import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const excluded=new Set(['node_modules','.git','work','coverage']);
const personal=os.userInfo().username;
const rules=[
  ['home path',/(?:[A-Z]:[\\/]+Users[\\/]+[^\s"'<>]+|\/(?:Users|home)\/[a-z0-9_.-]+\/)/i],
  ['private network address',/\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/],
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['credential',/\b(?:gh[pousr]_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{30,}|sk-[a-zA-Z0-9_-]{24,})\b/],
];
let count=0;
async function visit(directory){
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    if(excluded.has(entry.name))continue;
    const file=path.join(directory,entry.name),relative=path.relative(root,file);
    if(entry.isSymbolicLink())throw new Error(`Refusing linked public source: ${relative}`);
    if(entry.isDirectory()){if(entry.name==='state')throw new Error('Runtime state cannot be published');await visit(file);continue;}
    if(/(?:\.sqlite(?:-.*)?|\.bak|\.log|\.pfx|\.pem|\.key|\.tgz)$|^(?:client-key|endpoint\.json|service\.lock|\.env)$/i.test(entry.name))throw new Error(`Private artifact: ${relative}`);
    count++;
    if(/\.(?:png|jpg|jpeg|gif|webp)$/i.test(file))continue;
    const text=await fs.readFile(file,'utf8');
    for(const [name,pattern]of rules)if(pattern.test(text))throw new Error(`${relative}: possible ${name}`);
    if(personal.length>=5&&text.toLowerCase().includes(personal.toLowerCase()))throw new Error(`${relative}: possible local username`);
  }
}
await visit(root);
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Privacy guard passed for ${count} public files. Images require a separate visual review.`);
