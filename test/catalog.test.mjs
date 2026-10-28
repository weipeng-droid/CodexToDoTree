import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { CodexCatalog } from '../src/catalog.mjs';
import { readCatalog,normalizeWorkspacePath } from '../src/catalog-worker.mjs';
import { BoardStore } from '../src/store.mjs';
import { startServer } from '../src/server.mjs';
import { fixture,examplePlan } from './helpers.mjs';
async function source(t){
  const directory=await fixture(t),dbPath=path.join(directory,'state_5.sqlite'),globalPath=path.join(directory,'.codex-global-state.json');
  const db=new DatabaseSync(dbPath);
  db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY,archived INTEGER,cwd TEXT,title TEXT,name TEXT,project_id TEXT)');
  const add=db.prepare('INSERT INTO threads VALUES (?,?,?,?,?,?)');
  add.run('a',0,'\\\\?\\D:\\Example\\ProjectAlpha','Title A','显示标题 A',null);
  add.run('b',1,'D:\\Example\\ProjectBeta','Title B',null,null);
  add.run('c',0,'D:\\Example\\ProjectAlpha2','Outside boundary',null,null);
  db.close();
  const global={'local-projects':{projectalpha:{id:'projectalpha',name:'ProjectAlpha',rootPaths:['D:\\Example\\ProjectAlpha']},uni:{id:'uni',name:'ProjectBeta',rootPaths:['D:\\Example\\ProjectBeta']}},'project-order':['projectalpha','uni']};
  await fs.writeFile(globalPath,JSON.stringify(global),'utf8');
  return {directory,dbPath,globalPath,global};
}
test('read-only registered-thread metadata matches real archive/title/project fields and does not modify SQLite',async t=>{
  const s=await source(t);const hash=bytes=>createHash('sha256').update(bytes).digest('hex');const before=hash(await fs.readFile(s.dbPath));
  const rows=await readCatalog({...s,ids:['a','b']});
  assert.equal(rows.length,2);assert.equal(rows[0].title,'显示标题 A');assert.equal(rows[0].project.label,'ProjectAlpha');assert.equal(rows[1].archived,true);
  assert.equal(hash(await fs.readFile(s.dbPath)),before);
});
test('project matching respects root boundaries and explicit projectless or moved conversation assignments',async t=>{
  const s=await source(t);let rows=await readCatalog({...s,ids:['c']});assert.equal(rows[0].project.label,'未分组');
  s.global['projectless-thread-ids']=['a'];s.global['thread-project-assignments']={b:'projectalpha'};
  await fs.writeFile(s.globalPath,JSON.stringify(s.global));rows=await readCatalog({...s,ids:['a','b']});
  assert.equal(rows[0].project.label,'未分组');assert.equal(rows[1].project.label,'ProjectAlpha');
  assert.equal(normalizeWorkspacePath('\\\\?\\D:\\Example\\ProjectAlpha\\'),'d:\\example\\projectalpha');
});
test('worker observes archive and restore changes and is released on close',async t=>{
  const s=await source(t);const catalog=new CodexCatalog(s);t.after(()=>catalog.close());
  assert.equal((await catalog.refresh(['a']))[0].archived,false);
  const writer=new DatabaseSync(s.dbPath);writer.prepare('UPDATE threads SET archived=1 WHERE id=?').run('a');writer.close();
  assert.equal((await catalog.refresh(['a']))[0].archived,true);
  const restore=new DatabaseSync(s.dbPath);restore.prepare('UPDATE threads SET archived=0 WHERE id=?').run('a');restore.close();
  assert.equal((await catalog.refresh(['a']))[0].archived,false);await catalog.close();assert.equal(catalog.worker,null);
});
test('metadata failure retains previously known archived state and advertises a warning',async t=>{
  const store=await new BoardStore(path.join(await fixture(t),'boards')).init();await store.command(examplePlan());
  store.setCatalog([{id:'test-thread-a',archived:true,title:'Archived',project:{id:'p',label:'P',order:0}}]);
  store.setCatalog(null,'对话资料暂不可用');
  const result=store.snapshot();assert.equal(result.boards.length,0);assert.equal(result.metadataWarning,'对话资料暂不可用');
});
test('unsupported schemas fail explicitly; untrusted IDs remain bound parameters',async t=>{
  const s=await source(t);assert.deepEqual(await readCatalog({...s,ids:["a') OR 1=1 --"]}),[]);
  const bad=path.join(s.directory,'unsupported.sqlite');const db=new DatabaseSync(bad);db.exec('CREATE TABLE threads(id TEXT)');db.close();
  await assert.rejects(readCatalog({dbPath:bad,globalPath:s.globalPath,ids:['a']}),/UNSUPPORTED/);
});

test('shared server broadcasts native archive and restoration without deleting boards and releases its worker',async t=>{
  const s=await source(t),catalog=new CodexCatalog(s);
  const service=await startServer({state:path.join(s.directory,'service'),port:0,announce:false,catalog});
  t.after(()=>service.close());
  await service.store.command(examplePlan({thread_id:'a'}));
  const abort=new AbortController();
  t.after(()=>abort.abort());
  const response=await fetch(`${service.url}/api/events?thread=a`,{signal:abort.signal});
  assert.equal(response.status,200);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  async function until(predicate){
    for(;;){
      const frame=buffer.indexOf('\n\n');
      if(frame>=0){const text=buffer.slice(0,frame);buffer=buffer.slice(frame+2);const data=text.split('\n').find(line=>line.startsWith('data: '));if(data){const value=JSON.parse(data.slice(6));if(predicate(value))return value;}continue;}
      const chunk=await reader.read();assert.equal(chunk.done,false);buffer+=decoder.decode(chunk.value,{stream:true});
    }
  }
  const timeout=setTimeout(()=>abort.abort(),12000);t.after(()=>clearTimeout(timeout));
  await until(value=>value.boards.length===1);
  const writer=new DatabaseSync(s.dbPath);
  writer.prepare('UPDATE threads SET archived=1 WHERE id=?').run('a');
  const archived=await until(value=>value.selection.archived);
  assert.equal(archived.boards.length,0);assert.ok(!archived.threads.some(thread=>thread.id==='a'));
  assert.equal(service.store.boards.size,1);
  writer.prepare('UPDATE threads SET archived=0 WHERE id=?').run('a');writer.close();
  const restored=await until(value=>!value.selection.archived&&value.boards.length===1);
  assert.equal(restored.projects[0].label,'ProjectAlpha');
  abort.abort();await reader.cancel().catch(()=>{});await service.close();
  assert.equal(catalog.worker,null);await assert.rejects(fs.access(path.join(s.directory,'service','service.lock')));
});
