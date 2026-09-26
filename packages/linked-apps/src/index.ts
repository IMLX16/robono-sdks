import { type EventPage, waitForPoll, type WatchOptions } from "./delivery.js";
import { consumeStream, type LinkedSocketFactory } from "./stream.js";
import type {
  ConversationPage,
  Message,
  MessagePage,
  Receipt,
  UploadTicket,
} from "./types.js";
export * from "./types.js";
export * from "./delivery.js";
export type { LinkedSocket, LinkedSocketFactory } from "./stream.js";
export type Scope =
  | "account:read"
  | "messages:read"
  | "messages:send"
  | "receipts:write";
export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: string;
  grantId: string;
  scopes: Scope[];
};
export interface TokenStore {
  /** Use the device Keychain/Keystore. Never AsyncStorage, URLs or logs. */
  get(): Promise<Tokens | null>;
  set(tokens: Tokens | null): Promise<void>;
}
export interface CryptoProvider {
  randomBytes(length: number): Uint8Array;
  sha256(bytes: Uint8Array): Promise<Uint8Array>;
}
export interface PendingLink {
  clientId: string;
  redirectUri: string;
  verifier: string;
  state: string;
  expiresAt: string;
}
/** Secret pending state: keep in secure storage, never display or log it. */
export interface PendingPairing {
  clientId: string;
  deviceCode: string;
  verifier: string;
  expiresAt: string;
  interval: number;
  nextPollAt: number;
}
export type PairingResult = { status: "pending" } | { status: "connected"; tokens: Tokens };
export interface SendMessage {
  conversationId: string;
  messageKind: "text" | "voice" | "image" | "video" | "document";
  /** Persist this UUID with the outgoing message. Reuse it for every retry. */
  clientMessageId: string;
  textBody?: string;
  mediaObjectId?: string;
  replyToMessageId?: string;
}
export interface MediaUpload {
  conversationId: string;
  mediaKind: "voice" | "image" | "video" | "document";
  mimeType: string;
  sizeBytes: number;
  fileName?: string;
  durationMs?: number;
  waveform?: number[];
}
export type ApiRecord = Record<string, unknown>;
export class RobonoLinkedAppError extends Error {
  constructor(public code: string, public status: number) {
    super(`Robono request failed (${code})`);
  }
}
type WireToken = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_at: string;
  grant_id: string;
  scope: string;
};
const scopeNames = new Set<Scope>([
  "account:read",
  "messages:read",
  "messages:send",
  "receipts:write",
]);
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
function base64url(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "", bits = 0, value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += alphabet[(value >>> bits) & 63];
    }
  }
  if (bits) result += alphabet[(value << (6 - bits)) & 63];
  return result;
}
export function webCryptoProvider(): CryptoProvider {
  if (!globalThis.crypto?.subtle) {
    throw new Error("A secure CryptoProvider is required on this platform.");
  }
  return {
    randomBytes: (length) =>
      globalThis.crypto.getRandomValues(new Uint8Array(length)),
    sha256: async (bytes) =>
      new Uint8Array(
        await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
      ),
  };
}

/** One instance per connected account. Watching starts only when explicitly requested. */
export class RobonoLinkedApps {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private pairingPolls = new Map<string, Promise<PairingResult>>();
  private refreshPending: Promise<Tokens> | null = null;
  constructor(
    private readonly options: {
      functionsUrl: string;
      clientId: string;
      tokenStore: TokenStore;
      crypto?: CryptoProvider;
      fetch?: typeof fetch;
      timeoutMs?: number;
      webSocket?: LinkedSocketFactory;
    },
  ) {
    const url = new URL(options.functionsUrl);
    if (
      url.username || url.password || url.search || url.hash ||
      !(url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    ) {
      throw new Error(
        "Use an HTTPS Robono functions URL (HTTP is allowed only for local tests).",
      );
    }
    this.baseUrl = url.toString().replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch;
  }
  private async post<T>(
    endpoint: string,
    body: unknown,
    token?: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(cancel, this.options.timeoutMs ?? 30_000);
    try {
      const response = await this.fetcher(`${this.baseUrl}/${endpoint}`, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await response.json() as {
        error?: string | { code?: string };
      };
      if (!response.ok) {
        const code = typeof data.error === "string"
          ? data.error
          : data.error?.code ?? "request_failed";
        throw new RobonoLinkedAppError(code, response.status);
      }
      return data as T;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  }
  /** Show only userCode. The user approves inside their signed-in Robono app. */
  async beginPairing(scopes: Scope[], signal?: AbortSignal) {
    if (!scopes.length || scopes.some((scope) => !scopeNames.has(scope))) {
      throw new Error("Select supported permissions.");
    }
    const crypto = this.options.crypto ?? webCryptoProvider();
    const verifier = hex(crypto.randomBytes(32));
    const challenge = base64url(await crypto.sha256(new TextEncoder().encode(verifier)));
    const result = await this.post<{
      user_code: string; device_code: string; expires_at: string; interval: number;
      verification_uri: string; verification_app_uri: string;
    }>("linked-app-pair", {
      client_id: this.options.clientId, scopes,
      code_challenge: challenge, code_challenge_method: "S256",
    }, undefined, signal);
    const interval = Math.max(5, result.interval);
    return {
      userCode: result.user_code,
      verificationUrl: result.verification_uri,
      verificationAppUrl: result.verification_app_uri,
      pending: {
        clientId: this.options.clientId, deviceCode: result.device_code, verifier,
        expiresAt: result.expires_at, interval, nextPollAt: Date.now() + interval * 1000,
      } satisfies PendingPairing,
    };
  }
  /** Returns pending until approval. Concurrent calls share one token exchange. */
  async pollPairing(pending: PendingPairing, signal?: AbortSignal): Promise<PairingResult> {
    if (pending.clientId !== this.options.clientId ||
        !Number.isFinite(Date.parse(pending.expiresAt)) ||
        Date.parse(pending.expiresAt) <= Date.now()) {
      throw new RobonoLinkedAppError("expired_token", 400);
    }
    if (signal?.aborted) throw new RobonoLinkedAppError("cancelled", 400);
    const existing = this.pairingPolls.get(pending.deviceCode);
    if (existing) return existing;
    if (Date.now() < pending.nextPollAt) return { status: "pending" };
    const operation = (async (): Promise<PairingResult> => {
      pending.nextPollAt = Date.now() + Math.max(5, pending.interval) * 1000;
      try {
        const wire = await this.post<WireToken>("linked-app-token", {
          client_id: this.options.clientId,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: pending.deviceCode, code_verifier: pending.verifier,
        }, undefined, signal);
        const tokens = await this.save(wire);
        return { status: "connected", tokens };
      } catch (error) {
        if (error instanceof RobonoLinkedAppError &&
            ["authorization_pending", "slow_down"].includes(error.code)) {
          if (error.code === "slow_down") pending.interval = Math.min(60, pending.interval + 5);
          return { status: "pending" };
        }
        throw error;
      } finally {
        pending.nextPollAt = Date.now() + Math.max(5, pending.interval) * 1000;
      }
    })();
    this.pairingPolls.set(pending.deviceCode, operation);
    try { return await operation; }
    finally { this.pairingPolls.delete(pending.deviceCode); }
  }
  /** Cancel when leaving the pairing screen. Never polls in the background implicitly. */
  async waitForPairing(pending: PendingPairing, signal: AbortSignal): Promise<Tokens> {
    while (!signal.aborted) {
      if (Date.parse(pending.expiresAt) <= Date.now()) {
        throw new RobonoLinkedAppError("expired_token", 400);
      }
      await waitForPoll(Math.max(0, Math.min(pending.nextPollAt, Date.parse(pending.expiresAt)) - Date.now()), signal);
      if (signal.aborted) break;
      const result = await this.pollPairing(pending, signal);
      if (result.status === "connected") return result.tokens;
    }
    throw new RobonoLinkedAppError("cancelled", 400);
  }
  async beginLink(redirectUri: string, scopes: Scope[]) {
    if (!scopes.length || scopes.some((scope) => !scopeNames.has(scope))) {
      throw new Error("Select supported permissions.");
    }
    const crypto = this.options.crypto ?? webCryptoProvider();
    const verifier = hex(crypto.randomBytes(32)),
      state = hex(crypto.randomBytes(32));
    const challenge = base64url(
      await crypto.sha256(new TextEncoder().encode(verifier)),
    );
    const result = await this.post<
      { authorization_url: string; request_id: string; expires_at: string }
    >("linked-app-authorize", {
      client_id: this.options.clientId,
      redirect_uri: redirectUri,
      scopes,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return {
      authorizationUrl: result.authorization_url,
      requestId: result.request_id,
      pending: {
        clientId: this.options.clientId,
        redirectUri,
        verifier,
        state,
        expiresAt: result.expires_at,
      } satisfies PendingLink,
    };
  }
  async completeLink(callback: string, pending: PendingLink) {
    const url = new URL(callback), expected = new URL(pending.redirectUri);
    if (
      pending.clientId !== this.options.clientId ||
      Date.parse(pending.expiresAt) <= Date.now() ||
      url.protocol !== expected.protocol || url.host !== expected.host ||
      url.pathname !== expected.pathname ||
      url.username || url.password || url.hash ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.get("state") !== pending.state ||
      [...expected.searchParams].some(([k, v]) => url.searchParams.get(k) !== v)
    ) {
      throw new RobonoLinkedAppError("invalid_callback", 400);
    }
    if (url.searchParams.has("error")) {
      throw new RobonoLinkedAppError("access_denied", 400);
    }
    const code = url.searchParams.get("code");
    if (
      url.searchParams.getAll("code").length !== 1 || !code ||
      !/^rlc_[a-f0-9]{64}$/.test(code)
    ) {
      throw new RobonoLinkedAppError("invalid_callback", 400);
    }
    return this.save(
      await this.post<WireToken>("linked-app-token", {
        client_id: this.options.clientId,
        grant_type: "authorization_code",
        redirect_uri: pending.redirectUri,
        code,
        code_verifier: pending.verifier,
      }),
    );
  }
  private async save(wire: WireToken) {
    const tokens: Tokens = {
      accessToken: wire.access_token,
      refreshToken: wire.refresh_token,
      expiresAt: Date.now() + wire.expires_in * 1000,
      refreshExpiresAt: wire.refresh_expires_at,
      grantId: wire.grant_id,
      scopes: wire.scope.split(" ") as Scope[],
    };
    await this.options.tokenStore.set(tokens);
    return tokens;
  }
  async refresh(): Promise<Tokens> {
    if (this.refreshPending) return this.refreshPending;
    this.refreshPending = (async () => {
      const tokens = await this.options.tokenStore.get();
      if (!tokens) throw new RobonoLinkedAppError("not_connected", 401);
      try {
        return await this.save(
          await this.post<WireToken>("linked-app-token", {
            client_id: this.options.clientId,
            grant_type: "refresh_token",
            refresh_token: tokens.refreshToken,
          }),
        );
      } catch (error) {
        if (
          error instanceof RobonoLinkedAppError &&
          error.code === "invalid_grant"
        ) await this.options.tokenStore.set(null);
        throw error;
      }
    })();
    try {
      return await this.refreshPending;
    } finally {
      this.refreshPending = null;
    }
  }
  private async call<T>(
    operation: string,
    input: unknown = {},
    signal?: AbortSignal,
  ): Promise<T> {
    let tokens = await this.options.tokenStore.get();
    if (!tokens) throw new RobonoLinkedAppError("not_connected", 401);
    if (tokens.expiresAt <= Date.now() + 30_000) tokens = await this.refresh();
    // No blind retries: a timeout may occur after a successful send. The host
    // retains the original clientMessageId and explicitly retries that message.
    return this.post<T>(
      "linked-app-api",
      { version: 1, operation, input },
      tokens.accessToken,
      signal,
    );
  }
  account() {
    return this.call<
      {
        account: { id: string; display_name: string | null; phone: string };
        grant_id: string;
        scopes: Scope[];
      }
    >("account.get");
  }
  conversations() {
    return this.call<ConversationPage>("conversations.list");
  }
  messages(
    conversationId: string,
    page: { before?: string; beforeId?: string; limit?: number } = {},
  ) {
    return this.call<MessagePage>("messages.list", { conversationId, ...page });
  }
  message(conversationId: string, messageId: string) {
    return this.call<{ message: Message; messages: Message[] }>(
      "messages.get",
      { conversationId, messageId },
    );
  }
  send(input: SendMessage) {
    if (
      !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(
        input.clientMessageId,
      )
    ) throw new Error("A stable clientMessageId UUID is required.");
    return this.call<{ message: Message }>("messages.send", {
      ...input,
      inputSource: "external",
    });
  }
  createUpload(input: MediaUpload) {
    return this.call<UploadTicket>("media.upload", input);
  }
  /** Upload exactly the bytes described in the ticket. No Robono bearer is sent to storage. */
  async uploadBytes(
    ticket: UploadTicket,
    bytes: Uint8Array,
    mimeType: string,
    signal?: AbortSignal,
  ) {
    const url = new URL(ticket.signedUrl);
    if (
      url.protocol !== "https:" ||
      url.origin !== new URL(this.baseUrl).origin ||
      !url.pathname.startsWith("/storage/v1/object/upload/sign/")
    ) throw new Error("Invalid upload destination");
    if (
      ticket.media.size_bytes !== undefined &&
      bytes.byteLength !== ticket.media.size_bytes
    ) throw new Error("Upload size does not match ticket");
    if (ticket.media.mime_type && mimeType !== ticket.media.mime_type) {
      throw new Error("Upload type does not match ticket");
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const timer = setTimeout(cancel, 120_000);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      const response = await this.fetcher(url.toString(), {
        method: "PUT",
        redirect: "error",
        signal: controller.signal,
        headers: { "content-type": mimeType, "x-upsert": "false" },
        body: new Uint8Array(bytes),
      });
      await response.body?.cancel();
      if (!response.ok) {
        throw new RobonoLinkedAppError("upload_failed", response.status);
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
  download(messageId: string) {
    return this.call<{ signedUrl: string; expiresIn: number }>(
      "media.download",
      { messageId },
    );
  }
  receipt(messageId: string, state: "delivered" | "read" | "heard") {
    return this.call<{ receipts: Receipt[] }>("receipts.update", {
      messageId,
      heard: state === "heard",
      deliveredOnly: state === "delivered",
    });
  }
  events(cursor: string | null, signal?: AbortSignal) {
    return this.call<EventPage>("events.poll", { cursor }, signal);
  }
  /** Open a live connection, replay missed events, and reconnect automatically.
   * On phones, stop on suspension/logout; a backend may keep watching for push.
   * Checkpoints and acknowledgements happen only after successful callbacks.
   */
  async watch(options: WatchOptions): Promise<void> {
    const initial = await this.options.tokenStore.get();
    if (!initial) throw new RobonoLinkedAppError("not_connected", 401);
    const grantId = initial.grantId;
    const factory = this.options.webSocket ?? ((url: string) => new WebSocket(url));
    if (!this.options.webSocket && typeof globalThis.WebSocket !== "function") {
      throw new Error("Provide a WebSocket implementation for this runtime.");
    }
    const streamUrl = this.baseUrl.replace(/^http/, "ws") + "/linked-app-stream";
    const current = async () => {
      const tokens = await this.options.tokenStore.get();
      if (!tokens || tokens.grantId !== grantId) throw new RobonoLinkedAppError("not_connected", 401);
      return tokens;
    };
    let failures = 0;
    while (!options.signal.aborted) {
      let sessionToken = "";
      try {
        let tokens = await current();
        if (tokens.expiresAt <= Date.now() + 30_000) tokens = await this.refresh();
        if (tokens.grantId !== grantId) throw new RobonoLinkedAppError("not_connected", 401);
        sessionToken = tokens.accessToken;
        let cursor = await options.cursorStore.get(grantId);
        await consumeStream({ url: streamUrl, factory, tokens, cursor, signal: options.signal,
          onPage: async (page) => {
            await current();
            if (options.signal.aborted) return;
            if (cursor === null || page.resync_required) await options.onResync();
            else if (page.events.length) await options.onEvents(page.events);
            await current();
            if (options.signal.aborted) return;
            await options.cursorStore.set(grantId, page.cursor);
            cursor = page.cursor;
            failures = 0;
          },
        });
        if (options.signal.aborted) return;
      } catch (error) {
        if (options.signal.aborted) return;
        if (error instanceof RobonoLinkedAppError && error.code === "invalid_token") {
          const tokens = await current();
          // Another request may have rotated the token used by this socket.
          if (tokens.accessToken !== sessionToken || tokens.expiresAt <= Date.now() + 30_000) continue;
        }
        if (error instanceof RobonoLinkedAppError && [400, 401, 403].includes(error.status)) throw error;
        options.onError?.(error);
        failures++;
      }
      await waitForPoll(failures ? Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)) : 250 + Math.floor(Math.random() * 500), options.signal);
    }
  }
  async disconnect() {
    await this.call("connection.revoke");
    await this.options.tokenStore.set(null);
  }
}
