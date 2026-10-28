import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { BoardStore } from '../src/store.mjs';
import { fixture, examplePlan } from './helpers.mjs';

test('same board IDs in different conversations and multiple boards stay isolated', async t => {
  const directory = await fixture(t); const store = await new BoardStore(directory).init();
  await store.command(examplePlan());
  await store.command(examplePlan({ thread_id: 'test-thread-b', thread_title: '测试对话 B' }));
  await store.command(examplePlan({ board_id: 'work-2' }));
  await store.command({ action: 'update', thread_id: 'test-thread-a', board_id: 'work-1', step_id: 'step-1', status: 'in_progress' });
  const all = store.snapshot(); assert.equal(all.boards.length, 3); assert.equal(all.threads.length, 2);
  assert.equal(all.boards.find(b => b.threadId === 'test-thread-b').steps[0].status, 'todo');
  assert.equal(store.snapshot('test-thread-a').boards.length, 2);
  assert.equal(store.snapshot('unknown-thread').boards.length, 0);
  const restored = await new BoardStore(directory).init();
  assert.deepEqual(restored.snapshot(), store.snapshot());
});
test('concurrent commands serialize; rejected writes do not damage later commands', async t => {
  const store = await new BoardStore(await fixture(t)).init(); await store.command(examplePlan());
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.command({ action: 'add', thread_id: 'test-thread-a', board_id: 'work-1', step_id: `added-${i}`, title: `新阶段 ${i}` })));
  assert.equal(store.snapshot().boards[0].steps.length, 23);
  await assert.rejects(store.command({ action: 'update', thread_id: 'test-thread-a', board_id: 'work-1', step_id: 'step-1', status: 'done' }), /evidence/);
  await store.command({ action: 'update', thread_id: 'test-thread-a', board_id: 'work-1', step_id: 'step-1', status: 'in_progress' });
  assert.equal(store.snapshot().boards[0].revision, 22);
});
test('watched source updates live, preserves valid state on corrupt/missing files, and recovers', async t => {
  const directory = await fixture(t); const source = path.join(directory, 'tasks.json');
  await fs.writeFile(source, JSON.stringify({ groups: { 'To Do': ['任务 A'] } }));
  const store = await new BoardStore(path.join(directory, 'boards')).init();
  await store.command({ ...examplePlan(), action: 'watch', source_path: source });
  await assert.rejects(store.command({ ...examplePlan({ thread_id: 'test-thread-b' }), action: 'watch', source_path: source }), /already registered/);
  await fs.writeFile(source, JSON.stringify({ groups: { Done: ['任务 A'] } })); await store.refreshSources();
  assert.equal(store.snapshot().boards[0].status, 'done');
  await fs.writeFile(source, '{broken'); await store.refreshSources();
  assert.ok(store.snapshot().boards[0].sourceError); assert.equal(store.snapshot().boards[0].status, 'done');
  await fs.unlink(source); await store.refreshSources(); assert.ok(store.snapshot().boards[0].sourceError);
  await fs.writeFile(source, '## In Progress\n- [ ] not JSON'); await store.refreshSources(); assert.ok(store.snapshot().boards[0].sourceError);
  await fs.writeFile(source, JSON.stringify({ groups: { 'In Progress': ['任务 A'] } })); await store.refreshSources();
  assert.equal(store.snapshot().boards[0].sourceError, null); assert.equal(store.snapshot().boards[0].status, 'in_progress');
});
test('corrupt committed board refuses startup instead of resetting progress', async t => {
  const directory = await fixture(t); const store = await new BoardStore(directory).init();
  const board = await store.command(examplePlan()); await fs.writeFile(path.join(directory, `${board.key}.json`), '{bad');
  await assert.rejects(new BoardStore(directory).init());
});
test('task source and storage directory junctions are rejected', async t => {
  const directory = await fixture(t); const target = path.join(directory, 'target'); const link = path.join(directory, 'linked');
  await fs.mkdir(target); await fs.writeFile(path.join(target, 'tasks.md'), '## To Do\n- [ ] Task');
  await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(new BoardStore(link).init(), /Symlinks\/junctions/);
  const store = await new BoardStore(path.join(directory, 'boards')).init();
  await assert.rejects(store.command({ ...examplePlan(), action: 'watch', source_path: path.join(link, 'tasks.md') }), /Symlinks\/junctions/);
});
