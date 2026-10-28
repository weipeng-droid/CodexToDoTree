import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defaultState,ROOT } from '../src/paths.mjs';
test('portable storage defaults are separate from the install and current directory',()=>{
  const home=path.resolve('example-home');
  assert.equal(defaultState({platform:'win32',home,env:{LOCALAPPDATA:path.join(home,'local')}}),path.join(home,'local','CodexToDoTree'));
  assert.equal(defaultState({platform:'darwin',home,env:{}}),path.join(home,'Library','Application Support','CodexToDoTree'));
  assert.equal(defaultState({platform:'linux',home,env:{XDG_DATA_HOME:path.join(home,'data')}}),path.join(home,'data','codex-todo-tree'));
});
test('setup prints valid portable TOML and does not modify host configuration',async()=>{
  const {stdout}=await promisify(execFile)(process.execPath,[path.join(ROOT,'scripts/setup.mjs')]);
  assert.match(stdout,/\[mcp_servers.codex_todo_tree\]/);assert.ok(stdout.includes(JSON.stringify(process.execPath)));
  assert.ok(stdout.includes(JSON.stringify(path.join(ROOT,'bin/mcp.mjs'))));assert.ok(!stdout.includes('CODEX_TODO_TREE_CODEX_METADATA'));
  const enabled=await promisify(execFile)(process.execPath,[path.join(ROOT,'scripts/setup.mjs'),'--codex-metadata']);assert.match(enabled.stdout,/CODEX_TODO_TREE_CODEX_METADATA = "1"/);
  const template=await fs.readFile(path.join(ROOT,'docs/AGENTS.example.md'),'utf8');assert.match(template,/console_open/);assert.match(template,/CODEX_THREAD_ID/);
});
test('documentation links resolve locally and examples contain no private task state',async()=>{
  for(const file of ['README.md','README.zh-CN.md','docs/reference.md','docs/AGENTS.example.md','SECURITY.md','CONTRIBUTING.md']){
    const text=await fs.readFile(path.join(ROOT,file),'utf8');
    for(const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
      const target=match[1];if(/^[a-z]+:|^#/.test(target))continue;
      await fs.access(path.resolve(ROOT,path.dirname(file),target.split('#')[0]));
    }
    assert.ok(!/state_\d+\.sqlite|\.codex-global-state\.json/.test(text),'User-facing docs must not include copied database contents');
  }
});
