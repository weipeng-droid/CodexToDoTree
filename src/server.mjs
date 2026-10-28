import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BoardStore, atomicJson, rejectLinks } from './store.mjs';
import { InputError } from './model.mjs';
import { ROOT, STATE } from './paths.mjs';
import { CodexCatalog } from './catalog.mjs';

const assets = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/tree.js', ['public/tree.js', 'text/javascript; charset=utf-8']],
  ['/bootstrap.js', ['public/bootstrap.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
  ['/tree.css', ['public/tree.css', 'text/css; charset=utf-8']],
  ['/workspace.css', ['public/workspace.css', 'text/css; charset=utf-8']],
  ['/icons.js', [fileURLToPath(new URL('./dist/umd/lucide.js',import.meta.resolve('lucide/package.json'))), 'text/javascript; charset=utf-8']],
]);
export async function startServer({ state = STATE, port = 47831, announce = true, idleTimeoutMs = Number(process.env.TASK_CONSOLE_IDLE_MS || 60000),catalog } = {}) {
  if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs < 50) throw new InputError('Idle timeout must be at least 50 milliseconds.');
  await rejectLinks(state); await fs.mkdir(state, { recursive: true });
  const serviceLock = path.join(state, 'service.lock');
  let lock;
  try { lock = await fs.open(serviceLock, 'wx'); await lock.writeFile(String(process.pid)); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await fs.readFile(serviceLock, 'utf8'));
    try { process.kill(pid, 0); throw new Error('CodexToDoTree is already running.'); }
    catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
    await fs.unlink(serviceLock); return startServer({ state, port, announce, idleTimeoutMs,catalog });
  }
  const clients = new Set();
  let timer, heartbeat, idleTimer,catalogTimer;
  if(catalog===undefined)catalog=state===STATE&&process.env.CODEX_TODO_TREE_CODEX_METADATA==='1'?new CodexCatalog():null;
  let lastUse = Date.now(), operations = 0;
  try {
    const assetSnapshot = new Map();
    const buildHasher = createHash('sha256');
    for (const [route, [file, type]] of assets) {
      const bytes = await fs.readFile(path.resolve(ROOT, file)); buildHasher.update(route).update(bytes);
      assetSnapshot.set(route, { bytes, type });
    }
    const build = buildHasher.digest('hex').slice(0, 16);
    for (const [route, item] of assetSnapshot) if (route !== '/icons.js') item.bytes = Buffer.from(item.bytes.toString('utf8').replaceAll('__BUILD__', build));
    let token;
    try { await rejectLinks(path.join(state, 'client-key')); token = await fs.readFile(path.join(state, 'client-key'), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; token = randomBytes(32).toString('hex'); await fs.writeFile(path.join(state, 'client-key'), token, { flag: 'wx', mode: 0o600 }); }
    const publish = () => {
      for (const client of clients) {
        if(client.res.destroyed||client.res.writableEnded){clients.delete(client);continue;}
        if (client.res.writableLength > 1024 * 1024) { client.res.destroy(); clients.delete(client); }
        else client.res.write(`event: snapshot\ndata: ${JSON.stringify(store.snapshot(client.threadId))}\n\n`);
      }
    };
    const store = await new BoardStore(path.join(state, 'boards'), publish).init();
    let catalogRefreshing=false;
    async function refreshCatalog() {
      if(!catalog||catalogRefreshing)return;
      catalogRefreshing=true;
      try{store.setCatalog(await catalog.refresh([...new Set([...store.boards.values()].map(b=>b.threadId))]));}
      catch(error){store.setCatalog(null,error.message);}
      finally{catalogRefreshing=false;}
    }
    await refreshCatalog();
    const server = http.createServer(async (req, res) => {
      const address = server.address();
      const hosts = new Set([`127.0.0.1:${address.port}`, `localhost:${address.port}`]);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
      const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
      if (!hosts.has(req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'Local same-origin access only.' });
      if (req.headers.origin && ![...hosts].some(host => req.headers.origin === `http://${host}`)) return json(403, { error: 'Origin denied.' });
      const requestUrl = new URL(req.url, 'http://127.0.0.1');
      const route = requestUrl.pathname;
      const threadId = requestUrl.searchParams.get('thread');
      try {
        if (req.method === 'GET' && route === '/api/health') return json(200, { service: 'codex-todo-tree', version: '0.1.0', build, pid: process.pid, viewers: clients.size, idleTimeoutMs });
        if (req.method === 'GET' && route === '/api/state') { lastUse = Date.now(); return json(200, store.snapshot(threadId)); }
        if (req.method === 'GET' && route === '/api/events') {
          if (clients.size >= 32) return json(503, { error: 'Too many live viewers.' });
          res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          res.write(`retry: 2000\nevent: snapshot\ndata: ${JSON.stringify(store.snapshot(threadId))}\n\n`);
          const client = { res, threadId }; clients.add(client); lastUse = Date.now();
          req.on('close', () => { clients.delete(client); lastUse = Date.now(); }); return;
        }
        if (req.method === 'POST' && ['/api/command', '/api/shutdown', '/api/touch'].includes(route)) {
          const credential = Buffer.from(req.headers.authorization || ''); const expected = Buffer.from(`Bearer ${token}`);
          if (credential.length !== expected.length || !timingSafeEqual(credential, expected)) return json(401, { error: 'CLI/MCP authentication required.' });
          if (route === '/api/touch') { lastUse = Date.now(); return json(200, { ok:true }); }
          if (route === '/api/shutdown') {
            json(200, { ok: true });
            setImmediate(() => { close().catch(() => {}); });
            return;
          }
          operations++; lastUse = Date.now();
          try {
          if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(415, { error: 'JSON required.' });
          let size = 0; const chunks = [];
          for await (const chunk of req) { size += chunk.length; if (size > 256 * 1024) return json(413, { error: 'Request too large.' }); chunks.push(chunk); }
          const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!['plan', 'update', 'add', 'move', 'rename','annotate', 'watch'].includes(input.action)) throw new InputError('Unknown command.');
          const result=await store.command(input);
          if(input.action==='plan'||input.action==='watch')await refreshCatalog();
          return json(200,result);
          } finally { operations--; lastUse = Date.now(); }
        }
        if (req.method === 'GET' && assetSnapshot.has(route)) {
          if (route !== '/' && requestUrl.searchParams.has('v') && requestUrl.searchParams.get('v') !== build) return json(409, { error:'Asset version changed. Reload the page.' });
          const { bytes, type } = assetSnapshot.get(route);
          res.writeHead(200, { 'Content-Type': type, 'X-Task-Console-Build':build }); res.end(bytes); return;
        }
        return json(404, { error: 'Not found.' });
      } catch (error) {
        json(error instanceof InputError || error instanceof SyntaxError ? 400 : 500, { error: error instanceof InputError || error instanceof SyntaxError ? error.message : 'Storage operation failed; previous committed state retained.' });
      }
    });
    server.requestTimeout = 10000;
    await new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(port, '127.0.0.1', resolve);
    }).catch(async error => {
      if (error.code !== 'EADDRINUSE' || port === 0) throw error;
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    await atomicJson(path.join(state, 'endpoint.json'), { url, pid: process.pid, version: '0.1.0' });
    let refreshing = false;
    timer = setInterval(() => {
      if (refreshing) return;
      refreshing = true;
      store.refreshSources().catch(() => {}).finally(() => { refreshing = false; });
    }, 1000);
    heartbeat = setInterval(() => { for (const client of clients) client.res.write(': connected\n\n'); }, 15000);
    if(catalog)catalogTimer=setInterval(()=>refreshCatalog().catch(()=>{}),3000);
    idleTimer = setInterval(() => {
      if (!clients.size && !operations && Date.now() - lastUse >= idleTimeoutMs) close().catch(() => {});
    }, Math.max(25, Math.min(5000, idleTimeoutMs / 4)));
    if (announce) console.log(`CodexToDoTree: ${url}`);
    let closing;
    function close() {
      closing ||= (async () => {
        clearInterval(timer); clearInterval(heartbeat); clearInterval(idleTimer);clearInterval(catalogTimer);
        for (const client of clients) client.res.end();
        clients.clear();
        await new Promise(resolve => server.close(resolve));
        await store.queue;await catalog?.close(); await lock.close(); await fs.unlink(serviceLock).catch(() => {});
      })();
      return closing;
    }
    return { server, store, url, close };
  } catch (error) { clearInterval(timer); clearInterval(heartbeat); clearInterval(idleTimer);clearInterval(catalogTimer);await catalog?.close(); await lock.close(); await fs.unlink(serviceLock).catch(() => {}); throw error; }
}
