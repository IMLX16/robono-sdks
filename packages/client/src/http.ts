import type {
  ClientRequestOptions,
  RobonoClientTransport,
  TransformRequestOptions,
} from "./types.js";

export interface RobonoHttpTransportOptions {
  baseUrl: string;
  /**
   * Return the child app session token. Token providers that perform I/O
   * should honor the signal; the transport also stops waiting when it aborts.
   */
  getAccessToken: (signal?: AbortSignal) => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class RobonoClientError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  override readonly cause: unknown;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      requestId?: string;
      retryable?: boolean;
      retryAfterMs?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "RobonoClientError";
    this.code = options.code ?? "client_error";
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.cause = options.cause;
  }
}

export function createRobonoHttpTransport(
  options: RobonoHttpTransportOptions,
): RobonoClientTransport {
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) {
    throw new RobonoClientError("This environment does not provide fetch.", {
      code: "fetch_required",
    });
  }
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = positiveInteger(options.timeoutMs, 15_000);

  async function request<T>(
    path: string,
    body: unknown,
    requestTimeoutMs = timeoutMs,
    requestOptions?: ClientRequestOptions,
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () =>
      controller.abort(
        requestOptions?.signal?.reason ??
          new DOMException("The request was cancelled.", "AbortError"),
      );
    requestOptions?.signal?.addEventListener("abort", onAbort, { once: true });
    if (requestOptions?.signal?.aborted) onAbort();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(
        new DOMException("The request timed out.", "TimeoutError"),
      );
    }, requestTimeoutMs);
    try {
      const token = await abortable(
        Promise.resolve(options.getAccessToken(controller.signal)),
        controller.signal,
      );
      if (!token?.trim()) {
        throw new RobonoClientError("The child app access token is missing.", {
          code: "access_token_required",
        });
      }
      const idempotencyKey = requestOptions?.idempotencyKey?.trim();
      if (
        requestOptions?.idempotencyKey !== undefined &&
        (!idempotencyKey || idempotencyKey.length < 8 ||
          idempotencyKey.length > 200)
      ) {
        throw new RobonoClientError(
          "idempotencyKey must contain 8 to 200 characters.",
          { code: "idempotency_key_invalid" },
        );
      }
      const response = await fetcher(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${token.trim()}`,
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
          ...(requestOptions?.requestId?.trim()
            ? { "x-request-id": requestOptions.requestId.trim() }
            : {}),
          ...options.headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as Record<
        string,
        unknown
      >;
      if (!response.ok) {
        const nested = record(payload.error);
        const requestId = string(payload.request_id);
        const retryAfterMs = parseRetryAfter(
          response.headers.get("retry-after"),
        );
        const retryable = bool(nested?.retryable) ??
          bool(payload.retryable) ??
          (response.status === 429 || response.status >= 500);
        throw new RobonoClientError(
          string(nested?.message) || string(payload.message) ||
            "Robono request failed.",
          {
            code: string(nested?.code) || string(payload.code) ||
              "request_failed",
            status: response.status,
            ...(requestId ? { requestId } : {}),
            retryable,
            ...(retryAfterMs !== null ? { retryAfterMs } : {}),
          },
        );
      }
      return payload as T;
    } catch (cause) {
      if (cause instanceof RobonoClientError) throw cause;
      const cancelled = requestOptions?.signal?.aborted === true;
      throw new RobonoClientError(
        cancelled
          ? "The Robono request was cancelled."
          : timedOut
          ? "Robono request timed out."
          : "Robono request could not be completed.",
        {
          code: cancelled
            ? "request_cancelled"
            : timedOut
            ? "request_timeout"
            : "network_error",
          retryable: !cancelled,
          cause,
        },
      );
    } finally {
      clearTimeout(timeout);
      requestOptions?.signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    listNetworks: () => request("/robono/networks", {}),
    requestNetworkConnection: (input, requestOptions) =>
      request("/robono/network-connections", input, timeoutMs, requestOptions),
    respondNetworkConnection: (input, requestOptions) =>
      request("/robono/network-connections/respond", input, timeoutMs, requestOptions),
    listNetworkConnections: (input) => request("/robono/network-connections/list", input),
    disconnectNetworkConnection: (input, requestOptions) =>
      request("/robono/network-connections/disconnect", input, timeoutMs, requestOptions),
    updateNetworkConnection: (input, requestOptions) =>
      request("/robono/network-connections/update", input, timeoutMs, requestOptions),
    createRobonoConnection: (input, requestOptions) =>
      request("/robono/connections", input, timeoutMs, requestOptions),
    listRobonoConnections: (input) => request("/robono/connections/list", input),
    updateRobonoConnection: (input, requestOptions) =>
      request("/robono/connections/profile", input, timeoutMs, requestOptions),
    disconnectRobonoConnection: (input, requestOptions) =>
      request("/robono/connections/disconnect", input, timeoutMs, requestOptions),
    sendNetworkMessage: (input, requestOptions) =>
      request("/robono/network-messages", input, timeoutMs, requestOptions),
    listNetworkMessages: (input) => request("/robono/network-messages/list", input),
    markNetworkMessage: (input, requestOptions) =>
      request("/robono/network-messages/events", input, timeoutMs, requestOptions),
    sendRobonoMessage: (input, requestOptions) =>
      request("/robono/messages", input, timeoutMs, requestOptions),
    listRobonoMessages: (input) => request("/robono/messages/list", input),
    markRobonoMessage: (input, requestOptions) =>
      request("/robono/message-events", input, timeoutMs, requestOptions),
    sendGuardianMessage: (input, requestOptions) =>
      request("/robono/guardian-messages", input, timeoutMs, requestOptions),
    listGuardianMessages: (input) =>
      request("/robono/guardian-messages/list", input),
    markGuardianMessage: (input, requestOptions) =>
      request("/robono/guardian-messages/events", input, timeoutMs, requestOptions),
    transformMessage: (input, requestOptions) =>
      request("/robono/transforms/message", input, 120_000, requestOptions),
    transformSpeech: (input, requestOptions) =>
      request("/robono/transforms/speech", input, 120_000, requestOptions),
    reportPushDiagnostic: (input, requestOptions) =>
      request("/robono/push-diagnostics/events", input, timeoutMs, requestOptions),
  };
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function parseRetryAfter(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) throw signal.reason;
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() =>
      signal.removeEventListener("abort", abort)
    );
  });
}
