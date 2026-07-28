export interface RobonoErrorDetails {
  status?: number;
  code?: string;
  requestId?: string;
  fields?: unknown[];
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
  cause?: unknown;
}

export class RobonoError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly requestId: string | null;
  readonly fields: unknown[];
  readonly details: unknown;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  override readonly cause: unknown;

  constructor(message: string, input: RobonoErrorDetails = {}) {
    super(message);
    this.name = "RobonoError";
    this.status = input.status ?? null;
    this.code = input.code ?? "robono_error";
    this.requestId = input.requestId ?? null;
    this.fields = input.fields ?? [];
    this.details = input.details;
    this.retryable = input.retryable ?? false;
    this.retryAfterMs = input.retryAfterMs ?? null;
    this.cause = input.cause;
  }
}

export class RobonoWebhookError extends RobonoError {
  constructor(
    message: string,
    code = "invalid_webhook",
    details: RobonoErrorDetails = {},
  ) {
    super(message, { ...details, code });
    this.name = "RobonoWebhookError";
  }
}

/**
 * Throw this from a backend adapter's authenticate callback when a request
 * has no valid child-app session. The adapter converts it to a safe 401.
 * Unexpected authentication-system failures remain sanitized 500 responses.
 */
export class RobonoAuthenticationError extends Error {
  override readonly cause: unknown;

  constructor(
    message = "The child app user is not authenticated.",
    options: { cause?: unknown } = {},
  ) {
    super(message);
    this.name = "RobonoAuthenticationError";
    this.cause = options.cause;
  }
}
