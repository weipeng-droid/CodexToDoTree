import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { InputError, boardKey, boardStatus, event, parseTaskSource, plan, update } from './model.mjs';
import { indexTree, projectBoard } from './tree.mjs';
import { workspaceSnapshot } from './workspace.mjs';

export async function rejectLinks(target) {
  let current = path.resolve(target);
  while (true) {
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new InputError('Symlinks/junctions are not allowed for task storage.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
export async function atomicJson(file, value) {
  await rejectLinks(file);
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  try { await fs.rename(temporary, file); }
  catch (error) { await fs.unlink(temporary).catch(() => {}); throw error; }
}
export class BoardStore {
  constructor(directory, onChange = () => {}) {
    this.directory = directory;
    this.boards = new Map();
    this.onChange = onChange;
    this.queue = Promise.resolve();
    this.threadMetadata=new Map();
    this.metadataWarning=null;
  }
  async init() {
    await rejectLinks(this.directory);
    await fs.mkdir(this.directory, { recursive: true });
    for (const file of await fs.readdir(this.directory)) {
      if (!/^[a-f0-9]{24}-[a-f0-9]{24}\.json$/.test(file)) continue;
      const full = path.join(this.directory, file); await rejectLinks(full);
      const board = JSON.parse(await fs.readFile(full, 'utf8'));
      if (boardKey(board.threadId, board.boardId) !== board.key || `${board.key}.json` !== file || !Array.isArray(board.steps)) throw new Error('Invalid saved board; refusing to reset committed task state.');
      indexTree(board.steps);
      this.boards.set(board.key, board);
    }
    return this;
  }
  serialize(operation) {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => {});
    return next;
  }
  snapshot(threadId = null) {
    return workspaceSnapshot([...this.boards.values()].map(board=>projectBoard(structuredClone(board))),this.threadMetadata,threadId,this.metadataWarning);
  }
  setCatalog(rows,warning=null) {
    const next=rows?new Map(rows.map(row=>[row.id,row])):this.threadMetadata;
    if(JSON.stringify([...next])===JSON.stringify([...this.threadMetadata])&&warning===this.metadataWarning)return;
    this.threadMetadata=next;this.metadataWarning=warning;this.onChange();
  }
  async save(board) {
    await atomicJson(path.join(this.directory, `${board.key}.json`), board);
    this.boards.set(board.key, board);
    this.onChange();
    return structuredClone(board);
  }
  command(input) {
    return this.serialize(async () => {
      const id = boardKey(input.thread_id, input.board_id);
      if (input.action === 'plan') return this.save(plan(input, this.boards.get(id)));
      if (input.action === 'watch') {
        if (!path.isAbsolute(input.source_path || '')) throw new InputError('source_path must be absolute.');
        const source = path.resolve(input.source_path);
        if ([...this.boards.values()].some(b => b.source?.toLowerCase() === source.toLowerCase())) throw new InputError('This source is already registered. Use a separate task file for each work item/conversation.');
        if (!['.md', '.json'].includes(path.extname(source).toLowerCase())) throw new InputError('Only dedicated .md and .json mcp-tasks sources are supported.');
        await rejectLinks(source);
        const contents = await this.readSource(source);
        const parsed = parseTaskSource(contents, path.extname(source).toLowerCase());
        if (this.boards.has(id)) throw new InputError('Board already exists. Use a new board_id.');
        const board = plan({ ...input, steps: ['等待任务源'] });
        board.source = source;
        this.mergeSource(board, parsed);
        return this.save(board);
      }
      return this.save(update(this.boards.get(id), input));
    });
  }
  async readSource(source) {
    await rejectLinks(source);
    const stat = await fs.stat(source);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new InputError('Task source must be a regular file smaller than 1 MiB.');
    return fs.readFile(source, 'utf8');
  }
  mergeSource(board, parsed) {
    const now = new Date().toISOString();
    const previous = new Map(board.steps.map(s => [s.id, s]));
    board.steps = parsed.map(item => {
      const old = previous.get(item.id);
      const changed = !old || old.status !== item.status;
      if (changed) event(board, `任务源更新：${item.title} → ${item.status}`, now, item.id);
      return { ...old, ...item, createdAt: old?.createdAt || now, updatedAt: changed ? now : old.updatedAt,
        startedAt: old?.startedAt || (item.status === 'in_progress' ? now : null),
        completedAt: item.status === 'done' ? old?.completedAt || now : null,
        evidence: item.status === 'done' ? '源文件标记完成；未独立验证测试证据' : null, note: null };
    });
    for (const [id, old] of previous) {
      if (!parsed.some(s => s.id === id) && old.title !== '等待任务源') event(board, `任务源移除：${old.title}`, now, id);
    }
    board.sourceError = null;
    board.updatedAt = now;
  }
  refreshSources() {
    return this.serialize(async () => {
      for (const existing of this.boards.values()) {
        if (!existing.source) continue;
        const board = structuredClone(existing);
        try {
          const parsed = parseTaskSource(await this.readSource(board.source), path.extname(board.source).toLowerCase());
          if (!board.sourceError && JSON.stringify(parsed) === JSON.stringify(board.steps.map(({ id, title, status }) => ({ title, status, id })))) continue;
          this.mergeSource(board, parsed); board.revision++;
        } catch (error) {
          const message = error instanceof InputError || error instanceof SyntaxError ? error.message : `任务源读取失败 (${error.code || 'unknown'})`;
          if (message === board.sourceError) continue;
          board.sourceError = message;
          event(board, '任务源不可用，保留最后有效状态', new Date().toISOString());
          board.revision++;
        }
        await this.save(board);
      }
    });
  }
}
