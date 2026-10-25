import { AppRegistry, AppState, DeviceEventEmitter, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { CallingController } from './types.js';

// Android pauses React timers without an active JS task even while a microphone
// service owns audio. Keep signaling alive only for an explicitly started call.
const callTasks = new Map<string, {promise: Promise<void>; finish(): void}>();
let taskRegistered = false;
function holdCallTask(token: string) {
  if (Platform.OS !== 'android') return;
  if (!taskRegistered) {
    AppRegistry.registerHeadlessTask('RobonoBridgeCallLifetime', () => async data => {
      await callTasks.get(data.token)?.promise;
    });
    taskRegistered = true;
  }
  let finish!: () => void;
  const promise = new Promise<void>(resolve => { finish = resolve; });
  callTasks.set(token, {promise, finish});
}
function finishCallTask(token: string | undefined) {
  if (!token) return;
  callTasks.get(token)?.finish(); callTasks.delete(token);
}

export interface CallRuntime {
  /** Start from the visible app, after microphone permission and before capture. */
  begin(): Promise<void>;
  end(): Promise<void>;
  attach(controller: CallingController): () => void;
  dispose(): Promise<void>;
  /** Audio cleanup deadline also advances on native call ticks in background. */
  schedule?(callback: () => void, delayMs: number): () => void;
  activateAudio?(): Promise<void>;
}
export interface NativeRuntimeOptions {
  /** Your app's translated, privacy-safe ongoing-call notification. */
  notificationTitle: string;
  notificationText: string;
  channelName: string;
  endLabel: string;
  onError(error: Error): void;
}

/** Optional native lifetime support. Does not install CallKit or incoming-call UI. */
export function createNativeCallRuntime(options: NativeRuntimeOptions): CallRuntime {
  const native = NativeModules.RobonoCallingRuntime;
  if (!native) throw Error('calling_runtime_native_build_required');
  for (const key of ['notificationTitle', 'notificationText', 'channelName', 'endLabel'] as const)
    if (!options[key]?.trim()) throw Error(`calling_runtime_${key}_required`);
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let token: string | undefined;
  let starting: Promise<void> | undefined;
  let disposed = false, active = false, generation = 0;
  let controller: CallingController | undefined;
  let ending = false;
  let interruption = 0;
  let holding: Promise<void> = Promise.resolve();
  let backgroundSince = 0, lastBackgroundSuccess = 0, nextRefresh = 0, refreshing = false;
  const deadlines = new Set<{at: number; run(): void; cancel(): void}>();
  const subscriptions: {remove(): void}[] = [];
  const endCall = (playEndTone = true) => {
    if ((!active && !starting) || ending || !controller) return;
    ending = true;
    void controller.hangUp({playEndTone}).catch(options.onError).finally(() => { ending = false; });
  };
  const interrupt = () => {
    if (!active || !controller) return;
    ++interruption;
    const currentToken = token;
    // interrupt() disables tracks synchronously before its first network wait.
    holding = controller.interrupt().catch(options.onError).finally(() => {
      if (token === currentToken) void native.interruptionHandled?.(currentToken);
    });
  };
  const resume = () => {
    const currentToken = token, revision = interruption;
    void holding.then(async () => {
      if (active && token === currentToken && revision === interruption) await controller?.resume();
    }).catch(options.onError);
  };
  const emitter = new NativeEventEmitter(native);
  subscriptions.push(emitter.addListener('RobonoCallingRuntimeEvent', event => {
    if (event.token !== token) return;
    if (event.type === 'interrupted') interrupt();
    if (event.type === 'interruptionEnded' && event.shouldResume) resume();
    if (event.type === 'audioReset') endCall(false);
    if (event.type === 'end') endCall();
    if (event.type === 'tick') {
      const now = Date.now();
      for (const deadline of [...deadlines]) if (deadline.at <= now) deadline.run();
      if (!active || !controller || AppState.currentState === 'active') { backgroundSince = 0; return; }
      if (!backgroundSince) backgroundSince = lastBackgroundSuccess = now;
      // Native ticks don't depend on Android display-frame timers. Match the
      // engine's connection-loss deadline, including while a request is stuck.
      const state = controller.getSnapshot();
      const heldLease = state.localHeld && (state.call?.holdExpiresAt || 0) > now;
      if (now - lastBackgroundSuccess > 10000 && !heldLease) { endCall(!state.localHeld); return; }
      if (refreshing || now < nextRefresh) return;
      refreshing = true; nextRefresh = now + 1000;
      const currentToken = token;
      void controller.refresh().then(ok => {
        if (ok && token === currentToken) lastBackgroundSuccess = Date.now();
      }).catch(options.onError).finally(() => { refreshing = false; });
    }
  }));
  if (Platform.OS === 'android') subscriptions.push(DeviceEventEmitter.addListener('onAudioFocusChange', event => {
    if (event.eventCode === -1 || event.eventCode === -2) interrupt();
    if (event.eventCode === 1) resume();
  }));
  return {
    async begin() {
      if (disposed) throw Error('calling_runtime_disposed');
      if (active) return;
      if (starting) return starting;
      if (AppState.currentState !== 'active') throw Error('open_app_to_start_call');
      const revision = ++generation;
      const callToken = token = `${owner}-${revision}`;
      backgroundSince = nextRefresh = 0;
      holdCallTask(callToken);
      const work = (async () => {
        try { await native.begin(callToken, options.notificationTitle, options.notificationText, options.channelName, options.endLabel); }
        catch (error) { finishCallTask(callToken); throw error; }
        if (disposed || revision !== generation) {
          try { await native.end(callToken); } finally { finishCallTask(callToken); }
          throw Error('call_cancelled');
        }
        active = true;
      })();
      starting = work;
      try { await work; } finally { if (starting === work) starting = undefined; }
    },
    async end() {
      ++generation; ++interruption; active = false;
      const endingToken = token; token = undefined;
      if (endingToken) try { await native.end(endingToken); } finally { finishCallTask(endingToken); }
    },
    async activateAudio() {
      if (!active || !token || disposed) throw Error('call_cancelled');
      if (typeof native.activateAudio !== 'function') throw Error('calling_runtime_native_build_required');
      await native.activateAudio(token);
    },
    schedule(callback, delayMs) {
      let timer: ReturnType<typeof setTimeout>, pending = true;
      const deadline = {
        at: Date.now() + delayMs,
        run() { if (!pending) return; deadline.cancel(); callback(); },
        cancel() { pending = false; clearTimeout(timer); deadlines.delete(deadline); },
      };
      deadlines.add(deadline); timer = setTimeout(deadline.run, delayMs);
      return deadline.cancel;
    },
    attach(value) {
      if (disposed || controller && controller !== value) throw Error('calling_runtime_already_attached');
      controller = value;
      value.setForeground(AppState.currentState === 'active');
      const sub = AppState.addEventListener('change', state => {
        value.setForeground(state === 'active');
        if (state === 'active') void value.refresh().catch(options.onError);
      });
      subscriptions.push(sub);
      return () => { sub.remove(); if (controller === value) controller = undefined; };
    },
    async dispose() {
      if (disposed) return;
      disposed = true; ++generation; active = false; controller = undefined;
      subscriptions.forEach(sub => sub.remove());
      for (const deadline of [...deadlines]) deadline.cancel();
      const endingToken = token; token = undefined;
      if (endingToken) try { await native.end(endingToken); } finally { finishCallTask(endingToken); }
    },
  };
}
