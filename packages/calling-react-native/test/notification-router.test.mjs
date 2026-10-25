import test from 'node:test';
import assert from 'node:assert/strict';
import {createCallingNotificationRouter, callingNotificationPresentation} from '../dist/notification-router.js';
const event=(sequence=1)=>({account:'alice',event:sequence===1?'calling.incoming':'calling.dismissed',event_id:'event'+sequence,call_id:'one',connection_id:'network:friend',sequence,ring_expires_at:new Date(Date.now()+30000).toISOString()});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(extra={}) {
  let ledger={};const actions=[];
  const router=createCallingNotificationRouter({accountKey:'alice',recipientAccount:p=>p?.account,store:{load:async()=>structuredClone(ledger),save:async(_,v)=>{ledger=v;}},open:id=>actions.push(['open',id]),dismiss:async id=>actions.push(['dismiss',id]),refresh:async()=>actions.push('refresh'),...extra});
  return {router,actions};
}
test('cold-start response and duplicate live tap open exactly one call layer',async()=>{
  const f=fixture();await Promise.all([f.router.handle(event(),true),f.router.handle(event(),true)]);
  assert.deepEqual(f.actions,[['open','one'],['dismiss','one']]);
});
test('received invitation can be opened later; dismissal cannot hang up an answered call',async()=>{
  const f=fixture();await f.router.handle(event());await f.router.handle(event(),true);await f.router.handle(event(2));await f.router.handle(event(),true);
  assert.deepEqual(f.actions,['refresh',['open','one'],['dismiss','one'],['dismiss','one'],'refresh',['dismiss','one'],'refresh']);
});
test('wrong account and expired pushes do not open a screen',async()=>{
  const f=fixture();assert.equal(await f.router.handle({...event(),account:'bob'},true),false);
  await f.router.handle({...event(),ring_expires_at:'2000-01-01T00:00:00Z'},true);
  assert.equal(f.actions.some(a=>a[0]==='open'),false);
});
test('logout during durable read cancels the pending tap',async()=>{
  const gate=deferred();const f=fixture({store:{load:()=>gate.promise,save:async()=>{}}});
  const done=f.router.handle(event(),true);await Promise.resolve();f.router.dispose();gate.resolve({});await done;
  assert.deepEqual(f.actions,[]);
});
test('storage failure fails closed and can be retried',async()=>{
  let fail=true;const f=fixture({store:{load:async()=>({}),save:async()=>{if(fail)throw Error('storage');}}});
  await assert.rejects(f.router.handle(event(),true),/storage/);assert.deepEqual(f.actions,[]);
  fail=false;await f.router.handle(event(),true);assert.equal(f.actions[0][0],'open');
});
test('foreground suppresses duplicate alert, background retains normal notification',()=>{
  assert.equal(callingNotificationPresentation(event(),true),'screen');
  assert.equal(callingNotificationPresentation(event(),false),'notification');
  assert.equal(callingNotificationPresentation(event(2),false),'dismiss');
  assert.equal(callingNotificationPresentation({event:'message.created'},true),null);
});
