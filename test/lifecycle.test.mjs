import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { startServer } from '../src/server.mjs';
import { fixture, examplePlan } from './helpers.mjs';
import { ensureServer } from '../src/client.mjs';
async function waitForShutdown(service,timeoutMs=6000) {
  const deadline=Date.now()+timeoutMs;
  while(service.server.listening&&Date.now()<deadline)await pause(30);
  assert.equal(service.server.listening,false);
  await service.close();
}
test('unused service exits, releases the port and lock, and preserves tree state', async t => {
  const state = await fixture(t); const first = await startServer({ state, port:0, announce:false, idleTimeoutMs:120 }); t.after(()=>first.close());
  await first.store.command(examplePlan({ steps:[{id:'root',title:'Root',children:['Child']}] }));
  await pause(270); assert.equal(first.server.listening,false); await first.close();
  const next=await startServer({ state,port:0,announce:false }); t.after(()=>next.close());
  assert.equal(next.store.snapshot().boards[0].steps.length,2);
});
test('multiple viewing pages share one service; closing one cannot terminate the other', async t => {
  const state=await fixture(t); const service=await startServer({state,port:0,announce:false,idleTimeoutMs:1500}); t.after(()=>service.close());
  const a=new AbortController(),b=new AbortController();
  t.after(()=>{a.abort();b.abort();});
  const ra=await fetch(`${service.url}/api/events?thread=a`,{signal:a.signal}), rb=await fetch(`${service.url}/api/events?thread=b`,{signal:b.signal});
  const readerA=ra.body.getReader(),readerB=rb.body.getReader(); await readerA.read(); await readerB.read();
  a.abort(); await readerA.cancel().catch(()=>{}); await pause(1800);
  assert.equal(service.server.listening,true); assert.equal((await(await fetch(`${service.url}/api/health`)).json()).viewers,1);
  b.abort(); await readerB.cancel().catch(()=>{}); await waitForShutdown(service);
});
test('authenticated in-flight writes prevent idle shutdown until the commit is complete', async t => {
  const state=await fixture(t); const service=await startServer({state,port:0,announce:false,idleTimeoutMs:120}); t.after(()=>service.close());
  const save=service.store.save.bind(service.store); service.store.save=async board=>{await pause(260);return save(board);};
  const token=await fs.readFile(path.join(state,'client-key'),'utf8');
  const writing=fetch(`${service.url}/api/command`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(examplePlan())});
  await pause(190); assert.equal(service.server.listening,true); assert.equal((await writing).status,200);
});
test('URL acquisition renews idle grace while ordinary health probes do not', async t => {
  const state=await fixture(t); const service=await startServer({state,port:0,announce:false,idleTimeoutMs:1500}); t.after(()=>service.close());
  const started=Date.now();await pause(700);assert.equal(await ensureServer(state),service.url);
  await pause(900); assert.ok(Date.now()-started>=1500);assert.equal(service.server.listening,true);
  await fetch(`${service.url}/api/health`);
  await waitForShutdown(service,1250);
});
