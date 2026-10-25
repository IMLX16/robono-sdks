/** Audio-only calling client. Media and identity adapters are supplied by the host. */
export function createHttpTransport({ baseUrl, token, fetcher = fetch }) {
  return async (operation, payload = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetcher(`${baseUrl}/${operation}`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal, redirect: 'error',
      });
      // Headers arriving does not mean the request completed. Keep the deadline
      // through body consumption so a stalled response cannot freeze controls.
      let data;
      try { data = await response.json(); }
      catch (error) {
        if (response.ok) throw error;
        // Proxies may return HTML for 429/503. Preserve status and Retry-After.
        data = {};
      }
      if (!response.ok) {
        const e = Error(typeof data.error === 'string' ? data.error : data.error?.message || 'request_failed');
        e.status = response.status;
        const retryAfter = response.headers?.get('Retry-After');
        if (retryAfter) {
          const seconds = /^\d+(?:\.\d+)?$/.test(retryAfter.trim()) ? Number(retryAfter) : null;
          const delay = seconds == null ? Date.parse(retryAfter) - Date.now() : seconds * 1000;
          if (Number.isFinite(delay)) e.retryAfterMs = Math.max(0, delay);
        }
        throw e;
      }
      return data;
    } finally { clearTimeout(timer); }
  };
}

export class RobonoCallingClient {
  constructor({ request, onChange = () => {}, onRemoteStream = () => {},
    getUserMedia = () => navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
    createPeerConnection = config => new RTCPeerConnection(config), pollMs = 1000, forceRelay = false, createId = () => crypto.randomUUID(),
    createRemoteStream = track => new MediaStream([track]) } = {}) {
    Object.assign(this, { request, onChange, onRemoteStream, getUserMedia, createPeerConnection, pollMs, forceRelay, createId, createRemoteStream });
    this.state = { voiceAvailable: false, call: null, muted: false, error: null };
    this.pc = null; this.stream = null; this.epoch = 0; this.busy = false; this.closed = false;
    this.lastSuccess = Date.now(); this.started = false; this.remoteCount = 0;
    this.pendingRTC = new Set(); this.mediaTimers = new Set();
    this.locallyEnded = new Set(); this.endRequests = new Map();
    this.expiredRings = new Set();
    this.pollFailures = 0; this.pollNotBefore = 0;
    this.localHeld = false; this.holdRevision = 0; this.holdDeadline = 0;
  }
  rtc(promise, phase, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const finish = (fn, value) => { clearTimeout(timer); this.pendingRTC.delete(cancel); fn(value); };
      const cancel = () => finish(reject, Error('call_cancelled'));
      const timer = setTimeout(() => finish(reject, Error(phase + '_timeout')), timeoutMs);
      this.pendingRTC.add(cancel); promise.then(v => finish(resolve, v), e => finish(reject, e));
    });
  }
  emit() {
    const call = this.state.call;
    this.scheduleRingDeadline(call);
    // The local WebRTC transport, not a later server poll, determines when this
    // device can communicate. Keep the server snapshot separate for sequencing.
    const connected = this.mediaConnectedAt != null && this.mediaCallId === call?.id &&
      call.controlled && ['connecting', 'connected'].includes(call.state);
    this.onChange({ ...this.state, preparing: this.busy, localHeld: this.localHeld,
      call: connected ? { ...call, state: this.pc?.connectionState === 'disconnected' ? 'connecting' : 'connected', connectedAt: this.mediaConnectedAt } : call });
  }
  scheduleRingDeadline(call) {
    if (call?.state !== 'ringing' || !call.controlled) {
      clearTimeout(this.ringTimer); this.ringCallId = null; return;
    }
    const remaining = Number.isFinite(call.ringRemainingMs) ? call.ringRemainingMs :
      Number.isFinite(call.ringExpiresAt) ? call.ringExpiresAt - Date.now() : null;
    if (remaining == null) return;
    const deadline = Date.now() + Math.max(0, remaining);
    if (this.ringCallId === call.id && this.ringDeadline <= deadline) return;
    clearTimeout(this.ringTimer); this.ringCallId = call.id; this.ringDeadline = deadline;
    this.ringTimer = setTimeout(() => {
      if (this.state.call?.id !== call.id || this.state.call.state !== 'ringing') return;
      // A stalled poll must not leave an unanswered phone ringing. The server
      // independently finalizes No answer; never send End (which means Decline).
      this.locallyEnded.add(call.id); this.expiredRings.add(call.id);
      while (this.expiredRings.size > 256) this.expiredRings.delete(this.expiredRings.values().next().value);
      while (this.locallyEnded.size > 256) this.locallyEnded.delete(this.locallyEnded.values().next().value);
      this.resetMedia();
      this.state.call = {...this.state.call, state: 'ended', reason: 'no_answer', endedAt: Date.now()};
      this.emit();
    }, Math.min(2147483647, Math.max(0, remaining)));
  }
  async listen() {
    if (this.started) return; this.started = true;
    this.watchdog = setInterval(() => {
      // Match the service's ten-second endpoint lease. Six seconds left almost
      // no recovery time after a 4.5-second request timeout plus the poll delay.
      // Explicit authorization failures still stop media immediately in refresh.
      const heldLease = this.localHeld && this.holdDeadline > Date.now();
      const unconfirmedHold = this.pendingHold && Date.now() - this.pendingHold.at > 10000;
      if ((this.pc || this.stream) && (unconfirmedHold || !heldLease && Date.now() - this.lastSuccess > 10000)) {
        const id = this.state.call?.id; this.finishLocal('connection_lost');
        if (id) this.request('end', { callId: id }).catch(() => {});
      }
    }, 500);
    await this.poll();
  }
  // Refresh without scheduling a second poll loop (also used for native wake races).
  // False means the cached snapshot is not authoritative for this attempt.
  async refresh() {
    if (this.refreshing) return this.refreshing;
    const work = this.refreshState();
    this.refreshing = work;
    try { return await work; } finally { if (this.refreshing === work) this.refreshing = null; }
  }
  async refreshState() {
    if (this.closed || Date.now() < this.pollNotBefore) return false;
    const epoch = this.epoch;
    try {
      const state = await this.request('state');
      if (this.closed) return false;
      this.lastSuccess = Date.now();
      this.pollFailures = 0; this.pollNotBefore = 0;
      if (epoch === this.epoch) {
        this.state.error = null;
        if (!this.busy && !(state.version < (this.state.call?.version ?? -1))) {
          this.state.voiceAvailable = state.voiceAvailable;
          await this.apply(state.call);
          if (this.pendingHold) await this.confirmHold(this.pendingHold);
          return true;
        }
      }
    } catch (e) {
      if (this.closed) return false;
      const delay = Math.min(30000, Math.max(1000, this.pollMs) * 2 ** Math.min(this.pollFailures++, 5));
      this.pollNotBefore = Date.now() + Math.max(delay, Number.isFinite(e.retryAfterMs) ? e.retryAfterMs : 0);
      // Credential revocations remain authoritative even after a local action.
      if (epoch === this.epoch || e.status === 401 || e.status === 403) {
        this.state.error = e.message;
        if (e.status === 401 || e.status === 403) { this.resetMedia(); this.closed = true; clearInterval(this.watchdog); }
        this.emit();
      }
    }
    return false;
  }
  async poll() {
    await this.refresh();
    if (!this.closed) this.timer = setTimeout(() => this.poll(), Math.min(2147483647, Math.max(this.pollMs, this.pollNotBefore - Date.now())));
  }
  async apply(call) {
    // A pending/late server poll cannot reopen a call the person already ended.
    if (call && call.state !== 'ended' && this.locallyEnded.has(call.id)) {
      // Reconcile a lost End response on subsequent polls, without reopening UI.
      if (!this.expiredRings.has(call.id)) await this.endRemote(call.id).catch(() => {});
      return;
    }
    if (call && this.state.call && call.version < this.state.call.version) return;
    if (!call) { if (this.pc) this.resetMedia(); this.state.call = null; this.emit(); return; }
    const wasHeld = this.state.call?.remoteHeld;
    this.state.call = call;
    if (call.state === 'ended' || !call.controlled) this.resetMedia();
    else if (this.pc && this.mediaCallId === call.id) {
      const pc = this.pc;
      if (call.remoteDescription && !pc.remoteDescription) await this.rtc(pc.setRemoteDescription(call.remoteDescription), 'remote_description');
      if (pc !== this.pc) return;
      if (pc.remoteDescription) {
        for (const candidate of call.remoteCandidates.slice(this.remoteCount)) {
          await this.rtc(pc.addIceCandidate(candidate), 'remote_candidate'); if (pc !== this.pc) return; this.remoteCount++;
        }
      }
    }
    if (wasHeld && !call.remoteHeld && !this.localHeld) this.checkResumedTransport();
    this.syncAudioTracks();
    this.emit();
  }
  syncAudioTracks() {
    const held = this.localHeld || this.state.call?.localHeld || this.state.call?.remoteHeld;
    this.stream?.getAudioTracks().forEach(t => { t.enabled = !held && !this.state.muted; });
    this.remoteStream?.getAudioTracks().forEach(t => { t.enabled = !held; });
  }
  /** Silence immediately; only a server-acknowledged hold relaxes the lease. */
  async hold() {
    const call = this.state.call;
    if (!call?.controlled || call.state !== 'connected' || !this.pc) throw Error('call_not_connected');
    this.localHeld = true; this.syncAudioTracks(); this.emit();
    const revision = this.holdRevision = Math.max(this.holdRevision, call.holdRevision || 0) + 1;
    const intent = this.pendingHold = {callId: call.id, held: true, revision, at: Date.now()};
    await this.confirmHold(intent);
  }
  async confirmHold(intent) {
    const {callId, revision} = intent;
    const result = await this.retry('hold', {callId, held: true, revision});
    if (this.mediaCallId !== callId || !this.localHeld || revision !== this.holdRevision) return;
    if (this.pendingHold === intent) this.pendingHold = null;
    this.holdDeadline = result.holdExpiresAt || 0;
    await this.apply(result);
  }
  /** Revalidate before activating audio; a late response cannot restart a call. */
  async resume(prepareAudio = async () => {}) {
    const id = this.mediaCallId, revision = this.holdRevision;
    if (!id || !this.localHeld) return;
    if (!await this.refresh()) throw Error('call_state_unavailable');
    if (this.mediaCallId !== id || !this.localHeld || revision !== this.holdRevision) return;
    await prepareAudio();
    if (this.mediaCallId !== id || !this.localHeld || revision !== this.holdRevision) return;
    const nextRevision = ++this.holdRevision;
    this.pendingHold = null;
    const result = await this.retry('hold', {callId: id, held: false, revision: nextRevision});
    if (this.mediaCallId !== id || nextRevision !== this.holdRevision) return;
    this.localHeld = false; this.holdDeadline = 0; this.lastSuccess = Date.now();
    await this.apply(result);
    // A transport that failed while iOS suspended the app cannot be presented
    // as a resumed conversation. End it cleanly rather than expose dead audio.
    this.checkResumedTransport();
  }
  checkResumedTransport() {
    const pc = this.pc;
    if (!pc) return;
    if (['failed', 'closed'].includes(pc.connectionState)) { this.mediaError(Error('media_disconnected')); return; }
    if (pc.connectionState === 'disconnected') {
      const timer = setTimeout(() => {
        this.mediaTimers.delete(timer);
        if (this.pc === pc && pc.connectionState === 'disconnected' && !this.localHeld && !this.state.call?.remoteHeld) this.mediaError(Error('media_disconnected'));
      }, 10000);
      this.mediaTimers.add(timer);
    }
  }
  resetMedia() {
    this.epoch++;
    for (const timer of this.mediaTimers) clearTimeout(timer); this.mediaTimers.clear();
    for (const cancel of this.pendingRTC) cancel();
    const pc = this.pc; this.pc = null;
    if (pc) { pc.onicecandidate = pc.onconnectionstatechange = pc.ontrack = null; pc.close(); }
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.remoteStream = null; this.localHeld = false; this.holdDeadline = 0; this.holdRevision = 0; this.pendingHold = null;
    this.candidates = []; this.remoteCount = 0; this.mediaCallId = null; this.mediaConnectedAt = null; this.state.muted = false;
    this.onRemoteStream(null);
  }
  async prepare(connectionId) {
    this.resetMedia(); const epoch = this.epoch;
    const ice = await this.request('ice', connectionId ? { connectionId } : {});
    if (this.closed || epoch !== this.epoch) throw Error('call_cancelled');
    if (this.forceRelay && !ice.relayAvailable) throw Error('relay_not_configured');
    const stream = await this.rtc(this.getUserMedia({ isCurrent: () => !this.closed && epoch === this.epoch }).then(stream => {
      if (this.closed || epoch !== this.epoch) stream.getTracks().forEach(t => t.stop());
      return stream;
    }), 'microphone', 30000);
    if (this.closed || epoch !== this.epoch) { stream.getTracks().forEach(t => t.stop()); throw Error('call_cancelled'); }
    if (!stream.getAudioTracks().length || stream.getVideoTracks().length) { stream.getTracks().forEach(t => t.stop()); throw Error('audio_only'); }
    this.stream = stream;
    const pc = this.pc = this.createPeerConnection({ iceServers: ice.iceServers, iceTransportPolicy: this.forceRelay ? 'relay' : 'all' });
    this.candidates = []; this.sendTail = Promise.resolve();
    for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
    pc.ontrack = e => { if (this.pc === pc) { this.remoteStream = e.streams[0] || this.createRemoteStream(e.track); this.syncAudioTracks(); this.onRemoteStream(this.remoteStream); } };
    pc.onicecandidate = e => {
      if (!e.candidate || this.pc !== pc) return;
      this.candidates.push(e.candidate.toJSON()); this.flushCandidates();
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc || !this.mediaCallId) return;
      if (pc.connectionState === 'connected') { this.reportMediaConnection(pc); this.emit(); }
      if (pc.connectionState === 'failed' && !this.localHeld && !this.state.call?.remoteHeld) this.mediaError(Error('media_failed'));
      if (pc.connectionState === 'disconnected') {
        const timer = setTimeout(() => {
          this.mediaTimers.delete(timer);
          if (this.pc === pc && pc.connectionState === 'disconnected' && !this.localHeld && !this.state.call?.remoteHeld) this.mediaError(Error('media_disconnected'));
        }, 10000);
        this.mediaTimers.add(timer);
      }
    };
    return pc;
  }
  reportMediaConnection(pc) {
    if (pc !== this.pc || pc.connectionState !== 'connected' || !this.mediaCallId || this.mediaConnectedAt != null) return;
    const callId = this.mediaCallId;
    this.mediaConnectedAt = Date.now();
    this.emit();
    // Acknowledge promptly; never let an old request alter a later call.
    void this.retry('connected', { callId }).then(call => {
      if (this.pc === pc && this.mediaCallId === callId && call?.id === callId) return this.apply(call);
    }).catch(e => { if (this.pc === pc && this.mediaCallId === callId) this.mediaError(e); });
  }
  flushCandidates() {
    if (!this.mediaCallId || !this.pc) return;
    const callId = this.mediaCallId, pc = this.pc, candidates = this.candidates.splice(0);
    for (const candidate of candidates) this.sendTail = this.sendTail.then(async () => {
      if (this.pc === pc) await this.retry('candidate', { callId, candidate });
    }).catch(e => { if (this.pc === pc) this.mediaError(e); });
  }
  mediaError(e) {
    const callId = this.mediaCallId; this.finishLocal(e.message);
    if (callId) this.request('failed', { callId }).catch(() => {});
  }
  finishLocal(error) {
    const call = this.state.call;
    this.resetMedia(); this.state.error = error;
    if (call && call.state !== 'ended' && call.controlled) {
      this.locallyEnded.add(call.id);
      while (this.locallyEnded.size > 256) this.locallyEnded.delete(this.locallyEnded.values().next().value);
      this.state.call = {...call, state: 'ended', reason: 'media_failed', endedAt: Date.now()};
    }
    this.emit();
  }
  async action(fn) {
    if (this.busy || this.closed) throw Error('client_not_ready');
    this.busy = true; this.state.error = null; this.emit();
    try { return await fn(); }
    catch (e) { this.mediaError(e); throw e; }
    finally { this.busy = false; this.emit(); }
  }
  async history(query = {}) { return this.request('history', query); }
  async availability(connectionId) { return this.request('availability', { connectionId }); }
  async retry(operation, payload) {
    try { return await this.request(operation, payload); }
    catch (e) { if (e.status && e.status < 500) throw e; return this.request(operation, payload); }
  }
  async call(connectionId) {
    if (this.state.call && this.state.call.state !== 'ended') throw Error('busy');
    return this.action(async () => {
      const pc = await this.prepare(connectionId); const epoch = this.epoch;
      await this.rtc(pc.setLocalDescription(await this.rtc(pc.createOffer(), 'create_offer')), 'local_description');
      if (this.epoch !== epoch || this.closed) throw Error('call_cancelled');
      const payload = { ...(connectionId ? { connectionId } : {}), requestId: this.createId(), description: { type: 'offer', sdp: pc.localDescription.sdp } };
      // Retrying this exact request is safe: the service deduplicates requestId.
      const call = await this.retry('start', payload);
      if (this.epoch !== epoch) { await this.retry('end', { callId: call.id }); return; }
      this.state.call = call; this.mediaCallId = call.id; this.flushCandidates(); this.reportMediaConnection(pc); this.emit();
    });
  }
  async answer() {
    const call = this.state.call;
    if (!call || call.role !== 'callee' || call.state !== 'ringing' || !call.controlled) throw Error('no_incoming_call');
    return this.action(async () => {
      const pc = await this.prepare(call.connectionId), epoch = this.epoch;
      await this.rtc(pc.setRemoteDescription(call.remoteDescription), 'remote_description');
      await this.rtc(pc.setLocalDescription(await this.rtc(pc.createAnswer(), 'create_answer')), 'local_description');
      if (this.epoch !== epoch || this.closed) throw Error('call_cancelled');
      const result = await this.retry('answer', { callId: call.id, description: { type: 'answer', sdp: pc.localDescription.sdp } });
      if (this.epoch !== epoch) { await this.retry('end', { callId: call.id }); return; }
      this.state.call = result; this.mediaCallId = call.id; this.flushCandidates(); this.reportMediaConnection(pc); await this.apply(result);
    });
  }
  async endRemote(callId) {
    if (this.endRequests.has(callId)) return this.endRequests.get(callId);
    const pending = this.retry('end', { callId }); this.endRequests.set(callId, pending);
    try { return await pending; } finally { if (this.endRequests.get(callId) === pending) this.endRequests.delete(callId); }
  }
  async hangUp() {
    const call = this.state.call; this.resetMedia();
    if (call && call.state !== 'ended' && call.controlled) {
      this.locallyEnded.add(call.id);
      while (this.locallyEnded.size > 256) this.locallyEnded.delete(this.locallyEnded.values().next().value);
      // Stop the local screen/audio immediately; server acknowledgement can be
      // slow. The remote end remains retried using this same immutable call ID.
      this.state.call = { ...call, state: 'ended', endedAt: Date.now(), reason: 'hangup' };
      this.emit();
      try {
        const ended = await this.endRemote(call.id);
        if (this.state.call?.id === call.id) this.state.call = ended;
      } catch (e) { if (this.state.call?.id === call.id) this.state.error = e.message; }
    }
    this.emit();
  }
  mute(muted = true) { this.state.muted = muted; this.syncAudioTracks(); this.emit(); }
  async dispose() {
    this.closed = true; clearTimeout(this.timer); clearInterval(this.watchdog);
    clearTimeout(this.ringTimer);
    await this.hangUp();
    // Older sandbox hosts may not have close; media is already released.
    await this.request('close').catch(() => {});
  }
}
