import { InputError } from './validation.mjs';
import { translated } from './annotations.mjs';

export function indexTree(steps) {
  const byId = new Map(steps.map(step => [step.id, step]));
  if (byId.size !== steps.length) throw new InputError('Step IDs must be unique inside a board.');
  const children = new Map([[null, []]]);
  for (const step of steps) {
    const parent = step.parentId ?? null;
    if (parent && !byId.has(parent)) throw new InputError('Parent step does not exist in this work item.');
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(step);
    let current = step; const seen = new Set();
    while (current) {
      if (seen.has(current.id)) throw new InputError('A stage cannot be moved beneath itself or its descendants.');
      seen.add(current.id);
      if (seen.size > 32) throw new InputError('Maximum task tree depth is 32.');
      current = byId.get(current.parentId);
    }
  }
  return { byId, children };
}
export function projectSteps(steps) {
  const { children } = indexTree(steps);
  const projected = new Map();
  function visit(step, depth, path) {
    const descendants = (children.get(step.id) || []).map(child => visit(child, depth + 1, [...path, step.id]));
    let effectiveStatus = step.status;
    if (descendants.length && !['blocked', 'skipped'].includes(step.status)) {
      if (descendants.some(s => s.effectiveStatus === 'blocked')) effectiveStatus = 'blocked';
      else if (descendants.some(s => s.effectiveStatus === 'in_progress')) effectiveStatus = 'in_progress';
      else if (descendants.some(s => s.effectiveStatus === 'awaiting_verification')) effectiveStatus = 'awaiting_verification';
      else if (descendants.every(s => ['done', 'skipped'].includes(s.effectiveStatus))) effectiveStatus = step.status === 'done' ? 'done' : 'awaiting_verification';
      else effectiveStatus = 'todo';
    }
    const effectiveChildren = descendants.filter(s => s.effectiveStatus !== 'skipped');
    const result = { ...step, title:translated(step.title,step.titleTranslation),evidence:translated(step.evidence,step.evidenceTranslation), parentId: step.parentId ?? null, effectiveStatus, depth, ancestors: path,
      childIds: descendants.map(s => s.id), progress: { done: effectiveChildren.filter(s => s.effectiveStatus === 'done').length, total: effectiveChildren.length } };
    projected.set(step.id, result);
    return result;
  }
  const roots = (children.get(null) || []).map(step => visit(step, 0, []));
  return { roots, steps: steps.map(step => projected.get(step.id)) };
}
export function treeStatus(steps) {
  const { roots } = projectSteps(steps);
  if (roots.some(s => s.effectiveStatus === 'blocked')) return 'blocked';
  if (roots.some(s => s.effectiveStatus === 'in_progress')) return 'in_progress';
  if (roots.some(s => s.effectiveStatus === 'awaiting_verification')) return 'awaiting_verification';
  if (roots.every(s => s.effectiveStatus === 'skipped')) return 'skipped';
  if (roots.every(s => ['done', 'skipped'].includes(s.effectiveStatus))) return 'done';
  return 'todo';
}
export function projectBoard(board) {
  const tree = projectSteps(board.steps);
  const candidates = tree.steps.filter(s => !s.ancestors.some(id => tree.steps.find(p => p.id === id)?.status === 'skipped'));
  const focused = candidates.find(s => s.status === 'in_progress' && !s.childIds.length) ||
    candidates.filter(s => ['blocked', 'awaiting_verification'].includes(s.effectiveStatus)).sort((a,b) => b.depth - a.depth || b.updatedAt.localeCompare(a.updatedAt))[0];
  const path = focused ? [...focused.ancestors, focused.id] : [];
  return { ...board, steps: tree.steps, rootIds: tree.roots.map(s => s.id), status: treeStatus(board.steps), focusPath: path.map(id => ({ id, title: tree.steps.find(s => s.id === id).title })) };
}
export function descendantIds(steps, id) {
  const { children } = indexTree(steps); const result = [];
  function visit(parent) { for (const child of children.get(parent) || []) { result.push(child.id); visit(child.id); } }
  visit(id); return result;
}
