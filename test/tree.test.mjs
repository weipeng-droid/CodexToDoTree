import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, update } from '../src/model.mjs';
import { projectBoard, projectSteps } from '../src/tree.mjs';
import { examplePlan } from './helpers.mjs';
const input = () => examplePlan({ steps: [{ id: 'phase', title: '主阶段', children: [{ id: 'part', title: '子阶段', children: [{ id: 'leaf', title: '具体执行步骤' }] }, { id: 'other', title: '其他子阶段' }] }, { id: 'next', title: '下个主阶段' }] });
const change = (board, id, status, extra = {}) => update(board, { step_id: id, status, ...extra });

test('recursive plans preserve identity, hierarchy, and one active leaf with derived ancestors', () => {
  let board = plan(input()); assert.equal(board.steps.length, 5);
  board = change(board, 'leaf', 'in_progress'); const view = projectBoard(board);
  assert.equal(view.steps.find(s => s.id === 'phase').effectiveStatus, 'in_progress');
  assert.equal(view.steps.find(s => s.id === 'part').effectiveStatus, 'in_progress');
  assert.deepEqual(view.focusPath.map(s => s.id), ['phase', 'part', 'leaf']);
  assert.equal(board.steps.filter(s => s.status === 'in_progress').length, 1);
  assert.throws(() => change(board, 'next', 'in_progress'), /Only one/);
  assert.throws(() => change(board, 'phase', 'in_progress'), /leaf stage/);
});
test('parents require completed children plus their own acceptance; pending acceptance rolls up', () => {
  let board = plan(input());
  assert.throws(() => change(board, 'phase', 'done', { evidence: 'test' }), /child stages/);
  board = change(board, 'leaf', 'done', { evidence: 'leaf: exit 0' });
  assert.equal(projectBoard(board).status, 'awaiting_verification');
  assert.throws(() => change(board, 'part', 'done'), /evidence/);
  board = change(board, 'part', 'done', { evidence: 'part: exit 0' });
  board = change(board, 'other', 'done', { evidence: 'other: exit 0' });
  assert.equal(projectSteps(board.steps).steps.find(s => s.id === 'phase').effectiveStatus, 'awaiting_verification');
  board = change(board, 'phase', 'done', { evidence: 'parent: exit 0' });
  assert.equal(projectSteps(board.steps).steps.find(s => s.id === 'phase').effectiveStatus, 'done');
});
test('child changes reopen verified ancestors; identical completion is idempotent for acceptance', () => {
  let board = plan(input());
  for (const id of ['leaf', 'part', 'other', 'phase']) board = change(board, id, 'done', { evidence: 'exit 0' });
  board = change(board, 'leaf', 'done', { evidence: 'exit 0' });
  assert.equal(board.steps.find(s => s.id === 'phase').status, 'done');
  board = change(board, 'leaf', 'todo');
  for (const id of ['part', 'phase']) { assert.equal(board.steps.find(s => s.id === id).status, 'todo'); assert.equal(board.steps.find(s => s.id === id).evidence, null); }
});
test('add under an active leaf transfers focus; dynamic roots and sibling insertion work', () => {
  let board = change(plan(examplePlan()), 'step-1', 'in_progress');
  board = update(board, { action: 'add', step_id: 'child', parent_id: 'step-1', title: '新子阶段' });
  assert.equal(board.steps.find(s => s.id === 'child').status, 'in_progress');
  assert.equal(board.steps.find(s => s.id === 'step-1').status, 'todo');
  board = update(board, { action: 'add', step_id: 'root', title: '新主阶段', index: 0 });
  assert.equal(projectBoard(board).rootIds[0], 'root');
});
test('move/rename retain descendants, reject cycles and cross-board parents', () => {
  let board = plan(input());
  assert.throws(() => update(board, { action: 'move', step_id: 'phase', parent_id: 'leaf' }), /descendants/);
  assert.throws(() => update(board, { action: 'move', step_id: 'part', parent_id: 'missing' }), /does not exist/);
  board = update(board, { action: 'move', step_id: 'part', parent_id: 'next', index: 0 });
  assert.equal(board.steps.find(s => s.id === 'leaf').parentId, 'part');
  assert.deepEqual(projectSteps(board.steps).steps.find(s => s.id === 'leaf').ancestors, ['next', 'part']);
  board = update(board, { action: 'rename', step_id: 'part', title: '调整后的子阶段' });
  assert.equal(board.steps.find(s => s.id === 'part').title, '调整后的子阶段');
});
test('skipping a branch cancels unfinished descendants without deleting completed evidence', () => {
  let board = plan(input()); board = change(board, 'other', 'done', { evidence: 'completed proof' });
  board = change(board, 'leaf', 'in_progress');
  board = change(board, 'phase', 'skipped', { note: '方案调整' });
  assert.equal(board.steps.find(s => s.id === 'leaf').status, 'skipped');
  assert.equal(board.steps.find(s => s.id === 'other').evidence, 'completed proof');
  assert.equal(projectBoard(board).focusPath.length, 0);
  assert.throws(() => update(board, { action: 'add', parent_id: 'other', step_id: 'new', title: '不可添加' }), /skipped ancestor/);
});
test('tree depth is bounded and legacy flat plans remain root stages', () => {
  const flat = projectBoard(plan(examplePlan())); assert.equal(flat.rootIds.length, 3);
  let tree = { title: 'leaf' }; for (let i=0;i<32;i++) tree={title:`depth ${i}`,children:[tree]};
  assert.throws(() => plan(examplePlan({ steps:[tree] })), /depth|deeper/);
});
