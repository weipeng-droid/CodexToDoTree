import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { command, snapshot, threadId, ensureServer } from './client.mjs';
import { doctor } from './setup.mjs';
import { VERSION, workflowInstructions } from './workflow.mjs';

const str = { type: 'string' };
const identity = { thread_id: { ...str, description: 'Exact CODEX_THREAD_ID from the calling conversation. Do not use a project path or a made-up ID.' }, board_id: { ...str, description: 'Stable work-item ID, unique within this conversation.' } };
const tools = [
  { name:'console_doctor',description:'Read-only check that this installation has matching persistent global workflow rules, MCP paths, capacity and override settings. Initialization guidance alone is not proof of installation. Does not expose configuration values or write files.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{codex_home:{type:'string'}},additionalProperties:false}},
  { name:'console_open',description:'Get the exact local dashboard URL for this conversation. If the host exposes a browser panel tool, open this URL in the current conversation only. Otherwise return it for a regular browser. This tool cannot force a host UI to open.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{thread_id:identity.thread_id},required:['thread_id'],additionalProperties:false}},
  { name: 'console_plan', description: 'Create a work item in the live task dashboard. Multiple conversations and multiple work items per conversation stay isolated. All steps start todo. Do not paste the board into chat.',
    inputSchema: { type: 'object', $defs: { stage: { oneOf: [str, { type: 'object', properties: { id: str, title: str, children: { type: 'array', items: { $ref: '#/$defs/stage' } } }, required: ['title'], additionalProperties: false }] } }, properties: { ...identity, thread_title: str, title: str, project: str, steps: { type: 'array', minItems: 1, maxItems: 100, items: { $ref: '#/$defs/stage' } } }, required: ['thread_id', 'board_id', 'thread_title', 'title', 'steps'], additionalProperties: false } },
  { name: 'console_update', description: 'Maintain a recursive task tree. action=add creates a child under parent_id (null=root); move reparents/reorders a subtree; rename changes title. Start only the focused leaf; ancestors roll up automatically. Accepting a parent requires all children verified plus its own evidence. Changing a verified subtree reopens ancestor acceptance. skipped preserves history and cancels unfinished descendants.',
    inputSchema: { type: 'object', properties: { ...identity, action: { enum: ['update', 'add', 'move', 'rename','annotate'] }, step_id: str, parent_id: { type: ['string', 'null'] }, index: { type: 'integer', minimum: 0 }, title: str,title_zh:str,evidence_zh:str, status: { enum: ['todo', 'in_progress', 'blocked', 'done', 'skipped'] }, note: str, evidence: str, expected_revision: { type: 'integer' } }, required: ['thread_id', 'board_id', 'step_id'], additionalProperties: false } },
  { name: 'console_watch', description: 'Register an existing dedicated mcp-tasks .md or .json file for live, read-only dashboard display. Pass conversation identity explicitly. Missing or invalid sources retain the last valid state and show an error.',
    inputSchema: { type: 'object', properties: { ...identity, thread_title: str, title: str, project: str, source_path: { ...str, description: 'Absolute source file path. Never a shared tasks.md used by different conversations.' } }, required: ['thread_id', 'board_id', 'thread_title', 'title', 'source_path'], additionalProperties: false } },
  { name: 'console_list', description: 'Read dashboard state for one conversation; pass all=true only to intentionally list all registered conversations. Returns a compact summary unless detail=true.',
    annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { thread_id: str, all: { type: 'boolean' }, detail: { type: 'boolean' } }, additionalProperties: false } },
];
const server = new Server({ name: 'codex-todo-tree', version: VERSION }, { capabilities: { tools: {} }, instructions: await workflowInstructions() });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const input = request.params.arguments || {};
    let result;
    if(request.params.name==='console_doctor') {
      result=await doctor({home:input.codex_home});
    } else if(request.params.name==='console_open') {
      const id=threadId(input.thread_id),url=await ensureServer();
      result={thread_id:id,url:`${url}/?thread=${encodeURIComponent(id)}`,open_in_current_conversation_only:true};
    } else if (request.params.name === 'console_list') {
      const state = await snapshot(undefined,input.all ? null : threadId(input.thread_id));
      const boards = state.boards;
      result = input.detail ? boards : boards.map(b => ({ board_id: b.boardId, title: b.title, status: b.status, revision: b.revision, focus_path: b.focusPath, steps: b.steps.map(s => ({ id: s.id, parent_id: s.parentId, title: s.title, status: s.effectiveStatus })) }));
    } else {
      const action = { console_plan: 'plan', console_update: input.action || 'update', console_watch: 'watch' }[request.params.name];
      if (!action) throw new Error('Unknown tool.');
      const board = await command({ ...input, thread_id: threadId(input.thread_id), action });
      result = { ok: true, board_id: board.boardId, revision: board.revision, steps: board.steps.map(s => ({ id: s.id, status: s.status })) };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
});
await server.connect(new StdioServerTransport());
