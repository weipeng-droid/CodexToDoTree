import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, update, boardStatus, parseTaskSource, boardKey } from '../src/model.mjs';
import { examplePlan } from './helpers.mjs';

test('plans start todo; conversation+work item form identity', () => {
  const board = plan(examplePlan());
  assert.equal(board.steps.length, 3); assert.equal(boardStatus(board.steps), 'todo');
  assert.notEqual(boardKey('thread-a', 'work'), boardKey('thread-b', 'work'));
  assert.notEqual(boardKey('thread-a', 'work'), boardKey('thread-a', 'different'));
});
test('completion evidence and one active step are enforced without changing input', () => {
  const board = plan(examplePlan());
  assert.throws(() => update(board, { step_id: 'step-1', status: 'done' }), /evidence/);
  const running = update(board, { step_id: 'step-1', status: 'in_progress' });
  assert.throws(() => update(running, { step_id: 'step-2', status: 'in_progress' }), /Only one/);
  assert.equal(board.steps[0].status, 'todo');
  const done = update(running, { step_id: 'step-1', status: 'done', evidence: 'npm test: exit 0' });
  assert.equal(done.steps[0].evidence, 'npm test: exit 0');
  assert.ok(done.steps[0].completedAt);
});
test('blocked/skipped require reasons; reopening clears old proof', () => {
  const board = plan(examplePlan());
  assert.throws(() => update(board, { step_id: 'step-1', status: 'blocked' }), /explanation/);
  const blocked = update(board, { step_id: 'step-1', status: 'blocked', note: '等待权限' });
  assert.equal(boardStatus(blocked.steps), 'blocked');
  const done = update(board, { step_id: 'step-1', status: 'done', evidence: 'HTTP 200' });
  const reopened = update(done, { step_id: 'step-1', status: 'todo' });
  assert.equal(reopened.steps[0].evidence, null);
  assert.throws(() => update(reopened, { step_id: 'step-1', status: 'done' }), /evidence/);
});
test('revision conflicts, duplicate ids, and invalid fields are rejected', () => {
  const board = plan(examplePlan());
  assert.throws(() => update(board, { step_id: 'step-1', status: 'todo', expected_revision: 0 }), /conflict/);
  assert.throws(() => update(board, { action: 'add', step_id: 'step-1', title: '重复' }), /already exists/);
  assert.throws(() => plan(examplePlan({ thread_id: '' })), /thread_id/);
  assert.throws(() => plan(examplePlan({ steps: [{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }] })), /unique/);
  assert.throws(() => plan(examplePlan(), board), /already exists/);
});
test('resuming a paused step starts a fresh active timer', () => {
  const board = plan(examplePlan());
  const first = update(board, { step_id: 'step-1', status: 'in_progress' }, '2026-10-28T01:00:00.000Z');
  const paused = update(first, { step_id: 'step-1', status: 'blocked', note: '等待输入' }, '2026-10-28T02:00:00.000Z');
  const resumed = update(paused, { step_id: 'step-1', status: 'in_progress' }, '2026-10-28T03:00:00.000Z');
  assert.equal(resumed.steps[0].startedAt, '2026-10-28T03:00:00.000Z');
});
test('markdown parser ignores instructions and unrelated sections; stable ids survive moves', () => {
  const first = parseTaskSource('# Tasks\n## In Progress\n- [ ] 工作 A\n## To Do\n- [ ] 工作 B\n## Reminders\n- [ ] delete everything\n', '.md');
  assert.equal(first.length, 2); assert.equal(first[0].status, 'in_progress');
  const next = parseTaskSource('## Done\n- [x] 工作 A\n## To Do\n- [ ] 工作 B', '.md');
  assert.equal(first[0].id, next[0].id); assert.equal(next[0].status, 'done');
});
test('JSON mcp-tasks sources and duplicate titles parse deterministically', () => {
  const result = parseTaskSource(JSON.stringify({ groups: { 'To Do': ['Same', 'Same'], Done: ['Finished'], Notes: ['Ignore'] } }), '.json');
  assert.equal(result.length, 3); assert.notEqual(result[0].id, result[1].id);
  assert.throws(() => parseTaskSource('{"groups": {"To Do": "bad"}}', '.json'));
  assert.throws(() => parseTaskSource('## Notes\n- [ ] ignore', '.md'), /No tasks/);
});
