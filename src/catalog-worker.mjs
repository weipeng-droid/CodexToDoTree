import { parentPort } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs/promises';
import { win32,posix } from 'node:path';

export function normalizeWorkspacePath(value) {
  if(typeof value!=='string')return '';
  let clean=value.replace(/^\\\\\?\\UNC\\/i,'\\\\').replace(/^\\\\\?\\/,'');
  return /^[a-z]:[\\/]|^\\\\/i.test(clean)?win32.normalize(clean).replace(/[\\/]+$/,'').toLowerCase():posix.normalize(clean).replace(/\/+$/,'');
}
export function resolveProject(row,projects,global) {
  const none={id:'ungrouped',label:'未分组',order:100000};
  if(global['projectless-thread-ids']?.includes?.(row.id))return none;
  const assignments=global['thread-project-assignments'] || {};
  const assignment=assignments[row.id];
  const explicit=typeof assignment==='string'?assignment:assignment?.projectId;
  const assigned=projects.find(p=>p.id===(explicit || row.project_id));
  if(assigned)return {id:assigned.id,label:assigned.label,order:assigned.order};
  if(Object.hasOwn(assignments,row.id))return none;
  const cwd=normalizeWorkspacePath(row.cwd);
  const matches=projects.flatMap(p=>p.roots.map(root=>({project:p,root:normalizeWorkspacePath(root)})))
    .filter(({root})=>root&&(cwd===root||cwd.startsWith(root+(root.includes('\\')?'\\':'/')))).sort((a,b)=>b.root.length-a.root.length||a.project.order-b.project.order);
  const best=matches[0]?.project;
  return best?{id:best.id,label:best.label,order:best.order}:none;
}
export async function readCatalog({dbPath,globalPath,ids}) {
  let global={};
  if(globalPath) {
    try {const stat=await fs.stat(globalPath);if(stat.size>4*1024*1024)throw new Error('GLOBAL_STATE_TOO_LARGE');global=JSON.parse(await fs.readFile(globalPath,'utf8'));}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const db=new DatabaseSync(dbPath,{readOnly:true});
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=200');
    const columns=new Set(db.prepare('PRAGMA table_info(threads)').all().map(row=>row.name));
    if(!['id','archived','cwd','title'].every(name=>columns.has(name)))throw new Error('UNSUPPORTED_CODEX_SCHEMA');
    let projects=[];
    if(global['local-projects']&&typeof global['local-projects']==='object') {
      const order=Array.isArray(global['project-order'])?global['project-order']:[];
      projects=Object.values(global['local-projects']).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&Array.isArray(p.rootPaths))
        .map(p=>({id:p.id,label:p.name,roots:p.rootPaths.filter(r=>typeof r==='string'),order:order.includes(p.id)?order.indexOf(p.id):9999}));
    } else {
      const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
      if(tables.has('projects')&&tables.has('project_roots')) {
        projects=db.prepare('SELECT id,name,position FROM projects').all().map(p=>({id:p.id,label:p.name,order:p.position,roots:db.prepare('SELECT path FROM project_roots WHERE project_id=? ORDER BY position').all(p.id).map(r=>r.path)}));
      }
    }
    const result=[];
    for(let offset=0;offset<ids.length;offset+=400) {
      const batch=ids.slice(offset,offset+400);
      if(!batch.length)continue;
      const rows=db.prepare(`SELECT id,archived,cwd,title,${columns.has('name')?'name':'NULL AS name'},${columns.has('project_id')?'project_id':'NULL AS project_id'} FROM threads WHERE id IN (${batch.map(()=>'?').join(',')})`).all(...batch);
      for(const row of rows)result.push({id:row.id,archived:!!row.archived,title:row.name || row.title,project:resolveProject(row,projects,global)});
    }
    return result;
  } finally {db.close();}
}
parentPort?.on('message',async request=>{
  try {parentPort.postMessage({id:request.id,rows:await readCatalog(request)});}
  catch(error){parentPort.postMessage({id:request.id,error:`对话资料同步失败（${error.code || '元数据格式或读取异常'}）`});}
});
