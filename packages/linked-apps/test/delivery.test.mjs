import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';
import { RobonoLinkedApps, secureTokenStore, nativeCryptoProvider, verifyWebhook } from '../dist/index.js';
function client(pages) {
  const calls=[];
  let tokens={accessToken:'token',refreshToken:'refresh',expiresAt:Date.now()+600000,grantId:'grant',scopes:['messages:read']};
  const api=new RobonoLinkedApps({functionsUrl:'https://backend.example/functions/v1',clientId:'client',tokenStore:{get:async()=>tokens,set:async v=>tokens=v},fetch:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push(body);
    const page=pages.shift();return new Response(JSON.stringify(typeof page==='function'?page(body):page),{status:200});
  }});
  return {api,calls};
}
test('watch snapshots from captured cursor, drains pages, persists only successful callbacks',async()=>{
  const c=client([{events:[],cursor:'3',has_more:true},{events:[{id:'4',type:'messages.changed'}],cursor:'4',has_more:true},{events:[{id:'5',type:'receipts.changed'}],cursor:'5',has_more:false}]);
  const controller=new AbortController(), writes=[], delivered=[];
  let snapshots=0;
  await c.api.watch({signal:controller.signal,cursorStore:{get:async()=>null,set:async(g,v)=>{writes.push([g,v]);if(v==='5')controller.abort()}},onResync:async()=>{snapshots++},onEvents:async events=>{delivered.push(...events.map(e=>e.id))}});
  assert.equal(snapshots,1);assert.deepEqual(delivered,['4','5']);assert.deepEqual(writes,[['grant','3'],['grant','4'],['grant','5']]);
  assert.deepEqual(c.calls.map(c=>c.input.cursor),[null,'3','4']);
});
test('expired cursor reconciles before advancing and cancellation never checkpoints unprocessed work',async()=>{
  const c=client([{events:[],cursor:'20',resync_required:true,has_more:false}]);
  const controller=new AbortController();let writes=0,resync=0;
  await c.api.watch({signal:controller.signal,cursorStore:{get:async()=> '1',set:async()=>{writes++}},onResync:async()=>{resync++;controller.abort()},onEvents:async()=>assert.fail()});
  assert.equal(resync,1);assert.equal(writes,0);
});
test('handler failure does not save cursor',async()=>{
  const c=client([{events:[{id:'2'}],cursor:'2',has_more:false}]);
  const controller=new AbortController();let writes=0;
  await c.api.watch({signal:controller.signal,cursorStore:{get:async()=> '1',set:async()=>{writes++}},onResync:async()=>assert.fail(),onEvents:async()=>{throw new Error('local disk unavailable')},onError:()=>controller.abort()});
  assert.equal(writes,0);
});
test('secure storage and native crypto adapters preserve tokens and clear secrets',async()=>{
  const values=new Map();const store=secureTokenStore({getItemAsync:async k=>values.get(k)??null,setItemAsync:async(k,v)=>{values.set(k,v)},deleteItemAsync:async k=>{values.delete(k)}},'companion.account.1');
  await store.set({accessToken:'secret',grantId:'grant'});assert.equal((await store.get()).accessToken,'secret');await store.set(null);assert.equal(await store.get(),null);
  const engine=nativeCryptoProvider({getRandomBytes:n=>webcrypto.getRandomValues(new Uint8Array(n)),digest:(a,b)=>webcrypto.subtle.digest(a,b)});
  assert.equal(engine.randomBytes(32).length,32);assert.equal((await engine.sha256(new Uint8Array([1]))).length,32);
});
test('webhook verifies exact bytes, freshness and signature without trusting parsed fields',async()=>{
  const secret='s'.repeat(64),timestamp=String(Math.floor(Date.now()/1000));
  const body=JSON.stringify({version:1,id:'delivery',type:'sync_available',client_id:'client',grant_id:'grant',cursor:'3'});
  const signature='v1='+createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');
  assert.equal((await verifyWebhook({body,timestamp,signature,secret,crypto:webcrypto})).cursor,'3');
  for(const overrides of [{body:body+' '},{signature:'v1'+'0'.repeat(64)},{nowMs:Date.now()+600000},{secret:'bad'}])await assert.rejects(()=>verifyWebhook({body,timestamp,signature,secret,crypto:webcrypto,...overrides}));
});
test('media upload refuses untrusted destination, enforces size, and sends no account credential',async()=>{
  const requests=[];const api=new RobonoLinkedApps({functionsUrl:'https://backend.example/functions/v1',clientId:'c',tokenStore:{get:async()=>null,set:async()=>{}},fetch:async(url,init)=>{requests.push(init);return new Response('{}')}});
  const ticket={signedUrl:'https://backend.example/storage/v1/object/upload/sign/media/test?token=x',media:{size_bytes:2,mime_type:'audio/mp4'}};
  await api.uploadBytes(ticket,new Uint8Array([1,2]),'audio/mp4');assert.equal(requests[0].method,'PUT');assert.equal(requests[0].headers.authorization,undefined);
  await assert.rejects(()=>api.uploadBytes({...ticket,signedUrl:'https://evil.example/file'},new Uint8Array([1,2]),'audio/mp4'));
  await assert.rejects(()=>api.uploadBytes(ticket,new Uint8Array([1]),'audio/mp4'));
});
