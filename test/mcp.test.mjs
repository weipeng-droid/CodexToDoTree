import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startServer } from '../src/server.mjs';
import { ROOT } from '../src/paths.mjs';
import { fixture, examplePlan } from './helpers.mjs';

test('real MCP initialize, tools/list, tools/call, CLI, and HTTP all use the same state', async t => {
  const state = await fixture(t); const service = await startServer({ state, port: 0, announce: false }); t.after(() => service.close());
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'src/mcp.mjs')], env: { ...process.env, TASK_CONSOLE_STATE:state, CODEX_TODO_TREE_STATE:state } });
  const client = new Client({ name: 'task-console-acceptance', version: '1.0' });
  await client.connect(transport); t.after(() => client.close());
  const tools = await client.listTools(); assert.equal(tools.tools.length, 5);
  const opened=await client.callTool({name:'console_open',arguments:{thread_id:'test-thread-a'}});
  assert.equal(JSON.parse(opened.content[0].text).url,`${service.url}/?thread=test-thread-a`);
  const { action, ...input } = examplePlan();
  const planned = await client.callTool({ name: 'console_plan', arguments: input }); assert.ok(!planned.isError);
  const rejected = await client.callTool({ name: 'console_update', arguments: { thread_id: input.thread_id, board_id: input.board_id, step_id: 'step-1', status: 'done' } }); assert.equal(rejected.isError, true);
  const updated = await client.callTool({ name: 'console_update', arguments: { thread_id: input.thread_id, board_id: input.board_id, step_id: 'step-1', status: 'in_progress' } }); assert.ok(!updated.isError);
  const listed = await client.callTool({ name: 'console_list', arguments: { thread_id: input.thread_id } }); assert.match(listed.content[0].text, /in_progress/);
  await promisify(execFile)(process.execPath, [path.join(ROOT, 'src/cli.mjs'), 'update', '--thread', input.thread_id, '--board', input.board_id, '--step', 'step-1', '--status', 'done', '--evidence', 'MCP/CLI acceptance: exit 0'], { env: { ...process.env, TASK_CONSOLE_STATE:state, CODEX_TODO_TREE_STATE:state } });
  const httpState = await (await fetch(`${service.url}/api/state?thread=${input.thread_id}`)).json(); assert.equal(httpState.boards[0].steps[0].status, 'done');
  assert.match(httpState.boards[0].steps[0].evidence, /acceptance/);
});
test('MCP creates and dynamically reparents recursive stages in the shared broker', async t => {
  const state=await fixture(t); const service=await startServer({state,port:0,announce:false}); t.after(()=>service.close());
  const client=new Client({name:'tree-acceptance',version:'1.0'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(ROOT,'src/mcp.mjs')],env:{...process.env,TASK_CONSOLE_STATE:state, CODEX_TODO_TREE_STATE:state}})); t.after(()=>client.close());
  const args={thread_id:'tree-test',thread_title:'Tree MCP',board_id:'tree',title:'Nested task',steps:[{id:'p',title:'Phase',children:[{id:'c',title:'Child',children:['Leaf']}]},'Other phase']};
  const created=await client.callTool({name:'console_plan',arguments:args}); assert.ok(!created.isError);
  const added=await client.callTool({name:'console_update',arguments:{thread_id:'tree-test',board_id:'tree',action:'add',step_id:'dynamic',parent_id:'c',title:'Dynamic leaf'}}); assert.ok(!added.isError);
  const moved=await client.callTool({name:'console_update',arguments:{thread_id:'tree-test',board_id:'tree',action:'move',step_id:'dynamic',parent_id:'step-2'}}); assert.ok(!moved.isError);
  const listed=await client.callTool({name:'console_list',arguments:{thread_id:'tree-test'}}); assert.match(listed.content[0].text,/parent_id/);
  assert.equal(service.store.snapshot().boards[0].steps.find(s=>s.id==='dynamic').parentId,'step-2');
});
test('CLI list defaults to the exact calling conversation; listing all is explicit', async t => {
  const state=await fixture(t); const service=await startServer({state,port:0,announce:false}); t.after(()=>service.close());
  await service.store.command(examplePlan());
  await service.store.command(examplePlan({thread_id:'different-thread',thread_title:'Other',title:'OTHER CONVERSATION TASK'}));
  const env={...process.env,TASK_CONSOLE_STATE:state, CODEX_TODO_TREE_STATE:state,CODEX_THREAD_ID:'test-thread-a'};
  const own=await promisify(execFile)(process.execPath,[path.join(ROOT,'src/cli.mjs'),'list'],{env});
  assert.equal(JSON.parse(own.stdout).boards.length,1); assert.ok(!own.stdout.includes('OTHER CONVERSATION TASK'));
  const all=await promisify(execFile)(process.execPath,[path.join(ROOT,'src/cli.mjs'),'list','--all'],{env});
  assert.equal(JSON.parse(all.stdout).boards.length,2);
});
