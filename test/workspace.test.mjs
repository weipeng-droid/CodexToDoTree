import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBoards,workspaceSnapshot } from '../src/workspace.mjs';
import { plan,update } from '../src/model.mjs';
import { projectBoard } from '../src/tree.mjs';
import { examplePlan } from './helpers.mjs';
const board=(id,status,date='2026-10-28T01:00:00Z')=>({key:id,threadId:id,threadTitle:id,title:id,project:'Fallback',updatedAt:date,status,steps:[]});
test('active work items always precede blocked, pending and completed items regardless of recency',()=>{
  const list=[board('done','done','2099-01-01'),board('todo','todo'),board('active','in_progress','2000-01-01'),board('blocked','blocked'),board('accept','awaiting_verification')].sort(compareBoards);
  assert.deepEqual(list.map(b=>b.key),['active','blocked','accept','todo','done']);
});
test('archived conversations disappear without deleting boards; restore brings back the same state',()=>{
  const boards=[board('a','done'),board('b','in_progress')];
  const metadata=new Map([['a',{id:'a',title:'已归档',archived:true,project:{id:'p',label:'项目',order:0}}]]);
  const hidden=workspaceSnapshot(boards,metadata,'a');
  assert.equal(hidden.boards.length,0);assert.equal(hidden.selection.archived,true);assert.equal(hidden.threads.length,1);assert.equal(boards.length,2);
  metadata.get('a').archived=false;
  assert.equal(workspaceSnapshot(boards,metadata,'a').boards[0].key,'a');
});
test('project groups use Codex title and membership instead of the work item project label',()=>{
  const metadata=new Map([['a',{title:'实际对话标题',project:{id:'projectalpha',label:'ProjectAlpha',order:0}}],['b',{title:'另一个对话',project:{id:'uni',label:'ProjectBeta',order:1}}]]);
  const result=workspaceSnapshot([board('a','done'),board('b','in_progress')],metadata,null);
  assert.deepEqual(result.projects.map(p=>p.label),['ProjectAlpha','ProjectBeta']);
  assert.equal(result.projects[0].threads[0].title,'实际对话标题');
});
test('Chinese display annotations preserve original evidence, acceptance and task ordering timestamps',()=>{
  let original=plan(examplePlan());original=update(original,{step_id:'step-1',status:'done',evidence:'npm test: 14 passed; exit 0'});
  const annotated=update(original,{action:'annotate',step_id:'step-1',evidence_zh:'执行 npm test，14 项通过，退出码 0。',title_zh:'检查环境与运行条件'});
  assert.equal(annotated.updatedAt,original.updatedAt);assert.equal(annotated.steps[0].status,'done');assert.equal(annotated.steps[0].evidence,original.steps[0].evidence);
  const shown=projectBoard(annotated).steps[0];assert.match(shown.evidence,/14 项通过/);assert.equal(shown.title,'检查环境与运行条件');
});
test('stale Chinese evidence cannot describe a different verification result',()=>{
  let b=update(plan(examplePlan()),{step_id:'step-1',status:'done',evidence:'old proof'});
  b=update(b,{action:'annotate',step_id:'step-1',evidence_zh:'原先的验证记录'});
  b=update(b,{step_id:'step-1',status:'todo'});b=update(b,{step_id:'step-1',status:'done',evidence:'new proof'});
  assert.equal(projectBoard(b).steps[0].evidence,'new proof');
  assert.throws(()=>update(b,{action:'annotate',step_id:'step-1',evidence_zh:'English only'}),/Chinese/);
});
test('watched task sources allow display translation, not business mutations',()=>{
  const b=plan(examplePlan());b.source='C:\\fixture\\tasks.md';
  const annotated=update(b,{action:'annotate',step_id:'step-1',title_zh:'中文阶段名'});
  assert.equal(annotated.source,b.source);assert.equal(annotated.steps[0].title,b.steps[0].title);
  assert.throws(()=>update(b,{step_id:'step-1',status:'in_progress'}),/read-only/);
});
