import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { ROOT } from '../src/paths.mjs';
import { fixture } from './helpers.mjs';

test('simultaneous first clients converge on one service process', async t => {
  const state = await fixture(t); let ownedPid;
  t.after(async () => {
    if (!ownedPid) return;
    try { process.kill(ownedPid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  });
  const thread = 'startup-synthetic';
  const run = () => promisify(execFile)(process.execPath, [path.join(ROOT, 'src/cli.mjs'), 'url'], { env: { ...process.env, CODEX_THREAD_ID:thread, TASK_CONSOLE_STATE:state, CODEX_TODO_TREE_STATE:state }, timeout: 15000 });
  const clients = await Promise.all([run(), run(), run(), run()]);
  const urls = clients.map(result => result.stdout.trim());
  const endpoint = JSON.parse(await fs.readFile(path.join(state, 'endpoint.json'), 'utf8'));
  const health = await (await fetch(`${endpoint.url}/api/health`)).json();
  assert.equal(health.service, 'codex-todo-tree'); assert.equal(health.pid, endpoint.pid);
  ownedPid = health.pid;
  assert.ok(urls.every(url => url === `${endpoint.url}/?thread=${encodeURIComponent(thread)}`));
});
