import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/controller.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
function fixture(overrides = {}) {
  const sounds = [], actions = []; let callback;
  const client = {listen: async()=>{}, refresh: async()=>false, dispose: async()=>actions.push('dispose'),
    call: async()=>{}, answer: async()=>{}, hangUp: async()=>actions.push('hangup'), mute: value=>actions.push(['mute',value]), ...overrides};
  const controller = createController({request: async()=>{}, media: {}, audio: {update: s=>sounds.push(s), dispose: async()=>{}},
    resolveContact: id=>({name:id}), createClient: config => {callback=config.onChange;return client;}});
  const emit = (call, preparing = false) => callback({call,preparing,muted:false,error:null,voiceAvailable:true});
  return {controller,client,sounds,actions,emit};
}
const incoming = {id:'one',connectionId:'bridge:friend',state:'ringing',role:'callee',controlled:true};
test('explicit silent hangup does not request an audio cue',async()=>{
  const f=fixture();f.emit({...incoming,state:'connected',connectedAt:2000});
  await f.controller.hangUp({playEndTone:false});
  assert.deepEqual(f.actions,['hangup']);
  assert.equal(f.controller.getSnapshot().phase,'idle');
  assert.equal(f.sounds.at(-1).endTone,false);
  f.emit({...incoming,state:'ended',reason:'hangup'});
  assert.equal(f.sounds.some(s=>s.endTone),false);
});
test('speaker choice is per call; early outgoing choice survives receiving its call ID', async()=>{
  const pending=deferred(), f=fixture({call:()=>pending.promise});
  f.emit({...incoming,state:'connected',connectedAt:2000});
  f.controller.setSpeaker(true);
  await f.controller.hangUp();
  const next=f.controller.call('bridge:friend');
  assert.equal(f.controller.getSnapshot().speaker,false);
  f.controller.setSpeaker(true);
  f.emit({...incoming,id:'two',role:'caller'},true);
  assert.equal(f.controller.getSnapshot().speaker,true);
  pending.resolve(); await next;
  await f.controller.hangUp();
  f.emit({...incoming,id:'three'});
  assert.equal(f.controller.getSnapshot().speaker,false);
});
test('answer stays mounted, speaker works before media, duration starts at connection', async()=>{
  const pending = deferred(), f = fixture({answer:()=>pending.promise});
  const phases = []; f.controller.subscribe(()=>phases.push(f.controller.getSnapshot().phase));
  f.emit(incoming);
  const answer = f.controller.answer();
  assert.equal(f.controller.getSnapshot().phase,'connecting');
  assert.equal(f.controller.getSnapshot().connectedAt,null);
  f.controller.setSpeaker(true);
  assert.equal(f.sounds.at(-1).speaker,true);
  f.emit(incoming,true);
  assert.equal(f.controller.getSnapshot().phase,'connecting');
  f.emit({...incoming,state:'connected',connectedAt:2000},true);
  pending.resolve(); await answer;
  assert.equal(f.controller.getSnapshot().connectedAt,2000);
  assert.equal(phases.includes('idle'),false);
  await f.controller.hangUp();
  assert.equal(f.controller.getSnapshot().phase,'idle');
  assert.equal(f.sounds.at(-1).endTone,true);
});
test('decline and unanswered caller cancellation are silent',async()=>{
  for (const local of [true,false]) {
    const f=fixture(); f.emit(incoming);
    if(local) await f.controller.hangUp(); else f.emit({...incoming,state:'ended',reason:'cancelled'});
    assert.equal(f.sounds.some(s=>s.endTone),false);
    assert.equal(f.controller.getSnapshot().phase,'idle');
  }
});
test('cancel during outgoing preparation does not reopen a screen',async()=>{
  const pending=deferred(),f=fixture({call:()=>pending.promise});
  const call=f.controller.call('bridge:friend',{name:'Alex'});
  assert.equal(f.controller.getSnapshot().canSpeaker,true);
  await f.controller.hangUp();
  f.emit(null,true); pending.resolve(); await call; f.emit(null,false);
  assert.equal(f.controller.getSnapshot().phase,'idle');
});
test('another device owning a call never presents Answer or starts a ringtone',()=>{
  const f=fixture(); f.emit({...incoming,controlled:false});
  assert.equal(f.controller.getSnapshot().phase,'idle');
  assert.equal(f.sounds.some(s=>s.phase==='incoming'),false);
});
test('notification opens loading screen and only verified matching call enables Answer',async()=>{
  const pending=deferred(), f=fixture({refresh:()=>pending.promise});
  const opened=f.controller.openIncoming('one');
  assert.equal(f.controller.getSnapshot().phase,'loading');
  assert.equal(f.actions.length,0);
  f.emit({...incoming,id:'other'});
  assert.equal(f.controller.getSnapshot().phase,'loading');
  f.emit(incoming); pending.resolve(true);
  assert.equal(await opened,true);
  assert.equal(f.controller.getSnapshot().phase,'incoming');
});
test('expired push closes without capturing microphone or hanging up another call',async()=>{
  const f=fixture({refresh:async()=>true});
  assert.equal(await f.controller.openIncoming('old'),false);
  assert.equal(f.controller.getSnapshot().phase,'error');
  assert.deepEqual(f.actions,[]);
  f.controller.dismissError();
  assert.equal(f.controller.getSnapshot().phase,'idle');
});
test('background incoming audio is handed to host notifications',()=>{
  const f=fixture(); f.controller.setForeground(false); f.emit(incoming);
  assert.equal(f.sounds.at(-1).foreground,false);
  f.controller.setForeground(true);
  assert.equal(f.sounds.at(-1).foreground,true);
});
test('dispose stops client even if native cleanup fails',async()=>{
  let closed=false;
  const f=createController({request:async()=>{},media:{},audio:{update:()=>{},dispose:async()=>{throw Error('native');}},createClient:()=>({dispose:async()=>{closed=true;}})});
  await assert.rejects(f.dispose(),/native/); assert.equal(closed,true);
});
test('revoked or expired session cannot leave a connected screen or enabled audio controls',async()=>{
  let emit;
  const client={closed:false};
  const controller=createController({request:async()=>{},media:{},audio:{update:()=>{},dispose:async()=>{}},
    createClient:options=>{emit=options.onChange;return client;}});
  const call={...incoming,state:'connected',connectedAt:1000};
  emit({call,muted:false,error:null});
  client.closed=true;
  emit({call,muted:false,error:'session_expired'});
  const state=controller.getSnapshot();
  assert.equal(state.phase,'error');assert.equal(state.call,null);
  assert.equal(state.connectedAt,null);assert.equal(state.canMute,false);assert.equal(state.canSpeaker,false);
});

test('the waiting participant still hears hangup when the other side was holding',async()=>{
 const f=fixture();f.emit({...incoming,state:'connected',connectedAt:2000});
 f.emit({...incoming,state:'connected',connectedAt:2000,remoteHeld:true});
 assert.equal(f.controller.getSnapshot().phase,'held');
 f.emit({...incoming,state:'ended',reason:'hangup'});
 assert.equal(f.sounds.at(-1).endTone,true);
});

test('failed resume remains visible across held snapshots and repeated taps share one request',async()=>{
 let emit, attempts=0, pending=deferred();
 const controller=createController({request:async()=>{},media:{},audio:{update:()=>{},dispose:async()=>{}},
  createClient:options=>{emit=options.onChange;return {resume:()=>{attempts++;return pending.promise;}};}});
 const call={...incoming,state:'connected',connectedAt:1000};
 const held=()=>emit({call:{...call,localHeld:true},localHeld:true,muted:true,error:null});
 emit({call,muted:true,error:null});controller.setSpeaker(true);held();
 const first=controller.resume(),second=controller.resume();
 assert.equal(first,second);assert.equal(controller.getSnapshot().resumePending,true);
 await Promise.resolve();assert.equal(attempts,1);
 pending.reject(Error('call_state_unavailable'));await assert.rejects(first,/call_state_unavailable/);
 held();
 assert.equal(controller.getSnapshot().resumePending,false);
 assert.equal(controller.getSnapshot().resumeError,'call_state_unavailable');
 assert.equal(controller.getSnapshot().speaker,true);assert.equal(controller.getSnapshot().muted,true);
 pending=deferred();const retry=controller.resume();assert.equal(controller.getSnapshot().resumeError,null);
 emit({call,localHeld:false,muted:true,error:null});pending.resolve();await retry;
 assert.equal(controller.getSnapshot().phase,'connected');assert.equal(controller.getSnapshot().resumeError,null);
});

test('late resume failure does not put an error on an ended call',async()=>{
 let emit;const pending=deferred();
 const controller=createController({request:async()=>{},media:{},audio:{update:()=>{},dispose:async()=>{}},
  createClient:options=>{emit=options.onChange;return {resume:()=>pending.promise};}});
 emit({call:{...incoming,state:'connected',localHeld:true},localHeld:true,muted:false,error:null});
 const work=controller.resume();await Promise.resolve();
 emit({call:{...incoming,state:'ended'},muted:false,error:null});
 pending.reject(Error('call_state_unavailable'));await assert.rejects(work);
 assert.equal(controller.getSnapshot().phase,'idle');assert.equal(controller.getSnapshot().resumeError,null);
});
