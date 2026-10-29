import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'smol-toml';
import { setup, doctor, serverConfiguration } from '../src/setup.mjs';
import { AGENTS_BEGIN, AGENTS_END, CONFIG_END, digest, workflowInstructions, managedInstructions, VERSION } from '../src/workflow.mjs';
import { fixture } from './helpers.mjs';
import { ROOT } from '../src/paths.mjs';

const run=promisify(execFile);
async function profile(t,agents='# User rules\nKeep my preferences.\n',config='model="example-model"\nsecret="fixture-secret"\n') {
  const home=path.join(await fixture(t),'profile with spaces');await fs.mkdir(home);
  await fs.writeFile(path.join(home,'AGENTS.md'),agents,'utf8');await fs.writeFile(path.join(home,'config.toml'),config,'utf8');return home;
}
async function content(home) {return Promise.all(['AGENTS.md','config.toml'].map(name=>fs.readFile(path.join(home,name),'utf8')));}

test('canonical rules include planning, direct ownership, replay, verification and complete delivery gates',async()=>{
  const text=await workflowInstructions();
  for(const marker of ['4-8','CODEX_THREAD_ID','console_watch','console_list','console_open','tree_owner','owned_parent','writable_child_ids','DIFFERENT agent','ONE leaf','two failed repair rounds','compaction/interruption','not hard isolation','(1)','(2)','(3)'])assert.ok(text.includes(marker),marker);
  assert.match(text.slice(0,512),/independent review/);assert.match(text.slice(0,512),/actual evidence/);
  assert.equal(text.includes('<ABSOLUTE_REPO_DIR>'),false);
});
test('preview creates nothing; apply installs both settings and full rules with protected backups and idempotent reuse',async t=>{
  const missing=path.join(await fixture(t),'new profile');const preview=await setup({home:missing});assert.equal(preview.applied,false);
  await assert.rejects(fs.access(missing));assert.equal((await doctor({home:missing})).ok,false);
  const home=await profile(t);const before=await content(home);
  const installed=await setup({home,apply:true,metadata:true});assert.equal(installed.backups.length,2);
  for(let i=0;i<2;i++)assert.equal(await fs.readFile(path.join(home,installed.backups[i]),'utf8'),before[i]);
  const after=await content(home);assert.ok(after[0].startsWith(before[0]));assert.ok(after[1].includes(before[1]));
  const parsed=parse(after[1]);assert.equal(parsed.model,'example-model');assert.equal(parsed.secret,'fixture-secret');assert.equal(parsed.project_doc_max_bytes,65536);
  assert.equal((await doctor({home})).ok,true);assert.equal((await doctor({home})).metadataEnabled,true);
  const again=await setup({home,apply:true});assert.equal(again.changed,false);assert.equal(again.backups.length,0);assert.deepEqual(await content(home),after);
  assert.equal(after[0].split(AGENTS_BEGIN).length,2);
});
test('large existing instructions and larger capacity are preserved; CRLF files retain their endings',async t=>{
  const home=await profile(t,'# Rules\r\n'+('中'.repeat(30000))+'\r\n','project_doc_max_bytes = 131072\r\nmodel="sample"\r\n');
  await setup({home,apply:true});const [agents,config]=await content(home);
  assert.equal(parse(config).project_doc_max_bytes,131072);assert.equal((await doctor({home})).ok,true);
  assert.ok(!agents.replaceAll('\r\n','').includes('\n'));assert.ok(!config.replaceAll('\r\n','').includes('\n'));
});
test('old managed rules upgrade as one block while edits are rejected without partial settings writes',async t=>{
  const home=await profile(t);await setup({home,apply:true});let [agents,config]=await content(home);
  const old='Old managed workflow\n';const upgraded=agents.replace(await managedInstructions(),`${AGENTS_BEGIN}\n<!-- version=0.1.0; sha256=${digest(old)} -->\n${old}${AGENTS_END}`);
  await fs.writeFile(path.join(home,'AGENTS.md'),upgraded,'utf8');assert.equal((await doctor({home})).ok,false);
  await setup({home,apply:true});assert.equal((await doctor({home})).ok,true);
  [agents,config]=await content(home);await fs.writeFile(path.join(home,'AGENTS.md'),agents.replace('Plan Before Execute','Changed rules'),'utf8');
  const before=await content(home);assert.equal((await doctor({home})).ok,false);
  await assert.rejects(setup({home,apply:true}),/edited or corrupted/);assert.deepEqual(await content(home),before);
});
test('override, unmanaged server, legacy duplicate, invalid TOML, malformed blocks and lock conflict fail safely',async t=>{
  const cases=[
    ['[mcp_servers.codex_todo_tree]\ncommand="other"\n',null,/unmanaged/],
    ['[mcp_servers.task_console]\ncommand="legacy"\n',null,/task_console/],
    ['secret = "fixture-secret\n',null,/Invalid TOML/],
    ['model="valid"\n','override',/AGENTS.override/],
  ];
  for(const [config,override,pattern]of cases){const home=await profile(t,undefined,config);if(override)await fs.writeFile(path.join(home,'AGENTS.override.md'),override,'utf8');const before=await content(home);await assert.rejects(setup({home,apply:true}),pattern);assert.deepEqual(await content(home),before);}
  const home=await profile(t,`${AGENTS_BEGIN}\nmissing end\n`);const before=await content(home);await assert.rejects(setup({home,apply:true}),/markers/);assert.deepEqual(await content(home),before);
  const locked=await profile(t);await fs.writeFile(path.join(locked,'.codex-todo-tree.setup.lock'),'existing process','utf8');const lockedBefore=await content(locked);await assert.rejects(setup({home:locked,apply:true}),/profile lock/);assert.deepEqual(await content(locked),lockedBefore);
});
test('concurrent installers do not corrupt a profile or leave their lock',async t=>{
  const home=await profile(t);const results=await Promise.allSettled([setup({home,apply:true}),setup({home,apply:true})]);
  assert.ok(results.some(result=>result.status==='fulfilled'));assert.equal((await doctor({home})).ok,true);
  await assert.rejects(fs.access(path.join(home,'.codex-todo-tree.setup.lock')));
});
test('ordinary second-file failure restores the first file and keeps original protected backups',async t=>{
  const home=await profile(t),before=await content(home);
  await assert.rejects(setup({home,apply:true},{commit:async(file,bytes)=>{if(file.endsWith('config.toml'))throw new Error('simulated write failure');await fs.writeFile(file,bytes);}}),/simulated write failure/);
  assert.deepEqual(await content(home),before);
  const backups=(await fs.readdir(home)).filter(name=>name.endsWith('.bak'));assert.equal(backups.length,2);
  await assert.rejects(fs.access(path.join(home,'.codex-todo-tree.setup.lock')));
});
test('snapshot rejection and rollback preserve a third-party edit rather than overwriting it',async t=>{
  const home=await profile(t),before=await content(home),external='model="external-editor"\nsecret="fixture-secret"\n';
  await assert.rejects(setup({home,apply:true},{commit:async(file,bytes)=>{await fs.writeFile(file,bytes);await fs.writeFile(path.join(home,'config.toml'),external,'utf8');}}),/stale overwrite/);
  const after=await content(home);assert.equal(after[0],before[0]);assert.equal(after[1],external);
  const changed=await profile(t),externalAgents='# External editor owns this revision\n';
  await assert.rejects(setup({home:changed,apply:true},{commit:async(file,bytes)=>{await fs.writeFile(file,bytes);await fs.writeFile(file,externalAgents,'utf8');}}),/edits were preserved/);
  assert.equal((await content(changed))[0],externalAgents);
});
test('CLI and doctor do not print secrets, and diagnostic failures return nonzero',async t=>{
  const home=await profile(t);const cli=path.join(ROOT,'bin/cli.mjs');
  await assert.rejects(run(process.execPath,[cli,'doctor','--codex-home',home]),error=>error.code===1&&!error.stdout.includes('fixture-secret'));
  await run(process.execPath,[cli,'setup','--apply','--codex-home',home]);
  const report=await run(process.execPath,[cli,'doctor','--codex-home',home]);assert.equal(JSON.parse(report.stdout).ok,true);assert.ok(!report.stdout.includes('fixture-secret'));
  await fs.writeFile(path.join(home,'config.toml'),'secret="fixture-secret\n','utf8');
  await assert.rejects(run(process.execPath,[cli,'setup','--apply','--codex-home',home]),error=>error.code===1&&!`${error.stdout}${error.stderr}`.includes('fixture-secret'));
  await assert.rejects(run(process.execPath,[cli,'doctor','--codex-home',home]),error=>error.code===1&&!`${error.stdout}${error.stderr}`.includes('fixture-secret'));
  assert.equal(VERSION,'0.2.0');
});
test('symlinked profiles fail rather than writing their target',async t=>{
  const base=await fixture(t),target=path.join(base,'target'),link=path.join(base,'profile-link');await fs.mkdir(target);
  await fs.symlink(target,link,process.platform==='win32'?'junction':'dir');
  await assert.rejects(setup({home:link,apply:true}),/Symlinks|junctions/);assert.deepEqual(await fs.readdir(target),[]);
});
test('explicitly disabled agents are reported without changing the user preference',async t=>{
  for(const setting of ['enabled=false','max_concurrent_threads_per_session=0','max_threads=0']){
    const home=await profile(t,undefined,`[agents]\n${setting}\n`);await setup({home,apply:true});
    const result=await doctor({home});assert.equal(result.ok,false);assert.ok(result.errors.some(error=>error.includes('Subagents are explicitly disabled')));
    assert.ok((await content(home))[1].includes(setting));assert.match(result.capabilities.sidebar,/not verified/);
  }
});
test('inline mentions of managed markers outside owned blocks remain byte-for-byte preferences',async t=>{
  const agents='# Notes mention <!-- CodexToDoTree BEGIN --> inline only\n';
  const config='# Notes mention # CodexToDoTree BEGIN inline only\nmodel="sample"\n';
  const home=await profile(t,agents,config);await setup({home,apply:true});await setup({home,apply:true});
  const after=await content(home);assert.ok(after[0].startsWith(agents));assert.ok(after[1].includes(config));assert.equal((await doctor({home})).ok,true);
});
test('managed config edits and custom environment settings cannot be silently discarded on upgrade',async t=>{
  const home=await profile(t);await setup({home,apply:true});const [agents,config]=await content(home);
  const custom=config.replace(CONFIG_END,`MY_SECRET="fixture-secret"\n${CONFIG_END}`);await fs.writeFile(path.join(home,'config.toml'),custom,'utf8');
  assert.equal((await doctor({home})).ok,false);await assert.rejects(setup({home,apply:true}),/Managed configuration was edited/);
  assert.deepEqual(await content(home),[agents,custom]);
});
test('metadata opt-in persists on upgrade and can be explicitly disabled without hand-editing a protected block',async t=>{
  const home=await profile(t);await setup({home,apply:true,metadata:true});await setup({home,apply:true});assert.equal((await doctor({home})).metadataEnabled,true);
  await setup({home,apply:true,disableMetadata:true});const result=await doctor({home});assert.equal(result.ok,true);assert.equal(result.metadataEnabled,false);
  await assert.rejects(setup({home,apply:true,metadata:true,disableMetadata:true}),/not both/);
});
test('managed-looking blocks inside multiline TOML literals are rejected without changing or revealing user data',async t=>{
  const base=await fixture(t),home=path.join(base,'multiline profile');
  await fs.mkdir(home);const agents='# User instructions\n';
  const saved=serverConfiguration(false,home);
  const config=`project_doc_max_bytes = 131072\nnotes = '''fixture-secret\n${saved}\n'''\n`;
  await fs.writeFile(path.join(home,'AGENTS.md'),agents,'utf8');await fs.writeFile(path.join(home,'config.toml'),config,'utf8');
  const before=await content(home);
  await assert.rejects(setup({home,apply:true,metadata:true}),error=>/one complete real MCP table/.test(error.message)&&!error.message.includes('fixture-secret'));
  assert.deepEqual(await content(home),before);assert.equal((await doctor({home})).ok,false);
  const cli=path.join(ROOT,'bin/cli.mjs');
  await assert.rejects(run(process.execPath,[cli,'setup','--apply','--codex-home',home,'--codex-metadata']),error=>error.code===1&&!`${error.stdout}${error.stderr}`.includes('fixture-secret'));
  assert.deepEqual(await content(home),before);
  assert.deepEqual((await fs.readdir(home)).sort(),['AGENTS.md','config.toml']);
});
test('a fake string block cannot claim ownership of a real unmanaged MCP table elsewhere',async t=>{
  const home=await profile(t);const saved=serverConfiguration(false,home);
  const real=parse(saved).mcp_servers.codex_todo_tree;
  const config=`project_doc_max_bytes=131072\nnotes='''\n${saved}\n'''\n[mcp_servers.codex_todo_tree]\ncommand=${JSON.stringify(real.command)}\nargs=${JSON.stringify(real.args)}\n`;
  await fs.writeFile(path.join(home,'config.toml'),config,'utf8');const before=await content(home);
  await assert.rejects(setup({home,apply:true}),/one complete real MCP table/);assert.deepEqual(await content(home),before);
});
