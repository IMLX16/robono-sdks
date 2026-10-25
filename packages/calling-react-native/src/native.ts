import { PermissionsAndroid, Platform } from 'react-native';
import { mediaDevices, MediaStream, RTCPeerConnection } from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { createCallAudio } from './audio.mjs';
import type { CallAudio, MediaAdapter, Phase } from './types.js';
import {callingSounds,type CallingAppearance, type SoundEvent} from './appearance.js';
import type { CallRuntime } from './runtime.js';

export interface NativeAdapterOptions {
  appearance?: CallingAppearance;
  /** Restore your app's ordinary playback/recording policy after each call. */
  restoreAudio(): Promise<void>;
  onError(error: Error): void;
  /** Default uses the person's system ringtone. Set 'robono' for the supplied chime. */
  ringtone?: 'system' | 'robono';
  /** Supplied native runtime, or your existing application's lifetime adapter. */
  runtime?: CallRuntime;
}
let audioOwner: symbol | null = null;
/** Import this entry point only when choosing the supplied native audio adapter. */
export function createNativeCallAdapters(options: NativeAdapterOptions): {media: MediaAdapter; audio: CallAudio} {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') throw Error('native_platform_required');
  let players: Record<string, AudioPlayer> | undefined;
  const sounds={...callingSounds,...options.appearance?.sounds};
  const owner = Symbol('calling-audio');
  let current = '', session = '', speaker = false, disposed = false;
  let resumedFocus = false;
  // These cues share AVAudioSession with WebRTC. Expo's default pause/finish
  // deactivates that session when no Expo player is playing, without accounting
  // for the live WebRTC microphone. Call cleanup owns session release instead.
  const cueOptions = {keepAudioSessionActive: true};
  const load = () => players ||= {
    ringing: createAudioPlayer(require('../assets/ringing.wav'), cueOptions),
    connecting: createAudioPlayer(require('../assets/connecting.wav'), cueOptions),
    ended: createAudioPlayer(require('../assets/ended.wav'), cueOptions),
    bell: createAudioPlayer(require('../assets/bell.wav'), cueOptions),
    marimba: createAudioPlayer(require('../assets/marimba.wav'), cueOptions),
    pulse: createAudioPlayer(require('../assets/pulse.wav'), cueOptions),
    click: createAudioPlayer(require('../assets/click.wav'), cueOptions),

  };
  const pause = () => {
    if (audioOwner === owner) InCallManager.stopRingtone();
    if (players) Object.values(players).forEach(player => player.pause());
    current = '';
  };
  const route = () => {
    // null restores automatic headset/Bluetooth routing; false forces earpiece.
    InCallManager.setForceSpeakerphoneOn((speaker ? true : null) as unknown as boolean);
  };
  const audio = createCallAudio({
    schedule: options.runtime?.schedule,
    sound: (event:SoundEvent)=>sounds[event],
    duration:(event:SoundEvent)=>['bell','marimba'].includes(sounds[event])?1850:700,
    onError: options.onError,
    pause,
    playing: () => !!current,
    async resume() {
      if (audioOwner !== owner || disposed) throw Error('call_cancelled');
      if (Platform.OS === 'ios') {
        if (!options.runtime?.activateAudio) throw Error('calling_runtime_native_build_required');
        await options.runtime.activateAudio();
      } else {
        const result = await InCallManager.requestAudioFocus();
        if (result !== 'AUDIOFOCUS_REQUEST_GRANTED') throw Error('audio_still_interrupted');
        resumedFocus = true;
      }
      route();
    },
    async prepare(phase: Phase, selected: boolean) {
      if (audioOwner && audioOwner !== owner) throw Error('audio_busy');
      audioOwner = owner;
      speaker = selected;
      const target = phase === 'incoming' ? 'ring' : 'call';
      if (session !== target) {
        if (session === 'call') InCallManager.stop();
        await setAudioModeAsync({allowsRecording: target === 'call' && Platform.OS === 'ios', playsInSilentMode: target === 'call',
          interruptionMode: 'mixWithOthers', shouldPlayInBackground: target === 'call', shouldRouteThroughEarpiece: target === 'call'});
        if (target === 'call') InCallManager.start({media: 'audio'});
        session = target;
      }
      if (target === 'call') route();
    },
    async play(kind: string, playback: {loop?:boolean;event?:string}={}) {
      pause(); current = kind;
      if (playback.event==='incoming' && !options.appearance && kind === 'ringing' && options.ringtone !== 'robono') {
        InCallManager.startRingtone('_DEFAULT_', [0, 350, 900], 'ambient', 0); return;
      }
      const player = load()[kind]; player.loop = !!playback.loop;
      // Fresh local assets start at zero. Seeking before native decoding has
      // loaded can reject; play itself queues safely while the asset loads.
      // Android's isLoaded becomes false at STATE_ENDED, even though the file
      // remains prepared. Rewind completed cues as well as currently ready ones.
      if (player.isLoaded || player.currentTime > 0) await player.seekTo(0);
      if (current === kind && !disposed) player.play();
    },
    async release() {
      pause(); if (audioOwner !== owner) return;
      try {
        InCallManager.stop(); session = '';
        try {
          if (resumedFocus) { resumedFocus = false; await InCallManager.abandonAudioFocus(); }
        } finally { try { await options.runtime?.end(); } finally { await options.restoreAudio(); } }
      }
      finally { if (audioOwner === owner) audioOwner = null; }
    },
    dispose() { disposed = true; pause(); if (players) Object.values(players).forEach(player => player.remove()); players = undefined; },
  });
  (audio as CallAudio).robonoAdapter=true;
  const media: MediaAdapter = {
    robonoAdapter:true,
    createId: randomUUID,
    createPeerConnection: config => new RTCPeerConnection(config as ConstructorParameters<typeof RTCPeerConnection>[0]) as unknown as globalThis.RTCPeerConnection,
    createRemoteStream: track => new MediaStream([track as unknown as import('react-native-webrtc').MediaStreamTrack]) as unknown as globalThis.MediaStream,
    async getUserMedia(context) {
      const current = () => !disposed && (!context || context.isCurrent());
      if (!current()) throw Error('call_cancelled');
      if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (!current()) throw Error('call_cancelled');
        if (result !== PermissionsAndroid.RESULTS.GRANTED) throw Error('microphone_permission_denied');
      }
      await audio.ready();
      if (!current()) throw Error('call_cancelled');
      await options.runtime?.begin();
      if (!current()) { await options.runtime?.end(); throw Error('call_cancelled'); }
      let stream;
      try { stream = await mediaDevices.getUserMedia({audio: true, video: false}); }
      catch (error) { await options.runtime?.end(); throw error; }
      if (!current()) { stream.getTracks().forEach(track => track.stop()); await options.runtime?.end(); throw Error('call_cancelled'); }
      route();
      return stream as unknown as globalThis.MediaStream;
    },
  };
  return {media, audio};
}
