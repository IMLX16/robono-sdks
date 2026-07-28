import { RobonoAuthenticationError, RobonoError } from "./errors.js";
import type { RobonoServer } from "./client.js";
import type { JsonObject } from "./types.js";

export type RobonoAuthorizationAction =
  | "networks.list"
  | "languages.list"
  | "network_connections.request"
  | "network_connections.respond"
  | "network_connections.list"
  | "network_connections.disconnect"
  | "network_connections.update"
  | "robono_connections.create"
  | "robono_connections.list"
  | "robono_connections.update_profile"
  | "robono_connections.disconnect"
  | "network_messages.send"
  | "network_messages.list"
  | "network_messages.mark"
  | "robono_messages.send"
  | "robono_messages.list"
  | "robono_messages.mark"
  | "guardian_messages.send"
  | "guardian_messages.list"
  | "guardian_messages.mark"
  | "message_transforms.create"
  | "speech_transforms.create"
  | "push_diagnostics.report";

export interface RobonoAuthorizationContext {
  action: RobonoAuthorizationAction;
  userId: string;
  input: JsonObject;
  request: Request;
}

export interface RobonoBackendAdapterOptions {
  robono: RobonoServer;
  authenticate: (
    request: Request,
  ) => string | null | undefined | Promise<string | null | undefined>;
  authorize: (
    context: RobonoAuthorizationContext,
  ) => boolean | Promise<boolean>;
  maxRequestBytes?: number;
}

const authorizationActions: Record<string, RobonoAuthorizationAction> = {
  "/networks": "networks.list",
  "/languages": "languages.list",
  "/network-connections": "network_connections.request",
  "/network-connections/respond": "network_connections.respond",
  "/network-connections/list": "network_connections.list",
  "/network-connections/disconnect": "network_connections.disconnect",
  "/network-connections/update": "network_connections.update",
  "/connections": "robono_connections.create",
  "/connections/list": "robono_connections.list",
  "/connections/profile": "robono_connections.update_profile",
  "/connections/disconnect": "robono_connections.disconnect",
  "/network-messages": "network_messages.send",
  "/network-messages/list": "network_messages.list",
  "/network-messages/events": "network_messages.mark",
  "/messages": "robono_messages.send",
  "/messages/list": "robono_messages.list",
  "/message-events": "robono_messages.mark",
  "/guardian-messages": "guardian_messages.send",
  "/guardian-messages/list": "guardian_messages.list",
  "/guardian-messages/events": "guardian_messages.mark",
  "/transforms/message": "message_transforms.create",
  "/transforms/speech": "speech_transforms.create",
  "/push-diagnostics/events": "push_diagnostics.report",
};

export function createRobonoBackendAdapter(
  options: RobonoBackendAdapterOptions,
) {
  const maxRequestBytes = positiveInteger(options.maxRequestBytes, 1_000_000);

  return async function handle(request: Request): Promise<Response> {
    const requestId = request.headers.get("x-request-id") ??
      `child_req_${crypto.randomUUID()}`;
    try {
      if (request.method !== "POST") {
        return responseError(
          405,
          "method_not_allowed",
          "Only POST is supported.",
          requestId,
        );
      }
      const externalUserId = (await options.authenticate(request))?.trim();
      if (!externalUserId) {
        return responseError(
          401,
          "user_authentication_required",
          "The child app user is not authenticated.",
          requestId,
        );
      }
      const body = await readBody(request, maxRequestBytes);
      const path = normalizedAdapterPath(new URL(request.url).pathname);
      const action = authorizationActions[path];
      if (!action) {
        return responseError(
          404,
          "adapter_route_not_found",
          "Robono adapter route was not found.",
          requestId,
        );
      }
      const authorizationInput = inputWithAuthenticatedUser(
        action,
        body,
        externalUserId,
      );
      const authorized = await options.authorize?.({
        action,
        userId: externalUserId,
        input: authorizationInput,
        request,
      }) ?? false;
      if (!authorized) {
        return responseError(
          403,
          "operation_not_authorized",
          "The child app did not authorize this operation for the signed-in user.",
          requestId,
        );
      }
      const idempotencyKey = optionalIdempotencyKey(
        request.headers.get("idempotency-key"),
      );
      const requestOptions = {
        requestId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      };

      if (path === "/networks") {
        return responseJson(
          await options.robono.directory.list({}, requestOptions),
        );
      }
      if (path === "/languages") {
        return responseJson(
          await options.robono.languages(requestOptions),
        );
      }
      if (path === "/network-connections") {
        return responseJson(
          await options.robono.networkConnections.request({
            ...body,
            source_external_user_id: externalUserId,
            source_display_name: requiredString(
              body.source_display_name,
              "source_display_name",
            ),
            target_identifier: requiredString(
              body.target_identifier,
              "target_identifier",
            ),
          }, requestOptions),
        );
      }
      if (path === "/network-connections/respond") {
        return responseJson(
          await options.robono.networkConnections.respond({
            ...body,
            bridge_connection_id: requiredString(
              body.bridge_connection_id,
              "bridge_connection_id",
            ),
            status: requiredConnectionResponseStatus(body.status),
            target_external_user_id: externalUserId,
          }, requestOptions),
        );
      }
      if (path === "/network-connections/list") {
        const status = optionalString(body.status);
        const limit = optionalNumber(body.limit);
        const before = optionalString(body.before);
        const bridgeConnectionId = optionalString(body.bridge_connection_id);
        return responseJson(
          await options.robono.networkConnections.list({
            external_user_id: externalUserId,
            ...(status ? { status } : {}),
            ...(limit ? { limit } : {}),
            ...(before ? { before } : {}),
            ...(bridgeConnectionId
              ? { bridge_connection_id: bridgeConnectionId }
              : {}),
          }, requestOptions),
        );
      }
      if (path === "/network-connections/disconnect") {
        const reason = optionalString(body.reason);
        return responseJson(
          await options.robono.networkConnections.disconnect({
            bridge_connection_id: requiredString(
              body.bridge_connection_id,
              "bridge_connection_id",
            ),
            external_user_id: externalUserId,
            ...(reason ? { reason } : {}),
          }, requestOptions),
        );
      }
      if (path === "/network-connections/update") {
        return responseJson(
          await options.robono.networkConnections.update({
            ...body,
            bridge_connection_id: requiredString(
              body.bridge_connection_id,
              "bridge_connection_id",
            ),
            external_user_id: externalUserId,
          }, requestOptions),
        );
      }
      if (path === "/connections") {
        return responseJson(
          await options.robono.connections.create({
            ...body,
            target_phone_e164: requiredString(
              body.target_phone_e164,
              "target_phone_e164",
            ),
            external_user_id: externalUserId,
            external_display_name: requiredString(
              body.external_display_name,
              "external_display_name",
            ),
          }, requestOptions),
        );
      }
      if (path === "/connections/list") {
        const status = optionalString(body.status);
        const limit = optionalNumber(body.limit);
        const before = optionalString(body.before);
        const connectionId = optionalString(body.connection_id);
        return responseJson(
          await options.robono.connections.list({
            external_user_id: externalUserId,
            ...(status ? { status } : {}),
            ...(limit ? { limit } : {}),
            ...(before ? { before } : {}),
            ...(connectionId ? { connection_id: connectionId } : {}),
          }, requestOptions),
        );
      }
      if (path === "/connections/profile") {
        return responseJson(
          await options.robono.connections.updateProfile({
            ...body,
            connection_id: requiredString(body.connection_id, "connection_id"),
            external_user_id: externalUserId,
          }, requestOptions),
        );
      }
      if (path === "/connections/disconnect") {
        const reason = optionalString(body.reason);
        return responseJson(
          await options.robono.connections.disconnect({
            connection_id: requiredString(body.connection_id, "connection_id"),
            external_user_id: externalUserId,
            ...(reason ? { reason } : {}),
          }, requestOptions),
        );
      }
      if (path === "/network-messages") {
        return responseJson(
          await options.robono.messages.send(
            {
              ...body,
              bridge_connection_id: requiredString(
                body.bridge_connection_id,
                "bridge_connection_id",
              ),
              external_user_id: externalUserId,
              external_message_id: requiredString(
                body.external_message_id,
                "external_message_id",
              ),
            } as Parameters<RobonoServer["messages"]["send"]>[0],
            requestOptions,
          ),
        );
      }
      if (path === "/messages/list") {
        const limit = optionalNumber(body.limit);
        const before = optionalString(body.before);
        const after = optionalString(body.after);
        return responseJson(
          await options.robono.messages.listFromRobono({
            connection_id: requiredString(
              body.connection_id,
              "connection_id",
            ),
            external_user_id: externalUserId,
            ...(limit ? { limit } : {}),
            ...(before ? { before } : {}),
            ...(after ? { after } : {}),
          }, requestOptions),
        );
      }
      if (path === "/network-messages/list") {
        const limit = optionalNumber(body.limit);
        const before = optionalString(body.before);
        const after = optionalString(body.after);
        return responseJson(
          await options.robono.messages.list({
            bridge_connection_id: requiredString(
              body.bridge_connection_id,
              "bridge_connection_id",
            ),
            external_user_id: externalUserId,
            ...(limit ? { limit } : {}),
            ...(before ? { before } : {}),
            ...(after ? { after } : {}),
          }, requestOptions),
        );
      }
      if (path === "/network-messages/events") {
        const bridgeConnectionId = requiredString(
          body.bridge_connection_id,
          "bridge_connection_id",
        );
        const occurredAt = optionalString(body.occurred_at);
        await assertConnectionBelongsToUser(
          options.robono,
          bridgeConnectionId,
          externalUserId,
          requestId,
        );
        return responseJson(
          await options.robono.messages.mark({
            bridge_connection_id: bridgeConnectionId,
            bridge_message_id: requiredString(
              body.bridge_message_id,
              "bridge_message_id",
            ),
            event: requiredEvent(body.event),
            ...(occurredAt ? { occurred_at: occurredAt } : {}),
          }, requestOptions),
        );
      }
      if (path === "/messages") {
        return responseJson(
          await options.robono.messages.sendToRobono({
            ...body,
            connection_id: requiredString(body.connection_id, "connection_id"),
            external_user_id: externalUserId,
            external_message_id: requiredString(
              body.external_message_id,
              "external_message_id",
            ),
          } as Parameters<RobonoServer["messages"]["sendToRobono"]>[0], requestOptions),
        );
      }
      if (path === "/message-events") {
        const occurredAt = optionalString(body.occurred_at);
        return responseJson(
          await options.robono.messages.markFromRobono({
            connection_id: requiredString(
              body.connection_id,
              "connection_id",
            ),
            robono_message_id: requiredString(
              body.robono_message_id,
              "robono_message_id",
            ),
            external_user_id: externalUserId,
            event: requiredEvent(body.event),
            ...(occurredAt ? { occurred_at: occurredAt } : {}),
          }, requestOptions),
        );
      }
      if (path === "/guardian-messages") {
        return responseJson(
          await options.robono.messages.sendGuardian({
            bridge_connection_id: requiredString(
              body.bridge_connection_id,
              "bridge_connection_id",
            ),
            external_guardian_id: externalUserId,
            external_message_id: requiredString(
              body.external_message_id,
              "external_message_id",
            ),
            text_body: requiredString(body.text_body, "text_body"),
            message_kind: "text",
          }, requestOptions),
        );
      }
      if (path === "/guardian-messages/list") {
        const limit = optionalNumber(body.limit);
        const before = optionalString(body.before);
        return responseJson(
          await options.robono.messages.listGuardian({
            bridge_connection_id: requiredString(
              body.bridge_connection_id,
              "bridge_connection_id",
            ),
            ...(limit ? { limit } : {}),
            ...(before ? { before } : {}),
          }, requestOptions),
        );
      }
      if (path === "/guardian-messages/events") {
        const occurredAt = optionalString(body.occurred_at);
        return responseJson(
          await options.robono.messages.markGuardian({
            bridge_connection_id: requiredString(
              body.bridge_connection_id,
              "bridge_connection_id",
            ),
            guardian_message_id: requiredString(
              body.guardian_message_id,
              "guardian_message_id",
            ),
            event: requiredGuardianEvent(body.event),
            ...(occurredAt ? { occurred_at: occurredAt } : {}),
          }, requestOptions),
        );
      }
      if (path === "/transforms/speech") {
        return responseJson(
          await options.robono.transforms.speech(
            body as Parameters<RobonoServer["transforms"]["speech"]>[0],
            requestOptions,
          ),
        );
      }
      if (path === "/transforms/message") {
        return responseJson(
          await options.robono.transforms.message(
            body as unknown as Parameters<
              RobonoServer["transforms"]["message"]
            >[0],
            requestOptions,
          ),
        );
      }
      if (path === "/push-diagnostics/events") {
        const failureStage = optionalString(body.failure_stage);
        const failureReason = optionalString(body.failure_reason);
        const platform = optionalString(body.platform);
        const provider = optionalString(body.provider);
        const appVersion = optionalString(body.app_version);
        const detail = optionalString(body.detail);
        return responseJson(
          await options.robono.diagnostics.reportPush({
            diagnostic_id: requiredString(
              body.diagnostic_id,
              "diagnostic_id",
            ),
            diagnostic_token: requiredString(
              body.diagnostic_token,
              "diagnostic_token",
            ),
            stage: requiredPushDiagnosticStage(body.stage),
            ...(failureStage ? { failure_stage: failureStage } : {}),
            ...(failureReason ? { failure_reason: failureReason } : {}),
            ...(platform ? { platform } : {}),
            ...(provider ? { provider } : {}),
            ...(appVersion ? { app_version: appVersion } : {}),
            ...(detail ? { detail } : {}),
          }, requestOptions),
        );
      }

      throw new AdapterRequestError(
        500,
        "adapter_handler_missing",
        "Authorized adapter route has no handler.",
      );
    } catch (error) {
      if (error instanceof RobonoAuthenticationError) {
        return responseError(
          401,
          "user_authentication_required",
          "The child app user is not authenticated.",
          requestId,
        );
      }
      if (error instanceof AdapterRequestError) {
        return responseError(
          error.status,
          error.code,
          error.message,
          requestId,
        );
      }
      if (error instanceof RobonoError) {
        const status = error.status ??
          (error.code === "request_timeout" ? 504 : 502);
        return responseJson({
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
          },
          request_id: error.requestId ?? requestId,
          ...(error.fields ? { fields: error.fields } : {}),
        }, status, error.retryAfterMs !== null
          ? { "retry-after": String(Math.ceil(error.retryAfterMs / 1_000)) }
          : undefined);
      }
      console.error("Unexpected Robono adapter failure", {
        request_id: requestId,
        error,
      });
      return responseError(
        500,
        "adapter_internal_error",
        "The Robono adapter could not complete the request.",
        requestId,
      );
    }
  };
}

function inputWithAuthenticatedUser(
  action: RobonoAuthorizationAction,
  input: JsonObject,
  userId: string,
): JsonObject {
  if (action === "network_connections.request") {
    return { ...input, source_external_user_id: userId };
  }
  if (action === "network_connections.respond") {
    return { ...input, target_external_user_id: userId };
  }
  if (
    action === "network_connections.list" ||
    action === "network_connections.disconnect" ||
    action === "network_connections.update" ||
    action === "robono_connections.create" ||
    action === "robono_connections.list" ||
    action === "robono_connections.update_profile" ||
    action === "robono_connections.disconnect" ||
    action === "network_messages.send" ||
    action === "network_messages.list" ||
    action === "network_messages.mark" ||
    action === "robono_messages.send"
    || action === "robono_messages.list"
    || action === "robono_messages.mark"
    || action === "guardian_messages.send"
    || action === "guardian_messages.list"
    || action === "guardian_messages.mark"
    || action === "message_transforms.create"
    || action === "push_diagnostics.report"
  ) {
    return action.startsWith("guardian_messages.")
      ? { ...input, external_guardian_id: userId }
      : { ...input, external_user_id: userId };
  }
  return { ...input };
}

async function assertConnectionBelongsToUser(
  robono: RobonoServer,
  connectionId: string,
  externalUserId: string,
  requestId: string,
) {
  const result = await robono.networkConnections.list({
    external_user_id: externalUserId,
    bridge_connection_id: connectionId,
    limit: 1,
  }, { requestId });
  if (
    result.connections.some((item) =>
      item.bridge_connection_id === connectionId
    )
  ) return;
  throw new RobonoError("Connection was not found for this child app user.", {
    code: "connection_not_found",
    status: 404,
    requestId,
  });
}

async function readBody(request: Request, maxRequestBytes: number) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maxRequestBytes) {
    throw new AdapterRequestError(
      413,
      "request_body_too_large",
      "Request body is too large.",
    );
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxRequestBytes) {
    throw new AdapterRequestError(
      413,
      "request_body_too_large",
      "Request body is too large.",
    );
  }
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new AdapterRequestError(
      400,
      "invalid_json",
      "Request body must contain valid JSON.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AdapterRequestError(
      400,
      "invalid_request_body",
      "Request body must be a JSON object.",
    );
  }
  return parsed as JsonObject;
}

function normalizedAdapterPath(pathname: string) {
  const marker = "/robono";
  const index = pathname.lastIndexOf(marker);
  const path = index >= 0 ? pathname.slice(index + marker.length) : pathname;
  return `/${path}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function requiredString(value: unknown, field: string) {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new AdapterRequestError(
      422,
      "required_field_missing",
      `${field} is required.`,
    );
  }
  return normalized;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalIdempotencyKey(value: string | null) {
  if (!value) return undefined;
  const key = value.trim();
  if (key.length < 8 || key.length > 200) {
    throw new AdapterRequestError(
      422,
      "idempotency_key_invalid",
      "Idempotency-Key must contain 8 to 200 characters.",
    );
  }
  return key;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function requiredEvent(value: unknown) {
  if (value === "delivered" || value === "read" || value === "heard") {
    return value;
  }
  throw new AdapterRequestError(
    422,
    "event_invalid",
    "event must be delivered, read, or heard.",
  );
}

function requiredGuardianEvent(value: unknown) {
  if (value === "delivered" || value === "read") return value;
  throw new AdapterRequestError(
    422,
    "event_invalid",
    "event must be delivered or read.",
  );
}

function requiredConnectionResponseStatus(value: unknown) {
  if (value === "accepted" || value === "rejected" || value === "not_found") {
    return value;
  }
  throw new AdapterRequestError(
    422,
    "connection_status_invalid",
    "status must be accepted, rejected, or not_found.",
  );
}

function requiredPushDiagnosticStage(value: unknown) {
  if (
    value === "provider_accepted" || value === "device_received" ||
    value === "content_fetched" || value === "rendered" ||
    value === "polling_recovered" || value === "failed"
  ) return value;
  throw new AdapterRequestError(
    422,
    "push_diagnostic_stage_invalid",
    "stage is not a supported push diagnostic stage.",
  );
}

class AdapterRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdapterRequestError";
  }
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function responseJson(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function responseError(
  status: number,
  code: string,
  message: string,
  requestId: string,
) {
  return responseJson(
    { error: { code, message }, request_id: requestId },
    status,
  );
}
