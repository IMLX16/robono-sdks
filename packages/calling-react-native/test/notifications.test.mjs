import test from 'node:test';
import assert from 'node:assert/strict';
import { createCallingNotificationHandler, parseCallingNotification } from '../dist/notifications.js';
const event=(sequence=1)=>({event:sequence===1?'calling.incoming':'calling.dismissed',event_id:'event'+sequence,call_id:'one',connection_id:'bridge:friend',sequence,ring_expires_at:new Date(Date.now()+30000).toISOString()});
function fixture() {
  let saved={}; const actions=[];
  const handler=createCallingNotificationHandler({accountKey:'user',store:{load:async()=>structuredClone(saved),save:async(_,v)=>{saved=v;}},
    dismiss:async id=>actions.push(['dismiss',id]),controller:{refresh:async()=>actions.push('refresh'),openIncoming:async id=>{actions.push(['open',id]);return true;}}});
  return {handler,actions};
}
test('dismissal wins before invitation; duplicates do not ring twice',async()=>{
  const f=fixture(); assert.equal(await f.handler.handle(event(2)),false);
  assert.equal(await f.handler.handle(event(),{opened:true}),false);
  assert.equal(f.actions.some(a=>Array.isArray(a)&&a[0]==='open'),false);
  const g=fixture(); assert.equal(await g.handler.handle(event()),true); assert.equal(await g.handler.handle(event()),false);
  assert.equal(await g.handler.handle(event(),{opened:true}),true);
});
test('expired push and malformed payload never open the call',async()=>{
  const f=fixture(); assert.equal(await f.handler.handle({...event(),ring_expires_at:'2000-01-01T00:00:00Z'},{opened:true}),false);
  assert.equal(parseCallingNotification({...event(),sequence:2}),null);
  assert.equal(parseCallingNotification({...event(),ring_expires_at:'not a date'}),null);
});
test('failed durable save is not treated as a processed invitation',async()=>{
  const f=createCallingNotificationHandler({accountKey:'user',store:{load:async()=>({}),save:async()=>{throw Error('disk');}},dismiss:async()=>{},controller:{refresh:()=>{throw Error('must not ring');}}});
  await assert.rejects(f.handle(event()),/disk/);
});
