import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCallingNotificationStore} from '../dist/notifications.js';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const event={account:'alice',event:'calling.incoming',event_id:'event',call_id:'one',connection_id:'network:friend',sequence:1,ring_expires_at:new Date(Date.now()+30000).toISOString()};
const response={actionIdentifier:'default',notification:{request:{identifier:'push-one',content:{data:event}}}};
test('Expo cold-start and live response deduplicate; only matching call notification is dismissed',async()=>{
  const actions=[],listeners={};let last=response,ledger={};
  const key='expo'+crypto.randomUUID().replaceAll('-','');
  const module={DEFAULT_ACTION_IDENTIFIER:'default',
    getPresentedNotificationsAsync:async()=>[response.notification,{request:{identifier:'chat',content:{data:{event:'message.created'}}}},{request:{identifier:'other-account',content:{data:{...event,account:'bob'}}}}],
    dismissNotificationAsync:async id=>actions.push(['dismiss',id]),getLastNotificationResponseAsync:async()=>last,
    clearLastNotificationResponseAsync:async()=>{last=null;actions.push(['clear']);},
    addNotificationReceivedListener:fn=>{listeners.received=fn;return {remove:()=>delete listeners.received};},
    addNotificationResponseReceivedListener:fn=>{listeners.response=fn;return {remove:()=>delete listeners.response};}};
  globalThis[key]=module;
  let source=await readFile(new URL('../dist/expo-notifications.js',import.meta.url),'utf8');
  const exports=Object.keys(module).join(',');
  source=source.replace("'expo-notifications'",JSON.stringify(url(`export const {${exports}}=globalThis.${key};`))).replace("'react-native'",JSON.stringify(url('export const AppState={currentState:"active"};'))).replaceAll("'./notification-router.js'",JSON.stringify(new URL('../dist/notification-router.js',import.meta.url).href));
  const {connectExpoCallingNotifications,withCallingNotificationPresentation}=await import(url(source));
  const normal={shouldPlaySound:true,shouldShowBanner:true};
  const foreground=withCallingNotificationPresentation({handleNotification:async()=>normal},()=>true);
  assert.equal((await foreground.handleNotification(response.notification)).shouldShowBanner,false);
  assert.equal(await foreground.handleNotification({request:{content:{data:{event:'message.created'}}}}),normal);
  const booting=withCallingNotificationPresentation({handleNotification:async()=>normal},()=>false);
  assert.equal(await booting.handleNotification(response.notification),normal);
  const adapter=connectExpoCallingNotifications({accountKey:'alice',recipientAccount:data=>data?.account,
    store:{load:async()=>ledger,save:async(_,next)=>{ledger=next;}},open:id=>actions.push(['open',id]),refresh:async()=>{},onError:error=>assert.fail(error.message)});
  listeners.response(response);await adapter.ready;await new Promise(r=>setImmediate(r));
  assert.deepEqual(actions.filter(a=>a[0]==='open'),[['open','one']]);
  assert.deepEqual(actions.filter(a=>a[0]==='dismiss'),[['dismiss','push-one']]);
  adapter.dispose();assert.deepEqual(listeners,{});delete globalThis[key];
});
test('durable ledger separates accounts, prunes expired entries, rejects corruption',async()=>{
  const entries=new Map();const store=createCallingNotificationStore({getItem:async key=>entries.get(key)||null,setItem:async(key,value)=>{entries.set(key,value);}});
  await store.save('alice',{one:{sequence:2,retainUntil:Date.now()+60000},old:{sequence:1,retainUntil:0}});
  assert.deepEqual(Object.keys(await store.load('alice')),['one']);assert.deepEqual(Object.keys(await store.load('bob')),[]);
  entries.set('@robono/calling-notifications/alice','{"one":null}');await assert.rejects(store.load('alice'),/invalid/);
});
