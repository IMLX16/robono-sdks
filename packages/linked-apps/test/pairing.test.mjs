import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { RobonoLinkedApps } from '../dist/index.js';
const clientId='00000000-0000-4000-8000-000000000010';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
const pending=()=>({clientId,deviceCode:'rld_'+'a'.repeat(64),verifier:'b'.repeat(64),expiresAt:new Date(Date.now()+300000).toISOString(),interval:5,nextPollAt:0});
const wire={access_token:'rla_test',refresh_token:'rlr_test',expires_in:600,refresh_expires_at:'2099-01-01',grant_id:'grant',scope:'messages:read'};
function fixture(handler){
 let saved=null;const calls=[];
 const sdk=new RobonoLinkedApps({functionsUrl:'https://example.com',clientId,crypto:{randomBytes:n=>webcrypto.getRandomValues(new Uint8Array(n)),sha256:async b=>new Uint8Array(await webcrypto.subtle.digest('SHA-256',b))},tokenStore:{get:async()=>saved,set:async v=>{saved=v}},fetch:async(url,init)=>{const c={url,init,body:JSON.parse(init.body)};calls.push(c);return handler(c)}});
 return {sdk,calls,saved:()=>saved};
}
test('pairing creates PKCE-bound secret state separately from visible user code',async()=>{
 const f=fixture(()=>json({user_code:'ABCDE-23456',device_code:'rld_'+'a'.repeat(64),expires_at:'2099-01-01',interval:5,verification_uri:'https://robono.com/link-account',verification_app_uri:'robono://linked-app'}));
 const r=await f.sdk.beginPairing(['messages:read']);
 assert.equal(r.userCode,'ABCDE-23456');assert.equal(r.pending.clientId,clientId);
 assert.equal(f.calls[0].body.code_challenge,Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(r.pending.verifier))).toString('base64url'));
 assert.equal(f.calls[0].body.redirect_uri,undefined);assert.equal(f.saved(),null);
 assert(!JSON.stringify(f.calls).includes(r.pending.verifier));
});
test('pending and slow-down responses enforce polling spacing without saving credentials',async()=>{
 let response='authorization_pending';const f=fixture(()=>json({error:response},400)),p=pending();
 assert.equal((await f.sdk.pollPairing(p)).status,'pending');
 await f.sdk.pollPairing(p);assert.equal(f.calls.length,1);
 response='slow_down';p.nextPollAt=0;await f.sdk.pollPairing(p);
 assert.equal(p.interval,10);assert(p.nextPollAt>=Date.now()+9900);assert.equal(f.saved(),null);
});
test('concurrent polls exchange once and only approval saves credentials',async()=>{
 const f=fixture(async()=>{await new Promise(r=>setTimeout(r,10));return json(wire)}),p=pending();
 const results=await Promise.all(Array.from({length:8},()=>f.sdk.pollPairing(p)));
 assert.equal(f.calls.length,1);assert(results.every(r=>r.status==='connected'));assert.equal(f.saved().grantId,'grant');
 assert.equal(f.calls[0].body.code_verifier,p.verifier);
});
test('wrong client, expiry, cancellation and denial never save credentials',async()=>{
 const f=fixture(()=>json({error:'access_denied'},400));
 for(const p of [{...pending(),clientId:'other'},{...pending(),expiresAt:'bad'},{...pending(),expiresAt:'2000-01-01'}]) await assert.rejects(f.sdk.pollPairing(p),e=>e.code==='expired_token');
 const controller=new AbortController();controller.abort();
 await assert.rejects(f.sdk.waitForPairing(pending(),controller.signal),e=>e.code==='cancelled');
 assert.equal(f.calls.length,0);
 await assert.rejects(f.sdk.pollPairing(pending()),e=>e.code==='access_denied');assert.equal(f.saved(),null);
});
test('waiting can be cancelled during cooldown without making a request',async()=>{
 const f=fixture(()=>json(wire)),p={...pending(),nextPollAt:Date.now()+5000},controller=new AbortController();
 const waiting=f.sdk.waitForPairing(p,controller.signal);controller.abort();
 await assert.rejects(waiting,e=>e.code==='cancelled');assert.equal(f.calls.length,0);
});
