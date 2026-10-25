export interface CallHistoryEntry { id: string; sequence: number; connectionId: string; role: 'caller' | 'callee'; reason: string; createdAt: number; answeredAt: number | null; connectedAt: number | null; endedAt: number; durationMs: number }
export interface CallHistoryPage { entries: CallHistoryEntry[]; nextCursor: number; hasMore: boolean }
export type CallState = 'ringing' | 'connecting' | 'connected' | 'ended';
export interface Call { id: string; version: number; connectionId: string; state: CallState; role: 'caller' | 'callee'; controlled: boolean; reason?: string; remoteDescription: RTCSessionDescriptionInit | null; remoteCandidates: RTCIceCandidateInit[]; createdAt: number; ringExpiresAt?: number; ringRemainingMs?: number; localHeld?: boolean; remoteHeld?: boolean; holdExpiresAt?: number | null; holdRevision?: number; answeredAt?: number; connectedAt?: number; endedAt?: number }
export interface Snapshot { voiceAvailable: boolean; call: Call | null; muted: boolean; localHeld?: boolean; error: string | null; preparing?: boolean; nativePresentation?: { mode?: string; dismissedCallIds?: string[]; speakerEnabled?: boolean; callerNames?: Record<string, string>; appOwnedCallIds?: string[]; appAnsweringCallIds?: string[]; appRingingCallIds: string[]; systemRingingCallIds: string[] } | null }
export type Request = (operation: string, payload?: Record<string, unknown>) => Promise<any>;
export function createHttpTransport(options: { baseUrl: string; token: string; fetcher?: typeof fetch }): Request;
export class RobonoCallingClient {
  constructor(options: { request: Request; onChange?: (state: Snapshot) => void; onRemoteStream?: (stream: MediaStream | null) => void; getUserMedia?: (context?: { isCurrent: () => boolean }) => Promise<MediaStream>; createPeerConnection?: (config: RTCConfiguration) => RTCPeerConnection; pollMs?: number; forceRelay?: boolean; createId?: () => string; createRemoteStream?: (track: MediaStreamTrack) => MediaStream });
  state: Snapshot;
  readonly closed: boolean;
  listen(): Promise<void>;
  refresh(): Promise<boolean>;
  call(connectionId?: string): Promise<void>;
  history(query?: { after?: number; limit?: number; connectionId?: string }): Promise<CallHistoryPage>;
  availability(connectionId: string): Promise<{ voiceAvailable: boolean }>;
  answer(): Promise<void>;
  hangUp(): Promise<void>;
  hold(): Promise<void>;
  resume(prepareAudio?: () => Promise<void>): Promise<void>;
  mute(muted?: boolean): void;
  dispose(): Promise<void>;
}
