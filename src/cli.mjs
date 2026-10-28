import * as fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { startServer } from './server.mjs';
import { command, ensureServer, snapshot, stopServer, threadId } from './client.mjs';

const [action = 'url', ...args] = process.argv.slice(2);
try {
  if (action === 'serve') {
    const service = await startServer();
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => service.close().then(() => process.exit(0)));
  } else if (action === 'url') {
    const { values } = parseArgs({ args, options: { thread: { type: 'string' } } });
    const url = await ensureServer();
    console.log(values.thread ? `${url}/?thread=${encodeURIComponent(values.thread)}` : url);
  }
  else if (action === 'stop') console.log(await stopServer() ? 'CodexToDoTree stopped. Committed task state retained.' : 'CodexToDoTree is not running.');
  else if (action === 'list') {
    const { values } = parseArgs({args,options:{thread:{type:'string'},all:{type:'boolean',default:false}}});
    const state = await snapshot(undefined, values.all ? null : threadId(values.thread));
    console.log(JSON.stringify(values.all ? state : {schema:state.schema,boards:state.boards}, null, 2));
  } else {
    const { values } = parseArgs({ args, options: {
      thread: { type: 'string' }, 'thread-title': { type: 'string' }, board: { type: 'string' },
      title: { type: 'string' }, project: { type: 'string' }, steps: { type: 'string' },
      file: { type: 'string' }, step: { type: 'string' }, status: { type: 'string' },
      note: { type: 'string' }, evidence: { type: 'string' }, revision: { type: 'string' },
      parent: { type: 'string' }, index: { type: 'string' },
      'title-zh':{type:'string'},'evidence-zh':{type:'string'},
    } });
    const input = { action, thread_id: threadId(values.thread), board_id: values.board,
      thread_title: values['thread-title'], title: values.title, project: values.project,
      step_id: values.step, status: values.status, note: values.note, evidence: values.evidence,
      expected_revision: values.revision === undefined ? undefined : Number(values.revision),
      parent_id: values.parent || null, index: values.index === undefined ? undefined : Number(values.index),
      title_zh:values['title-zh'],evidence_zh:values['evidence-zh'],
    };
    if (action === 'plan') input.steps = values.file ? JSON.parse(await fs.readFile(values.file, 'utf8')) : values.steps?.split('|');
    if (action === 'watch') input.source_path = values.file;
    if (!['plan', 'update', 'add', 'move', 'rename', 'annotate', 'watch'].includes(action)) throw new Error('Commands: url, serve, stop, list, plan, update, add, move, rename, annotate, watch. See docs/README.md.');
    const board = await command(input);
    console.log(JSON.stringify({ ok: true, board_id: board.boardId, revision: board.revision, steps: board.steps.map(s => ({ id: s.id, parent_id:s.parentId ?? null, status: s.effectiveStatus || s.status })) }));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
