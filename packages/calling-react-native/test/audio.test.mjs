import test from 'node:test';
import assert from 'node:assert/strict';
import { createCallAudio } from '../src/audio.mjs';
function fixture(extra={}) {
  const calls=[];
  const audio=createCallAudio({pause:()=>calls.push('pause'),playing:()=>false,prepare:async(p,s)=>calls.push(['prepare',p,s]),play:async p=>calls.push(['play',p]),release:async()=>calls.push('release'),dispose:()=>calls.push('dispose'),onError:e=>{throw e;},...extra});
  return {calls,audio};
}
const state=(phase,extra={})=>({phase,speaker:false,foreground:true,endTone:false,...extra});
test('ringing, connecting and hangup are distinct; connected is silent',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {calls,audio}=fixture();
  await audio.update(state('incoming')); await audio.update(state('connecting',{speaker:true})); await audio.update(state('connected',{speaker:true}));
  assert.deepEqual(calls.filter(c=>Array.isArray(c)&&c[0]==='play'),[['play','ringing'],['play','connecting']]);
  await audio.update(state('idle',{endTone:true}));
  assert.deepEqual(calls.at(-1),['play','ended']);
  t.mock.timers.tick(700); await audio.ready(); assert.equal(calls.at(-1),'release');
  await audio.dispose();
});
test('stale asynchronous preparation cannot play after decline',async()=>{
  let release; const pending=new Promise(r=>release=r), f=fixture({prepare:()=>pending});
  const ring=f.audio.update(state('incoming')); await Promise.resolve();
  const end=f.audio.update(state('idle')); release(); await ring; await end;
  assert.equal(f.calls.some(c=>Array.isArray(c)&&c[0]==='play'),false);
  await f.audio.dispose();
});
test('old end-tone cleanup cannot stop the next call',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture(); await f.audio.update(state('connected')); await f.audio.update(state('idle',{endTone:true}));
  await f.audio.update(state('outgoing')); const count=f.calls.length;
  t.mock.timers.tick(1000); await f.audio.ready();
  assert.equal(f.calls.length,count); await f.audio.dispose();
});
test('no custom foreground ringtone while background notification owns incoming alert',async()=>{
  const f=fixture(); await f.audio.update(state('incoming',{foreground:false}));
  assert.equal(f.calls.some(c=>Array.isArray(c)&&c[0]==='play'),false);
  await f.audio.dispose();
});
test('failed audio setup is visible to microphone preparation',async()=>{
  const f=fixture({prepare:async()=>{throw Error('audio_session_failed');}});
  await assert.rejects(f.audio.update(state('connecting')),/audio_session_failed/);
  await assert.rejects(f.audio.ready(),/audio_session_failed/);
  await f.audio.dispose();
});

test('hold silences cues without releasing call lifetime or taking audio from another call',async()=>{
 const f=fixture();await f.audio.update(state('connected'));const before=f.calls.length;
 await f.audio.update(state('held'));await f.audio.update(state('held',{foreground:false,speaker:true}));
 assert.equal(f.calls.slice(before).every(x=>x==='pause'),true);
 await f.audio.update(state('connected',{speaker:true}));
 assert.equal(f.calls.some(x=>Array.isArray(x)&&x[0]==='play'),false);await f.audio.dispose();
});
