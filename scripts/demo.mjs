import * as fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/paths.mjs';
import { startServer } from '../src/server.mjs';
const base=path.join(ROOT,'work');await fs.mkdir(base,{recursive:true});
const state=await fs.mkdtemp(path.join(base,'demo-'));
const service=await startServer({state,port:0,announce:false,catalog:null});
const plan={action:'plan',thread_id:'demo-thread',thread_title:'Build a thoughtful release',board_id:'release',title:'Ship the next release',project:'Example App',steps:[
  {id:'research',title:'Understand the problem',children:['Review the existing workflow','Confirm acceptance criteria']},
  {id:'build',title:'Build the core experience',children:[{id:'api',title:'Implement the data layer',children:['Define the contract','Verify persistence']},{id:'ui',title:'Refine the task tree',children:['Add nested navigation','Polish motion and keyboard focus']}]},
  {id:'verify',title:'Verify the complete workflow',children:['Run automated tests','Check responsive layouts']},
  {id:'ship',title:'Document and ship'}
]};
await service.store.command(plan);
const update=(step_id,status,evidence)=>service.store.command({action:'update',thread_id:plan.thread_id,board_id:plan.board_id,step_id,status,evidence});
for(const id of ['research.1','research.2','research','api.1','api.2','api','ui.1'])await update(id,'done','Demo fixture only. Synthetic verification evidence.');
await update('ui.2','in_progress');
await service.store.command({...plan,board_id:'previous',title:'Prepare the release workspace',steps:['Review requirements','Agree on the plan','Prepare fixtures','Validate setup']});
for(const id of ['step-1','step-2','step-3','step-4'])await service.store.command({action:'update',thread_id:plan.thread_id,board_id:'previous',step_id:id,status:'done',evidence:'Demo fixture only.'});
service.store.setCatalog([{id:'demo-thread',archived:false,title:plan.thread_title,project:{id:'example',label:'Example App',order:0}}]);
console.log(JSON.stringify({url:`${service.url}/?thread=demo-thread`,state,synthetic:true}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await service.close();process.exit(0);});
