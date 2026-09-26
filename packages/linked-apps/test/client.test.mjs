import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { RobonoLinkedApps, RobonoLinkedAppError } from '../dist/index.js';

const clientId = '00000000-0000-4000-8000-000000000010';
const redirect = 'com.example.companion://oauth/callback';
const crypto = {
  randomBytes: n => webcrypto.getRandomValues(new Uint8Array(n)),
  sha256: async b => new Uint8Array(await webcrypto.subtle.digest('SHA-256', b)),
};
const wire = () => ({ access_token: 'rla_'+'a'.repeat(64), refresh_token: 'rlr_'+'b'.repeat(64),
  expires_in: 600, refresh_expires_at: '2099-01-01T00:00:00Z', grant_id:'grant', scope:'account:read messages:read messages:send' });
const saved = () => ({ accessToken:'rla_'+'a'.repeat(64),refreshToken:'rlr_'+'b'.repeat(64),expiresAt:Date.now()+600000,
  grantId:'grant',refreshExpiresAt:'2099-01-01T00:00:00Z',scopes:['messages:send'] });
function fixture(handler, initial=null) {
  let tokens=initial; const calls=[];
  const store={async get(){return tokens},async set(t){tokens=t}};
  const sdk=new RobonoLinkedApps({functionsUrl:'https://example.com/functions/v1',clientId,crypto,tokenStore:store,
    fetch:async (url,options)=> {const call={url,options,body:JSON.parse(options.body)};calls.push(call);return handler(call)}});
  return {sdk,calls,store};
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('PKCE, exact callback/state validation, and token persistence',async()=>{
  const f=fixture(call=>call.url.endsWith('linked-app-authorize')
    ?json({authorization_url:'robono://linked-app?requestId=test',request_id:'test',expires_at:'2099-01-01T00:00:00Z'})
    :json(wire()));
  const link=await f.sdk.beginLink(redirect,['messages:read']);
  assert.equal(f.calls[0].body.code_challenge_method,'S256');
  assert.equal(f.calls[0].body.code_challenge,Buffer.from(await crypto.sha256(new TextEncoder().encode(link.pending.verifier))).toString('base64url'));
  assert.notEqual(link.pending.verifier,link.pending.state);
  assert.equal(f.calls[0].options.headers.authorization,undefined);
  const callback=`${redirect}?state=${link.pending.state}&code=rlc_${'c'.repeat(64)}`;
  for(const invalid of [callback.replace(link.pending.state,'attacker'),callback.replace('com.example','com.attacker'),callback+'&state=duplicate',callback+'&code=duplicate',callback+'#fragment']) {
    await assert.rejects(f.sdk.completeLink(invalid,link.pending),e=>e.code==='invalid_callback');
  }
  assert.equal(f.calls.length,1,'invalid callbacks never exchange codes');
  await f.sdk.completeLink(callback,link.pending);
  assert.equal(f.calls[1].body.code_verifier,link.pending.verifier);
  assert.equal((await f.store.get()).grantId,'grant');
});
test('concurrent requests share exactly one refresh',async()=>{
  const f=fixture(async call=>{
    if(call.url.endsWith('linked-app-token')){await new Promise(r=>setTimeout(r,10));return json(wire())}
    return json({conversations:[],messages:[]});
  },{...saved(),expiresAt:0});
  await Promise.all(Array.from({length:12},()=>f.sdk.conversations()));
  assert.equal(f.calls.filter(c=>c.url.endsWith('linked-app-token')).length,1);
  assert.equal(f.calls.filter(c=>c.url.endsWith('linked-app-api')).length,12);
});
test('invalid refresh clears credentials; temporary failures do not',async()=>{
  for(const [error,status,cleared] of [['invalid_grant',400,true],['temporarily_unavailable',503,false]]) {
    const f=fixture(()=>json({error},status),saved());
    await assert.rejects(f.sdk.refresh(),RobonoLinkedAppError);
    assert.equal((await f.store.get())===null,cleared);
    assert.equal(f.calls.length,1,'no retry of single-use refresh token');
  }
});
test('send keeps original idempotency key and never blindly retries',async()=>{
  const f=fixture(()=>{throw new Error('connection lost after server accepted message')},saved());
  const message={conversationId:'chat',messageKind:'text',textBody:'hello',clientMessageId:'00000000-0000-4000-8000-000000000099'};
  await assert.rejects(f.sdk.send(message));
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].body.input.clientMessageId,message.clientMessageId);
  assert.equal(f.calls[0].options.redirect,'error');
  assert.equal(f.calls[0].options.headers.authorization,`Bearer ${saved().accessToken}`);
  assert(!f.calls[0].options.body.includes('refreshToken'));
  assert.throws(()=>f.sdk.send({...message,clientMessageId:''}));
});
test('disconnect clears local credentials only after confirmed server revocation',async()=>{
  const f=fixture(()=>json({revoked:true}),saved()); await f.sdk.disconnect();
  assert.equal(f.calls[0].body.operation,'connection.revoke');assert.equal(await f.store.get(),null);
  const offline=fixture(()=>{throw new Error('offline')},saved());
  await assert.rejects(offline.sdk.disconnect());assert(await offline.store.get());
});
test('unsupported permissions and insecure remote servers fail locally',()=>{
  assert.throws(()=>new RobonoLinkedApps({functionsUrl:'http://remote.example',clientId,tokenStore:{}}));
  assert.throws(()=>new RobonoLinkedApps({functionsUrl:'https://user:password@remote.example',clientId,tokenStore:{}}));
});
test('receipt and media helpers preserve the original conversation/message identities',async()=>{
  const f=fixture(()=>json({}),saved());
  await f.sdk.receipt('message','heard');await f.sdk.download('message');
  await f.sdk.messages('chat',{before:'2026-09-25T00:00:00.123456Z',beforeId:'message',limit:25});
  assert.deepEqual(f.calls.map(c=>c.body.operation),['receipts.update','media.download','messages.list']);
  assert.equal(f.calls[0].body.input.heard,true);assert.equal(f.calls[0].body.input.deliveredOnly,false);
  assert.equal(f.calls[2].body.input.before,'2026-09-25T00:00:00.123456Z');
});
