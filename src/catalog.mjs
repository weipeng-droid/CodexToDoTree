import { Worker } from 'node:worker_threads';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
export class CodexCatalog {
  constructor({home=process.env.CODEX_HOME || path.join(os.homedir(),'.codex'),dbPath=null,globalPath=null}={}) {
    this.home=home;this.dbPath=dbPath;this.globalPath=globalPath || path.join(home,'.codex-global-state.json');this.sequence=0;this.pending=null;this.worker=null;
  }
  async refresh(ids) {
    if(!ids.length)return [];
    if(!this.dbPath) {
      const candidates=(await fs.readdir(this.home)).filter(name=>/^state_\d+\.sqlite$/.test(name)).sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]));
      if(!candidates.length)throw new Error('Codex 对话元数据文件不可用');
      this.dbPath=path.join(this.home,candidates[0]);
    }
    if(!this.worker) {
      this.worker=new Worker(new URL('./catalog-worker.mjs',import.meta.url));
      this.worker.on('message',message=>{if(message.id!==this.pending?.id)return;const pending=this.pending;this.pending=null;clearTimeout(pending.timer);message.error?pending.reject(new Error(message.error)):pending.resolve(message.rows);});
      this.worker.on('error',()=>{if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(new Error('对话资料读取进程异常'));this.pending=null;}this.worker=null;});
    }
    if(this.pending)throw new Error('对话资料正在同步');
    return new Promise((resolve,reject)=>{
      const id=++this.sequence;
      const timer=setTimeout(()=>{this.pending=null;const old=this.worker;this.worker=null;old?.terminate();reject(new Error('对话资料同步超时'));},3000);
      this.pending={id,resolve,reject,timer};
      this.worker.postMessage({id,ids,dbPath:this.dbPath,globalPath:this.globalPath});
    });
  }
  async close() {
    if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(new Error('对话资料同步已结束'));this.pending=null;}
    const worker=this.worker;this.worker=null;if(worker)await worker.terminate();
  }
}
