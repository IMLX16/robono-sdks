import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(platform='android',gate=Promise.resolve()) {
  const actions=[], listeners=new Map(),appListeners=new Set(),tasks=new Map();
  const add=(name,fn)=>{listeners.set(name,fn);return {remove:()=>listeners.delete(name)};};
  const rn={AppRegistry:{registerHeadlessTask:(name,provider)=>tasks.set(name,provider)},Platform:{OS:platform},AppState:{currentState:'active',addEventListener:(_,fn)=>{appListeners.add(fn);return {remove:()=>appListeners.delete(fn)};}},
    DeviceEventEmitter:{addListener:add},NativeEventEmitter:class{addListener=add},
    NativeModules:{RobonoCallingRuntime:{begin:async(...args)=>{actions.push(['begin',...args]);await gate;},end:async token=>actions.push(['end',token])}}};
  const key='runtime'+crypto.randomUUID().replaceAll('-','');globalThis[key]=rn;
  let source=await readFile(new URL('../dist/runtime.js',import.meta.url),'utf8');
  source=source.replace("'react-native'",JSON.stringify(url(`export const {AppRegistry,AppState,DeviceEventEmitter,NativeEventEmitter,NativeModules,Platform}=globalThis.${key};`)));
  const {createNativeCallRuntime}=await import(url(source));
  const runtime=createNativeCallRuntime({notificationTitle:'Voice call',notificationText:'Call in progress',channelName:'Ongoing calls',endLabel:'End call',onError:e=>actions.push(['error',e.message])});
  const controller={getSnapshot:()=>({localHeld:false}),interrupt:async()=>actions.push(['hold']),resume:async()=>actions.push(['resume']),hangUp:async options=>actions.push(['hangup',options]),setForeground:v=>actions.push(['foreground',v]),refresh:async()=>{actions.push(['refresh']);return true;}};
  runtime.attach(controller);
  return {runtime,controller,actions,rn,listeners,appListeners,tasks,cleanup:()=>delete globalThis[key]};
}
test('background microphone starts only after explicit visible-app begin',async()=>{
  const f=await fixture();assert.equal(f.actions.some(a=>a[0]==='begin'),false);
  f.rn.AppState.currentState='background';await assert.rejects(f.runtime.begin(),/open_app/);
  f.rn.AppState.currentState='active';await f.runtime.begin();await f.runtime.begin();assert.equal(f.actions.filter(a=>a[0]==='begin').length,1);
  for(const fn of f.appListeners)fn('background');assert.equal(f.actions.some(a=>a[0]==='end'),false);
  await f.runtime.dispose();assert.equal(f.listeners.size,0);assert.equal(f.appListeners.size,0);f.cleanup();
});
test('logout during native start stops late service; cannot start again',async()=>{
  const gate=deferred(),f=await fixture('android',gate.promise);const begin=f.runtime.begin();
  await f.runtime.dispose();gate.resolve();await assert.rejects(begin,/call_cancelled/);
  await assert.rejects(f.runtime.begin(),/disposed/);assert.equal(f.actions.at(-1)[0],'end');f.cleanup();
});
for(const platform of ['ios','android'])test(`${platform}: interruption holds only its call; audio permission controls resume`,async()=>{
  const f=await fixture(platform);await f.runtime.begin();const token=f.actions.find(a=>a[0]==='begin')[1];
  const event=value=>f.listeners.get('RobonoCallingRuntimeEvent')({token,...value});
  event({token:'other',type:'interrupted'});assert.equal(f.actions.some(a=>a[0]==='hold'),false);
  event({type:'interrupted'});await new Promise(r=>setImmediate(r));
  assert.equal(f.actions.filter(a=>a[0]==='hold').length,1);
  assert.equal(f.actions.some(a=>a[0]==='hangup'),false);
  event({type:'interruptionEnded',shouldResume:false});await new Promise(r=>setImmediate(r));
  assert.equal(f.actions.some(a=>a[0]==='resume'),false);
  event({type:'interruptionEnded',shouldResume:true});await new Promise(r=>setImmediate(r));
  assert.equal(f.actions.filter(a=>a[0]==='resume').length,1);
  await f.runtime.dispose();f.cleanup();
});
test('Android audio loss holds; gain resumes; ducking does not interrupt',async()=>{
  const f=await fixture();await f.runtime.begin();f.listeners.get('onAudioFocusChange')({eventCode:-3});assert.equal(f.actions.some(a=>a[0]==='hold'),false);
  f.listeners.get('onAudioFocusChange')({eventCode:-2});assert.equal(f.actions.some(a=>a[0]==='hold'),true);
  f.listeners.get('onAudioFocusChange')({eventCode:1});await new Promise(r=>setImmediate(r));
  assert.equal(f.actions.some(a=>a[0]==='resume'),true);assert.equal(f.actions.some(a=>a[0]==='hangup'),false);
  await f.runtime.dispose();f.cleanup();
});
test('late native event from previous call cannot end the next call',async()=>{
  const f=await fixture();await f.runtime.begin();const old=f.actions.find(a=>a[0]==='begin')[1];
  await f.runtime.end();await f.runtime.begin();
  const tokens=f.actions.filter(a=>a[0]==='begin').map(a=>a[1]);assert.notEqual(tokens[0],tokens[1]);
  f.listeners.get('RobonoCallingRuntimeEvent')({token:old,type:'end'});
  assert.equal(f.actions.some(a=>a[0]==='hangup'),false);await f.runtime.dispose();f.cleanup();
});
test('Android call keeps JS lifetime through background, releases on end and ignores stale task tokens',async()=>{
  const f=await fixture();await f.runtime.begin();
  const token=f.actions.find(a=>a[0]==='begin')[1];
  let finished=false;
  const task=f.tasks.get('RobonoBridgeCallLifetime')()({token}).then(()=>{finished=true;});
  for(const fn of f.appListeners)fn('background');
  await new Promise(r=>setImmediate(r));assert.equal(finished,false);
  await f.runtime.end();await task;assert.equal(finished,true);
  await f.runtime.begin();const next=f.actions.filter(a=>a[0]==='begin').at(-1)[1];
  let nextFinished=false;const nextTask=f.tasks.get('RobonoBridgeCallLifetime')()({token:next}).then(()=>{nextFinished=true;});
  await f.tasks.get('RobonoBridgeCallLifetime')()({token});
  assert.equal(nextFinished,false);
  await f.runtime.dispose();await nextTask;assert.equal(nextFinished,true);f.cleanup();
});
test('native ticks refresh a background call and finish audio cleanup without JS timer callbacks',async t=>{
  t.mock.timers.enable({apis:['Date']}); t.mock.timers.setTime(1000);
  const f=await fixture(); await f.runtime.begin();const token=f.actions.find(a=>a[0]==='begin')[1];
  f.rn.AppState.currentState='background';const tick=()=>f.listeners.get('RobonoCallingRuntimeEvent')({token,type:'tick'});
  let released=0;f.runtime.schedule(()=>released++,700);
  tick();await new Promise(r=>setImmediate(r));assert.equal(f.actions.filter(a=>a[0]==='refresh').length,1);
  t.mock.timers.setTime(1800);tick();assert.equal(released,1);
  tick();assert.equal(released,1);assert.equal(f.actions.filter(a=>a[0]==='refresh').length,1);
  t.mock.timers.setTime(2100);tick();await new Promise(r=>setImmediate(r));assert.equal(f.actions.filter(a=>a[0]==='refresh').length,2);
  await f.runtime.dispose();f.cleanup();
});
test('native ticks end a background call whose state request is stuck',async t=>{
  t.mock.timers.enable({apis:['Date']});t.mock.timers.setTime(1000);
  const f=await fixture();const pending=deferred();f.controller.refresh=()=>pending.promise;
  await f.runtime.begin();const token=f.actions.find(a=>a[0]==='begin')[1];f.rn.AppState.currentState='background';
  f.listeners.get('RobonoCallingRuntimeEvent')({token,type:'tick'});
  t.mock.timers.setTime(12000);f.listeners.get('RobonoCallingRuntimeEvent')({token,type:'tick'});
  assert.equal(f.actions.filter(a=>a[0]==='hangup').length,1);
  pending.resolve(false);await f.runtime.dispose();f.cleanup();
});

test('held background lease survives suspension; expiry still releases the call',async t=>{
 t.mock.timers.enable({apis:['Date']});t.mock.timers.setTime(1000);
 const f=await fixture('ios');await f.runtime.begin();const token=f.actions.find(a=>a[0]==='begin')[1];
 f.controller.getSnapshot=()=>({localHeld:true,call:{holdExpiresAt:301000}});
 f.controller.refresh=async()=>false;f.rn.AppState.currentState='background';
 const tick=()=>f.listeners.get('RobonoCallingRuntimeEvent')({token,type:'tick'});
 tick();t.mock.timers.setTime(120000);tick();assert.equal(f.actions.some(a=>a[0]==='hangup'),false);
 t.mock.timers.setTime(301000);tick();assert.deepEqual(f.actions.find(a=>a[0]==='hangup'),['hangup',{playEndTone:false}]);
 await f.runtime.dispose();f.cleanup();
});
test('late interruption-end cannot resume after call ends',async()=>{
 const f=await fixture('ios'),pending=deferred();f.controller.interrupt=()=>pending.promise;
 await f.runtime.begin();const token=f.actions.find(a=>a[0]==='begin')[1];
 const event=value=>f.listeners.get('RobonoCallingRuntimeEvent')({token,...value});
 event({type:'interrupted'});event({type:'interruptionEnded',shouldResume:true});
 await f.runtime.end();pending.resolve();await new Promise(r=>setImmediate(r));
 assert.equal(f.actions.some(a=>a[0]==='resume'),false);await f.runtime.dispose();f.cleanup();
});
