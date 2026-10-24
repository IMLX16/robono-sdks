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
      const data = await response.json();
      if (!response.ok) { const e = Error(data.error || 'request_failed'); e.status = response.status; throw e; }
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
    // The local WebRTC transport, not a later server poll, determines when this
    // device can communicate. Keep the server snapshot separate for sequencing.
    const connected = this.mediaConnectedAt != null && this.mediaCallId === call?.id &&
      call.controlled && ['connecting', 'connected'].includes(call.state);
    this.onChange({ ...this.state, preparing: this.busy,
      call: connected ? { ...call, state: 'connected', connectedAt: this.mediaConnectedAt } : call });
  }
  async listen() {
    if (this.started) return; this.started = true;
    this.watchdog = setInterval(() => {
      // Match the service's ten-second endpoint lease. Six seconds left almost
      // no recovery time after a 4.5-second request timeout plus the poll delay.
      // Explicit authorization failures still stop media immediately in refresh.
      if ((this.pc || this.stream) && Date.now() - this.lastSuccess > 10000) {
        const id = this.state.call?.id; this.resetMedia(); this.state.error = 'connection_lost'; this.emit();
        if (id) this.request('end', { callId: id }).catch(() => {});
      }
    }, 500);
    await this.poll();
  }
  // Refresh without scheduling a second poll loop (also used for native wake races).
  // False means the cached snapshot is not authoritative for this attempt.
  async refresh() {
    if (this.closed) return false;
    const epoch = this.epoch;
    try {
      const state = await this.request('state');
      if (this.closed) return false;
      this.lastSuccess = Date.now();
      if (epoch === this.epoch) {
        this.state.error = null;
        if (!this.busy && !(state.version < (this.state.call?.version ?? -1))) {
          this.state.voiceAvailable = state.voiceAvailable;
          await this.apply(state.call);
          return true;
        }
      }
    } catch (e) {
      if (this.closed) return false;
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
    const refreshed = await this.refresh();
    if (!this.closed) this.timer = setTimeout(() => this.poll(), refreshed ? this.pollMs : Math.min(this.pollMs, 250));
  }
  async apply(call) {
    // A pending/late server poll cannot reopen a call the person already ended.
    if (call && call.state !== 'ended' && this.locallyEnded.has(call.id)) {
      // Reconcile a lost End response on subsequent polls, without reopening UI.
      await this.endRemote(call.id).catch(() => {});
      return;
    }
    if (call && this.state.call && call.version < this.state.call.version) return;
    if (!call) { if (this.pc) this.resetMedia(); this.state.call = null; this.emit(); return; }
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
    this.emit();
  }
  resetMedia() {
    this.epoch++;
    for (const timer of this.mediaTimers) clearTimeout(timer); this.mediaTimers.clear();
    for (const cancel of this.pendingRTC) cancel();
    const pc = this.pc; this.pc = null;
    if (pc) { pc.onicecandidate = pc.onconnectionstatechange = pc.ontrack = null; pc.close(); }
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
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
    pc.ontrack = e => { if (this.pc === pc) this.onRemoteStream(e.streams[0] || this.createRemoteStream(e.track)); };
    pc.onicecandidate = e => {
      if (!e.candidate || this.pc !== pc) return;
      this.candidates.push(e.candidate.toJSON()); this.flushCandidates();
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc || !this.mediaCallId) return;
      if (pc.connectionState === 'connected') this.reportMediaConnection(pc);
      if (pc.connectionState === 'failed') this.mediaError(Error('media_failed'));
      if (pc.connectionState === 'disconnected') {
        const timer = setTimeout(() => {
          this.mediaTimers.delete(timer);
          if (this.pc === pc && pc.connectionState === 'disconnected') this.mediaError(Error('media_disconnected'));
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
    const callId = this.mediaCallId; this.resetMedia(); this.state.error = e.message; this.emit();
    if (callId) this.request('failed', { callId }).catch(() => {});
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
  mute(muted = true) { this.stream?.getAudioTracks().forEach(t => { t.enabled = !muted; }); this.state.muted = muted; this.emit(); }
  async dispose() {
    this.closed = true; clearTimeout(this.timer); clearInterval(this.watchdog);
    await this.hangUp();
    // Older sandbox hosts may not have close; media is already released.
    await this.request('close').catch(() => {});
  }
}
