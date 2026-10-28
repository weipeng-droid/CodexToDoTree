import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from '../src/paths.mjs';
await import('./privacy-check.mjs');
const ignored=new Set(['node_modules','.git','work','coverage']);
const files=[];
async function walk(directory){
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    if(ignored.has(entry.name))continue;
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory()){await walk(absolute);continue;}
    const bytes=await fs.readFile(absolute);
    files.push({path:path.relative(ROOT,absolute).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
}
await walk(ROOT);files.sort((a,b)=>a.path.localeCompare(b.path));
console.log(JSON.stringify({project:'CodexToDoTree',version:'0.1.0',files},null,2));
