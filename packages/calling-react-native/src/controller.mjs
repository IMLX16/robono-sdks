// No UI, push registration, account storage or network-specific identity here.
/**
 * @param {import('./types.js').CallingOptions & {createClient: (options: any) => import('@robono/calling').RobonoCallingClient}} options
 * @returns {import('./types.js').CallingController}
 */
export function createController({ createClient, request, media, audio, resolveContact = () => null, onError = () => {}, forceRelay = false }) {
  const listeners = new Set();
  let disposed = false, foreground = true, action = null, startingContact = null;
  let opening = null, openingTimer, connectedId = null, audioKey = '', epoch = 0;
  let resuming = null;
  let snapshot = { call: null, voiceAvailable: false, muted: false, error: null };
  let state = { phase: 'idle', call: null, contact: null, speaker: false, muted: false, error: null, canMute: false, canSpeaker: false, connectedAt: null };
  const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const report = error => { if (!disposed) { publish({ error: error.message || 'call_failed' }); onError(error); } };
  const sound = (phase, tone = false) => {
    const key = `${phase}:${foreground}:${state.speaker}`;
    if (key === audioKey && !tone) return;
    audioKey = key;
    Promise.resolve(audio.update({ phase, speaker: state.speaker, foreground, endTone: tone })).catch(report);
  };
  const update = next => {
    if (disposed) return;
    snapshot = next;
    const call = next.call;
    const active = call && call.state !== 'ended' && call.controlled;
    if (opening && (!active || call.id !== opening)) return;
    if (opening) { opening = null; clearTimeout(openingTimer); }
    const terminalError = next.error && client.closed;
    const held = active && (next.localHeld || call.localHeld || call.remoteHeld);
    const phase = terminalError ? 'error' : held ? 'held' : active ? (call.state === 'ringing' ? (call.role === 'callee' && action !== 'answer' ? 'incoming' : call.role === 'caller' ? 'outgoing' : 'connecting') : call.state)
      : action === 'call' && next.preparing ? 'outgoing' : 'idle';
    const ended = connectedId !== null && (phase === 'idle' || phase === 'error' || call?.id !== connectedId);
    const endTone = ended && !state.localHeld;
    if (ended) connectedId = null;
    if (phase === 'connected') connectedId = call.id;
    const contact = active ? resolveContact(call.connectionId) || startingContact : startingContact;
    const newIncoming = active && call.role === 'callee' && state.call?.id !== call.id;
    publish({ phase, call: active && !terminalError ? call : null, contact, muted: next.muted,
      ...(newIncoming ? {speaker: false} : {}),
      error: next.error, localHeld: !!next.localHeld,
      ...(phase !== 'held' ? {resumeError: null, resumePending: false} : {}),
      connectedAt: ['connected', 'held'].includes(phase) ? call.connectedAt ?? null : null,
      canMute: phase === 'connected' && !next.preparing,
      canSpeaker: ['outgoing', 'connecting', 'connected'].includes(phase) });
    sound(phase, endTone);
    if (phase === 'idle' && !action) startingContact = null;
  };
  const client = createClient({ request, ...media, forceRelay, onChange: update });
  const run = async (kind, work) => {
    if (disposed || action || ['loading', 'error'].includes(state.phase)) throw Error('client_not_ready');
    action = kind; const generation = ++epoch;
    try { await work(); }
    catch (error) { if (!disposed && generation === epoch && error.message !== 'call_cancelled') report(error); throw error; }
    finally { if (generation === epoch) { action = null; update(snapshot); } }
  };
  return {
    client,
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async listen() { if (disposed) throw Error('client_not_ready'); await client.listen(); },
    async call(connectionId, contact) {
      if (state.phase !== 'idle') throw Error('busy');
      startingContact = contact || resolveContact(connectionId);
      return run('call', async () => {
        publish({ phase: 'outgoing', contact: startingContact, speaker: false, canSpeaker: true, error: null });
        sound('outgoing');
        await client.call(connectionId);
      });
    },
    async answer() {
      if (state.phase !== 'incoming') throw Error('no_incoming_call');
      return run('answer', async () => {
        // Keep this screen mounted throughout permission and SDP negotiation.
        publish({ phase: 'connecting', canSpeaker: true }); sound('connecting');
        await client.answer();
      });
    },
    async hangUp({playEndTone = true} = {}) {
      ++epoch; action = null; opening = null; clearTimeout(openingTimer);
      const tone = connectedId !== null && !state.localHeld; connectedId = null;
      publish({ phase: 'idle', call: null, canSpeaker: false, canMute: false, connectedAt: null });
      sound('idle', tone && playEndTone);
      await client.hangUp();
    },
    async interrupt() {
      // Pre-answer/setup calls do not have an established conversation to hold.
      if (!['connected', 'held'].includes(state.phase)) return this.hangUp({playEndTone: false});
      try { await client.hold(); } catch (error) { report(error); throw error; }
    },
    resume() {
      if (resuming) return resuming;
      if (state.phase !== 'held' || !state.localHeld) return Promise.resolve();
      const callId = state.call?.id;
      publish({resumePending: true, resumeError: null});
      const work = Promise.resolve().then(() => client.resume(() => audio.resume?.() || Promise.resolve()))
        .catch(error => {
          if (!disposed && state.call?.id === callId && state.phase === 'held') {
            publish({resumeError: error.message || 'call_state_unavailable'});
            report(error);
          }
          throw error;
        }).finally(() => {
          if (resuming === work) resuming = null;
          if (!disposed && state.call?.id === callId) publish({resumePending: false});
        });
      resuming = work;
      return work;
    },
    mute(value) { if (state.canMute) client.mute(value); },
    setSpeaker(value) {
      if (!state.canSpeaker) return;
      publish({ speaker: value }); sound(state.phase);
    },
    setForeground(value) { foreground = value; sound(state.phase); },
    async refresh() { return client.refresh(); },
    async openIncoming(callId) {
      if (disposed || typeof callId !== 'string' || !callId || callId.length > 128) return false;
      if (state.call?.id === callId) return true;
      if (state.phase !== 'idle' && state.phase !== 'error') return false;
      opening = callId;
      publish({ phase: 'loading', call: null, contact: null, canSpeaker: false, canMute: false, error: null });
      clearTimeout(openingTimer);
      openingTimer = setTimeout(() => {
        if (opening === callId) { opening = null; publish({ phase: 'error', error: 'call_unavailable' }); }
      }, 8000);
      const fresh = await client.refresh();
      if (opening !== callId) return state.call?.id === callId;
      // A current response authoritatively rejects a stale/foreign push.
      if (fresh) {
        opening = null; clearTimeout(openingTimer);
        publish({ phase: 'error', error: 'call_unavailable' });
      }
      return false;
    },
    dismissError() { if (state.phase === 'error') publish({ phase: 'idle', error: null }); },
    async dispose() {
      if (disposed) return;
      disposed = true; ++epoch; opening = null; clearTimeout(openingTimer); listeners.clear();
      // No end cue on logout/account switch; native resources release immediately.
      const results = await Promise.allSettled([client.dispose(), Promise.resolve().then(() => audio.dispose())]);
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    },
  };
}
