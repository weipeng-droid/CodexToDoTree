export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
export const labels = { todo: '待办', in_progress: '进行中', blocked: '已阻塞', done: '已完成', skipped: '已废弃', awaiting_verification: '待验收' };
const statusIcons = { todo: 'circle-dashed', in_progress: 'loader-circle', blocked: 'circle-alert', done: 'circle-check', skipped: 'circle-minus', awaiting_verification: 'clipboard-check' };
export const effective = step => step.effectiveStatus || step.status;
export function badge(status) { return `<span class="status-badge ${status}">${icon(statusIcons[status])}${labels[status]}</span>`; }
export const roots = board => board.steps.filter(step => !step.parentId);
export const nodeKey = (board, step) => `${board.key}:${step.id}`;
export function renderTree(board, state, duration) {
  const byId = new Map(board.steps.map(s => [s.id, s]));
  const children = new Map();
  for (const step of board.steps) {
    const parent = step.parentId || null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(step);
  }
  const searchExpanded = new Set();
  if (state.search) {
    for (const step of board.steps) if (step.title.toLocaleLowerCase().includes(state.search.toLocaleLowerCase())) {
      let parent = byId.get(step.parentId);
      while (parent) { searchExpanded.add(parent.id); parent = byId.get(parent.parentId); }
    }
  }
  function visit(step, number, depth) {
    const descendants = children.get(step.id) || [];
    const status = effective(step);
    const key = nodeKey(board, step);
    const open = state.expandedNodes.has(key) || searchExpanded.has(step.id);
    const changed = state.changed.has(key);
    const childDone = descendants.filter(s => effective(s) === 'done').length;
    const childTotal = descendants.filter(s => effective(s) !== 'skipped').length;
    const current = step.status === 'in_progress' && !descendants.length;
    const details = `${step.note ? `<div class="inline-record"><span>说明</span><p>${esc(step.note)}</p></div>` : ''}${step.evidence ? `<div class="inline-record"><span>验证记录</span><p>${esc(step.evidence)}</p></div>` : ''}`;
    const childContent = descendants.length ? `<ul class="tree-children ${depth >= 2 ? 'deep' : ''}" role="group">${descendants.map((s, i) => visit(s, `${number}.${i + 1}`, depth + 1)).join('')}</ul>${details ? `<div class="branch-record">${details}</div>` : ''}` : `<div class="leaf-record">${details || '<span class="record-empty">尚无子阶段或验证记录</span>'}</div>`;
    return `<li class="tree-node" role="treeitem" aria-expanded="${open}" aria-level="${depth + 1}" aria-label="${esc(step.title)} · ${labels[status]}"><button class="step ${status} ${open ? 'is-expanded' : ''} ${changed ? 'recent-change' : ''}" data-board="${esc(board.key)}" data-step="${esc(step.id)}" aria-expanded="${open}" title="${open ? '收起' : '展开'}${descendants.length ? '子阶段' : '阶段记录'}"><span class="step-icon">${current ? '<span class="spinner" aria-hidden="true"></span>' : icon(statusIcons[status])}</span><span class="step-title"><span class="step-index">${number}</span><span class="step-text">${esc(step.title)}</span></span><span class="step-right">${descendants.length ? `<span class="child-progress">${childDone}/${childTotal}</span>` : current && step.startedAt ? `<span class="step-time" data-time="${esc(step.startedAt)}">${duration(step.startedAt)}</span>` : `<span class="step-status-word">${labels[status]}</span>`}<span class="tree-chevron">${icon(open ? 'chevron-down' : 'chevron-right')}</span></span></button>${open ? `<div class="tree-expansion">${childContent}</div>` : ''}</li>`;
  }
  return `<ul class="task-tree" role="tree" aria-label="${esc(board.title)} 阶段树">${(children.get(null) || []).map((s, i) => visit(s, `${i + 1}`, 0)).join('')}</ul>`;
}
