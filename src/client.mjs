import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, STATE } from './paths.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function endpoint(state) {
  try {
    const data = JSON.parse(await fs.readFile(path.join(state, 'endpoint.json'), 'utf8'));
    if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(data.url)) return null;
    const response = await fetch(`${data.url}/api/health`, { signal: AbortSignal.timeout(700) });
    const health = await response.json();
    return response.ok && health.service === 'codex-todo-tree' && health.pid === data.pid ? data.url : null;
  } catch { return null; }
}
export async function ensureServer(state = STATE) {
  async function acquire(url) {
    try {
      const token = await fs.readFile(path.join(state, 'client-key'), 'utf8');
      const response = await fetch(`${url}/api/touch`, { method:'POST', headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(1500) });
      return response.ok || response.status === 404;
    } catch { return false; }
  }
  const active = await endpoint(state); if (active && await acquire(active)) return active;
  function launch() {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'cli.mjs'), 'serve'], {
      detached: true, windowsHide: true, stdio: 'ignore', env: { ...process.env, CODEX_TODO_TREE_STATE:state, TASK_CONSOLE_STATE: state },
    });
    child.on('error', () => {}); child.unref();
  }
  launch();
  for (let i = 0; i < 60; i++) {
    await pause(100); const url = await endpoint(state); if (url && await acquire(url)) return url;
    if (i === 20) launch();
  }
  throw new Error('CodexToDoTree did not start. Run the serve command to see diagnostics; no task state was reset.');
}
export async function command(input, state = STATE) {
  const url = await ensureServer(state);
  const token = await fs.readFile(path.join(state, 'client-key'), 'utf8');
  const response = await fetch(`${url}/api/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input), signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Task update failed (${response.status}).`);
  return result;
}
export async function snapshot(state = STATE, thread = null) {
  const url = await ensureServer(state);
  const response = await fetch(`${url}/api/state${thread ? `?thread=${encodeURIComponent(thread)}` : ''}`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Task state unavailable (${response.status}).`);
  return response.json();
}
export async function stopServer(state = STATE) {
  const url = await endpoint(state);
  if (!url) return false;
  const token = await fs.readFile(path.join(state, 'client-key'), 'utf8');
  const response = await fetch(`${url}/api/shutdown`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Service shutdown failed (${response.status}).`);
  for (let i = 0; i < 50; i++) { if (!await endpoint(state)) return true; await pause(100); }
  throw new Error('Shutdown requested but the service is still reachable.');
}
export function threadId(value) {
  const id = value || process.env.CODEX_THREAD_ID;
  if (!id) throw new Error('thread_id / --thread is required outside a Codex session. Never use the working directory as a conversation ID.');
  return id;
}
