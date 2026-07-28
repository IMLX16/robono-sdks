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
  /** Bounded automatic retries for retryable failures. Defaults to 2. */
  retries?: number;
  headers?: Record<string, string>;
}

export class RobonoClientError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly fields: unknown[];
  readonly details: unknown;
  override readonly cause: unknown;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      requestId?: string;
      retryable?: boolean;
      retryAfterMs?: number;
      fields?: unknown[];
      details?: unknown;
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
    this.fields = options.fields ?? [];
    this.details = options.details;
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
  const defaultRetries = nonnegativeInteger(options.retries, 2);

  async function request<T>(
    path: string,
    body: unknown,
    requestTimeoutMs = timeoutMs,
    requestOptions?: ClientRequestOptions,
    readOnly = false,
  ): Promise<T> {
    const retries = nonnegativeInteger(requestOptions?.retries, defaultRetries);
    const suppliedIdempotencyKey = requestOptions?.idempotencyKey?.trim();
    if (
      requestOptions?.idempotencyKey !== undefined &&
      (!suppliedIdempotencyKey || suppliedIdempotencyKey.length < 8 ||
        suppliedIdempotencyKey.length > 200)
    ) {
      throw new RobonoClientError(
        "idempotencyKey must contain 8 to 200 characters.",
        { code: "idempotency_key_invalid" },
      );
    }
    // A generated key makes retries inside this call safe for write routes.
    // Callers should still provide and persist their own key across later
    // manual retries, jobs, restarts, or devices.
    const idempotencyKey = suppliedIdempotencyKey ??
      (readOnly ? undefined : createIdempotencyKey());
    let lastError: RobonoClientError | null = null;
    let nextDelayMs: number | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (requestOptions?.signal?.aborted) {
        throw cancelledError(requestOptions.signal.reason);
      }
      if (attempt > 0) {
        await wait(
          nextDelayMs ?? retryDelay(attempt),
          requestOptions?.signal,
        );
        nextDelayMs = null;
      }

      const controller = new AbortController();
      let timedOut = false;
      const onAbort = () =>
        controller.abort(
          requestOptions?.signal?.reason ??
            new DOMException("The request was cancelled.", "AbortError"),
        );
      requestOptions?.signal?.addEventListener("abort", onAbort, {
        once: true,
      });
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
          throw new RobonoClientError(
            "The child app access token is missing.",
            { code: "access_token_required" },
          );
        }
        const response = await fetcher(`${baseUrl}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${token.trim()}`,
            ...(idempotencyKey
              ? { "idempotency-key": idempotencyKey }
              : {}),
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
            (response.status === 408 || response.status === 425 ||
              response.status === 429 || response.status >= 500);
          const error = new RobonoClientError(
            string(nested?.message) || string(payload.message) ||
              "Robono request failed.",
            {
              code: string(nested?.code) || string(payload.code) ||
                "request_failed",
              status: response.status,
              ...(requestId ? { requestId } : {}),
              retryable,
              ...(retryAfterMs !== null ? { retryAfterMs } : {}),
              fields: array(payload.fields) ?? array(nested?.fields) ?? [],
              details: payload.details ?? nested?.details,
            },
          );
          if (error.retryable && attempt < retries) {
            lastError = error;
            nextDelayMs = error.retryAfterMs;
            continue;
          }
          throw error;
        }
        return payload as T;
      } catch (cause) {
        const cancelled = requestOptions?.signal?.aborted === true;
        const error = cause instanceof RobonoClientError
          ? cause
          : cancelled
          ? cancelledError(requestOptions?.signal?.reason)
          : new RobonoClientError(
            timedOut
              ? "Robono request timed out."
              : "Robono request could not be completed.",
            {
              code: timedOut ? "request_timeout" : "network_error",
              retryable: true,
              cause,
            },
          );
        if (error.retryable && attempt < retries) {
          lastError = error;
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        requestOptions?.signal?.removeEventListener("abort", onAbort);
      }
    }
    throw lastError ??
      new RobonoClientError("Robono request failed.", {
        code: "request_failed",
      });
  }

  return {
    listNetworks: () =>
      request("/robono/networks", {}, timeoutMs, undefined, true),
    listLanguages: () =>
      request("/robono/languages", {}, timeoutMs, undefined, true),
    requestNetworkConnection: (input, requestOptions) =>
      request("/robono/network-connections", input, timeoutMs, requestOptions),
    respondNetworkConnection: (input, requestOptions) =>
      request("/robono/network-connections/respond", input, timeoutMs, requestOptions),
    listNetworkConnections: (input) =>
      request(
        "/robono/network-connections/list",
        input,
        timeoutMs,
        undefined,
        true,
      ),
    disconnectNetworkConnection: (input, requestOptions) =>
      request("/robono/network-connections/disconnect", input, timeoutMs, requestOptions),
    updateNetworkConnection: (input, requestOptions) =>
      request("/robono/network-connections/update", input, timeoutMs, requestOptions),
    createRobonoConnection: (input, requestOptions) =>
      request("/robono/connections", input, timeoutMs, requestOptions),
    listRobonoConnections: (input) =>
      request("/robono/connections/list", input, timeoutMs, undefined, true),
    updateRobonoConnection: (input, requestOptions) =>
      request("/robono/connections/profile", input, timeoutMs, requestOptions),
    disconnectRobonoConnection: (input, requestOptions) =>
      request("/robono/connections/disconnect", input, timeoutMs, requestOptions),
    sendNetworkMessage: (input, requestOptions) =>
      request("/robono/network-messages", input, timeoutMs, requestOptions),
    listNetworkMessages: (input) =>
      request(
        "/robono/network-messages/list",
        input,
        timeoutMs,
        undefined,
        true,
      ),
    markNetworkMessage: (input, requestOptions) =>
      request("/robono/network-messages/events", input, timeoutMs, requestOptions),
    sendRobonoMessage: (input, requestOptions) =>
      request("/robono/messages", input, timeoutMs, requestOptions),
    listRobonoMessages: (input) =>
      request("/robono/messages/list", input, timeoutMs, undefined, true),
    markRobonoMessage: (input, requestOptions) =>
      request("/robono/message-events", input, timeoutMs, requestOptions),
    sendGuardianMessage: (input, requestOptions) =>
      request("/robono/guardian-messages", input, timeoutMs, requestOptions),
    listGuardianMessages: (input) =>
      request(
        "/robono/guardian-messages/list",
        input,
        timeoutMs,
        undefined,
        true,
      ),
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

function nonnegativeInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
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

function array(value: unknown) {
  return Array.isArray(value) ? value : null;
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

function createIdempotencyKey() {
  const random = Math.random().toString(36).slice(2);
  return `client_${Date.now().toString(36)}_${random}`;
}

function retryDelay(attempt: number) {
  return Math.min(2_000, 150 * 2 ** Math.max(0, attempt - 1)) +
    Math.floor(Math.random() * 100);
}

function cancelledError(cause: unknown) {
  return new RobonoClientError("The Robono request was cancelled.", {
    code: "request_cancelled",
    retryable: false,
    cause,
  });
}

async function wait(milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted) throw cancelledError(signal.reason);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, Math.max(0, milliseconds));
    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(cancelledError(signal?.reason));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
