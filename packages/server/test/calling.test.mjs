import test from 'node:test';
import assert from 'node:assert/strict';
import { RobonoCallingBackend } from '../dist/index.js';
const options={admissionUrl:'https://api.example/functions/v1/calling-access',serviceUrl:'https://calls.example/v1',apiKey:'server-secret'};
test('backend exchanges admission without sending the network key to the media service',async()=>{
 const requests=[];const backend=new RobonoCallingBackend({...options,fetch:async(url,init)=>{requests.push({url,...init,body:JSON.parse(init.body)});return Response.json(requests.length===1?{ticket:'ticket',serviceUrl:options.serviceUrl}:{token:'session',expiresAt:Date.now()+60000});}});
 const result=await backend.createSession('alex');assert.equal(result.token,'session');
 assert.equal(requests[0].headers.authorization,'Bearer server-secret');assert.equal(requests[1].headers.authorization,undefined);
 assert.equal(requests[0].body.externalUserId,'alex');assert.equal(requests[1].redirect,'error');
});
test('unexpected service address is rejected before sending the ticket',async()=>{
 let count=0;const backend=new RobonoCallingBackend({...options,fetch:async()=>{count++;return Response.json({ticket:'secret',serviceUrl:'https://unexpected.example'});}});
 await assert.rejects(backend.createSession('alex'),e=>e.code==='invalid_calling_response');assert.equal(count,1);
});
test('permission retries preserve revision and a conflict is not automatically retried',async()=>{
 let count=0;const backend=new RobonoCallingBackend({...options,fetch:async(_url,init)=>{count++;assert.deepEqual(JSON.parse(init.body),{operation:'relationship',externalUserIds:['alex','sam'],allowed:false,revision:2});return Response.json({error:'relationship_revision_conflict',revision:3},{status:409});}});
 await assert.rejects(backend.setRelationship({externalUserIds:['alex','sam'],allowed:false,revision:2}),e=>e.status===409&&e.details.revision===3);assert.equal(count,1);
});
test('rate limits surface their delay without fast retries and reject malformed permission inputs',async()=>{
 let count=0;const backend=new RobonoCallingBackend({...options,fetch:async()=>{count++;return new Response('busy',{status:429,headers:{'retry-after':'60'}});}});
 await assert.rejects(backend.notifications(true),e=>e.status===429&&e.retryAfterMs===60000);assert.equal(count,1);
 assert.throws(()=>backend.setRelationship({externalUserIds:['alex','alex'],allowed:true,revision:1}));assert.equal(count,1);
 for(const admissionUrl of ['http://example.com','https://user:secret@example.com','https://example.com?token=secret'])assert.throws(()=>new RobonoCallingBackend({...options,admissionUrl}));
});
