import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyRobonoWebhook,toCallingPushPayload,toClientPushPayload} from '../dist/index.js';
const secret='a-network-webhook-secret';
async function verify(event,options={}) {const body=JSON.stringify(event),timestamp=new Date().toISOString();return verifyRobonoWebhook(body,{'Robono-Webhook-Timestamp':timestamp,'Robono-Webhook-Id':event.event_id,'Robono-Webhook-Signature':'v1='+createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex')},secret,options);}
test('calling events verify, deduplicate and produce routing-only push data',async()=>{
 const seen=new Set();
 for(const phase of ['incoming','dismissed']){
  const event={event:'calling.'+phase,event_id:'evt_'+phase,request_id:'req',created_at:new Date().toISOString(),recipient:{child_app_id:'app',external_user_id:'person'},call:{id:'call',connection_id:'bridge:connection',created_at:new Date().toISOString(),ring_expires_at:new Date(Date.now()+30000).toISOString(),sequence:phase==='incoming'?1:2,...(phase==='dismissed'?{reason:'answered'}:{})}};
  const options={claimEvent:async id=>{if(seen.has(id))return false;seen.add(id);return true;}};
  assert.equal((await verify(event,options)).duplicate,false);assert.equal((await verify(event,options)).duplicate,true);
  const push=toCallingPushPayload(event);assert.equal(push.call_id,'call');assert.equal(push.sequence,event.call.sequence);assert(!JSON.stringify(push).includes('person'));
  assert.throws(()=>toClientPushPayload(event),/toCallingPushPayload/);
  await assert.rejects(verify({...event,call:{...event.call,sequence:3}}),/sequence/);
 }
});
