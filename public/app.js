import { esc, icon, effective, roots, renderTree, nodeKey, badge } from './tree.js?v=__BUILD__';

const $ = selector => document.querySelector(selector);
const state = { boards: [], threads: [], projects:[],selection:null,metadataWarning:null,collapsedProjects:new Set(),expandedBoards:new Set(),collapsedBoards:new Set(),thread: new URL(location.href).searchParams.get('thread'), filter: 'all', search: '', grid: false, expandedNodes: new Set(), lastFocus: new Map(), connected: false, loaded: false, changed: new Set() };
let stream;
const progressValues = new Map();
const icons = () => window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
function relative(date) {
  if (!date) return '—';
  const seconds = Math.max(0, (Date.now() - Date.parse(date)) / 1000);
  if (seconds < 10) return '刚刚';
  if (seconds < 60) return `${Math.floor(seconds)} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}
function duration(start) {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(start)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
}
const scopedBoards = () => state.thread ? state.boards.filter(b => b.threadId === state.thread) : state.boards;
const attention = board => ['blocked', 'awaiting_verification'].includes(board.status) || board.sourceError;
function connection(connected) {
  state.connected = connected;
  $('#connection').className = `connection ${connected ? 'live' : 'offline'}`;
  $('#connection').innerHTML = `<span></span>${connected ? '实时连接' : state.loaded ? '连接中断' : '连接中'}`;
  updateTimes();
}
function setThread(id,replace=false) {
  state.thread = id; state.filter = 'all'; state.search = ''; $('#search').value = '';
  const url = new URL(location.href);
  if (id) url.searchParams.set('thread', id); else url.searchParams.delete('thread');
  history[replace?'replaceState':'pushState']({}, '', url); state.boards = []; state.loaded = false;
  closeNav(); render(); connect();
}
function renderNavigation() {
  $('#thread-navigation').innerHTML=state.projects.map(project=>{
    const collapsed=state.collapsedProjects.has(project.id);
    const items=project.threads.map(thread=>`<button class="thread-item ${state.thread===thread.id?'selected':''}" data-thread="${esc(thread.id)}" title="${esc(thread.title)}" ${state.thread===thread.id?'aria-current="page"':''}><span class="thread-text"><span class="thread-name">${esc(thread.title)}</span><span class="thread-meta"><span class="thread-state ${thread.status}"></span>${thread.boardCount} 个工作项<span>·</span><span data-relative="${esc(thread.updated)}">${relative(thread.updated)}</span></span></span></button>`).join('');
    return `<section class="project-group"><button class="project-header" data-project-toggle="${esc(project.id)}" aria-expanded="${!collapsed}" aria-label="${collapsed?'展开':'收起'}项目 ${esc(project.label)}">${icon(collapsed?'folder':'folder-open')}<span class="project-label">${esc(project.label)}</span><span class="project-count">${project.threads.length}</span><span class="project-chevron">${icon(collapsed?'chevron-right':'chevron-down')}</span></button>${collapsed?'':`<div class="project-threads">${items}</div>`}</section>`;
  }).join('') || `<p class="nav-empty">${state.loaded?'暂无未归档对话':'正在同步对话'}</p>`;
}
function boardHtml(board) {
  const primary = roots(board), done = primary.filter(s => effective(s) === 'done').length, skipped = primary.filter(s => effective(s) === 'skipped').length;
  const total = primary.length - skipped, percent = total ? done / total * 100 : 0;
  const previousPercent = progressValues.get(board.key) ?? 0; progressValues.set(board.key, percent);
  const focus = board.focusPath || [], path = focus.length > 5 ? [focus[0], { title: '…' }, ...focus.slice(-3)] : focus;
  const open=(!['done','skipped'].includes(board.status)||board.sourceError||state.expandedBoards.has(board.key))&&!state.collapsedBoards.has(board.key);
  const focusHtml = focus.length ? `<div class="focus-path" title="${esc(focus.map(s => s.title).join(' › '))}">${icon('locate-fixed')}<span class="focus-prefix">当前</span>${path.map((s, i) => `${i ? icon('chevron-right') : ''}<span>${esc(s.title)}</span>`).join('')}</div>` : '';
  return `<article class="board ${board.status==='in_progress'?'active-board':''} ${open?'':'is-collapsed'}" data-key="${esc(board.key)}"><div class="board-head"><div class="board-context">${icon('folder')}<span>${esc(board.project)}</span></div><div class="board-title-row"><h2>${esc(board.title)}</h2><div class="board-heading-actions">${badge(board.status)}<button class="icon-button" data-toggle-board="${esc(board.key)}" aria-expanded="${open}" aria-label="${open?'收起':'展开'}工作项 ${esc(board.title)}" title="${open?'收起':'展开'}工作项">${icon(open?'chevron-up':'chevron-down')}</button></div></div><div class="progress-info"><div class="progress-track" role="progressbar" aria-label="${esc(board.title)} 已验收主阶段" aria-valuemin="0" aria-valuemax="${Math.max(total,1)}" aria-valuenow="${done}"><div class="progress-fill" data-progress="${percent}" style="width:${previousPercent}%"></div></div><span class="progress-fraction">${done} / ${total} 主阶段</span></div>${open?focusHtml:''}</div>${open?`${board.sourceError?`<p class="source-error">${icon('triangle-alert')} ${esc(board.sourceError)}</p>`:''}<div class="step-list">${renderTree(board,state,duration)}</div><div class="board-footer"><span title="${esc(board.source||'CodexToDoTree MCP / CLI')}">${icon(board.source?'file-text':'plug')}<span class="source-label">${board.source?'mcp-tasks · 文件同步':'CodexToDoTree · 已同步'}</span></span><span>${icon('clock-3')}<span data-relative="${esc(board.updatedAt)}">${relative(board.updatedAt)}</span>${skipped?` · 废弃 ${skipped}`:''}</span></div>`:''}</article>`;
}
function render(focusKey = null) {
  const thread = state.threads.find(t => t.id === state.thread), scoped = scopedBoards();
  $('#page-title').textContent=thread?.title || state.selection?.title || '当前对话任务';
  document.title=`${$('#page-title').textContent} · CodexToDoTree`;
  const active = scoped.filter(b => b.status === 'in_progress').length, blocked = scoped.filter(attention).length, doneBoards = scoped.filter(b => b.status === 'done').length;
  const warning=$('#metadata-warning');warning.hidden=!state.metadataWarning;warning.title=state.metadataWarning || '';
  for (const [id, value] of [['all', scoped.length], ['active', active], ['blocked', blocked], ['done', doneBoards]]) $(`#${id}-count`).textContent = value;
  for (const tab of document.querySelectorAll('[data-filter]')) { const selected = tab.dataset.filter === state.filter; tab.classList.toggle('active', selected); tab.setAttribute('aria-selected', String(selected)); }
  const query = state.search.toLocaleLowerCase();
  const filtered = scoped.filter(b => (state.filter === 'all' || state.filter === 'active' && b.status === 'in_progress' || state.filter === 'blocked' && attention(b) || state.filter === 'done' && b.status === 'done') && (!query || [b.title, b.project, b.threadTitle, ...b.steps.map(s => s.title)].some(t => t.toLocaleLowerCase().includes(query))));
  $('#boards').className = `boards ${state.grid ? 'grid-view' : ''}`;
  const archived=state.selection?.archived;
  $('#boards').innerHTML = filtered.map(boardHtml).join('') || `<div class="empty-state">${icon(archived?'archive':state.loaded?'inbox':'loader-circle')}<h2>${archived?'此对话已归档':!state.loaded?'正在连接工作区':scoped.length?'没有匹配的工作项':state.thread?'这个对话还没有任务':'暂无已登记对话'}</h2><p>${archived?'历史任务记录已保留':state.loaded?scoped.length?'当前筛选下暂无结果':'等待首次任务计划':'等待本地服务响应'}</p>${scoped.length?'<button class="clear-search" id="clear-search">清除筛选</button>':''}</div>`;
  $('#work-label').textContent = `工作项 · ${filtered.length}`; renderNavigation(); icons(); updateTimes();
  if (focusKey) [...document.querySelectorAll('[data-step]')].find(el => `${el.dataset.board}:${el.dataset.step}` === focusKey)?.focus({ preventScroll: true });
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('[data-progress]').forEach(el => { el.style.width = `${el.dataset.progress}%`; })));
}
function updateTimes() {
  document.querySelectorAll('[data-relative]').forEach(el => { el.textContent = relative(el.dataset.relative); });
  document.querySelectorAll('[data-time]').forEach(el => { el.textContent = duration(el.dataset.time); });
  const scoped = scopedBoards(), updated = scoped.map(b => b.updatedAt).sort().at(-1);
  $('#updated-label').textContent = updated ? `更新于 ${relative(updated)}` : '等待任务';
  $('#footer-status').textContent = !state.connected ? state.loaded ? '离线 · 显示最后收到的状态' : '正在连接本机服务' : updated && Date.now() - Date.parse(updated) > 120000 && scoped.some(b => b.status === 'in_progress') ? '实时连接 · 等待任务更新' : '已连接 · 本机同步';
}
const narrowNav = matchMedia('(max-width:960px)');
function syncNav() { const open = $('#sidebar').classList.contains('open'); $('#sidebar').inert = narrowNav.matches && !open; $('#open-nav').setAttribute('aria-expanded', String(open)); if (!narrowNav.matches) $('#nav-backdrop').hidden = true; }
function closeNav() { const wasOpen = $('#sidebar').classList.contains('open'); $('#sidebar').classList.remove('open'); $('#nav-backdrop').hidden = true; syncNav(); if (wasOpen && narrowNav.matches) $('#open-nav').focus(); }
function connect() {
  stream?.close(); connection(false);
  const currentStream = new EventSource(`/api/events${state.thread ? `?thread=${encodeURIComponent(state.thread)}` : ''}`); stream = currentStream;
  let liveReceived = false;
  function consume(snapshot, isLive) {
    if (stream !== currentStream) return;
    try {
      if (snapshot.schema !== 1 || !Array.isArray(snapshot.boards)) throw new Error('Invalid snapshot');
      if(!state.thread&&snapshot.threads?.length){setThread(snapshot.threads[0].id,true);return;}
      const focused = document.activeElement?.closest('[data-step]'), focusKey = focused ? `${focused.dataset.board}:${focused.dataset.step}` : null;
      const previous = new Map(state.boards.flatMap(b => b.steps.map(s => [nodeKey(b, s), effective(s)])));
      state.changed = new Set(snapshot.boards.flatMap(b => b.steps.filter(s => previous.has(nodeKey(b, s)) && previous.get(nodeKey(b, s)) !== effective(s)).map(s => nodeKey(b, s))));
      for (const board of snapshot.boards) { const path = board.focusPath || [], signature = path.map(s => s.id).join('/'); if (signature !== state.lastFocus.get(board.key)) for (const node of path.slice(0, -1)) state.expandedNodes.add(nodeKey(board, node)); state.lastFocus.set(board.key, signature); }
      state.boards = snapshot.boards; state.threads = snapshot.threads || [];state.projects=snapshot.projects || [];state.selection=snapshot.selection || null;state.metadataWarning=snapshot.metadataWarning; state.loaded = true; connection(isLive); render(focusKey);
      window.dispatchEvent(new Event('task-console-ready'));
    } catch { connection(false); window.dispatchEvent(new Event('task-console-failed')); }
  }
  currentStream.addEventListener('snapshot', message => {
    try { const snapshot = JSON.parse(message.data); consume(snapshot, true); liveReceived = true; }
    catch { window.dispatchEvent(new Event('task-console-failed')); }
  });
  fetch(`/api/state${state.thread ? `?thread=${encodeURIComponent(state.thread)}` : ''}`, { signal:AbortSignal.timeout(8000) })
    .then(response => { if (!response.ok) throw new Error('Snapshot unavailable'); return response.json(); })
    .then(snapshot => { if (!liveReceived) consume(snapshot, false); }).catch(() => {});
  currentStream.onerror = () => { if (stream === currentStream) connection(false); };
}
document.addEventListener('click', event => {
  const project=event.target.closest('[data-project-toggle]');if(project){const id=project.dataset.projectToggle;if(state.collapsedProjects.has(id))state.collapsedProjects.delete(id);else state.collapsedProjects.add(id);renderNavigation();icons();[...document.querySelectorAll('[data-project-toggle]')].find(el=>el.dataset.projectToggle===id)?.focus({preventScroll:true});return;}
  const board=event.target.closest('[data-toggle-board]');if(board){const id=board.dataset.toggleBoard;if(board.getAttribute('aria-expanded')==='true'){state.collapsedBoards.add(id);state.expandedBoards.delete(id);}else{state.expandedBoards.add(id);state.collapsedBoards.delete(id);}render();[...document.querySelectorAll('[data-toggle-board]')].find(el=>el.dataset.toggleBoard===id)?.focus({preventScroll:true});return;}
  const thread = event.target.closest('[data-thread]'); if (thread) return setThread(thread.dataset.thread);
  const tab = event.target.closest('[data-filter]'); if (tab) { state.filter = tab.dataset.filter; render(); return; }
  const step = event.target.closest('[data-step]'); if (step) { const key = `${step.dataset.board}:${step.dataset.step}`; if (state.expandedNodes.has(key)) state.expandedNodes.delete(key); else state.expandedNodes.add(key); render(key); return; }
  if (event.target.closest('#clear-search')) { state.filter = 'all'; state.search = ''; $('#search').value = ''; render(); }
});
$('#refresh').onclick = connect;
$('#expand-tree').onclick = () => { for (const b of scopedBoards()) {state.expandedBoards.add(b.key);state.collapsedBoards.delete(b.key);for (const s of b.steps) if (b.steps.some(c => c.parentId === s.id)) state.expandedNodes.add(nodeKey(b, s));} render(); };
$('#collapse-tree').onclick = () => { state.expandedNodes.clear(); render(); };
$('#open-nav').onclick = () => { $('#sidebar').classList.add('open'); $('#nav-backdrop').hidden = false; syncNav(); $('#close-nav').focus(); };
$('#close-nav').onclick = closeNav; $('#nav-backdrop').onclick = closeNav;
$('#search').addEventListener('input', e => { state.search = e.target.value; render(); });
for (const [id, grid] of [['view-list', false], ['view-grid', true]]) $(`#${id}`).onclick = () => { state.grid = grid; for (const [name, value] of [['view-list', !grid], ['view-grid', grid]]) { $(`#${name}`).classList.toggle('selected', value); $(`#${name}`).setAttribute('aria-pressed', String(value)); } render(); };
window.addEventListener('popstate', () => { state.thread = new URL(location.href).searchParams.get('thread'); state.filter = 'all'; state.search = ''; state.boards = []; state.loaded = false; $('#search').value = ''; render(); connect(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeNav();
  if (event.key === 'Tab' && narrowNav.matches && $('#sidebar').classList.contains('open')) { const focusable = [...$('#sidebar').querySelectorAll('button')].filter(e => e.getBoundingClientRect().height); if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); } }
  const current = event.target.closest('[data-step]');
  if (current && ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); const key = `${current.dataset.board}:${current.dataset.step}`; if (event.key === 'ArrowRight') { state.expandedNodes.add(key); render(key); } else if (event.key === 'ArrowLeft') { state.expandedNodes.delete(key); render(key); } else { const rows = [...document.querySelectorAll('[data-step]')]; rows[rows.indexOf(current) + (event.key === 'ArrowDown' ? 1 : -1)]?.focus(); } }
});
narrowNav.addEventListener('change', closeNav);
window.addEventListener('pagehide', () => { stream?.close(); clearInterval(clock); });
window.addEventListener('pageshow', e => { if (e.persisted) { connect(); clearInterval(clock); clock = setInterval(updateTimes, 1000); } });
syncNav(); render(); connect();
let clock = setInterval(updateTimes, 1000);
