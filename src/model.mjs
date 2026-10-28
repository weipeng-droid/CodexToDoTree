import { createHash, randomUUID } from 'node:crypto';
import { InputError, text } from './validation.mjs';
import { descendantIds, indexTree, projectSteps, treeStatus } from './tree.mjs';
import { translation } from './annotations.mjs';
export { InputError, text } from './validation.mjs';

export const STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'skipped'];
const fail = (message) => { throw new InputError(message); };
export const key = (value) => createHash('sha256').update(value).digest('hex').slice(0, 24);
export function boardKey(threadId, boardId) {
  return `${key(text(threadId, 'thread_id'))}-${key(text(boardId, 'board_id'))}`;
}
export function boardStatus(steps) {
  return treeStatus(steps);
}
export function event(board, message, now, stepId = null) {
  board.events = [...(board.events || []), { id: randomUUID(), at: now, message, stepId }].slice(-200);
}
export function plan(input, existing = null, now = new Date().toISOString()) {
  const threadId = text(input.thread_id, 'thread_id');
  const boardId = text(input.board_id, 'board_id', 120);
  if (existing) fail('Board already exists. Update its steps, or use a new board_id for a different work item.');
  if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 100) fail('steps must contain 1-100 items.');
  const steps = [];
  function flatten(items, parentId = null, prefix = 'step-', depth = 0) {
    if (!Array.isArray(items) || depth >= 32) fail('Invalid children array or tree deeper than 32.');
    items.forEach((item, i) => {
      if (!item || !['string', 'object'].includes(typeof item)) fail('Invalid step.');
      const id = text(typeof item === 'string' ? `${prefix}${i + 1}` : item.id || `${prefix}${i + 1}`, 'step.id', 120);
      steps.push({ id, parentId, title: text(typeof item === 'string' ? item : item.title, 'step.title', 1000), status: 'todo', createdAt: now, updatedAt: now, startedAt: null, completedAt: null, evidence: null, note: null });
      if (steps.length > 1000) fail('Maximum 1000 stages per work item.');
      if (typeof item === 'object' && item.children) flatten(item.children, id, `${id}.`, depth + 1);
    });
  }
  flatten(input.steps); indexTree(steps);
  const board = {
    key: boardKey(threadId, boardId), threadId, boardId,
    threadTitle: text(input.thread_title, 'thread_title', 300), title: text(input.title, 'title', 300),
    project: text(input.project || '未分组', 'project', 1000),
    steps, events: [], createdAt: now, updatedAt: now, revision: 1,
    source: null, sourceError: null,
  };
  event(board, '创建工作项', now);
  return board;
}
export function update(existing, input, now = new Date().toISOString()) {
  if (!existing) fail('Board not found. Create a plan first.');
  if (existing.source && input.action !== 'annotate') fail('Watched boards are read-only here. Update the original task file through mcp-tasks.');
  if (input.expected_revision !== undefined && input.expected_revision !== existing.revision) fail('Revision conflict. Read the latest board before retrying.');
  const board = structuredClone(existing);
  if(input.action==='annotate') {
    const step=board.steps.find(s=>s.id===input.step_id);
    if(!step)fail('Step not found in this conversation/work item.');
    if(input.title_zh===undefined&&input.evidence_zh===undefined)fail('Provide title_zh or evidence_zh.');
    if(input.title_zh!==undefined)step.titleTranslation=translation(step.title,input.title_zh,'title_zh');
    if(input.evidence_zh!==undefined) {
      if(!step.evidence)fail('Cannot translate missing verification evidence.');
      step.evidenceTranslation=translation(step.evidence,input.evidence_zh,'evidence_zh');
    }
    board.revision++;
    event(board,'补充中文展示，原始验证依据与完成状态保持不变',now,step.id);
    return board;
  }
  const guardParent = (id) => {
    let parent = board.steps.find(s => s.id === id);
    while (parent) {
      if (parent.status === 'skipped') fail('Reopen the skipped ancestor before modifying this subtree.');
      parent = board.steps.find(s => s.id === parent.parentId);
    }
  };
  // Structural or child-state changes invalidate acceptance of enclosing stages.
  const invalidate = (id) => {
    let parent = board.steps.find(s => s.id === id);
    while (parent) {
      if (parent.status === 'done') {
        parent.status = 'todo'; parent.evidence = null; parent.completedAt = null; parent.updatedAt = now;
        event(board, `子阶段调整，重新验收：${parent.title}`, now, parent.id);
      }
      parent = board.steps.find(s => s.id === parent.parentId);
    }
  };
  const place = (step) => {
    const siblings = board.steps.filter(s => (s.parentId ?? null) === step.parentId && s.id !== step.id);
    if (input.index !== undefined && (!Number.isInteger(input.index) || input.index < 0 || input.index > siblings.length)) fail('index must be a valid sibling position.');
    board.steps = board.steps.filter(s => s.id !== step.id);
    const before = siblings[input.index ?? siblings.length];
    board.steps.splice(before ? board.steps.findIndex(s => s.id === before.id) : board.steps.length, 0, step);
  };
  if (input.action === 'add') {
    const id = text(input.step_id || randomUUID(), 'step_id', 120);
    if (board.steps.some(s => s.id === id)) fail('Step ID already exists.');
    if (board.steps.length >= 1000) fail('Maximum 1000 steps per board.');
    const parentId = input.parent_id == null ? null : text(input.parent_id, 'parent_id', 120);
    const parent = parentId && board.steps.find(s => s.id === parentId);
    if (parentId && !parent) fail('Parent step does not exist in this work item.');
    guardParent(parentId);
    const transferFocus = parent?.status === 'in_progress';
    invalidate(parentId);
    if (transferFocus) { parent.status = 'todo'; parent.updatedAt = now; }
    place({ id, parentId, title: text(input.title, 'title', 1000), status: transferFocus ? 'in_progress' : 'todo', createdAt: now, updatedAt: now, startedAt: transferFocus ? now : null, completedAt: null, evidence: null, note: null });
    event(board, `新增阶段：${input.title}`, now, id);
  } else {
    const step = board.steps.find(s => s.id === input.step_id);
    if (!step) fail('Step not found in this conversation/work item.');
    if (input.action === 'rename') {
      invalidate(step.id); step.title = text(input.title, 'title', 1000); step.updatedAt = now;
      event(board, `重命名阶段：${step.title}`, now, step.id);
    } else if (input.action === 'move') {
      const parentId = input.parent_id == null ? null : text(input.parent_id, 'parent_id', 120);
      if (parentId === step.id || descendantIds(board.steps, step.id).includes(parentId)) fail('A stage cannot be moved beneath itself or its descendants.');
      const parent = parentId && board.steps.find(s => s.id === parentId);
      if (parentId && !parent) fail('Parent step does not exist in this work item.');
      guardParent(parentId);
      invalidate(step.parentId); invalidate(parentId);
      if (parent?.status === 'in_progress') { parent.status = 'todo'; parent.updatedAt = now; }
      step.parentId = parentId; step.updatedAt = now; place(step);
      event(board, `移动阶段：${step.title}`, now, step.id);
    } else {
    if (!STATUSES.includes(input.status)) fail('Invalid status.');
    const { children, byId } = indexTree(board.steps);
    let parent = byId.get(step.parentId);
    while (parent) { if (parent.status === 'skipped') fail('Reopen the skipped ancestor before updating this stage.'); parent = byId.get(parent.parentId); }
    const note = input.note == null ? null : text(input.note, 'note', 3000);
    const evidence = input.evidence == null ? null : text(input.evidence, 'evidence', 4000);
    if (input.status === 'done' && !evidence && !step.evidence) fail('Completion requires verification evidence.');
    if (['blocked', 'skipped'].includes(input.status) && !note) fail('Blocked/skipped steps require an explanation.');
    if (input.status === 'done' && (children.get(step.id) || []).some(child => !['done', 'skipped'].includes(projectSteps(board.steps).steps.find(s => s.id === child.id).effectiveStatus))) fail('Complete and verify all child stages before accepting their parent.');
    if (input.status === 'in_progress' && children.get(step.id)?.length) fail('Start a leaf stage; ancestor progress is derived automatically.');
    if (input.status === 'in_progress' && board.steps.some(s => s.id !== step.id && s.status === 'in_progress')) fail('Only one in_progress step is allowed per work item. Finish or pause the current one first.');
    if (step.status !== input.status || step.note !== note || input.evidence && step.evidence !== evidence) invalidate(step.parentId);
    if (['skipped', 'blocked'].includes(input.status)) {
      for (const id of descendantIds(board.steps, step.id)) {
        const child = byId.get(id);
        if (input.status === 'skipped' && child.status !== 'done' || input.status === 'blocked' && child.status === 'in_progress') {
          child.status = input.status; child.note = note; child.evidence = null; child.completedAt = null; child.updatedAt = now;
        }
      }
    }
    const previousStatus = step.status;
    step.status = input.status;
    step.updatedAt = now;
    step.note = note;
    step.evidence = input.status === 'done' ? evidence || step.evidence : null;
    if (input.status === 'in_progress' && previousStatus !== 'in_progress') step.startedAt = now;
    step.completedAt = input.status === 'done' ? now : null;
    event(board, `${step.title} → ${input.status}${note ? `：${note}` : ''}`, now, step.id);
    }
  }
  indexTree(board.steps);
  board.updatedAt = now;
  board.revision++;
  return board;
}
const statusNames = new Map([
  ['in progress', 'in_progress'], ['in_progress', 'in_progress'], ['进行中', 'in_progress'], ['wip', 'in_progress'],
  ['to do', 'todo'], ['todo', 'todo'], ['待办', 'todo'], ['backlog', 'todo'],
  ['done', 'done'], ['已完成', 'done'], ['blocked', 'blocked'], ['阻塞', 'blocked'],
  ['skipped', 'skipped'], ['deleted', 'skipped'], ['已废弃', 'skipped'],
]);
export function parseTaskSource(content, extension) {
  const result = [];
  const add = (title, status) => { if (status) result.push({ title: text(title, 'task title', 1000), status }); };
  if (extension === '.json') {
    const parsed = JSON.parse(content);
    if (!parsed.groups || typeof parsed.groups !== 'object' || Array.isArray(parsed.groups)) fail('Expected mcp-tasks JSON with a groups object.');
    for (const [group, items] of Object.entries(parsed.groups)) {
      const status = statusNames.get(group.toLowerCase());
      if (!status) continue;
      if (!Array.isArray(items)) fail('Task groups must contain arrays.');
      for (const item of items) add(item, status);
    }
  } else {
    let status = null;
    for (const line of content.split(/\r?\n/)) {
      const heading = /^##\s+(.+?)\s*$/.exec(line);
      if (heading) { status = statusNames.get(heading[1].toLowerCase()) || null; continue; }
      const item = /^\s*-\s+\[([ xX])\]\s+(.+)$/.exec(line);
      if (item && status) add(item[2], item[1].toLowerCase() === 'x' ? 'done' : status);
    }
  }
  if (!result.length) fail('No tasks found under recognized status headings. Previous state was retained.');
  if (result.length > 1000) fail('Source has more than 1000 tasks.');
  const seen = new Map();
  return result.map(item => {
    const count = (seen.get(item.title) || 0) + 1; seen.set(item.title, count);
    return { ...item, id: `${key(item.title)}-${count}` };
  });
}
