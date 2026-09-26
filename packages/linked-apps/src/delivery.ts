import type { CryptoProvider, Tokens, TokenStore } from "./index.js";
export interface LinkedEvent {
  id: string;
  type: "messages.changed" | "receipts.changed" | "conversations.changed";
  conversation_id: string | null;
  message_id: string | null;
  created_at: string;
}
export interface EventPage {
  events: LinkedEvent[];
  cursor: string;
  has_more: boolean;
  resync_required?: boolean;
}
export interface CursorStore {
  /** Key by grant ID; never share a cursor between accounts or grants. */
  get(grantId: string): Promise<string | null>;
  set(grantId: string, cursor: string): Promise<void>;
}
export interface WatchOptions {
  signal: AbortSignal;
  cursorStore: CursorStore;
  onEvents(events: LinkedEvent[]): Promise<void>;
  /** Reconcile the conversation list and currently open message pages. */
  onResync(): Promise<void>;
  onError?(error: unknown): void;
  pollIntervalMs?: number;
}
export async function waitForPoll(ms: number, signal: AbortSignal) {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    if (signal.aborted) done();
  });
}
/** Dependency injection keeps the SDK usable in Expo and bare native apps. */
export function secureTokenStore(storage: {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}, key: string): TokenStore {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(key)) {
    throw new Error(
      "Use a unique, stable secure-storage key for each account.",
    );
  }
  return {
    async get() {
      const value = await storage.getItemAsync(key);
      return value ? JSON.parse(value) as Tokens : null;
    },
    async set(tokens) {
      if (tokens) await storage.setItemAsync(key, JSON.stringify(tokens));
      else await storage.deleteItemAsync(key);
    },
  };
}
export function nativeCryptoProvider(native: {
  getRandomBytes(length: number): Uint8Array;
  digest(algorithm: "SHA-256", bytes: Uint8Array): Promise<ArrayBuffer>;
}): CryptoProvider {
  return {
    randomBytes: (length) => native.getRandomBytes(length),
    sha256: async (bytes) =>
      new Uint8Array(await native.digest("SHA-256", bytes)),
  };
}
