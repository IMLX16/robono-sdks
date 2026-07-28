import { randomUUID } from "node:crypto";
import { RobonoError } from "./errors.js";
import {
  assertMessageAllowed,
  type BridgeDirection,
  restrictionsFor,
} from "./restrictions.js";
import type {
  BridgeConnection,
  BridgeConnectionListResponse,
  BridgeConnectionResponse,
  BridgeMessageRecord,
  BridgeMessageEventResponse,
  BridgeMessageListResponse,
  ConnectionCapabilities,
  ConnectEndpointInput,
  CreateRobonoConnectionInput,
  DirectoryEntry,
  DirectoryResponse,
  DisconnectEndpointConnectionInput,
  EndpointConnection,
  EndpointConnectionCursor,
  EndpointConnectionListResponse,
  EndpointMessageListResponse,
  EndpointMessageRecord,
  EndpointMessageResponse,
  GuardianMessageListResponse,
  JsonObject,
  LanguageResponse,
  MessageContent,
  MessageTransformInput,
  PushDiagnosticResponse,
  ReportPushDiagnosticInput,
  RequestBridgeConnectionInput,
  RespondBridgeConnectionInput,
  RobonoConnectionResponse,
  RobonoConnectionListResponse,
  RobonoMessageRecord,
  RobonoMessageListResponse,
  RobonoRequestOptions,
  RobonoServerOptions,
  SendBridgeMessageInput,
  SendBridgeMessageResponse,
  SendEndpointMessageInput,
  SendGuardianMessageInput,
  SendGuardianMessageResponse,
  SendRobonoMessageInput,
  SendRobonoMessageResponse,
  SpeechTransformInput,
  TransformResponse,
  UpdateBridgeConnectionInput,
  UpdateEndpointConnectionInput,
  MarkEndpointMessageInput,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.robono.com/v1";
const DEFAULT_API_VERSION = "2026-07-25";
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class RobonoServer {
  readonly directory: {
    list: (
      input?: { includePhoneRobono?: boolean; includeSelf?: boolean },
      options?: RobonoRequestOptions,
    ) => Promise<DirectoryResponse>;
  };
  readonly connections: {
    connect: (
      input: ConnectEndpointInput,
      options?: RobonoRequestOptions,
    ) => Promise<EndpointConnection>;
    create: (
      input: CreateRobonoConnectionInput,
      options?: RobonoRequestOptions,
    ) => Promise<RobonoConnectionResponse>;
    list: (
      input?: {
        external_user_id?: string;
        status?: string;
        limit?: number;
        before?: string;
        connection_id?: string;
      },
      options?: RobonoRequestOptions,
    ) => Promise<RobonoConnectionListResponse>;
    updateProfile: (
      input: JsonObject,
      options?: RobonoRequestOptions,
    ) => Promise<RobonoConnectionResponse>;
    disconnect: (
      input: {
        connection_id: string;
        external_user_id: string;
        reason?: string;
        disconnected_at?: string;
      },
      options?: RobonoRequestOptions,
    ) => Promise<JsonObject>;
  };
  /**
   * Fully normalized connection operations for every directory endpoint.
   * Prefer this namespace in new server-only integrations.
   */
  readonly endpointConnections: {
    connect: (
      input: ConnectEndpointInput,
      options?: RobonoRequestOptions,
    ) => Promise<EndpointConnection>;
    list: (
      input: {
        external_user_id: string;
        limit?: number;
        cursor?: EndpointConnectionCursor;
      },
      options?: RobonoRequestOptions,
    ) => Promise<EndpointConnectionListResponse>;
    update: (
      input: UpdateEndpointConnectionInput,
      options?: RobonoRequestOptions,
    ) => Promise<EndpointConnection>;
    disconnect: (
      input: DisconnectEndpointConnectionInput,
      options?: RobonoRequestOptions,
    ) => Promise<EndpointConnection>;
  };
  readonly networkConnections: {
    request: (
      input: RequestBridgeConnectionInput,
      options?: RobonoRequestOptions,
    ) => Promise<BridgeConnectionResponse>;
    update: (
      input: UpdateBridgeConnectionInput,
      options?: RobonoRequestOptions,
    ) => Promise<BridgeConnectionResponse>;
    respond: (
      input: RespondBridgeConnectionInput,
      options?: RobonoRequestOptions,
    ) => Promise<BridgeConnectionResponse>;
    list: (
      input?: {
        external_user_id?: string;
        status?: string;
        limit?: number;
        before?: string;
        bridge_connection_id?: string;
      },
      options?: RobonoRequestOptions,
    ) => Promise<BridgeConnectionListResponse>;
    disconnect: (
      input: {
        bridge_connection_id: string;
        external_user_id: string;
        reason?: string;
        disconnected_at?: string;
      },
      options?: RobonoRequestOptions,
    ) => Promise<BridgeConnectionResponse>;
    restrictions: (
      connection: Pick<BridgeConnection, "capabilities">,
      direction: BridgeDirection,
    ) => ReturnType<typeof restrictionsFor>;
  };
  readonly messages: {
    sendToRobono: (
      input: SendRobonoMessageInput,
      options?: RobonoRequestOptions,
    ) => Promise<SendRobonoMessageResponse>;
    listFromRobono: (
      input: {
        connection_id: string;
        external_user_id?: string;
        limit?: number;
        before?: string;
        after?: string;
      },
      options?: RobonoRequestOptions,
    ) => Promise<RobonoMessageListResponse>;
    send: {
      (
        input: SendEndpointMessageInput,
        options?: RobonoRequestOptions,
      ): Promise<EndpointMessageResponse>;
      (
        input: SendBridgeMessageInput,
        options?: RobonoRequestOptions & {
          connection?: BridgeConnection;
          direction?: BridgeDirection;
        },
      ): Promise<SendBridgeMessageResponse>;
    };
    sendGuardian: (
      input: SendGuardianMessageInput,
      options?: RobonoRequestOptions,
    ) => Promise<SendGuardianMessageResponse>;
    listGuardian: (
      input: {
        bridge_connection_id: string;
        limit?: number;
        before?: string;
      },
      options?: RobonoRequestOptions,
    ) => Promise<GuardianMessageListResponse>;
    markGuardian: (
      input: {
        bridge_connection_id: string;
        guardian_message_id: string;
        event: "delivered" | "read";
        occurred_at?: string;
      },
      options?: RobonoRequestOptions,
    ) => Promise<JsonObject>;
    list: (
      input: {
        bridge_connection_id: string;
        external_user_id?: string;
        limit?: number;
        before?: string;
        after?: string;
      },
      options?: RobonoRequestOptions,
    ) => Promise<BridgeMessageListResponse>;
    mark: (
      input: {
        bridge_connection_id: string;
        bridge_message_id: string;
        event: "delivered" | "read" | "heard";
        occurred_at?: string;
      },
      options?: RobonoRequestOptions,
    ) => Promise<BridgeMessageEventResponse>;
    markHeard: (
      input: {
        connection_id: string;
        robono_message_id: string;
        heard_by: JsonObject;
        heard_at?: string;
        dry_run?: boolean;
      },
      options?: RobonoRequestOptions,
    ) => Promise<JsonObject>;
    markFromRobono: (
      input: {
        connection_id: string;
        robono_message_id: string;
        external_user_id: string;
        event: "delivered" | "read" | "heard";
        occurred_at?: string;
        dry_run?: boolean;
      },
      options?: RobonoRequestOptions,
    ) => Promise<JsonObject>;
  };
  /**
   * Fully normalized message operations for every directory endpoint.
   * Prefer this namespace in new server-only integrations.
   */
  readonly endpointMessages: {
    send: (
      input: SendEndpointMessageInput,
      options?: RobonoRequestOptions,
    ) => Promise<EndpointMessageResponse>;
    list: (
      input: {
        connection: EndpointConnection;
        external_user_id: string;
        limit?: number;
        before?: string;
        after?: string;
      },
      options?: RobonoRequestOptions,
    ) => Promise<EndpointMessageListResponse>;
    mark: (
      input: MarkEndpointMessageInput,
      options?: RobonoRequestOptions,
    ) => Promise<EndpointMessageResponse>;
  };
  readonly transforms: {
    message: (
      input: MessageTransformInput,
      options?: RobonoRequestOptions,
    ) => Promise<TransformResponse>;
    speech: (
      input: SpeechTransformInput,
      options?: RobonoRequestOptions,
    ) => Promise<TransformResponse>;
  };
  readonly diagnostics: {
    reportPush: (
      input: ReportPushDiagnosticInput,
      options?: RobonoRequestOptions,
    ) => Promise<PushDiagnosticResponse>;
  };

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;
  private readonly defaultRetries: number;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly userAgent: string;
  private readonly apiVersion: string;

  constructor(options: RobonoServerOptions) {
    if (!options.apiKey?.trim()) {
      throw new RobonoError("A Robono API key is required.", {
        code: "api_key_required",
      });
    }
    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.defaultTimeoutMs = positiveInteger(options.timeoutMs, 15_000);
    this.defaultRetries = nonnegativeInteger(options.retries, 2);
    this.fetcher = options.fetch ?? globalThis.fetch;
    if (!this.fetcher) {
      throw new RobonoError("This environment does not provide fetch.", {
        code: "fetch_required",
      });
    }
    this.userAgent = options.userAgent ?? "@robono/server/0.7.5";
    this.apiVersion = options.apiVersion?.trim() || DEFAULT_API_VERSION;

    this.directory = {
      list: (input = {}, requestOptions) =>
        this.request<DirectoryResponse>(
          "/networks",
          {
            include_phone_robono: input.includePhoneRobono ?? true,
            include_self: input.includeSelf ?? false,
          },
          requestOptions,
          false,
        ),
    };
    this.connections = {
      connect: async (input, requestOptions) => {
        const targetIdentifier = normalizeEndpointIdentifier(
          input.target_identifier,
          input.endpoint,
        );
        if (input.endpoint.type === "robono_phone") {
          const raw = await this.request<RobonoConnectionResponse>(
            "/connections",
            {
              target_phone_e164: targetIdentifier,
              external_user_id: input.external_user_id,
              external_display_name: input.external_display_name,
              ...(input.external_profile
                ? { external_profile: input.external_profile }
                : {}),
              ...(input.target_contact_label
                ? { target_contact_label: input.target_contact_label }
                : {}),
              ...(input.monitoring_disclosure
                ? { monitoring_disclosure: input.monitoring_disclosure }
                : {}),
              ...(input.external_approval
                ? { external_approval: input.external_approval }
                : {}),
              ...(input.capabilities
                ? { capabilities: input.capabilities }
                : {}),
            },
            requestOptions,
          );
          return normalizeEndpointConnection(
            input.endpoint,
            raw,
            input.external_user_id,
          );
        }
        const raw = await this.request<BridgeConnectionResponse>(
          "/network-connections",
          {
            target_app_id: input.endpoint.id,
            source_external_user_id: input.external_user_id,
            source_display_name: input.external_display_name,
            target_identifier: targetIdentifier,
            ...(input.target_contact_label
              ? { target_contact_label: input.target_contact_label }
              : {}),
            ...(input.external_profile
              ? { external_profile: input.external_profile }
              : {}),
            ...(input.capabilities
              ? { capabilities: input.capabilities }
              : {}),
            ...(typeof input.guardian_messaging_enabled === "boolean"
              ? {
                guardian_messaging_enabled:
                  input.guardian_messaging_enabled,
              }
              : {}),
            ...(input.guardians
              ? { source_guardians: input.guardians }
              : {}),
            ...(input.monitoring_disclosure
              ? { monitoring_disclosure: input.monitoring_disclosure }
              : {}),
            ...(input.external_approval
              ? { external_approval: input.external_approval }
              : {}),
          },
          requestOptions,
        );
        return normalizeEndpointConnection(
          input.endpoint,
          raw,
          input.external_user_id,
        );
      },
      create: (input, requestOptions) =>
        this.request("/connections", input, requestOptions),
      list: (input = {}, requestOptions) =>
        this.request("/connections/list", input, requestOptions, false),
      updateProfile: (input, requestOptions) =>
        this.request("/connections/profile", input, requestOptions),
      disconnect: (input, requestOptions) =>
        this.request("/connections/disconnect", input, requestOptions),
    };
    this.networkConnections = {
      request: (input, requestOptions) =>
        this.request("/network-connections", input, requestOptions),
      respond: (input, requestOptions) =>
        this.request("/network-connections/respond", input, requestOptions),
      list: (input = {}, requestOptions) =>
        this.request("/network-connections/list", input, requestOptions, false),
      disconnect: (input, requestOptions) =>
        this.request("/network-connections/disconnect", input, requestOptions),
      update: (input, requestOptions) =>
        this.request("/network-connections/update", input, requestOptions),
      restrictions: restrictionsFor,
    };
    this.messages = {
      sendToRobono: (input, requestOptions) =>
        this.request("/messages", input, requestOptions),
      listFromRobono: (input, requestOptions) =>
        this.request("/messages/list", input, requestOptions, false),
      send: (async (
        input: SendEndpointMessageInput | SendBridgeMessageInput,
        requestOptions: (RobonoRequestOptions & {
          connection?: BridgeConnection;
          direction?: BridgeDirection;
        }) = {},
      ) => {
        if ("connection" in input) {
          const {
            connection,
            send_invite_sms_if_pending,
            external_profile,
            ...message
          } = input;
          assertEndpointMessageAllowed(connection, message, input.external_user_id);
          if (connection.endpoint_type === "robono_phone") {
            const raw = await this.request<SendRobonoMessageResponse>(
              "/messages",
              {
                ...message,
                connection_id: connection.connection_id,
                ...(typeof send_invite_sms_if_pending === "boolean"
                  ? { send_invite_sms_if_pending }
                  : {}),
                ...(external_profile ? { external_profile } : {}),
              },
              requestOptions,
            );
            return normalizeEndpointMessage(connection, raw);
          }
          const raw = await this.request<SendBridgeMessageResponse>(
            "/network-messages",
            {
              ...message,
              bridge_connection_id: connection.connection_id,
            },
            requestOptions,
          );
          return normalizeEndpointMessage(connection, raw);
        }
        if (requestOptions.connection && requestOptions.direction) {
          const limits = restrictionsFor(
            requestOptions.connection,
            requestOptions.direction,
          );
          assertMessageAllowed(limits, {
            messageKind: input.message_kind,
            ...(input.message_kind === "text"
              ? { textBody: input.text_body }
              : { media: input.media }),
          });
        }
        return this.request("/network-messages", input, requestOptions);
      }) as RobonoServer["messages"]["send"],
      sendGuardian: (input, requestOptions) =>
        this.request("/guardian-messages", input, requestOptions),
      listGuardian: (input, requestOptions) =>
        this.request("/guardian-messages/list", input, requestOptions, false),
      markGuardian: (input, requestOptions) =>
        this.request("/guardian-messages/events", input, requestOptions),
      list: (input, requestOptions) =>
        this.request("/network-messages/list", input, requestOptions, false),
      mark: (input, requestOptions) =>
        this.request("/network-messages/events", input, requestOptions),
      markHeard: (input, requestOptions) =>
        this.request(
          "/message-events",
          { ...input, event: "heard" },
          requestOptions,
        ),
      markFromRobono: (input, requestOptions) =>
        this.request("/message-events", input, requestOptions),
    };
    this.endpointConnections = {
      connect: (input, requestOptions) =>
        this.connections.connect(input, requestOptions),
      list: async (
        { external_user_id, limit = 50, cursor = {} },
        requestOptions,
      ) => {
        const pageLimit = Math.max(1, Math.min(100, Math.floor(limit)));
        const directory = await this.directory.list(
          { includePhoneRobono: true, includeSelf: true },
          requestOptions,
        );
        const phase = cursor.phase ??
          (cursor.robono_before && !cursor.connected_app_before
            ? "robono_phone"
            : "connected_app");
        const connections: EndpointConnection[] = [];

        if (phase === "connected_app") {
          const bridgePage = await this.networkConnections.list(
            {
              external_user_id,
              limit: pageLimit,
              ...(cursor.connected_app_before
                ? { before: cursor.connected_app_before }
                : {}),
            },
            requestOptions,
          );
          connections.push(...bridgePage.connections.map((connection) =>
            normalizeEndpointConnection(
              endpointForBridge(directory.directory, connection, external_user_id),
              connection as BridgeConnectionResponse,
              external_user_id,
            )
          ));
          if (bridgePage.has_more) {
            if (!bridgePage.next_before) {
              throw new RobonoError(
                "The Bridge returned an incomplete connection cursor.",
                { code: "invalid_pagination_cursor" },
              );
            }
            return {
              connections,
              has_more: true,
              next_cursor: {
                phase: "connected_app",
                connected_app_before: bridgePage.next_before,
              },
            };
          }
          if (connections.length >= pageLimit) {
            return {
              connections,
              has_more: true,
              next_cursor: { phase: "robono_phone" },
            };
          }
        }

        const robonoPage = await this.connections.list(
          {
            external_user_id,
            limit: pageLimit - connections.length,
            ...(cursor.robono_before
              ? { before: cursor.robono_before }
              : {}),
          },
          requestOptions,
        );
        connections.push(...robonoPage.connections.map((connection) =>
            normalizeEndpointConnection(
              phoneEndpoint(directory.directory),
              connection,
              external_user_id,
            )
          ));
        if (robonoPage.has_more && !robonoPage.next_before) {
          throw new RobonoError(
            "The Bridge returned an incomplete connection cursor.",
            { code: "invalid_pagination_cursor" },
          );
        }
        return {
          connections,
          has_more: robonoPage.has_more,
          next_cursor: robonoPage.has_more
            ? {
              phase: "robono_phone",
              robono_before: robonoPage.next_before!,
            }
            : null,
        };
      },
      update: async (input, requestOptions) => {
        const {
          connection,
          external_user_id,
          display_name,
          external_profile,
          capabilities,
          guardians,
        } = input;
        if (connection.endpoint_type === "connected_app") {
          const raw = await this.networkConnections.update({
            bridge_connection_id: connection.connection_id,
            external_user_id,
            ...(display_name ? { display_name } : {}),
            ...(external_profile ? { external_profile } : {}),
            ...(capabilities ? { capabilities } : {}),
            ...(guardians ? { guardians } : {}),
          }, requestOptions);
          return normalizeEndpointConnection(
            connection.endpoint,
            raw,
            external_user_id,
          );
        }
        const raw = await this.connections.updateProfile({
          connection_id: connection.connection_id,
          external_user_id,
          ...(display_name ? { external_display_name: display_name } : {}),
          ...(external_profile ? { external_profile } : {}),
          ...(capabilities ? { capabilities } : {}),
        }, requestOptions);
        return normalizeEndpointConnection(
          connection.endpoint,
          raw,
          external_user_id,
        );
      },
      disconnect: async (input, requestOptions) => {
        const { connection, external_user_id, reason } = input;
        const raw = connection.endpoint_type === "connected_app"
          ? await this.networkConnections.disconnect({
            bridge_connection_id: connection.connection_id,
            external_user_id,
            ...(reason ? { reason } : {}),
          }, requestOptions)
          : await this.connections.disconnect({
            connection_id: connection.connection_id,
            external_user_id,
            ...(reason ? { reason } : {}),
          }, requestOptions) as unknown as RobonoConnectionResponse;
        return normalizeEndpointConnection(
          connection.endpoint,
          raw,
          external_user_id,
        );
      },
    };
    this.endpointMessages = {
      send: (input, requestOptions) =>
        this.messages.send(input, requestOptions),
      list: async (input, requestOptions) => {
        const {
          connection,
          external_user_id,
          limit,
          before,
          after,
        } = input;
        const page = connection.endpoint_type === "connected_app"
          ? await this.messages.list({
            bridge_connection_id: connection.connection_id,
            external_user_id,
            ...(limit ? { limit } : {}),
            ...(before ? { before } : {}),
            ...(after ? { after } : {}),
          }, requestOptions)
          : await this.messages.listFromRobono({
            connection_id: connection.connection_id,
            external_user_id,
            ...(limit ? { limit } : {}),
            ...(before ? { before } : {}),
            ...(after ? { after } : {}),
          }, requestOptions);
        return {
          messages: page.messages.map((message) =>
            normalizeEndpointMessageRecord(connection, message)
          ),
          has_more: page.has_more,
          next_before: page.next_before,
          next_after: page.next_after ?? null,
          sync_cursor: page.sync_cursor ?? null,
        };
      },
      mark: async (input, requestOptions) => {
        const { connection, external_user_id, message_id, event, occurred_at } =
          input;
        const raw = connection.endpoint_type === "connected_app"
          ? await this.messages.mark({
            bridge_connection_id: connection.connection_id,
            bridge_message_id: message_id,
            event,
            ...(occurred_at ? { occurred_at } : {}),
          }, requestOptions)
          : await this.messages.markFromRobono({
            connection_id: connection.connection_id,
            robono_message_id: message_id,
            external_user_id,
            event,
            ...(occurred_at ? { occurred_at } : {}),
          }, requestOptions);
        return {
          endpoint_type: connection.endpoint_type,
          connection_id: connection.connection_id,
          message_id,
          status: optionalString(record(raw).status) ?? event,
          raw,
        };
      },
    };
    this.transforms = {
      message: (input, requestOptions) =>
        this.request("/message-transforms", input, {
          timeoutMs: 120_000,
          ...requestOptions,
        }),
      speech: (input, requestOptions) =>
        this.request("/speech-transforms", input, {
          timeoutMs: 120_000,
          ...requestOptions,
        }),
    };
    this.diagnostics = {
      reportPush: (input, requestOptions) =>
        this.request("/push-diagnostics/events", input, requestOptions),
    };
  }

  async languages(options?: RobonoRequestOptions) {
    return this.request<LanguageResponse>("/languages", {}, options, false);
  }

  async health(options: Omit<RobonoRequestOptions, "idempotencyKey"> = {}) {
    const healthUrl = this.baseUrl.replace(/\/v1$/, "/health");
    return this.requestAbsolute<{ ok: true; service: string }>(
      healthUrl,
      undefined,
      options,
      false,
      false,
      "GET",
    );
  }

  private async request<T>(
    path: string,
    body: unknown,
    options: RobonoRequestOptions = {},
    idempotentWrite = true,
  ): Promise<T> {
    return this.requestAbsolute<T>(
      `${this.baseUrl}${path}`,
      body,
      options,
      true,
      idempotentWrite,
    );
  }

  private async requestAbsolute<T>(
    url: string,
    body: unknown,
    options:
      | RobonoRequestOptions
      | Omit<RobonoRequestOptions, "idempotencyKey">,
    authenticated: boolean,
    idempotentWrite: boolean,
    method: "GET" | "POST" = "POST",
  ): Promise<T> {
    const retries = nonnegativeInteger(options.retries, this.defaultRetries);
    const timeoutMs = positiveInteger(options.timeoutMs, this.defaultTimeoutMs);
    const requestId = options.requestId ?? `req_${randomUUID()}`;
    const suppliedIdempotencyKey = "idempotencyKey" in options
      ? options.idempotencyKey
      : undefined;
    const idempotencyKey = suppliedIdempotencyKey ??
      (idempotentWrite ? `idem_${randomUUID()}` : undefined);
    let lastError: unknown;
    let nextRetryDelayMs: number | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (options.signal?.aborted) {
        throw new RobonoError("The Robono request was cancelled.", {
          code: "request_cancelled",
          requestId,
          retryable: false,
          cause: options.signal.reason,
        });
      }
      if (attempt > 0) {
        await wait(nextRetryDelayMs ?? retryDelay(attempt), options.signal);
        nextRetryDelayMs = null;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();
      options.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const headers: Record<string, string> = {
          "accept": "application/json",
          "robono-request-id": requestId,
          "x-client-info": this.userAgent,
          "robono-api-version": this.apiVersion,
        };
        if (method === "POST") headers["content-type"] = "application/json";
        if (authenticated) headers.authorization = `Bearer ${this.apiKey}`;
        if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
        const response = await this.fetcher(url, {
          method,
          headers,
          ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        });
        const payload = await parseResponse(response);
        if (!response.ok) {
          const apiError = apiErrorFrom(response, payload, requestId);
          if (apiError.retryable && attempt < retries) {
            lastError = apiError;
            nextRetryDelayMs = apiError.retryAfterMs;
            continue;
          }
          throw apiError;
        }
        return payload as T;
      } catch (cause) {
        if (cause instanceof RobonoError) throw cause;
        const abortedByCaller = options.signal?.aborted === true;
        const timedOut = controller.signal.aborted && !abortedByCaller;
        const error = new RobonoError(
          abortedByCaller
            ? "The Robono request was cancelled."
            : timedOut
            ? "The Robono request timed out."
            : "The Robono service could not be reached.",
          {
            code: abortedByCaller
              ? "request_cancelled"
              : timedOut
              ? "request_timeout"
              : "network_error",
            requestId,
            retryable: !abortedByCaller,
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
        options.signal?.removeEventListener("abort", onAbort);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new RobonoError("The Robono request failed.", { requestId });
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new RobonoError(
      "Robono returned a response that was not valid JSON.",
      {
        status: response.status,
        code: "invalid_json_response",
        retryable: response.status >= 500,
        cause,
      },
    );
  }
}

function apiErrorFrom(
  response: Response,
  payload: unknown,
  fallbackRequestId: string,
) {
  const record = isRecord(payload) ? payload : {};
  const nested = isRecord(record.error) ? record.error : record;
  const status = response.status;
  return new RobonoError(
    stringValue(nested.message) || stringValue(record.message) ||
      `Robono request failed with status ${status}.`,
    {
      status,
      code: stringValue(nested.code) || stringValue(record.code) ||
        `http_${status}`,
      requestId: stringValue(record.request_id) ||
        response.headers.get("robono-request-id") || fallbackRequestId,
      fields: Array.isArray(record.fields)
        ? record.fields
        : Array.isArray(nested.fields)
        ? nested.fields
        : [],
      details: record.details ?? nested.details,
      retryable: RETRYABLE_STATUS.has(status),
      ...(parseRetryAfter(response.headers.get("retry-after")) !== null
        ? {
          retryAfterMs: parseRetryAfter(
            response.headers.get("retry-after"),
          ) as number,
        }
        : {}),
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && (value ?? 0) > 0
    ? Math.floor(value as number)
    : fallback;
}

function nonnegativeInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && (value ?? -1) >= 0
    ? Math.floor(value as number)
    : fallback;
}

function retryDelay(attempt: number) {
  return Math.min(2_000, 150 * 2 ** Math.max(0, attempt - 1)) +
    Math.floor(Math.random() * 100);
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

async function wait(milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new Error("Aborted");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    if (!signal) return;
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

function normalizeEndpointConnection(
  endpoint: ConnectEndpointInput["endpoint"],
  raw: BridgeConnectionResponse | RobonoConnectionResponse,
  externalUserId: string,
): EndpointConnection {
  if ("bridge_connection_id" in raw) {
    const ownSource = raw.source.external_user_id === externalUserId;
    const other = ownSource ? raw.target : raw.source;
    const profile = record(other.profile);
    const avatar = record(profile.avatar);
    return {
      endpoint,
      endpoint_type: "connected_app",
      connection_id: raw.bridge_connection_id,
      status: raw.status,
      external_user_id: ownSource
        ? raw.source.external_user_id
        : raw.target.external_user_id ?? externalUserId,
      capabilities: raw.capabilities,
      peer: {
        endpoint,
        external_user_id: other.external_user_id,
        display_name: other.display_name,
        identifier: ownSource ? raw.target.identifier : null,
        avatar_url: optionalString(avatar.source_url) ?? null,
        avatar_version: optionalString(avatar.version) ?? null,
        profile,
      },
      raw,
    };
  }
  const user = raw.robono_user;
  return {
    endpoint,
    endpoint_type: "robono_phone",
    connection_id: raw.connection_id,
    status: raw.status,
    external_user_id: raw.external_user_id,
    capabilities: raw.capabilities,
    peer: {
      endpoint,
      external_user_id: user?.id ?? null,
      display_name: user?.display_name ?? raw.target_contact_label ??
        raw.phone_masked,
      identifier: raw.phone_masked,
      avatar_url: user?.avatar_url ?? null,
      avatar_version: user?.avatar_version ?? null,
      profile: user ? { ...user } : {},
    },
    raw,
  };
}

function endpointForBridge(
  directory: DirectoryEntry[],
  connection: BridgeConnection,
  externalUserId: string,
) {
  const ownSource = connection.source.external_user_id === externalUserId;
  const app = ownSource ? connection.target.app : connection.source.app;
  const appId = app.id;
  return directory.find((entry) => entry.id === appId) ??
    fallbackDirectoryEntry(app);
}

function phoneEndpoint(directory: DirectoryEntry[]) {
  return directory.find((entry) => entry.type === "robono_phone") ??
    fallbackDirectoryEntry({
      id: "robono-phone",
      slug: "robono",
      display_name: "Robono",
    }, "robono_phone");
}

function fallbackDirectoryEntry(
  app: { id: string; slug?: string; display_name?: string },
  type: DirectoryEntry["type"] = "connected_app",
): DirectoryEntry {
  const displayName = app.display_name?.trim() || "Connected app";
  return {
    type,
    id: app.id,
    slug: app.slug?.trim() || app.id,
    display_name: displayName,
    description: "",
    icon_url: "",
    accepts_inbound_bridge_requests: true,
    accepted_identifier: {
      label: "Friend identifier",
      description: `Enter the identifier used by ${displayName}.`,
      example: "",
      format: "text",
      input_type: "text",
      min_length: 1,
      max_length: 160,
      normalization: "trim",
      case_sensitive: true,
    },
    default_capabilities: {},
  };
}

function normalizeEndpointIdentifier(raw: string, endpoint: DirectoryEntry) {
  const rules = endpoint.accepted_identifier;
  let value = String(raw ?? "");
  switch (rules.normalization) {
    case "trim":
      value = value.trim();
      break;
    case "lowercase":
      value = value.trim().toLowerCase();
      break;
    case "uppercase":
      value = value.trim().toUpperCase();
      break;
    case "e164":
      value = value.trim().replace(/^00/, "+").replace(/[^\d+]/g, "");
      break;
    case "none":
      break;
  }
  if (
    !rules.case_sensitive &&
    rules.normalization !== "uppercase" &&
    rules.normalization !== "e164"
  ) value = value.toLowerCase();
  if (
    value.length < rules.min_length ||
    value.length > rules.max_length
  ) {
    throw new Error(
      `${rules.label} must contain ${rules.min_length} to ${rules.max_length} characters.`,
    );
  }
  if (rules.pattern) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(rules.pattern);
    } catch {
      throw new Error(
        `${endpoint.display_name} published an invalid identifier rule.`,
      );
    }
    if (!pattern.test(value)) {
      throw new Error(rules.description || `${rules.label} is not valid.`);
    }
  }
  return value;
}

function record(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeEndpointMessage(
  connection: EndpointConnection,
  raw: SendBridgeMessageResponse | SendRobonoMessageResponse,
): EndpointMessageResponse {
  const messageId = connection.endpoint_type === "connected_app"
    ? (raw as SendBridgeMessageResponse).bridge_message_id ?? null
    : (raw as SendRobonoMessageResponse).robono_message_id ?? null;
  return {
    endpoint_type: connection.endpoint_type,
    connection_id: connection.connection_id,
    message_id: messageId,
    status: raw.status,
    raw,
  };
}

function normalizeEndpointMessageRecord(
  connection: EndpointConnection,
  raw: BridgeMessageRecord | RobonoMessageRecord,
): EndpointMessageRecord {
  const bridge = connection.endpoint_type === "connected_app";
  return {
    endpoint_type: connection.endpoint_type,
    connection_id: connection.connection_id,
    message_id: bridge
      ? (raw as BridgeMessageRecord).bridge_message_id
      : (raw as RobonoMessageRecord).robono_message_id,
    direction: raw.direction,
    external_message_id: raw.external_message_id,
    message_kind: raw.message_kind,
    text_body: raw.text_body,
    media: raw.media,
    status: raw.status,
    accepted_at: bridge
      ? (raw as BridgeMessageRecord).accepted_at
      : null,
    accepted_via: bridge
      ? (raw as BridgeMessageRecord).accepted_via
      : null,
    delivered_at: raw.delivered_at,
    read_at: raw.read_at,
    heard_at: raw.heard_at,
    failed_at: raw.failed_at,
    failure_code: raw.failure_code,
    created_at: raw.created_at,
    raw,
  };
}

function assertEndpointMessageAllowed(
  connection: EndpointConnection,
  input: MessageContent,
  externalUserId: string,
) {
  if (connection.endpoint_type === "connected_app") {
    const raw = connection.raw as BridgeConnectionResponse;
    const direction: BridgeDirection =
      raw.source.external_user_id === externalUserId
        ? "source_to_target"
        : "target_to_source";
    assertMessageAllowed(restrictionsFor(raw, direction), {
      messageKind: input.message_kind,
      ...(input.message_kind === "text"
        ? { textBody: input.text_body }
        : { media: input.media }),
    });
    return;
  }

  const capabilities = connection.capabilities;
  assertMessageAllowed(
    {
      allowed_message_kinds:
        capabilities.allowed_outbound_message_kinds ??
          ["text", "voice", "image", "video", "document"],
      ...(capabilities.text ? { text: capabilities.text } : {}),
      ...(capabilities.voice ? { voice: capabilities.voice } : {}),
      ...(capabilities.photo ? { photo: capabilities.photo } : {}),
      ...(capabilities.video ? { video: capabilities.video } : {}),
      ...(capabilities.document ? { document: capabilities.document } : {}),
    },
    {
      messageKind: input.message_kind,
      ...(input.message_kind === "text"
        ? { textBody: input.text_body }
        : { media: input.media }),
    },
  );
}
