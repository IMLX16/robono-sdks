// Serializes native audio changes. Late setup/cleanup cannot overtake a new call.
export function createCallAudio(driver) {
  let revision = 0, disposed = false, queue = Promise.resolve(), latest = queue, timer;
  let phase = 'idle', speaker = false, active = false;
  const serial = work => { const next = queue.then(work); latest = next; queue = next.catch(() => {}); return next; };
  const schedule = driver.schedule || ((callback, delay) => { const id = setTimeout(callback, delay); return () => clearTimeout(id); });
  const stop = () => { driver.pause(); timer?.(); timer = undefined; };
  const release = async generation => {
    if (generation !== revision) return;
    stop(); if (active) { active = false; await driver.release(); }
  };
  return {
    ready() { return latest; },
    resume() { return serial(async () => { if (!disposed && active) await driver.resume?.(); }); },
    update(next) {
      if (disposed) return Promise.resolve();
      const generation = ++revision;
      const changed = next.phase !== phase;
      phase = next.phase; speaker = next.speaker;
      // Stop a ringtone immediately on Answer, even while native setup is queued.
      if (changed || !next.foreground && phase === 'incoming') stop();
      return serial(async () => {
        if (generation !== revision || disposed) return;
        // The OS owns audio during a local interruption. Never activate the
        // session, route output or play a cue while either participant is held.
        if (phase === 'held') { stop(); return; }
        if (['idle', 'error', 'loading'].includes(phase)) {
          if (next.endTone && active) {
            stop(); await driver.play('ended');
            if (generation !== revision) return;
            timer = schedule(() => { void serial(() => release(generation)).catch(driver.onError); }, 700);
          } else await release(generation);
          return;
        }
        if (phase === 'incoming' && !next.foreground) { await release(generation); return; }
        active = true;
        await driver.prepare(phase, speaker);
        if (generation !== revision || disposed) return;
        if (phase === 'connected') driver.pause();
        else if (changed || !driver.playing()) await driver.play(phase === 'incoming' ? 'ringing' : 'connecting');
      });
    },
    async dispose() {
      if (disposed) return;
      disposed = true; const generation = ++revision; stop();
      try { await serial(() => release(generation)); } finally { driver.dispose(); }
    },
  };
}
