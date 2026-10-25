import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function native(platform, {permission='granted', capture, runtime=false, focus='AUDIOFOCUS_REQUEST_GRANTED'}={}) {
  const calls=[], players=[];
  let audioSessionActive=false;
  const fixture={
    rn:{Platform:{OS:platform},PermissionsAndroid:{PERMISSIONS:{RECORD_AUDIO:'mic'},RESULTS:{GRANTED:'granted'},request:async()=>{calls.push('permission');return permission;}}},
    rtc:{mediaDevices:{getUserMedia:async input=>{audioSessionActive=true;calls.push(['capture',input]);return capture || {getTracks:()=>[{stop:()=>calls.push('stop-track')}]};}},MediaStream:class{},RTCPeerConnection:class{}},
    manager:{requestAudioFocus:async()=>{calls.push('focus');return focus;},abandonAudioFocus:async()=>calls.push('abandon'),start:()=>{audioSessionActive=true;calls.push('start');},stop:()=>{audioSessionActive=false;calls.push('stop');},setForceSpeakerphoneOn:value=>calls.push(['speaker',value]),startRingtone:()=>calls.push('ring'),stopRingtone:()=>{}},
    audio:{setAudioModeAsync:async mode=>calls.push(['mode',mode]),createAudioPlayer:(_source,options)=>{
      const index=players.length;
      // Expo's iOS player deactivates the shared session on pause by default,
      // even when non-Expo WebRTC capture is active.
      const p={isLoaded:false,currentTime:0,pause:()=>{if(platform==='ios'&&!options?.keepAudioSessionActive)audioSessionActive=false;},seekTo:async()=>{calls.push(['seek',index]);p.currentTime=0;},
        play:()=>{calls.push(['play',index,p.currentTime]);if(index===2)p.currentTime=0.65;},remove:()=>calls.push('remove')};
      players.push(p);return p;
    }},
  };
  const id=crypto.randomUUID().replaceAll('-',''); globalThis[id]=fixture;
  let source=await readFile(new URL('../dist/native.js',import.meta.url),'utf8');
  const modules={
    'react-native':`export const {Platform,PermissionsAndroid}=globalThis['${id}'].rn;`,
    'react-native-webrtc':`export const {mediaDevices,MediaStream,RTCPeerConnection}=globalThis['${id}'].rtc;`,
    'react-native-incall-manager':`export default globalThis['${id}'].manager;`,
    'expo-audio':`export const {createAudioPlayer,setAudioModeAsync}=globalThis['${id}'].audio;`,
    'expo-crypto':'export const randomUUID=()=>crypto.randomUUID();',
  };
  for(const [name,body] of Object.entries(modules)) source=source.replace(`from '${name}'`,`from '${url(body)}'`);
  source=source.replace("'./audio.mjs'",JSON.stringify(new URL('../dist/audio.mjs',import.meta.url).href));
  source=source.replace("'./appearance.js'",JSON.stringify(new URL('../dist/appearance.js',import.meta.url).href));
  // Metro resolves WAV assets to resource IDs. Fake only that platform boundary.
  source='const require=()=>1;\n'+source;
  const {createNativeCallAdapters}=await import(url(source));
  const adapter=createNativeCallAdapters({restoreAudio:async()=>calls.push('restore'),onError:e=>{throw e;},
    ...(runtime?{runtime:{activateAudio:async()=>calls.push('activate'),begin:async()=>calls.push('runtime-begin'),end:async()=>calls.push('runtime-end')}}:{})});
  return {adapter,calls,audioSessionActive:()=>audioSessionActive,cleanup:()=>delete globalThis[id]};
}
test('iOS: stopping connecting cues and entering background preserve WebRTC audio until call cleanup',async()=>{
  const f=await native('ios');
  await f.adapter.audio.update({phase:'connecting',speaker:false,foreground:true,endTone:false});
  await f.adapter.media.getUserMedia({isCurrent:()=>true});
  assert.equal(f.audioSessionActive(),true);
  await f.adapter.audio.update({phase:'connected',speaker:false,foreground:true,endTone:false});
  assert.equal(f.audioSessionActive(),true,'stopping connection tone must not deactivate WebRTC');
  await f.adapter.audio.update({phase:'connected',speaker:false,foreground:false,endTone:false});
  assert.equal(f.audioSessionActive(),true,'switching apps must retain call audio');
  await f.adapter.audio.update({phase:'idle',speaker:false,foreground:false,endTone:false});
  assert.equal(f.audioSessionActive(),false,'call cleanup must release the shared session');
  await f.adapter.audio.dispose();f.cleanup();
});
for(const platform of ['ios','android']) {
  test(`${platform}: completed hangup cue rewinds for the next call even when isLoaded is false`,async()=>{
    const f=await native(platform);
    for(let n=0;n<2;n++) {
      await f.adapter.audio.update({phase:'connected',speaker:true,foreground:true,endTone:false});
      await f.adapter.audio.update({phase:'idle',speaker:true,foreground:true,endTone:true});
    }
    const ends=f.calls.filter(c=>Array.isArray(c)&&c[0]==='play'&&c[1]===2);
    assert.deepEqual(ends,[['play',2,0],['play',2,0]]);
    assert.equal(f.calls.some(c=>Array.isArray(c)&&c[0]==='seek'&&c[1]===2),true);
    await f.adapter.audio.dispose();f.cleanup();
  });
  test(`${platform}: microphone only on action, speaker retained and native resources restored`,async()=>{
    const f=await native(platform);
    assert.equal(f.calls.some(c=>Array.isArray(c)&&c[0]==='capture'),false);
    await f.adapter.audio.update({phase:'connecting',speaker:true,foreground:true,endTone:false});
    await f.adapter.media.getUserMedia({isCurrent:()=>true});
    assert.deepEqual(f.calls.at(-1),['speaker',true]);
    await f.adapter.audio.update({phase:'connected',speaker:false,foreground:true,endTone:false});
    assert.deepEqual(f.calls.at(-1),['speaker',null]);
    await f.adapter.audio.dispose(); assert.equal(f.calls.includes('restore'),true); f.cleanup();
  });
  test(`${platform}: cancellation before microphone prevents capture`,async()=>{
    const f=await native(platform);
    await assert.rejects(f.adapter.media.getUserMedia({isCurrent:()=>false}),/call_cancelled/);
    assert.equal(f.calls.some(c=>Array.isArray(c)&&c[0]==='capture'),false);
    await f.adapter.audio.dispose(); f.cleanup();
  });
}
test('Android microphone denial does not capture or create a peer',async()=>{
  const f=await native('android',{permission:'denied'});
  await assert.rejects(f.adapter.media.getUserMedia({isCurrent:()=>true}),/microphone_permission_denied/);
  assert.equal(f.calls.some(c=>Array.isArray(c)&&c[0]==='capture'),false);
  await f.adapter.audio.dispose(); f.cleanup();
});
test('background lifetime starts after permission but before microphone capture, releases after call',async()=>{
  const f=await native('android',{runtime:true});
  await f.adapter.audio.update({phase:'connecting',speaker:false,foreground:true,endTone:false});
  assert.equal(f.calls.includes('runtime-begin'),false);
  await f.adapter.media.getUserMedia({isCurrent:()=>true});
  const begin=f.calls.indexOf('runtime-begin'),capture=f.calls.findIndex(c=>Array.isArray(c)&&c[0]==='capture');
  assert.ok(f.calls.indexOf('permission')<begin && begin<capture);
  await f.adapter.audio.dispose();assert.ok(f.calls.indexOf('runtime-end')<f.calls.indexOf('restore'));f.cleanup();
});

for(const platform of ['ios','android'])test(`${platform}: hold never reactivates audio; resume restores route and releases acquired focus`,async()=>{
 const f=await native(platform,{runtime:true});
 await f.adapter.audio.update({phase:'connected',speaker:true,foreground:true,endTone:false});
 const before=f.calls.length;
 await f.adapter.audio.update({phase:'held',speaker:true,foreground:false,endTone:false});
 assert.equal(f.calls.length,before);
 await f.adapter.audio.resume();assert.equal(f.calls.includes(platform==='ios'?'activate':'focus'),true);
 assert.deepEqual(f.calls.at(-1),['speaker',true]);
 await f.adapter.audio.dispose();if(platform==='android')assert.equal(f.calls.includes('abandon'),true);f.cleanup();
});
test('Android resume denied by the OS does not change route or claim audio focus',async()=>{
 const f=await native('android',{focus:'AUDIOFOCUS_REQUEST_FAILED'});
 await f.adapter.audio.update({phase:'connected',speaker:false,foreground:true,endTone:false});
 await f.adapter.audio.update({phase:'held',speaker:false,foreground:true,endTone:false});
 await assert.rejects(f.adapter.audio.resume(),/audio_still_interrupted/);
 assert.equal(f.calls.at(-1),'focus');await f.adapter.audio.dispose();assert.equal(f.calls.includes('abandon'),false);f.cleanup();
});
