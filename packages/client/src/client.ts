import type {
  ClientStartResult,
  ClientState,
  ClientRequestOptions,
  ConnectionListAllOptions,
  ConnectEndpointInput,
  DisconnectEndpointConnectionInput,
  EndpointConnection,
  EndpointConnectionCursor,
  EndpointConnectionListResult,
  EndpointConnectionPage,
  EndpointMessage,
  EndpointMessagePage,
  EndpointMessageSendResult,
  ExternalProfile,
  ConnectionCapabilities,
  Guardian,
  MarkEndpointMessageInput,
  MarkRobonoMessageInput,
  MessageTransformInput,
  NetworkConnection,
  NetworkDirectoryEntry,
  NetworkMessage,
  PageOptions,
  CreateRobonoConnectionInput,
  RequestNetworkConnectionInput,
  ReportPushDiagnosticInput,
  RespondNetworkConnectionInput,
  RobonoClientTransport,
  RobonoConnection,
  RobonoMessage,
  RobonoPushEvent,
  SendEndpointMessageInput,
  SendGuardianMessageInput,
  SendMessageInput,
  SendRobonoMessageInput,
  SpeechTransformInput,
  TransformRequestOptions,
  TransformResponse,
  UpdateEndpointConnectionInput,
} from "./types.js";
import { parseRobonoPushEvent } from "./push.js";

export interface RobonoClientOptions {
  externalUserId: string;
  transport: RobonoClientTransport;
  /** Maximum age of the endpoint directory before an automatic refresh. */
  directoryTtlMs?: number;
  pollingIntervalMs?: number;
  maxPollingIntervalMs?: number;
  pollingJitterRatio?: number;
  pollingEnabled?: boolean;
  random?: () => number;
}

export class RobonoClientStartError extends Error {
  readonly code = "initial_sync_failed";

  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = "RobonoClientStartError";
  }
}

export class RobonoClient {
  readonly networks: {
    list: () => ReturnType<RobonoClientTransport["listNetworks"]>;
    refresh: () => ReturnType<RobonoClientTransport["listNetworks"]>;
  };
  readonly networkConnections: {
    request: (input: RequestNetworkConnectionInput, options?: ClientRequestOptions) => Promise<NetworkConnection>;
    respond: (input: RespondNetworkConnectionInput, options?: ClientRequestOptions) => Promise<NetworkConnection>;
    list: (
      input?: PageOptions & { status?: string },
    ) => Promise<NetworkConnection[]>;
    disconnect: (
      input: { bridge_connection_id: string; reason?: string },
      options?: ClientRequestOptions,
    ) => Promise<NetworkConnection>;
    update: (input: {
      bridge_connection_id: string;
      display_name?: string;
      external_profile?: ExternalProfile;
      capabilities?: ConnectionCapabilities;
      guardians?: Guardian[];
    }, options?: ClientRequestOptions) => Promise<NetworkConnection>;
  };
  readonly robonoConnections: {
    create: (input: CreateRobonoConnectionInput, options?: ClientRequestOptions) => ReturnType<RobonoClientTransport["createRobonoConnection"]>;
    list: (
      input?: PageOptions & { status?: string },
    ) => Promise<RobonoConnection[]>;
    updateProfile: (input: Record<string, unknown> & { connection_id: string }, options?: ClientRequestOptions) => ReturnType<RobonoClientTransport["updateRobonoConnection"]>;
    disconnect: (input: { connection_id: string; reason?: string }, options?: ClientRequestOptions) => ReturnType<RobonoClientTransport["disconnectRobonoConnection"]>;
  };
  readonly networkMessages: {
    send: (
      input: SendMessageInput,
      options?: ClientRequestOptions,
    ) => ReturnType<RobonoClientTransport["sendNetworkMessage"]>;
    list: (
      input: PageOptions & { bridge_connection_id: string },
    ) => Promise<NetworkMessage[]>;
    mark: (
      input: Parameters<RobonoClientTransport["markNetworkMessage"]>[0],
      options?: ClientRequestOptions,
    ) => ReturnType<RobonoClientTransport["markNetworkMessage"]>;
  };
  readonly robonoMessages: {
    send: (input: SendRobonoMessageInput, options?: ClientRequestOptions) => ReturnType<RobonoClientTransport["sendRobonoMessage"]>;
    list: (
      input: PageOptions & { connection_id: string },
    ) => Promise<RobonoMessage[]>;
    mark: (
      input: MarkRobonoMessageInput,
      options?: ClientRequestOptions,
    ) => ReturnType<RobonoClientTransport["markRobonoMessage"]>;
  };
  readonly connections: {
    connect: (input: ConnectEndpointInput, options?: ClientRequestOptions) => Promise<EndpointConnection>;
    listPage: (input?: { limit?: number; cursor?: EndpointConnectionCursor }) => Promise<EndpointConnectionPage>;
    listAll: (input?: ConnectionListAllOptions) => Promise<EndpointConnectionListResult>;
    list: (input?: ConnectionListAllOptions) => Promise<EndpointConnection[]>;
    update: (input: UpdateEndpointConnectionInput, options?: ClientRequestOptions) => Promise<EndpointConnection>;
    disconnect: (
      input: DisconnectEndpointConnectionInput,
      options?: ClientRequestOptions,
    ) => Promise<EndpointConnection>;
  };
  readonly messages: {
    send: (input: SendEndpointMessageInput, options?: ClientRequestOptions) => Promise<EndpointMessageSendResult>;
    list: (
      input: PageOptions & { connection: EndpointConnection },
    ) => Promise<EndpointMessage[]>;
    listPage: (
      input: PageOptions & { connection: EndpointConnection },
    ) => Promise<EndpointMessagePage>;
    mark: (input: MarkEndpointMessageInput, options?: ClientRequestOptions) => Promise<EndpointMessageSendResult>;
  };
  readonly guardianMessages: {
    send: (input: SendGuardianMessageInput, options?: ClientRequestOptions) => ReturnType<RobonoClientTransport["sendGuardianMessage"]>;
    list: (input: PageOptions & { bridge_connection_id: string }) => ReturnType<RobonoClientTransport["listGuardianMessages"]>;
    mark: (
      input: {
        bridge_connection_id: string;
        guardian_message_id: string;
        event: "delivered" | "read";
        occurred_at?: string;
      },
      options?: ClientRequestOptions,
    ) => ReturnType<RobonoClientTransport["markGuardianMessage"]>;
  };
  readonly transforms: {
    message: (
      input: MessageTransformInput,
      options: TransformRequestOptions,
    ) => Promise<TransformResponse>;
    speech: (
      input: SpeechTransformInput,
      options: TransformRequestOptions,
    ) => Promise<TransformResponse>;
  };
  readonly diagnostics: {
    reportPush: (
      input: ReportPushDiagnosticInput,
      options?: ClientRequestOptions,
    ) => ReturnType<RobonoClientTransport["reportPushDiagnostic"]>;
  };

  private readonly externalUserId: string;
  private readonly transport: RobonoClientTransport;
  private readonly directoryTtlMs: number;
  private readonly pollingIntervalMs: number;
  private readonly maxPollingIntervalMs: number;
  private readonly pollingJitterRatio: number;
  private readonly pollingEnabled: boolean;
  private readonly random: () => number;
  private readonly listeners = new Set<(state: ClientState) => void>();
  private pollingTimer: ReturnType<typeof setTimeout> | null = null;
  private currentPollingIntervalMs: number;
  private syncPromise: Promise<void> | null = null;
  private startPromise: Promise<ClientStartResult> | null = null;
  private queuedFullSync = false;
  private readonly queuedConnectionIds = new Set<string>();
  private queuedSyncVia: "push" | "polling" = "polling";
  private directoryRefreshedAt = 0;
  private lifecycleVersion = 0;
  private state: ClientState = initialState();

  constructor(options: RobonoClientOptions) {
    if (!options.externalUserId?.trim()) {
      throw new Error("externalUserId is required.");
    }
    this.externalUserId = options.externalUserId.trim();
    this.transport = options.transport;
    this.directoryTtlMs = positiveInteger(
      options.directoryTtlMs,
      5 * 60_000,
    );
    this.pollingIntervalMs = positiveInteger(options.pollingIntervalMs, 60_000);
    this.maxPollingIntervalMs = Math.max(
      this.pollingIntervalMs,
      positiveInteger(options.maxPollingIntervalMs, 5 * 60_000),
    );
    this.pollingJitterRatio = boundedRatio(options.pollingJitterRatio, 0.2);
    this.pollingEnabled = options.pollingEnabled ?? true;
    this.random = options.random ?? Math.random;
    this.currentPollingIntervalMs = this.pollingIntervalMs;

    const refreshNetworks = async () => {
      const result = await this.transport.listNetworks();
      this.directoryRefreshedAt = Date.now();
      this.patch({ networks: result.directory });
      return result;
    };
    this.networks = {
      list: refreshNetworks,
      refresh: refreshNetworks,
    };
    this.networkConnections = {
      request: async (input, options) => {
        const connection = await this.transport.requestNetworkConnection({
          ...input,
          external_user_id: this.externalUserId,
        }, options);
        this.upsertConnection(
          normalizeNetworkConnection(
            connection,
            this.state.networks,
            this.externalUserId,
          ),
        );
        return connection;
      },
      respond: async (input, options) => {
        const connection = await this.transport.respondNetworkConnection({
          ...input,
          target_external_user_id: this.externalUserId,
        }, options);
        this.upsertConnection(
          normalizeNetworkConnection(
            connection,
            this.state.networks,
            this.externalUserId,
          ),
        );
        return connection;
      },
      list: async (input = {}) => {
        const result = await this.transport.listNetworkConnections({
          ...input,
          external_user_id: this.externalUserId,
        });
        this.patch({
          connections: mergeConnections(
            this.state.connections,
            result.connections.map((connection) =>
              normalizeNetworkConnection(
                connection,
                this.state.networks,
                this.externalUserId,
              )
            ),
          ),
        });
        return result.connections;
      },
      disconnect: async (input, options) => {
        const connection = await this.transport.disconnectNetworkConnection({
          ...input,
          external_user_id: this.externalUserId,
        }, options);
        this.upsertConnection(
          normalizeNetworkConnection(
            connection,
            this.state.networks,
            this.externalUserId,
          ),
        );
        return connection;
      },
      update: async (input, options) => {
        const connection = await this.transport.updateNetworkConnection({
          ...input,
          external_user_id: this.externalUserId,
        }, options);
        this.upsertConnection(
          normalizeNetworkConnection(
            connection,
            this.state.networks,
            this.externalUserId,
          ),
        );
        return connection;
      },
    };
    this.robonoConnections = {
      create: async (input, options) => {
        const connection = await this.transport.createRobonoConnection({
          ...input,
          external_user_id: this.externalUserId,
        }, options);
        this.upsertConnection(
          normalizeRobonoConnection(connection, this.state.networks),
        );
        return connection;
      },
      list: async (input = {}) => {
        const result = await this.transport.listRobonoConnections({
          ...input,
          external_user_id: this.externalUserId,
        });
        this.patch({
          connections: mergeConnections(
            this.state.connections,
            result.connections.map((connection) =>
              normalizeRobonoConnection(connection, this.state.networks)
            ),
          ),
        });
        return result.connections;
      },
      updateProfile: async (input, options) => {
        const connection = await this.transport.updateRobonoConnection({
          ...input,
          external_user_id: this.externalUserId,
        }, options);
        this.upsertConnection(
          normalizeRobonoConnection(connection, this.state.networks),
        );
        return connection;
      },
      disconnect: async (input, options) => {
        const connection = await this.transport.disconnectRobonoConnection({
          ...input,
          external_user_id: this.externalUserId,
        }, options);
        this.upsertConnection(
          normalizeRobonoConnection(connection, this.state.networks),
        );
        return connection;
      },
    };
    this.networkMessages = {
      send: (input, options) =>
        this.transport.sendNetworkMessage({
          ...input,
          external_user_id: this.externalUserId,
        }, options),
      list: async (input) => {
        const result = await this.transport.listNetworkMessages({
          ...input,
          external_user_id: this.externalUserId,
        });
        this.setMessages(
          input.bridge_connection_id,
          result.messages.map(normalizeNetworkMessage),
        );
        return result.messages;
      },
      mark: (input, options) => this.transport.markNetworkMessage(input, options),
    };
    this.robonoMessages = {
      send: (input, options) => this.transport.sendRobonoMessage({
        ...input,
        external_user_id: this.externalUserId,
      }, options),
      list: async (input) => {
        const result = await this.transport.listRobonoMessages({
          ...input,
          external_user_id: this.externalUserId,
        });
        this.setMessages(
          input.connection_id,
          result.messages.map(normalizeRobonoMessage),
        );
        return result.messages;
      },
      mark: (input, options) => this.transport.markRobonoMessage({
        ...input,
        external_user_id: this.externalUserId,
      }, options),
    };
    this.connections = {
      connect: async (input, options) => {
        const targetIdentifier = normalizeEndpointIdentifier(
          input.target_identifier,
          input.endpoint,
        );
        if (input.endpoint.type === "robono_phone") {
          const raw = await this.robonoConnections.create({
            target_phone_e164: targetIdentifier,
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
          }, options);
          return normalizeRobonoConnection(raw, this.state.networks);
        }
        const raw = await this.networkConnections.request({
          target_app_id: input.endpoint.id,
          source_display_name: input.external_display_name,
          target_identifier: targetIdentifier,
          ...(input.target_contact_label
            ? { target_contact_label: input.target_contact_label }
            : {}),
          ...(input.external_profile
            ? { external_profile: input.external_profile }
            : {}),
          ...(input.capabilities ? { capabilities: input.capabilities } : {}),
          ...(typeof input.guardian_messaging_enabled === "boolean"
            ? {
              guardian_messaging_enabled: input.guardian_messaging_enabled,
            }
            : {}),
          ...(input.guardians ? { source_guardians: input.guardians } : {}),
          ...(input.monitoring_disclosure
            ? { monitoring_disclosure: input.monitoring_disclosure }
            : {}),
          ...(input.external_approval
            ? { external_approval: input.external_approval }
            : {}),
        }, options);
        return normalizeNetworkConnection(
          raw,
          this.state.networks,
          this.externalUserId,
        );
      },
      listPage: (input = {}) => this.fetchConnectionPage(input),
      listAll: (input = {}) => this.fetchAllConnections(input),
      list: async (input = {}) => {
        const result = await this.connections.listAll(input);
        this.patch({
          diagnostics: {
            ...this.state.diagnostics,
            connectionListTruncated: result.truncated,
          },
        });
        return result.connections;
      },
      update: async ({ connection, ...input }, options) => {
        if (connection.endpoint_type === "robono_phone") {
          const raw = await this.robonoConnections.updateProfile({
            connection_id: connection.connection_id,
            ...(input.display_name
              ? { external_display_name: input.display_name }
              : {}),
            ...(input.external_profile
              ? { external_profile: input.external_profile }
              : {}),
            ...(input.capabilities
              ? { capabilities: input.capabilities }
              : {}),
          }, options);
          return normalizeRobonoConnection(raw, this.state.networks);
        }
        const raw = await this.networkConnections.update({
          bridge_connection_id: connection.connection_id,
          ...(input.display_name ? { display_name: input.display_name } : {}),
          ...(input.external_profile
            ? { external_profile: input.external_profile }
            : {}),
          ...(input.capabilities
            ? { capabilities: input.capabilities }
            : {}),
          ...(input.guardians ? { guardians: input.guardians } : {}),
        }, options);
        return normalizeNetworkConnection(
          raw,
          this.state.networks,
          this.externalUserId,
        );
      },
      disconnect: async ({ connection, reason }, options) => {
        if (connection.endpoint_type === "robono_phone") {
          const raw = await this.robonoConnections.disconnect({
            connection_id: connection.connection_id,
            ...(reason ? { reason } : {}),
          }, options);
          return normalizeRobonoConnection(raw, this.state.networks);
        }
        const raw = await this.networkConnections.disconnect({
          bridge_connection_id: connection.connection_id,
          ...(reason ? { reason } : {}),
        }, options);
        return normalizeNetworkConnection(
          raw,
          this.state.networks,
          this.externalUserId,
        );
      },
    };
    this.messages = {
      send: async (input, options) => {
        const { connection, ...message } = input;
        assertMessageAllowed(connection, message, this.externalUserId);
        if (connection.endpoint_type === "robono_phone") {
          const raw = await this.robonoMessages.send({
            ...message,
            connection_id: connection.connection_id,
          }, options);
          return {
            endpoint_type: connection.endpoint_type,
            connection_id: connection.connection_id,
            message_id: requiredMessageId(
              raw.robono_message_id,
              "Robono did not return a message identifier.",
            ),
            status: raw.status,
            raw,
          };
        }
        const raw = await this.networkMessages.send({
          ...message,
          bridge_connection_id: connection.connection_id,
        }, options);
        return {
          endpoint_type: connection.endpoint_type,
          connection_id: connection.connection_id,
          message_id: requiredMessageId(
            raw.bridge_message_id,
            "Robono did not return a message identifier.",
          ),
          status: raw.status,
          raw,
        };
      },
      list: async ({ connection, ...input }) => {
        await this.messages.listPage({ connection, ...input });
        return this.state.messagesByConnection[connection.connection_id] ?? [];
      },
      listPage: (input) => this.fetchMessagePage(input),
      mark: async ({ connection, message_id, event, occurred_at }, options) => {
        if (connection.endpoint_type === "robono_phone") {
          const raw = await this.robonoMessages.mark({
            connection_id: connection.connection_id,
            robono_message_id: message_id,
            event,
            ...(occurred_at ? { occurred_at } : {}),
          }, options);
          return {
            endpoint_type: connection.endpoint_type,
            connection_id: connection.connection_id,
            message_id: raw.message_id || message_id,
            status: raw.status,
            raw,
          };
        }
        const raw = await this.networkMessages.mark({
          bridge_connection_id: connection.connection_id,
          bridge_message_id: message_id,
          event,
          ...(occurred_at ? { occurred_at } : {}),
        }, options);
        return {
          endpoint_type: connection.endpoint_type,
          connection_id: connection.connection_id,
          message_id: raw.bridge_message_id,
          status: raw.status,
          raw,
        };
      },
    };
    this.guardianMessages = {
      send: (input, options) =>
        this.transport.sendGuardianMessage({
          ...input,
          external_guardian_id: this.externalUserId,
        }, options),
      list: (input) =>
        this.transport.listGuardianMessages({
          ...input,
          external_guardian_id: this.externalUserId,
        }),
      mark: (input, options) =>
        this.transport.markGuardianMessage({
          ...input,
          external_guardian_id: this.externalUserId,
        }, options),
    };
    this.transforms = {
      message: (input, options) =>
        this.transport.transformMessage(input, options),
      speech: (input, options) =>
        this.transport.transformSpeech(input, options),
    };
    this.diagnostics = {
      reportPush: (input, options) =>
        this.transport.reportPushDiagnostic(input, options),
    };
  }

  getState(): ClientState {
    return cloneState(this.state);
  }

  subscribe(listener: (state: ClientState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<ClientStartResult> {
    if (this.startPromise) return this.startPromise;
    if (this.state.diagnostics.running) {
      return {
        ok: true,
        connectionCount: this.state.connections.length,
        synchronizedAt: this.state.diagnostics.lastPollAt ??
          new Date().toISOString(),
      };
    }
    const lifecycleVersion = ++this.lifecycleVersion;
    const pending = this.startInternal(lifecycleVersion);
    const tracked = pending.finally(() => {
      if (this.startPromise === tracked) this.startPromise = null;
    });
    this.startPromise = tracked;
    return tracked;
  }

  stop() {
    this.lifecycleVersion += 1;
    if (this.pollingTimer) clearTimeout(this.pollingTimer);
    this.pollingTimer = null;
    this.patch({ diagnostics: { ...this.state.diagnostics, running: false } });
  }

  async receivePush(event: RobonoPushEvent) {
    event = parseRobonoPushEvent(event);
    const now = new Date().toISOString();
    this.patch({
      diagnostics: {
        ...this.state.diagnostics,
        lastPushAt: now,
        lastUpdateVia: "push",
        pushEventsReceived: this.state.diagnostics.pushEventsReceived + 1,
      },
    });
    if (event.event === "bridge.directory_changed") {
      try {
        await this.networks.refresh();
        this.patch({ lastError: null });
      } catch (error) {
        this.patch({
          lastError: error instanceof Error
            ? error.message
            : "The endpoint directory could not be refreshed.",
        });
        throw error;
      }
      return;
    }
    const connectionId =
      "bridge_connection_id" in event &&
        typeof event.bridge_connection_id === "string"
        ? event.bridge_connection_id
        : "connection_id" in event && typeof event.connection_id === "string"
        ? event.connection_id
        : undefined;
    await this.sync("push", connectionId);
  }

  async sync(via: "push" | "polling" = "polling", connectionId?: string) {
    if (connectionId) this.queuedConnectionIds.add(connectionId);
    else this.queuedFullSync = true;
    if (via === "push") this.queuedSyncVia = "push";
    if (this.syncPromise) return this.syncPromise;
    const pending = this.drainSyncQueue();
    const tracked = pending.finally(() => {
      if (this.syncPromise === tracked) this.syncPromise = null;
    });
    this.syncPromise = tracked;
    return tracked;
  }

  private async startInternal(
    lifecycleVersion: number,
  ): Promise<ClientStartResult> {
    this.patch({ diagnostics: { ...this.state.diagnostics, running: true } });
    try {
      // Startup shares the synchronization queue with push and polling, so an
      // older initial response cannot overwrite a newer push-driven refresh.
      await this.sync("polling");
      if (this.state.lastError) throw new Error(this.state.lastError);
      if (
        lifecycleVersion !== this.lifecycleVersion ||
        !this.state.diagnostics.running
      ) {
        throw new Error("Robono was stopped before startup completed.");
      }
      this.schedulePoll();
      return {
        ok: true,
        connectionCount: this.state.connections.length,
        synchronizedAt: this.state.diagnostics.lastPollAt ??
          new Date().toISOString(),
      };
    } catch (cause) {
      if (lifecycleVersion === this.lifecycleVersion) {
        this.patch({
          diagnostics: { ...this.state.diagnostics, running: false },
        });
      }
      throw new RobonoClientStartError(
        cause instanceof Error
          ? `Robono could not start: ${cause.message}`
          : "Robono could not complete its initial synchronization.",
        { cause },
      );
    }
  }

  private async drainSyncQueue() {
    while (this.queuedFullSync || this.queuedConnectionIds.size) {
      const via = this.queuedSyncVia;
      this.queuedSyncVia = "polling";
      if (this.queuedFullSync) {
        this.queuedFullSync = false;
        this.queuedConnectionIds.clear();
        await this.performSync(via);
        continue;
      }
      const connectionIds = [...this.queuedConnectionIds];
      this.queuedConnectionIds.clear();
      for (const connectionId of connectionIds) {
        await this.performSync(via, connectionId);
      }
    }
  }

  private async performSync(
    via: "push" | "polling",
    connectionId?: string,
    throwOnError = false,
  ) {
    this.patch({ syncing: true, lastError: null });
    try {
      let connections: EndpointConnection[];
      if (connectionId) {
        const known = this.state.connections.find((item) =>
          item.connection_id === connectionId
        );
        if (known) {
          const refreshed = await this.refreshConnection(known);
          connections = refreshed ? [refreshed] : [];
        } else {
          connections = (await this.connections.listAll()).connections.filter(
            (item) => item.connection_id === connectionId,
          );
        }
      } else {
        connections = (await this.connections.listAll()).connections;
      }
      const activeConnections = connectionId
        ? connections.filter((item) => item.connection_id === connectionId)
        : connections.filter((item) =>
          item.status === "accepted" || item.status === "active"
        );
      let pollingRecoveries = this.state.diagnostics.pollingRecoveries;
      await mapWithConcurrency(activeConnections, 4, async (connection) => {
        const before =
          this.state.messagesByConnection[connection.connection_id] ?? [];
        const cursor =
          this.state.paginationByConnection[connection.connection_id]
            ?.sync_cursor;
        const page = await this.messages.listPage({
          connection,
          limit: 100,
          ...(cursor ? { after: cursor } : {}),
        });
        let nextAfter = page.next_after;
        let hasMore = page.has_more;
        for (let pageNumber = 1; hasMore && nextAfter && pageNumber < 100; pageNumber += 1) {
          const next = await this.messages.listPage({
            connection,
            limit: 100,
            after: nextAfter,
          });
          hasMore = next.has_more;
          nextAfter = next.next_after;
        }
        const messages =
          this.state.messagesByConnection[connection.connection_id] ?? [];
        if (via === "polling" && hasNewInbound(before, messages)) {
          pollingRecoveries += 1;
        }
      });
      const now = new Date().toISOString();
      this.patch({
        syncing: false,
        diagnostics: {
          ...this.state.diagnostics,
          ...(via === "polling" ? { lastPollAt: now } : {}),
          lastConnectionSyncAt: now,
          lastUpdateVia: via,
          pollingRecoveries,
        },
      });
      this.currentPollingIntervalMs = this.pollingIntervalMs;
    } catch (error) {
      this.patch({
        syncing: false,
        lastError: error instanceof Error
          ? error.message
          : "Robono synchronization failed.",
      });
      this.currentPollingIntervalMs = Math.min(
        this.maxPollingIntervalMs,
        this.currentPollingIntervalMs * 2,
      );
      if (throwOnError) throw error;
    }
  }

  private schedulePoll() {
    if (!this.pollingEnabled || !this.state.diagnostics.running) return;
    if (this.pollingTimer) clearTimeout(this.pollingTimer);
    const jitter = 1 + (this.random() * 2 - 1) * this.pollingJitterRatio;
    const delay = Math.max(
      1_000,
      Math.round(this.currentPollingIntervalMs * jitter),
    );
    this.pollingTimer = setTimeout(async () => {
      await this.sync("polling");
      this.schedulePoll();
    }, delay);
  }

  private async fetchConnectionPage(
    input: { limit?: number; cursor?: EndpointConnectionCursor } = {},
  ): Promise<EndpointConnectionPage> {
    if (
      !this.state.networks.length ||
      Date.now() - this.directoryRefreshedAt >= this.directoryTtlMs
    ) {
      await this.networks.refresh();
    }
    const limit = Math.min(100, positiveInteger(input.limit, 100));
    const cursor = input.cursor ?? {};
    const phase = cursor.phase ??
      (cursor.robono_before && !cursor.connected_app_before
        ? "robono_phone"
        : "connected_app");
    const connections: EndpointConnection[] = [];

    if (phase === "connected_app") {
      const networkPage = await this.transport.listNetworkConnections({
        external_user_id: this.externalUserId,
        limit,
        ...(cursor.connected_app_before
          ? { before: cursor.connected_app_before }
          : {}),
      });
      connections.push(...networkPage.connections.map((connection) =>
        normalizeNetworkConnection(
          connection,
          this.state.networks,
          this.externalUserId,
        )
      ));
      if (networkPage.has_more) {
        if (!networkPage.next_before) {
          throw new Error(
            "The Bridge returned an incomplete connection cursor.",
          );
        }
        return {
          connections,
          has_more: true,
          next_cursor: {
            phase: "connected_app",
            connected_app_before: networkPage.next_before,
          },
        };
      }
      if (connections.length >= limit) {
        return {
          connections,
          has_more: true,
          next_cursor: { phase: "robono_phone" },
        };
      }
    }

    const robonoPage = await this.transport.listRobonoConnections({
        external_user_id: this.externalUserId,
        limit: limit - connections.length,
        ...(cursor.robono_before
          ? { before: cursor.robono_before }
          : {}),
      });
    connections.push(...robonoPage.connections.map((connection) =>
        normalizeRobonoConnection(connection, this.state.networks)
      ));
    if (robonoPage.has_more && !robonoPage.next_before) {
      throw new Error("The Bridge returned an incomplete connection cursor.");
    }
    const nextCursor = robonoPage.has_more
      ? {
        phase: "robono_phone" as const,
        robono_before: robonoPage.next_before!,
      }
      : null;
    return {
      connections,
      has_more: robonoPage.has_more,
      next_cursor: nextCursor,
    };
  }

  private async fetchAllConnections(
    input: ConnectionListAllOptions = {},
  ): Promise<EndpointConnectionListResult> {
    const pageSize = Math.min(100, positiveInteger(input.pageSize, 100));
    const maxItems = positiveInteger(input.maxItems, 10_000);
    const all: EndpointConnection[] = [];
    let cursor: EndpointConnectionCursor | undefined;
    let truncated = false;
    for (;;) {
      const remaining = maxItems - all.length;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const page = await this.fetchConnectionPage({
        limit: Math.min(pageSize, remaining),
        ...(cursor ? { cursor } : {}),
      });
      all.push(...page.connections);
      if (!page.has_more || !page.next_cursor) {
        cursor = undefined;
        break;
      }
      if (sameConnectionCursor(cursor, page.next_cursor)) {
        cursor = page.next_cursor;
        truncated = true;
        break;
      }
      cursor = page.next_cursor;
    }
    const connections = dedupeConnections(all);
    if (!truncated) this.replaceConnections(connections);
    else {
      this.patch({
        connections: mergeConnections(this.state.connections, connections),
      });
    }
    this.patch({
      diagnostics: {
        ...this.state.diagnostics,
        connectionListTruncated: truncated,
      },
    });
    return {
      connections,
      truncated,
      next_cursor: truncated ? cursor ?? null : null,
    };
  }

  private async refreshConnection(connection: EndpointConnection) {
    if (connection.endpoint_type === "connected_app") {
      const page = await this.transport.listNetworkConnections({
        external_user_id: this.externalUserId,
        bridge_connection_id: connection.connection_id,
        limit: 1,
      });
      const raw = page.connections[0];
      if (!raw) {
        this.removeConnection(connection.connection_id);
        return null;
      }
      const normalized = normalizeNetworkConnection(
        raw,
        this.state.networks,
        this.externalUserId,
      );
      this.upsertConnection(normalized);
      return normalized;
    }
    const page = await this.transport.listRobonoConnections({
      external_user_id: this.externalUserId,
      connection_id: connection.connection_id,
      limit: 1,
    });
    const raw = page.connections[0];
    if (!raw) {
      this.removeConnection(connection.connection_id);
      return null;
    }
    const normalized = normalizeRobonoConnection(raw, this.state.networks);
    this.upsertConnection(normalized);
    return normalized;
  }

  private async fetchMessagePage(
    { connection, ...input }: PageOptions & {
      connection: EndpointConnection;
    },
  ): Promise<EndpointMessagePage> {
    let result: {
      has_more: boolean;
      next_before: string | null;
      next_after?: string | null;
      sync_cursor?: string | null;
    };
    let messages: EndpointMessage[];
    if (connection.endpoint_type === "robono_phone") {
      const page = await this.transport.listRobonoMessages({
        ...input,
        connection_id: connection.connection_id,
        external_user_id: this.externalUserId,
      });
      result = page;
      messages = page.messages.map(normalizeRobonoMessage);
    } else {
      const page = await this.transport.listNetworkMessages({
        ...input,
        bridge_connection_id: connection.connection_id,
        external_user_id: this.externalUserId,
      });
      result = page;
      messages = page.messages.map(normalizeNetworkMessage);
    }
    this.setMessages(connection.connection_id, messages);
    const nextAfter = result.next_after ??
      (input.after && messages.length
        ? messages[messages.length - 1]?.created_at ?? null
        : null);
    const syncCursor = result.sync_cursor ??
      latestCreatedAt(
        this.state.messagesByConnection[connection.connection_id] ?? [],
      ) ?? input.after ?? null;
    this.patch({
      paginationByConnection: {
        ...this.state.paginationByConnection,
        [connection.connection_id]: {
          has_more: result.has_more,
          next_before: result.next_before,
          sync_cursor: syncCursor,
        },
      },
    });
    return {
      messages,
      has_more: result.has_more,
      next_before: result.next_before,
      next_after: nextAfter,
      sync_cursor: syncCursor,
    };
  }

  private upsertConnection(connection: EndpointConnection) {
    this.patch({
      connections: mergeConnections(this.state.connections, [connection]),
    });
  }

  private replaceConnections(connections: EndpointConnection[]) {
    const ids = new Set(connections.map((item) => item.connection_id));
    this.patch({
      connections: [...connections].sort(compareConnections),
      messagesByConnection: Object.fromEntries(
        Object.entries(this.state.messagesByConnection).filter(([id]) =>
          ids.has(id)
        ),
      ),
      paginationByConnection: Object.fromEntries(
        Object.entries(this.state.paginationByConnection).filter(([id]) =>
          ids.has(id)
        ),
      ),
    });
  }

  private removeConnection(connectionId: string) {
    const messagesByConnection = { ...this.state.messagesByConnection };
    const paginationByConnection = { ...this.state.paginationByConnection };
    delete messagesByConnection[connectionId];
    delete paginationByConnection[connectionId];
    this.patch({
      connections: this.state.connections.filter((item) =>
        item.connection_id !== connectionId
      ),
      messagesByConnection,
      paginationByConnection,
    });
  }

  private setMessages(connectionId: string, messages: EndpointMessage[]) {
    this.patch({
      messagesByConnection: {
        ...this.state.messagesByConnection,
        [connectionId]: mergeMessages(
          this.state.messagesByConnection[connectionId] ?? [],
          messages,
        ),
      },
    });
  }

  private patch(patch: Partial<ClientState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.getState());
  }
}

function initialState(): ClientState {
  return {
    networks: [],
    connections: [],
    messagesByConnection: {},
    paginationByConnection: {},
    syncing: false,
    lastError: null,
    diagnostics: {
      running: false,
      lastPushAt: null,
      lastPollAt: null,
      lastConnectionSyncAt: null,
      lastUpdateVia: null,
      pushEventsReceived: 0,
      pollingRecoveries: 0,
      connectionListTruncated: false,
    },
  };
}

function mergeConnections(
  current: EndpointConnection[],
  incoming: EndpointConnection[],
) {
  const byId = new Map(
    current.map((item) => [item.connection_id, item]),
  );
  for (const item of incoming) byId.set(item.connection_id, item);
  return [...byId.values()].sort(compareConnections);
}

function compareConnections(a: EndpointConnection, b: EndpointConnection) {
  const byDate = String(b.created_at ?? "").localeCompare(
    String(a.created_at ?? ""),
  );
  return byDate || a.connection_id.localeCompare(b.connection_id);
}

function dedupeConnections(connections: EndpointConnection[]) {
  return mergeConnections([], connections);
}

function sameConnectionCursor(
  left: EndpointConnectionCursor | undefined,
  right: EndpointConnectionCursor,
) {
  return left?.phase === right.phase &&
    left?.connected_app_before === right.connected_app_before &&
    left?.robono_before === right.robono_before;
}

function mergeMessages(
  current: EndpointMessage[],
  incoming: EndpointMessage[],
) {
  const byId = new Map(current.map((item) => [item.message_id, item]));
  for (const item of incoming) byId.set(item.message_id, item);
  return [...byId.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
}

function hasNewInbound(before: EndpointMessage[], after: EndpointMessage[]) {
  const known = new Set(before.map((item) => item.message_id));
  return after.some((item) =>
    item.direction === "inbound" && !known.has(item.message_id)
  );
}

function cloneState(state: ClientState): ClientState {
  return deepClone(state);
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deepClone(item)]),
    ) as T;
  }
  return value;
}

function latestCreatedAt(messages: EndpointMessage[]) {
  let latest: string | null = null;
  for (const message of messages) {
    if (!latest || message.created_at > latest) latest = message.created_at;
  }
  return latest;
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  operation: (item: T) => Promise<void>,
) {
  let index = 0;
  const workers = Array.from(
    { length: Math.min(items.length, Math.max(1, concurrency)) },
    async () => {
      while (index < items.length) {
        const item = items[index];
        index += 1;
        if (item !== undefined) await operation(item);
      }
    },
  );
  await Promise.all(workers);
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function boundedRatio(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(value, 0.5))
    : fallback;
}

function requiredMessageId(value: unknown, message: string) {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(message);
}

function normalizeEndpointIdentifier(
  raw: string,
  endpoint: NetworkDirectoryEntry,
) {
  const rules = endpoint.accepted_identifier;
  let value = String(raw ?? "");
  switch (rules.normalization ?? "trim") {
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
  ) {
    value = value.toLowerCase();
  }
  const minLength = rules.min_length ?? 1;
  const maxLength = rules.max_length ?? 240;
  if (value.length < minLength || value.length > maxLength) {
    throw new Error(
      `${rules.label} must contain ${minLength} to ${maxLength} characters.`,
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

function assertMessageAllowed(
  connection: EndpointConnection,
  value: unknown,
  externalUserId: string,
) {
  const input = record(value);
  if (!input) throw new Error("Message input must be an object.");
  const kind = string(input.message_kind);
  if (!kind) throw new Error("message_kind is required.");

  const capabilities = record(connection.capabilities) ?? {};
  const directional = directionCapabilities(
    connection,
    capabilities,
    externalUserId,
  );
  const allowed = stringArray(
    directional.allowed_message_kinds ??
      capabilities.allowed_outbound_message_kinds,
  );
  if (allowed.length && !allowed.includes(kind)) {
    throw new Error(
      `${kind} messages are not allowed by this connection's capabilities.`,
    );
  }

  if (kind === "text") {
    const text = record(directional.text) ?? record(capabilities.text) ?? {};
    const maximum = number(text.max_characters);
    const body = string(input.text_body);
    if (maximum && body.length > maximum) {
      throw new Error(`Text messages are limited to ${maximum} characters.`);
    }
    return;
  }

  const capabilityKey = kind === "image" ? "photo" : kind;
  const mediaLimits = record(directional[capabilityKey]) ??
    record(capabilities[capabilityKey]) ?? {};
  const media = record(input.media);
  if (!media) throw new Error(`${kind} messages require media.`);
  const maximumBytes = number(mediaLimits.max_file_bytes);
  const byteSize = number(media.byte_size);
  if (maximumBytes && byteSize && byteSize > maximumBytes) {
    throw new Error(`${kind} media exceeds the ${maximumBytes}-byte limit.`);
  }
  const maximumDuration = number(mediaLimits.max_duration_ms);
  const duration = number(media.duration_ms);
  if (maximumDuration && duration && duration > maximumDuration) {
    throw new Error(
      `${kind} media exceeds the ${maximumDuration}-millisecond duration limit.`,
    );
  }
  const allowedMimeTypes = stringArray(mediaLimits.allowed_input_mime_types);
  const mimeType = string(media.mime_type);
  if (
    allowedMimeTypes.length && mimeType &&
    !allowedMimeTypes.includes(mimeType)
  ) {
    throw new Error(`${mimeType} is not allowed for ${kind} messages.`);
  }
}

function directionCapabilities(
  connection: EndpointConnection,
  capabilities: Record<string, unknown>,
  externalUserId: string,
) {
  if (connection.endpoint_type !== "connected_app") return capabilities;
  const raw = record(connection.raw);
  const source = record(raw?.source);
  const ownSource = string(source?.external_user_id) === externalUserId;
  return record(
    ownSource
      ? capabilities.from_source_to_target
      : capabilities.from_target_to_source,
  ) ?? capabilities;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string =>
      typeof item === "string" && item.length > 0
    )
    : [];
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function normalizeNetworkConnection(
  raw: NetworkConnection,
  directory: NetworkDirectoryEntry[],
  externalUserId: string,
): EndpointConnection {
  const source = record(raw.source);
  const target = record(raw.target);
  const sourceApp = record(source?.app);
  const targetApp = record(target?.app);
  const ownSource = source?.external_user_id === externalUserId;
  const otherApp = ownSource ? targetApp : sourceApp;
  const other = ownSource ? target : source;
  const endpoint = directory.find((item) =>
    item.type === "connected_app" &&
    (item.id === otherApp?.id || item.slug === otherApp?.slug)
  ) ?? endpointFromApp(otherApp);
  return {
    endpoint,
    endpoint_type: "connected_app",
    connection_id: raw.bridge_connection_id,
    status: raw.status,
    capabilities: raw.capabilities,
    peer: networkPeer(endpoint, other, ownSource),
    created_at: raw.created_at,
    raw,
  };
}

function normalizeRobonoConnection(
  raw: RobonoConnection,
  directory: NetworkDirectoryEntry[],
): EndpointConnection {
  const endpoint = directory.find((item) => item.type === "robono_phone") ??
    phoneEndpoint();
  const user = record(raw.robono_user);
  const avatarUrl = string(user?.avatar_url) || null;
  return {
    endpoint,
    endpoint_type: "robono_phone",
    connection_id: raw.connection_id,
    status: raw.status,
    capabilities: raw.capabilities,
    peer: {
      endpoint,
      external_user_id: string(user?.id) || null,
      display_name: string(user?.display_name) ||
        raw.target_contact_label || raw.phone_masked || null,
      identifier: raw.phone_masked,
      avatar_url: avatarUrl,
      avatar_version: string(user?.avatar_version) || null,
      profile: user ?? {},
    },
    created_at: raw.created_at ?? null,
    raw,
  };
}

function networkPeer(
  endpoint: NetworkDirectoryEntry,
  side: Record<string, unknown> | null,
  ownSource: boolean,
) {
  const profile = record(side?.profile) ?? {};
  const avatar = record(profile.avatar);
  return {
    endpoint,
    external_user_id: string(side?.external_user_id) || null,
    display_name: string(side?.display_name) ||
      string(profile.display_name) || null,
    identifier: ownSource ? string(side?.identifier) || null : null,
    avatar_url: string(avatar?.source_url) || null,
    avatar_version: string(avatar?.version) || null,
    profile,
  };
}

function normalizeNetworkMessage(raw: NetworkMessage): EndpointMessage {
  return {
    endpoint_type: "connected_app",
    connection_id: raw.bridge_connection_id,
    message_id: raw.bridge_message_id,
    direction: raw.direction,
    external_message_id: raw.external_message_id,
    message_kind: raw.message_kind,
    text_body: raw.text_body,
    media: raw.media,
    status: raw.status,
    accepted_at: raw.accepted_at,
    accepted_via: raw.accepted_via,
    delivered_at: raw.delivered_at,
    read_at: raw.read_at,
    heard_at: raw.heard_at,
    failed_at: raw.failed_at,
    failure_code: raw.failure_code,
    created_at: raw.created_at,
    raw,
  };
}

function normalizeRobonoMessage(raw: RobonoMessage): EndpointMessage {
  return {
    endpoint_type: "robono_phone",
    connection_id: raw.connection_id,
    message_id: raw.robono_message_id,
    direction: raw.direction,
    external_message_id: raw.external_message_id,
    message_kind: raw.message_kind,
    text_body: raw.text_body,
    media: raw.media,
    status: raw.status,
    accepted_at: null,
    accepted_via: null,
    delivered_at: raw.delivered_at,
    read_at: raw.read_at,
    heard_at: raw.heard_at,
    failed_at: raw.failed_at,
    failure_code: raw.failure_code,
    created_at: raw.created_at,
    raw,
  };
}

function endpointFromApp(
  app: Record<string, unknown> | null,
): NetworkDirectoryEntry {
  const id = string(app?.id) || string(app?.slug) || "connected-app";
  return {
    type: "connected_app",
    id,
    slug: string(app?.slug) || id,
    display_name: string(app?.display_name) || "Connected app",
    description: "",
    icon_url: "",
    accepts_inbound_bridge_requests: true,
    accepted_identifier: {
      label: "Identifier",
      description: "The identifier required by this endpoint.",
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

function phoneEndpoint(): NetworkDirectoryEntry {
  return {
    type: "robono_phone",
    id: "robono-phone",
    slug: "robono-phone",
    display_name: "Robono",
    description: "",
    icon_url: "",
    accepts_inbound_bridge_requests: true,
    accepted_identifier: {
      label: "Phone number",
      description: "The phone number used by the contact.",
      example: "+15551234567",
      format: "e164",
      input_type: "tel",
      pattern: "^\\+[1-9][0-9]{7,14}$",
      min_length: 8,
      max_length: 16,
      normalization: "e164",
      case_sensitive: false,
    },
    default_capabilities: {},
  };
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}
