import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../src/server.mjs';
import { fixture, examplePlan } from './helpers.mjs';

async function service(t) {
  const state = await fixture(t); const service = await startServer({ state, port: 0, announce: false });
  t.after(() => service.close());
  const token = await fs.readFile(path.join(state, 'client-key'), 'utf8');
  return { ...service, state, token };
}
test('HTTP serves real UI, validates writes, rejects foreign origins and unlisted paths', async t => {
  const { url, token } = await service(t);
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(`${url}/icons.js`)).status, 200);
  assert.equal((await fetch(`${url}/state/client-key`)).status, 404);
  assert.equal((await fetch(`${url}/api/state`, { headers: { Origin: 'https://evil.invalid' } })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const req = http.get(`${url}/api/state`, { headers: { Host: 'evil.invalid' } }, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject);
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await fetch(`${url}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(examplePlan()) })).status, 401);
  const response = await fetch(`${url}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(examplePlan()) });
  assert.equal(response.status, 200);
  const snapshot = await (await fetch(`${url}/api/state?thread=test-thread-a`)).json(); assert.equal(snapshot.boards.length, 1);
  const unknown = await (await fetch(`${url}/api/state?thread=other`)).json(); assert.equal(unknown.boards.length, 0);
});
test('SSE sends scoped initial and live snapshots; another conversation never enters the stream', async t => {
  const { url, store } = await service(t); await store.command(examplePlan());
  const abort = new AbortController(); const response = await fetch(`${url}/api/events?thread=test-thread-a`, { signal: abort.signal });
  assert.equal(response.status, 200); const reader = response.body.getReader();
  const initial = new TextDecoder().decode((await reader.read()).value); assert.match(initial, /event: snapshot/);
  await store.command(examplePlan({ thread_id: 'test-thread-b', thread_title: '测试对话 B', title: 'PRIVATE OTHER TASK' }));
  const update = new TextDecoder().decode((await reader.read()).value);
  assert.ok(!update.includes('PRIVATE OTHER TASK'));
  await store.command({ action: 'update', thread_id: 'test-thread-a', board_id: 'work-1', step_id: 'step-1', status: 'in_progress' });
  const changed = new TextDecoder().decode((await reader.read()).value); assert.match(changed, /in_progress/);
  abort.abort(); await reader.cancel().catch(() => {});
});
test('occupied preferred port falls back without stopping the other server', async t => {
  const occupied = http.createServer((_, res) => res.end('existing'));
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const state = await fixture(t);
  const service = await startServer({ state, port: occupied.address().port, announce: false }); t.after(() => service.close());
  assert.notEqual(service.server.address().port, occupied.address().port);
  assert.equal(await (await fetch(`http://127.0.0.1:${occupied.address().port}`)).text(), 'existing');
});
test('authenticated shutdown releases its lock and preserves committed boards for restart', async t => {
  const first = await service(t);
  await first.store.command(examplePlan());
  assert.equal((await fetch(`${first.url}/api/shutdown`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${first.url}/api/shutdown`, { method: 'POST', headers: { Authorization: `Bearer ${first.token}` } })).status, 200);
  await first.close();
  const next = await startServer({ state: first.state, port: 0, announce: false }); t.after(() => next.close());
  assert.equal(next.store.snapshot().boards.length, 1);
  assert.equal(next.store.snapshot().boards[0].title, '构建控制台');
});
test('all frontend assets have one startup fingerprint; mixed-version requests fail explicitly', async t => {
  const { url }=await service(t);
  const health=await(await fetch(`${url}/api/health`)).json(); assert.match(health.build,/^[a-f0-9]{16}$/);
  for(const route of ['/','/app.js','/tree.js','/tree.css','/style.css','/workspace.css','/bootstrap.js','/icons.js']) {
    const response=await fetch(`${url}${route}${route==='/'?'':`?v=${health.build}`}`);
    assert.equal(response.status,200); assert.equal(response.headers.get('x-task-console-build'),health.build);
    if(route==='/') { const html=await response.text(); assert.ok(!html.includes('__BUILD__')); assert.ok(html.indexOf('/bootstrap.js')<html.indexOf('/app.js')); }
    if(route==='/app.js') assert.ok((await response.text()).includes(`./tree.js?v=${health.build}`));
  }
  assert.equal((await fetch(`${url}/tree.js?v=old-version`)).status,409);
});
