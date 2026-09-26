import test from 'node:test';import assert from 'node:assert/strict';
import {RobonoLinkedApps} from '../dist/index.js';
import {consumeStream} from '../dist/stream.js';
const tokens={accessToken:'rla_'+'a'.repeat(64),refreshToken:'refresh',expiresAt:Date.now()+600000,grantId:'grant',scopes:['messages:read']};
const page=(cursor)=>({events:[{id:cursor,type:'messages.changed'}],cursor,has_more:false});
function socket(){const sent=[];const ws={readyState:1,onopen:null,onmessage:null,onerror:null,onclose:null,send(raw){sent.push(JSON.parse(raw))},close(){this.readyState=3},emit(frame){this.onmessage?.({data:JSON.stringify(frame)})}};return {ws,sent};}
const wait=()=>new Promise(r=>setTimeout(r,0));
test('no token in URL; ready grant validated; ACK follows completed handler',async()=>{
 const {ws,sent}=socket();let complete,received=false;const gate=new Promise(r=>complete=r),abort=new AbortController();let url;
 const running=consumeStream({url:'wss://robono.example/linked-app-stream',factory:u=>{url=u;return ws},tokens,cursor:'1',signal:abort.signal,onPage:async()=>{received=true;await gate}});
 ws.onopen();assert(!url.includes(tokens.accessToken));assert.equal(sent[0].access_token,tokens.accessToken);ws.emit({type:'ready',grant_id:'grant'});ws.emit({type:'page',page:page('2')});await wait();assert(received);assert.equal(sent.length,1);complete();await wait();assert.equal(sent[1].type,'ack');assert.equal(sent[1].cursor,'2');abort.abort();await running;
});
test('wrong grant rejected before consumer sees anything',async()=>{
 const {ws}=socket(),abort=new AbortController();const running=consumeStream({url:'wss://example.com',factory:()=>ws,tokens,cursor:null,signal:abort.signal,onPage:async()=>assert.fail()});ws.emit({type:'ready',grant_id:'someone-else'});await assert.rejects(running,e=>e.code==='invalid_stream');
});
test('callback failure never acknowledged',async()=>{
 const {ws,sent}=socket(),abort=new AbortController();const running=consumeStream({url:'wss://example.com',factory:()=>ws,tokens,cursor:'1',signal:abort.signal,onPage:async()=>{throw Error('local write failed')}});ws.emit({type:'ready',grant_id:'grant'});ws.emit({type:'page',page:page('2')});await assert.rejects(running,/local write/);assert.equal(sent.length,0);
});
test('revocation error is surfaced, not silently retried',async()=>{
 const {ws}=socket(),abort=new AbortController();const running=consumeStream({url:'wss://example.com',factory:()=>ws,tokens,cursor:'1',signal:abort.signal,onPage:async()=>assert.fail()});ws.emit({type:'error',error:'invalid_token',status:401});await assert.rejects(running,e=>e.status===401&&e.code==='invalid_token');
});
test('second unacknowledged page is rejected instead of creating unbounded work',async()=>{
 const {ws}=socket(),abort=new AbortController();let resolve;const gate=new Promise(r=>resolve=r);const running=consumeStream({url:'wss://example.com',factory:()=>ws,tokens,cursor:'1',signal:abort.signal,onPage:()=>gate});ws.emit({type:'ready',grant_id:'grant'});ws.emit({type:'page',page:page('2')});ws.emit({type:'page',page:page('3')});resolve();await assert.rejects(running,e=>e.code==='invalid_stream');
});
test('watch reconnects with saved cursor after normal server rotation',async()=>{
 let cursor='1',connections=0;const auths=[],received=[],abort=new AbortController();const api=new RobonoLinkedApps({functionsUrl:'https://example.com/functions/v1',clientId:'client',tokenStore:{get:async()=>tokens,set:async()=>{}},webSocket:()=>{
  const {ws}=socket();connections++;const nth=connections;ws.send=raw=>{const frame=JSON.parse(raw);if(frame.type==='authenticate'){auths.push(frame.cursor);queueMicrotask(()=>{ws.emit({type:'ready',grant_id:'grant'});ws.emit({type:'page',page:page(nth===1?'2':'3')})})}else if(frame.type==='ack')queueMicrotask(()=>ws.emit({type:'reconnect'}))};queueMicrotask(()=>ws.onopen());return ws;
 }});
 await api.watch({signal:abort.signal,cursorStore:{get:async()=>cursor,set:async(g,c)=>{cursor=c;if(c==='3')abort.abort()}},onResync:async()=>assert.fail(),onEvents:async events=>received.push(events[0].id)});assert.deepEqual(auths,['1','2']);assert.deepEqual(received,['2','3']);
});
test('account switch during callback cannot checkpoint into either account',async()=>{
 let current=tokens,writes=0;const abort=new AbortController();const api=new RobonoLinkedApps({functionsUrl:'https://example.com/functions/v1',clientId:'client',tokenStore:{get:async()=>current,set:async()=>{}},webSocket:()=>{const {ws}=socket();ws.send=()=>queueMicrotask(()=>{ws.emit({type:'ready',grant_id:'grant'});ws.emit({type:'page',page:page('2')})});queueMicrotask(()=>ws.onopen());return ws;}});
 await assert.rejects(api.watch({signal:abort.signal,cursorStore:{get:async()=> '1',set:async()=>{writes++}},onResync:async()=>{},onEvents:async()=>{current={...tokens,grantId:'other'}}}),e=>e.code==='not_connected');assert.equal(writes,0);
});
test('retired webhook APIs are not exported',async()=>{const exports=await import('../dist/index.js');assert.equal(exports.verifyWebhook,undefined);assert.equal(RobonoLinkedApps.prototype.configureBackgroundDelivery,undefined)});
