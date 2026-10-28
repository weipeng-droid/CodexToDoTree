import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ROOT } from '../src/paths.mjs';
const run=promisify(execFile),npm=process.env.npm_execpath;
if(!npm)throw new Error('Run this check with npm run package:smoke');
const work=path.join(ROOT,'work');await fs.mkdir(work,{recursive:true});
const directory=await fs.mkdtemp(path.join(work,'clean install-'));
await fs.writeFile(path.join(directory,'package.json'),JSON.stringify({name:'synthetic-clean-consumer',private:true,type:'module'}),'utf8');
let service,client;
try {
  const packed=JSON.parse((await run(process.execPath,[npm,'pack','--json','--pack-destination',directory],{cwd:ROOT})).stdout)[0];
  for(const file of packed.files)assert.ok(!/(?:^|\/)(?:state|work|test|node_modules)\/|client-key|\.sqlite|\.log$/.test(file.path),`Private or development file in package: ${file.path}`);
  await run(process.execPath,[npm,'install','--ignore-scripts','--no-audit','--no-fund',path.join(directory,packed.filename)],{cwd:directory,timeout:120000});
  const installed=path.join(directory,'node_modules','codex-todo-tree');
  assert.equal(await fs.stat(path.join(installed,'node_modules','lucide')).then(()=>true,()=>false),false,'Test must exercise hoisted dependencies');
  const {startServer}=await import(pathToFileURL(path.join(installed,'src/server.mjs')));
  const state=path.join(directory,'state');service=await startServer({state,port:0,announce:false,catalog:null});
  for(const asset of ['/','/icons.js','/app.js','/workspace.css'])assert.equal((await fetch(service.url+asset)).status,200);
  client=new Client({name:'packed-install-smoke',version:'1.0'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(installed,'bin/mcp.mjs')],env:{...process.env,CODEX_TODO_TREE_STATE:state,TASK_CONSOLE_STATE:state}}));
  const opened=await client.callTool({name:'console_open',arguments:{thread_id:'packed-demo'}});assert.equal(JSON.parse(opened.content[0].text).url,service.url+'/?thread=packed-demo');
  const planned=await client.callTool({name:'console_plan',arguments:{thread_id:'packed-demo',board_id:'release',thread_title:'Synthetic package test',title:'Verify packed installation',steps:[{id:'root',title:'Nested root',children:['Leaf']},'Other phase']}});assert.ok(!planned.isError);
  assert.equal((await(await fetch(service.url+'/api/state?thread=packed-demo')).json()).boards[0].steps.length,3);
  const {stdout}=await run(process.execPath,[path.join(installed,'bin/cli.mjs'),'list','--thread','packed-demo'],{env:{...process.env,CODEX_TODO_TREE_STATE:state,TASK_CONSOLE_STATE:state}});assert.equal(JSON.parse(stdout).boards.length,1);
  console.log(JSON.stringify({result:'passed',packageFiles:packed.files.length,sha512:packed.integrity,checked:'Clean install in a path with spaces; hoisted icons, real MCP, CLI, HTTP and scoped nested state'}));
} finally {
  await client?.close();await service?.close();
  await fs.rm(directory,{recursive:true,force:true});
}
