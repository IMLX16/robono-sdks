import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/controller.mjs';
import { RobonoCallingClient } from '../../calling/src/index.mjs';
test('real engine and optional controller keep Answer continuous and end once',async()=>{
  const phases=[],sounds=[];let pc;
  const call={id:'call',version:1,connectionId:'bridge:friend',role:'callee',state:'ringing',controlled:true,
    remoteDescription:{type:'offer',sdp:'offer'},remoteCandidates:[],createdAt:Date.now()};
  const track={enabled:true,stop(){this.stopped=true;}};
  const controller=createController({createClient:options=>new RobonoCallingClient(options),
    request:async(op)=>op==='state'?{voiceAvailable:true,call}:op==='ice'?{iceServers:[]}:op==='answer'?{...call,state:'connecting',version:2}:op==='end'?{...call,state:'ended',version:3}: {},
    media:{getUserMedia:async()=>({getAudioTracks:()=>[track],getVideoTracks:()=>[],getTracks:()=>[track]}),createPeerConnection:()=>pc={
      addTrack(){},setRemoteDescription:async()=>{},createAnswer:async()=>({type:'answer',sdp:'answer'}),
      async setLocalDescription(value){this.localDescription=value;},close(){},connectionState:'new'}},
    audio:{update:s=>sounds.push(s),dispose:async()=>{}},resolveContact:()=>({name:'Friend'})});
  controller.subscribe(()=>phases.push(controller.getSnapshot().phase));
  await controller.refresh();await controller.answer();
  assert.deepEqual([...new Set(phases)],['incoming','connecting']);
  assert.equal(controller.getSnapshot().canSpeaker,true);
  pc.connectionState='connected'; pc.onconnectionstatechange();
  assert.equal(controller.getSnapshot().phase,'connected');
  const ended=controller.hangUp();
  assert.equal(controller.getSnapshot().phase,'idle');assert.equal(track.stopped,true);
  await ended; assert.equal(sounds.filter(s=>s.endTone).length,1);
  await controller.dispose();
});
