import type { Call, Request, RobonoCallingClient } from '@robono/calling';
export type Phase = 'idle' | 'loading' | 'incoming' | 'outgoing' | 'connecting' | 'connected' | 'held' | 'error';
export interface Contact { name: string; avatarUri?: string }
export interface CallingState {
  resumePending?: boolean; resumeError?: string | null;
  phase: Phase; call: Call | null; contact: Contact | null; speaker: boolean; muted: boolean;
  canMute: boolean; canSpeaker: boolean; connectedAt: number | null; error: string | null;
  localHeld?: boolean;
}
export interface CallAudio {
  robonoAdapter?: boolean;
  update(state: { phase: Phase; speaker: boolean; foreground: boolean; endTone: boolean; cue?: string; localHeld?: boolean }): Promise<void> | void;
  dispose(): Promise<void> | void;
  resume?(): Promise<void>;
}
export type MediaAdapter = Required<Pick<ConstructorParameters<typeof RobonoCallingClient>[0], 'getUserMedia' | 'createPeerConnection' | 'createRemoteStream' | 'createId'>> & {robonoAdapter?: boolean};
export interface CallingOptions {
  appearanceRevision?: number;
  request: Request; media: MediaAdapter; audio: CallAudio; forceRelay?: boolean;
  resolveContact?: (connectionId: string) => Contact | null;
  onError?: (error: Error) => void;
}
export interface CallingController {
  reportComponents?(components:string[]): void;
  readonly client: RobonoCallingClient;
  getSnapshot(): CallingState;
  subscribe(listener: () => void): () => void;
  listen(): Promise<void>;
  refresh(): Promise<boolean>;
  call(connectionId: string, contact?: Contact): Promise<void>;
  answer(): Promise<void>;
  /** Suppress the end cue when the OS currently owns audio. */
  hangUp(options?: {playEndTone?: boolean}): Promise<void>;
  interrupt(): Promise<void>;
  resume(): Promise<void>;
  mute(value: boolean): void;
  setSpeaker(value: boolean): void;
  setForeground(value: boolean): void;
  openIncoming(callId: string): Promise<boolean>;
  dismissError(): void;
  dispose(): Promise<void>;
}
