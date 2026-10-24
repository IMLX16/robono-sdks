import test from 'node:test';
import assert from 'node:assert/strict';
import { RobonoCallingClient, createHttpTransport } from '../src/index.mjs';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function media() {
  const track = { enabled: true, readyState: 'live', stop() { this.readyState = 'ended'; } };
  return { track, getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [] };
}
function peer() {
  return { closed: false, addTrack() {}, createOffer: async () => ({ type: 'offer', sdp: 'offer' }),
    async setLocalDescription(d) { this.localDescription = d; }, close() { this.closed = true; } };
}
test('late microphone permission after cancel stops the returned track and never places call', async () => {
  const pending = deferred(), m = media(), requested = [];
  const client = new RobonoCallingClient({ request: async op => { requested.push(op); return { iceServers: [] }; }, getUserMedia: () => pending.promise });
  const attempt = client.call(); await new Promise(r => setImmediate(r)); await client.hangUp(); pending.resolve(m);
  await assert.rejects(attempt, /call_cancelled/); assert.equal(m.track.readyState, 'ended'); assert.deepEqual(requested, ['ice']);
});
test('relay-only without configuration never captures microphone', async () => {
  let capture = false;
  const client = new RobonoCallingClient({ forceRelay: true, request: async () => ({ iceServers: [], relayAvailable: false }), getUserMedia: async () => { capture = true; return media(); } });
  await assert.rejects(client.call(), /relay_not_configured/); assert.equal(capture, false);
});
test('ambiguous start response retries same request ID; busy rejection releases microphone', async () => {
  const m = media(), p = peer(), starts = [];
  const client = new RobonoCallingClient({ getUserMedia: async () => m, createPeerConnection: () => p, request: async (op, data) => {
    if (op === 'ice') return { iceServers: [] };
    starts.push(data.requestId); if (starts.length === 1) throw Error('Network failure');
    const e = Error('busy'); e.status = 409; throw e;
  } });
  await assert.rejects(client.call(), /busy/); assert.equal(starts.length, 2); assert.equal(starts[0], starts[1]);
  assert.equal(m.track.readyState, 'ended'); assert.equal(p.closed, true);
});
test('cancel while start response is in flight ends the call when its ID arrives', async () => {
  const pending = deferred(), started = deferred(), m = media(), p = peer(), ended = [];
  const client = new RobonoCallingClient({ getUserMedia: async () => m, createPeerConnection: () => p, request: async (op, data) => {
    if (op === 'ice') return { iceServers: [] };
    if (op === 'start') { started.resolve(); return pending.promise; }
    if (op === 'end') ended.push(data.callId);
  } });
  const attempt = client.call(); await started.promise; await client.hangUp(); pending.resolve({ id: 'late-call', state: 'ringing', controlled: true }); await attempt;
  assert.deepEqual(ended, ['late-call']); assert.equal(m.track.readyState, 'ended'); assert.equal(p.closed, true);
});
test('cancel interrupts stalled WebRTC negotiation and frees the Call action', async () => {
  const m = media(), p = peer(); p.createOffer = () => new Promise(() => {});
  const client = new RobonoCallingClient({ getUserMedia: async () => m, createPeerConnection: () => p, request: async () => ({ iceServers: [] }) });
  const attempt = client.call(); const rejected = assert.rejects(attempt, /call_cancelled/);
  await new Promise(r => setImmediate(r)); await client.hangUp(); await rejected;
  assert.equal(client.busy, false); assert.equal(m.track.readyState, 'ended');
});
test('late old-ended snapshot cannot close a newer call', async () => {
  const client = new RobonoCallingClient({ request: async () => ({}) });
  client.state.call = { id: 'new', version: 5, state: 'ringing' };
  const p = client.pc = peer();
  await client.apply({ id: 'old', version: 4, state: 'ended', controlled: true });
  assert.equal(client.state.call.id, 'new'); assert.equal(p.closed, false); client.resetMedia();
});

test('transport deadline remains active while a response body is stalled', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const request = createHttpTransport({ baseUrl: 'https://calling.invalid', token: 'test', fetcher: async (_url, options) => {
    signal = options.signal;
    return { ok: true, json: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Error('response_aborted')), { once: true });
    }) };
  } });
  const result = request('state');
  // Install a handler before advancing the deadline; no real network or wait.
  const rejected = assert.rejects(result, /response_aborted/);
  await Promise.resolve(); await Promise.resolve();
  t.mock.timers.tick(4500);
  assert.equal(signal.aborted, true);
  await rejected;
});

test('late state response after disposal cannot resurrect incoming-call UI', async () => {
  const pending = deferred();
  const client = new RobonoCallingClient({ request: async op => op === 'state' ? pending.promise : {} });
  try {
    const polling = client.poll();
    await client.dispose();
    pending.resolve({ version: 7, voiceAvailable: true, call: { id: 'stale', version: 7, state: 'ringing', controlled: true } });
    await polling;
    assert.equal(client.state.call, null);
    assert.equal(client.state.voiceAvailable, false);
  } finally { await client.dispose(); }
});

test('a poll begun before hangup cannot restore the ringing screen', async () => {
  const pending = deferred();
  const ringing = { id: 'old', version: 7, state: 'ringing', controlled: true };
  const client = new RobonoCallingClient({ request: async op => op === 'state' ? pending.promise : { ...ringing, state: 'ended' } });
  try {
    client.state.call = ringing;
    const polling = client.poll();
    await client.hangUp();
    pending.resolve({ version: 7, voiceAvailable: true, call: ringing });
    await polling;
    assert.equal(client.state.call.state, 'ended');
  } finally { await client.dispose(); }
});

test('a delayed authorization rejection still closes the client after hangup', async () => {
  let rejectState;
  const pending = new Promise((_resolve, reject) => { rejectState = reject; });
  const client = new RobonoCallingClient({ request: async op => op === 'state' ? pending : {} });
  try {
    const polling = client.poll();
    await client.hangUp();
    const error = Error('session_expired'); error.status = 401;
    rejectState(error); await polling;
    assert.equal(client.closed, true);
    assert.equal(client.state.error, 'session_expired');
  } finally { await client.dispose(); }
});

test('native wake refresh fetches authoritative state without adding a polling loop', async () => {
  let requests = 0;
  const client = new RobonoCallingClient({ request: async () => {
    requests++; return { version: 9, voiceAvailable: true, call: { id: 'incoming', state: 'ringing', controlled: true, version: 9 } };
  } });
  assert.equal(await client.refresh(), true);
  assert.equal(client.state.call.id, 'incoming');
  assert.equal(requests, 1); assert.equal(client.timer, undefined); assert.equal(client.watchdog, undefined);
});
test('failed native wake refresh is not evidence that the incoming call ended', async () => {
  const client = new RobonoCallingClient({ request: async () => { throw Error('temporary'); } });
  assert.equal(await client.refresh(), false);
  assert.equal(client.closed, false); assert.equal(client.timer, undefined);
});

test('one slow state request gets a recovery attempt before media is torn down', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 100000 });
  let fail = false; const operations = [];
  const call = { id: 'recovering', version: 1, state: 'connecting', controlled: true, remoteCandidates: [] };
  const client = new RobonoCallingClient({ request: async op => {
    operations.push(op);
    if (op === 'state' && fail) throw Error('response_aborted');
    return op === 'state' ? { version: 1, call } : {};
  } });
  try {
    await client.listen(); clearTimeout(client.timer);
    const p = client.pc = peer(); client.mediaCallId = call.id;
    fail = true; t.mock.timers.tick(5500); await client.refresh();
    t.mock.timers.tick(1000);
    assert.equal(p.closed, false, 'a single timed-out poll must not kill the call before recovery');
    fail = false; await client.refresh();
    assert.equal(client.state.error, null); assert.equal(p.closed, false);
    assert(!operations.includes('end'));
    t.mock.timers.tick(10500);
    assert.equal(p.closed, true, 'sustained loss still stops media within the bounded lease');
    assert.equal(client.state.error, 'connection_lost');
    assert(operations.includes('end'));
  } finally { await client.dispose(); }
});

test('local hangup closes media and emits ended before slow server acknowledgement', async () => {
  const pending = deferred(), seen = [], m = media(), p = peer();
  const call = { id: 'call-1', version: 1, state: 'connected', controlled: true };
  let requests = 0;
  const client = new RobonoCallingClient({ onChange: s => seen.push(s.call?.state), request: async () => { requests++; return pending.promise; } });
  client.state.call = call; client.pc = p; client.stream = m;
  const ending = client.hangUp();
  assert.equal(p.closed, true); assert.equal(m.track.readyState, 'ended');
  assert.equal(client.state.call.state, 'ended'); assert.equal(seen[0], 'ended');
  const stale = client.apply({ ...call, version: 2 });
  assert.equal(client.state.call.state, 'ended'); assert.equal(requests, 1, 'coalesce End retries');
  pending.resolve({ ...call, state: 'ended', version: 3 }); await ending; await stale;
  assert.equal(client.state.call.state, 'ended');
});
test('late hangup acknowledgement cannot replace a newer call', async () => {
  const pending = deferred();
  const old = { id: 'old', version: 1, state: 'connected', controlled: true };
  const client = new RobonoCallingClient({ request: () => pending.promise });
  client.state.call = old; const ending = client.hangUp();
  client.state.call = { id: 'new', version: 5, state: 'ringing', controlled: true };
  pending.resolve({ ...old, state: 'ended', version: 2 }); await ending;
  assert.equal(client.state.call.id, 'new'); assert.equal(client.state.call.state, 'ringing');
});
test('failed End requests recover through later state reconciliation without reopening local call', async () => {
  let fail = true, requests = 0;
  const call = { id: 'call-1', version: 1, state: 'connected', controlled: true };
  const client = new RobonoCallingClient({ request: async () => { requests++; if (fail) throw Error('offline'); return { ...call, state: 'ended' }; } });
  client.state.call = call; await client.hangUp();
  assert.equal(client.state.call.state, 'ended'); assert.equal(requests, 2);
  fail = false; await client.apply(call);
  assert.equal(requests, 3); assert.equal(client.state.call.state, 'ended');
});

test('media connection updates the timer immediately without waiting for server confirmation or a poll', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 10000 });
  const confirmation = deferred(), snapshots = [], p = peer(); let reports = 0;
  const call = { id: 'voice', state: 'connecting', controlled: true, version: 2, answeredAt: 1000, remoteCandidates: [] };
  const client = new RobonoCallingClient({ request: async op => {
    if (op === 'connected') { reports++; return confirmation.promise; }
    return {};
  }, onChange: s => snapshots.push(s) });
  client.pc = p; client.mediaCallId = call.id; client.state.call = call;
  p.connectionState = 'connecting'; client.reportMediaConnection(p);
  assert.equal(reports, 0);
  p.connectionState = 'connected'; client.reportMediaConnection(p);
  assert.equal(snapshots.at(-1).call.state, 'connected');
  assert.equal(snapshots.at(-1).call.connectedAt, 10000);
  assert.equal(client.state.call.state, 'connecting', 'server sequencing stays separate');
  t.mock.timers.tick(8000);
  client.reportMediaConnection(p); client.emit();
  assert.equal(reports, 1);
  assert.equal(snapshots.at(-1).call.connectedAt, 10000, 'repeat events cannot restart duration');
  confirmation.resolve({ ...call, state: 'connected', connectedAt: 18000 });
  await new Promise(r => setImmediate(r));
  assert.equal(snapshots.at(-1).call.connectedAt, 10000, 'late server confirmation cannot shift the local clock');
  client.resetMedia();
});
test('a late media acknowledgement cannot revive a call after hangup', async () => {
  const confirmation = deferred(), p = peer();
  const call = { id: 'voice', state: 'connecting', controlled: true, version: 2, remoteCandidates: [] };
  const client = new RobonoCallingClient({ request: async op => op === 'connected' ? confirmation.promise : { ...call, state: 'ended' } });
  client.pc = p; client.mediaCallId = call.id; client.state.call = call;
  p.connectionState = 'connected'; client.reportMediaConnection(p); await client.hangUp();
  confirmation.resolve({ ...call, state: 'connected', connectedAt: Date.now() });
  await new Promise(r => setImmediate(r));
  assert.equal(client.state.call.state, 'ended'); assert.equal(client.mediaConnectedAt, null);
});
