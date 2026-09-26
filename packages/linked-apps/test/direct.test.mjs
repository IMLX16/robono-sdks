import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto,createHash} from 'node:crypto';
import {RobonoLinkedApps} from '../dist/index.js';import {directAppIdentity} from '../dist/identity.js';
const app={name:'Example Messenger',developerName:'Example Inc',websiteUrl:'https://example.com',privacyUrl:'https://example.com/privacy'};
const crypto={randomBytes:n=>webcrypto.getRandomValues(new Uint8Array(n)),sha256:async b=>new Uint8Array(await webcrypto.subtle.digest('SHA-256',b))};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
const expectedHex=createHash('sha256').update(JSON.stringify(['robono-direct-app-v1',app.name,app.developerName,'https://example.com/',app.privacyUrl])).digest('hex');
const clientId=`${expectedHex.slice(0,8)}-${expectedHex.slice(8,12)}-8${expectedHex.slice(13,16)}-8${expectedHex.slice(17,20)}-${expectedHex.slice(20,32)}`;
const wire={access_token:'rla_fixture',refresh_token:'rlr_fixture',expires_in:600,refresh_expires_at:'2099-01-01',grant_id:'grant',scope:'messages:read'};
function fixture(handler){let saved=null;const calls=[];const options={app,crypto,tokenStore:{get:async()=>saved,set:async v=>{saved=v}},fetch:async(url,init)=>{const c={url,body:JSON.parse(init.body)};calls.push(c);return handler(c)}};return{sdk:new RobonoLinkedApps(options),options,calls,get saved(){return saved}}}
test('direct setup needs no client ID, developer login, registration request or custom server URL',async()=>{
 const f=fixture(c=>c.url.endsWith('/linked-app-pair')?json({client_id:clientId,user_code:'ABCDE-23456',device_code:'rld_test',expires_at:'2099-01-01',interval:5}):json(wire));
 const pair=await f.sdk.beginPairing(['messages:read']);assert.equal(pair.pending.clientId,clientId);assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].url,'https://vzoqxavqacydtwypjsrd.supabase.co/functions/v1/linked-app-pair');assert.equal(f.calls[0].body.client_id,undefined);assert.deepEqual(f.calls[0].body.app,{...app,websiteUrl:'https://example.com/'});
 pair.pending.nextPollAt=0;const restarted=new RobonoLinkedApps(f.options);assert.equal((await restarted.pollPairing(pair.pending)).status,'connected');assert.equal(f.calls[1].body.client_id,clientId);
 await restarted.refresh();assert.equal(f.calls[2].body.client_id,clientId);assert.equal(f.saved.grantId,'grant');
});
test('identity is normalized, stable across hosts and immutable after construction',async()=>{
 assert.equal((await directAppIdentity(app,crypto.sha256)).clientId,clientId);
 assert.equal((await directAppIdentity({...app,name:' Example Messenger ',websiteUrl:'https://EXAMPLE.com/'},crypto.sha256)).clientId,clientId);
 assert.notEqual((await directAppIdentity({...app,privacyUrl:'https://example.com/new-privacy'},crypto.sha256)).clientId,clientId);
 const mutable={...app};let captured;const sdk=new RobonoLinkedApps({app:mutable,crypto,tokenStore:{get:async()=>null,set:async()=>{}},fetch:async(_,init)=>{captured=JSON.parse(init.body);return json({client_id:clientId,expires_at:'2099-01-01',interval:5})}});mutable.name='Imposter';await sdk.beginPairing(['messages:read']);assert.equal(captured.app.name,app.name);
});
test('invalid details and ambiguous configuration fail before network access',()=>{
 const options={crypto,tokenStore:{get:async()=>null,set:async()=>{}},fetch:()=>assert.fail('must not fetch')};
 for(const bad of [{...app,name:' '},{...app,name:'fake\u202e'},{...app,websiteUrl:'http://example.com'},{...app,privacyUrl:'https://user:secret@example.com'},{...app,websiteUrl:'https://127.0.0.1'}])assert.throws(()=>new RobonoLinkedApps({...options,app:bad}));
 assert.throws(()=>new RobonoLinkedApps(options));assert.throws(()=>new RobonoLinkedApps({...options,app,clientId}));
});
test('unexpected returned identity cannot become a pending account connection',async()=>{
 const f=fixture(()=>json({client_id:'another-app',expires_at:'2099-01-01',interval:5}));await assert.rejects(f.sdk.beginPairing(['messages:read']),e=>e.code==='invalid_client_identity');assert.equal(f.saved,null);
});
test('direct identity cannot use unregistered callback linking',async()=>{const f=fixture(()=>assert.fail('must not fetch'));await assert.rejects(f.sdk.beginLink('https://example.com/callback',['messages:read']),/beginPairing/)});
