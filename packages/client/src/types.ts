export type MessageKind = "text" | "voice" | "image" | "video" | "document";
export type MessageStatus =
  | "stored"
  | "accepted"
  | "delivered"
  | "read"
  | "heard"
  | "failed"
  | "replaced";

export type ConnectionStatus =
  | "pending_target_approval"
  | "accepted"
  | "rejected"
  | "not_found"
  | "blocked"
  | "disconnected"
  | "expired";

export type JsonObject = Record<string, unknown>;

export interface IdentifierDescription {
  label: string;
  description: string;
  example: string;
  format: string;
  input_type: "text" | "tel" | "email" | "number";
  pattern?: string;
  min_length: number;
  max_length: number;
  normalization: "none" | "trim" | "lowercase" | "uppercase" | "e164";
  case_sensitive: boolean;
}

export interface NetworkDirectoryEntry {
  type: "connected_app" | "robono_phone";
  id: string;
  slug: string;
  display_name: string;
  description: string;
  icon_url: string;
  accepts_inbound_bridge_requests: boolean;
  accepted_identifier: IdentifierDescription;
  default_capabilities: ConnectionCapabilities;
}

export interface Language {
  code: string;
  name: string;
}

export interface LanguageResponse extends JsonObject {
  languages: Language[];
}

export interface Guardian {
  external_guardian_id: string;
  display_name?: string | null;
  relationship_to_child?: string | null;
  avatar_url?: string | null;
}

export interface ExternalProfile {
  display_name?: string;
  avatar?: {
    source_url: string;
    mime_type?: string;
    version?: string;
    updated_at?: string;
  };
}

export interface MediaOutputPreference {
  preferred_mime_type?: string;
  preferred_codec?: string;
  transcoding?: "off" | "preferred" | "required";
}

export interface MediaCapability {
  max_duration_ms?: number;
  max_file_bytes?: number;
  allowed_input_mime_types?: string[];
  max_width_px?: number;
  max_height_px?: number;
  max_items_per_message?: number;
  strip_metadata?: boolean;
  output?: MediaOutputPreference;
}

export interface DirectionCapabilities {
  allowed_message_kinds: MessageKind[];
  text?: { max_characters?: number };
  voice?: MediaCapability;
  photo?: MediaCapability;
  video?: MediaCapability;
  document?: MediaCapability;
  limitations?: unknown[];
}

export interface ConnectionCapabilities extends JsonObject {
  protocol_version?: string;
  allowed_outbound_message_kinds?: MessageKind[];
  allowed_inbound_message_kinds?: MessageKind[];
  history?: {
    max_items: number | null;
    message_expires_after_seconds: number | null;
  };
  text?: { max_characters?: number };
  voice?: MediaCapability;
  photo?: MediaCapability;
  video?: MediaCapability;
  document?: MediaCapability;
  receive_voice_waveforms?: boolean;
  receive_delivery_events?: boolean;
  receive_message_heard_events?: boolean;
  emoji_reactions?: boolean | { allowed: boolean };
  from_source_to_target?: DirectionCapabilities;
  from_target_to_source?: DirectionCapabilities;
  source?: ConnectionCapabilities;
  target?: ConnectionCapabilities;
}

export interface AppIdentity {
  id: string;
  slug?: string;
  display_name?: string;
}

export interface BridgeSourceParticipant {
  app: NetworkDirectoryEntry | AppIdentity;
  external_user_id: string;
  display_name: string;
  profile?: ExternalProfile;
  guardians?: Guardian[];
}

export interface BridgeTargetParticipant {
  app: NetworkDirectoryEntry | AppIdentity;
  identifier: string;
  external_user_id: string | null;
  display_name: string | null;
  profile?: ExternalProfile;
  contact_label?: string | null;
  guardians?: Guardian[];
}

export interface NetworkConnection extends JsonObject {
  bridge_connection_id: string;
  status: ConnectionStatus;
  source: BridgeSourceParticipant;
  target: BridgeTargetParticipant;
  guardian_messaging_enabled: boolean;
  capabilities: ConnectionCapabilities;
  created_at: string | null;
}

export interface MediaInput extends JsonObject {
  source_url: string;
  mime_type: string;
  byte_size?: number;
  duration_ms?: number;
  file_name?: string;
  waveform?: number[];
}

export interface AttachmentBatch {
  /** Caller-generated identity shared by the media items sent together. */
  id: string;
  /** Zero-based order of this item within the batch. */
  index: number;
  /** Total number of media items in the batch. */
  count: number;
}

export interface NetworkMessage extends JsonObject {
  bridge_message_id: string;
  bridge_connection_id: string;
  direction: "inbound" | "outbound";
  sender_external_user_id: string;
  external_message_id: string;
  message_kind: MessageKind;
  text_body: string | null;
  media: MediaInput | JsonObject;
  status: MessageStatus;
  accepted_at: string | null;
  accepted_via: "push" | "polling" | null;
  delivered_at: string | null;
  read_at: string | null;
  heard_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  created_at: string;
  attachment_batch?: AttachmentBatch;
}

export type MessageContent =
  | { message_kind: "text"; text_body: string }
  | {
    message_kind: "voice" | "image" | "video" | "document";
    media: MediaInput;
    text_body?: string;
    attachment_batch?: AttachmentBatch;
  };

export type RequestNetworkConnectionInput = {
  target_app_id?: string;
  target_app_slug?: string;
  source_display_name: string;
  target_identifier: string;
  target_contact_label?: string;
  external_profile?: ExternalProfile;
  capabilities?: ConnectionCapabilities;
  guardian_messaging_enabled?: boolean;
  source_guardians?: Guardian[];
  monitoring_disclosure?: string;
  external_approval?: JsonObject;
};

export type RespondNetworkConnectionInput =
  | {
    bridge_connection_id: string;
    status: "accepted";
    target_display_name: string;
    external_profile?: ExternalProfile;
    target_guardians?: Guardian[];
    capabilities?: ConnectionCapabilities;
    response_details?: JsonObject;
  }
  | {
    bridge_connection_id: string;
    status: "rejected" | "not_found";
    response_details?: JsonObject;
  };

export interface RobonoConnection extends JsonObject {
  connection_id: string;
  conversation_id: string | null;
  status: "active" | "pending_invite" | "blocked" | "disconnected" | "expired";
  external_user_id: string;
  external_display_name: string | null;
  target_contact_label: string | null;
  capabilities: ConnectionCapabilities;
  robono_user: (JsonObject & {
    id?: string;
    display_name?: string | null;
    avatar_url?: string | null;
    avatar_version?: string | null;
  }) | null;
  phone_masked: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RobonoMessage extends JsonObject {
  robono_message_id: string;
  connection_id: string;
  direction: "inbound" | "outbound";
  external_message_id: string | null;
  message_kind: MessageKind;
  text_body: string | null;
  media: MediaInput | JsonObject;
  status: string;
  delivered_at: string | null;
  read_at: string | null;
  heard_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  created_at: string;
  attachment_batch?: AttachmentBatch;
}

export interface EndpointConnection {
  endpoint: NetworkDirectoryEntry;
  endpoint_type: NetworkDirectoryEntry["type"];
  connection_id: string;
  status: ConnectionStatus | RobonoConnection["status"];
  capabilities: ConnectionCapabilities;
  peer: EndpointPeer;
  created_at: string | null;
  raw: NetworkConnection | RobonoConnection;
}

export interface EndpointPeer {
  endpoint: NetworkDirectoryEntry;
  external_user_id: string | null;
  display_name: string | null;
  identifier: string | null;
  avatar_url: string | null;
  avatar_version: string | null;
  profile: ExternalProfile | JsonObject;
}

export interface EndpointMessage {
  endpoint_type: NetworkDirectoryEntry["type"];
  connection_id: string;
  message_id: string;
  direction: "inbound" | "outbound";
  external_message_id: string | null;
  message_kind: MessageKind;
  text_body: string | null;
  media: MediaInput | JsonObject;
  status: string;
  accepted_at: string | null;
  accepted_via: "push" | "polling" | null;
  delivered_at: string | null;
  read_at: string | null;
  heard_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  created_at: string;
  attachment_batch?: AttachmentBatch;
  raw: NetworkMessage | RobonoMessage;
}

export interface ConnectEndpointInput {
  endpoint: NetworkDirectoryEntry;
  external_display_name: string;
  target_identifier: string;
  target_contact_label?: string;
  external_profile?: ExternalProfile;
  capabilities?: ConnectionCapabilities;
  guardian_messaging_enabled?: boolean;
  guardians?: Guardian[];
  monitoring_disclosure?: string;
  external_approval?: JsonObject;
}

export type SendEndpointMessageInput = MessageContent & {
  connection: EndpointConnection;
  external_message_id: string;
  send_invite_sms_if_pending?: boolean;
  external_profile?: ExternalProfile;
};

export interface EndpointMessageSendResult {
  endpoint_type: NetworkDirectoryEntry["type"];
  connection_id: string;
  message_id: string;
  status: string;
  raw: JsonObject;
}

export interface UpdateEndpointConnectionInput {
  connection: EndpointConnection;
  display_name?: string;
  external_profile?: ExternalProfile;
  capabilities?: ConnectionCapabilities;
  guardians?: Guardian[];
}

export interface DisconnectEndpointConnectionInput {
  connection: EndpointConnection;
  reason?: string;
}

export interface MarkEndpointMessageInput {
  connection: EndpointConnection;
  message_id: string;
  event: "delivered" | "read" | "heard";
  occurred_at?: string;
}

export interface CreateRobonoConnectionInput {
  target_phone_e164: string;
  external_display_name: string;
  external_profile?: ExternalProfile;
  target_contact_label?: string;
  monitoring_disclosure?: string;
  external_approval?: JsonObject;
  capabilities?: ConnectionCapabilities;
}

export type SendMessageInput = MessageContent & {
  bridge_connection_id: string;
  external_message_id: string;
};

export type SendRobonoMessageInput = MessageContent & {
  connection_id: string;
  external_message_id: string;
  send_invite_sms_if_pending?: boolean;
  external_profile?: ExternalProfile;
};

export interface SendNetworkMessageResponse extends JsonObject {
  bridge_message_id: string;
  status: MessageStatus;
}

export interface SendRobonoMessageResponse extends JsonObject {
  robono_message_id: string;
  status: string;
}

export interface MarkRobonoMessageInput {
  connection_id: string;
  robono_message_id: string;
  event: "delivered" | "read" | "heard";
  occurred_at?: string;
}

export interface MessageEventResponse extends JsonObject {
  message_id: string;
  status: string;
  occurred_at: string;
}

export interface GuardianMessage extends JsonObject {
  guardian_message_id: string;
  bridge_connection_id: string;
  direction: "inbound" | "outbound";
  sender_external_guardian_id: string;
  external_message_id: string;
  message_kind: "text";
  text_body: string;
  status: Exclude<MessageStatus, "heard">;
  accepted_at: string | null;
  accepted_via: "push" | "polling" | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  created_at: string;
}

export interface SendGuardianMessageInput {
  bridge_connection_id: string;
  external_message_id: string;
  text_body: string;
  message_kind?: "text";
}

export interface SendGuardianMessageResponse extends JsonObject {
  guardian_message_id: string;
  status: string;
}

export interface GuardianMessageList extends JsonObject {
  messages: GuardianMessage[];
  has_more: boolean;
  next_before: string | null;
}

export interface GuardianMessageEventResponse extends JsonObject {
  guardian_message_id: string;
  status: string;
  occurred_at: string;
}

export type TransformOutput =
  | "transcript"
  | "translated_text"
  | "voice"
  | "translated_voice";

export type SpeechTransformInput =
  | {
    external_request_id?: string;
    input: {
      type: "text";
      text: string;
      language?: string | null;
    };
    outputs: TransformOutput[];
    target_language?: string | null;
    voice?: string | null;
  }
  | {
    external_request_id?: string;
    input: {
      type: "audio";
      source_url: string;
      mime_type?: string;
      language?: string | null;
    };
    outputs: TransformOutput[];
    target_language?: string | null;
    voice?: string | null;
  };

export interface MessageTransformInput {
  connection_id: string;
  message_id: string;
  outputs: TransformOutput[];
  source_language?: string | null;
  target_language?: string | null;
  voice?: string | null;
}

export interface ClientRequestOptions {
  /**
   * A caller-generated stable value. Reuse it when retrying the same write.
   */
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
  /** Override the transport's bounded retry count for this request. */
  retries?: number;
}

export interface TransformRequestOptions extends ClientRequestOptions {
  /**
   * A caller-generated stable value. Reuse it when retrying the same
   * transform so a timeout cannot create or charge for the work twice.
   */
  idempotencyKey: string;
}

export interface TextTransformArtifact extends JsonObject {
  text: string;
  language: string | null;
  target_language?: string;
  cached: boolean;
}

export interface GeneratedSpeechMedia extends JsonObject {
  source_url: string;
  source_url_expires_at: string;
  mime_type: string;
  duration_ms: number | null;
  byte_size: number;
  waveform?: number[];
  generated_by: "robono";
  generated_kind: "tts_audio";
}

export interface VoiceTransformArtifact extends JsonObject {
  media_object_id: string | null;
  media: GeneratedSpeechMedia | null;
  language: string | null;
  target_language?: string;
  cached: boolean;
  disclosure: "Generated voice";
}

export interface TransformArtifacts extends JsonObject {
  transcript?: TextTransformArtifact;
  translated_text?: TextTransformArtifact;
  voice?: VoiceTransformArtifact;
  translated_voice?: VoiceTransformArtifact;
}

export interface TransformResponse extends JsonObject {
  ok: true;
  request_id: string;
  status: "completed";
  processing: "synchronous";
  connection_id?: string;
  message_id?: string;
  external_request_id?: string | null;
  artifacts: TransformArtifacts;
  billing: {
    bill_to: "integration" | "sandbox";
    charged: boolean;
    operation_count: number;
    operations: Array<{
      type: "transcription" | "translation" | "tts";
      quantity: 1;
      billable: boolean;
    }>;
    cache_reused: boolean;
  };
  test_mode?: boolean;
}

export interface PageOptions {
  limit?: number;
  before?: string;
  after?: string;
}

export interface ConnectionList extends JsonObject {
  connections: NetworkConnection[];
  has_more: boolean;
  next_before: string | null;
}

export interface MessageList extends JsonObject {
  messages: NetworkMessage[];
  has_more: boolean;
  next_before: string | null;
  next_after?: string | null;
  sync_cursor?: string | null;
}

export interface EndpointMessagePage {
  messages: EndpointMessage[];
  has_more: boolean;
  next_before: string | null;
  next_after: string | null;
  sync_cursor: string | null;
}

export interface EndpointConnectionCursor {
  phase?: "connected_app" | "robono_phone";
  connected_app_before?: string;
  robono_before?: string;
}

export interface EndpointConnectionPage {
  connections: EndpointConnection[];
  has_more: boolean;
  next_cursor: EndpointConnectionCursor | null;
}

export interface ConnectionListAllOptions {
  pageSize?: number;
  maxItems?: number;
}

export interface EndpointConnectionListResult {
  connections: EndpointConnection[];
  truncated: boolean;
  next_cursor: EndpointConnectionCursor | null;
}

export interface RobonoConnectionList extends JsonObject {
  connections: RobonoConnection[];
  has_more: boolean;
  next_before: string | null;
}

export interface RobonoMessageList extends JsonObject {
  messages: RobonoMessage[];
  has_more: boolean;
  next_before: string | null;
  next_after?: string | null;
  sync_cursor?: string | null;
}

export type PushDiagnosticStage =
  | "provider_accepted"
  | "device_received"
  | "content_fetched"
  | "rendered"
  | "polling_recovered"
  | "failed";

export interface ReportPushDiagnosticInput {
  diagnostic_id: string;
  diagnostic_token: string;
  stage: PushDiagnosticStage;
  failure_stage?: string;
  failure_reason?: string;
  platform?: string;
  provider?: string;
  app_version?: string;
  detail?: string;
}

export interface PushDiagnosticResponse extends JsonObject {
  ok: true;
  request_id: string;
  diagnostic: JsonObject;
}

export interface RobonoClientTransport {
  listNetworks(): Promise<{ directory: NetworkDirectoryEntry[] }>;
  /** Added in 0.5.5. Optional so existing custom transports remain source-compatible. */
  listLanguages?(): Promise<LanguageResponse>;
  requestNetworkConnection(
    input: RequestNetworkConnectionInput & { external_user_id: string },
    options?: ClientRequestOptions,
  ): Promise<NetworkConnection>;
  respondNetworkConnection(
    input: RespondNetworkConnectionInput & { target_external_user_id: string },
    options?: ClientRequestOptions,
  ): Promise<NetworkConnection>;
  listNetworkConnections(
    input: PageOptions & {
      external_user_id: string;
      status?: string;
      bridge_connection_id?: string;
    },
  ): Promise<ConnectionList>;
  disconnectNetworkConnection(input: {
    bridge_connection_id: string;
    external_user_id: string;
    reason?: string;
  }, options?: ClientRequestOptions): Promise<NetworkConnection>;
  updateNetworkConnection(input: {
    bridge_connection_id: string;
    external_user_id: string;
    display_name?: string;
    external_profile?: ExternalProfile;
    capabilities?: ConnectionCapabilities;
    guardians?: Guardian[];
  }, options?: ClientRequestOptions): Promise<NetworkConnection>;
  createRobonoConnection(
    input: CreateRobonoConnectionInput & { external_user_id: string },
    options?: ClientRequestOptions,
  ): Promise<RobonoConnection>;
  listRobonoConnections(
    input: PageOptions & {
      external_user_id: string;
      status?: string;
      connection_id?: string;
    },
  ): Promise<RobonoConnectionList>;
  updateRobonoConnection(input: JsonObject & {
    connection_id: string;
    external_user_id: string;
  }, options?: ClientRequestOptions): Promise<RobonoConnection>;
  disconnectRobonoConnection(input: {
    connection_id: string;
    external_user_id: string;
    reason?: string;
  }, options?: ClientRequestOptions): Promise<RobonoConnection>;
  sendNetworkMessage(
    input: SendMessageInput & { external_user_id: string },
    options?: ClientRequestOptions,
  ): Promise<SendNetworkMessageResponse>;
  listNetworkMessages(
    input: PageOptions & {
      bridge_connection_id: string;
      external_user_id: string;
    },
  ): Promise<MessageList>;
  markNetworkMessage(input: {
    bridge_connection_id: string;
    bridge_message_id: string;
    event: "delivered" | "read" | "heard";
    occurred_at?: string;
  }, options?: ClientRequestOptions): Promise<{
    bridge_message_id: string;
    status: MessageStatus;
  }>;
  sendRobonoMessage(
    input: SendRobonoMessageInput & { external_user_id: string },
    options?: ClientRequestOptions,
  ): Promise<SendRobonoMessageResponse>;
  listRobonoMessages(
    input: PageOptions & {
      connection_id: string;
      external_user_id: string;
    },
  ): Promise<RobonoMessageList>;
  markRobonoMessage(
    input: MarkRobonoMessageInput & { external_user_id: string },
    options?: ClientRequestOptions,
  ): Promise<MessageEventResponse>;
  sendGuardianMessage(
    input: SendGuardianMessageInput & { external_guardian_id: string },
    options?: ClientRequestOptions,
  ): Promise<SendGuardianMessageResponse>;
  listGuardianMessages(
    input: PageOptions & {
      bridge_connection_id: string;
      external_guardian_id: string;
    },
  ): Promise<GuardianMessageList>;
  markGuardianMessage(
    input: {
      bridge_connection_id: string;
      guardian_message_id: string;
      external_guardian_id: string;
      event: "delivered" | "read";
      occurred_at?: string;
    },
    options?: ClientRequestOptions,
  ): Promise<GuardianMessageEventResponse>;
  transformMessage(
    input: MessageTransformInput,
    options: TransformRequestOptions,
  ): Promise<TransformResponse>;
  transformSpeech(
    input: SpeechTransformInput,
    options: TransformRequestOptions,
  ): Promise<TransformResponse>;
  reportPushDiagnostic(
    input: ReportPushDiagnosticInput,
    options?: ClientRequestOptions,
  ): Promise<PushDiagnosticResponse>;
}

export interface ClientStartResult {
  ok: true;
  connectionCount: number;
  synchronizedAt: string;
}

export interface ClientState {
  networks: NetworkDirectoryEntry[];
  connections: EndpointConnection[];
  messagesByConnection: Record<string, EndpointMessage[]>;
  paginationByConnection: Record<string, {
    has_more: boolean;
    next_before: string | null;
    sync_cursor: string | null;
  }>;
  syncing: boolean;
  lastError: string | null;
  diagnostics: {
    running: boolean;
    lastPushAt: string | null;
    lastPollAt: string | null;
    lastConnectionSyncAt: string | null;
    lastUpdateVia: "push" | "polling" | null;
    pushEventsReceived: number;
    pollingRecoveries: number;
    connectionListTruncated: boolean;
  };
}

export type RobonoPushEventName =
  | "connection.status_changed"
  | "connection.profile_updated"
  | "message.created"
  | "message.delivered"
  | "message.heard"
  | "message.reaction_updated"
  | "bridge.connection_requested"
  | "bridge.connection_status_changed"
  | "bridge.connection_updated"
  | "bridge.directory_changed"
  | "bridge.message_created"
  | "bridge.message_status_changed"
  | "bridge.guardian_message_created"
  | "bridge.guardian_message_status_changed"
  | "transform.completed"
  | "transform.failed"
  | "diagnostic.push_requested";

export interface RobonoPushEventBase extends JsonObject {
  event: RobonoPushEventName;
  event_id?: string;
}

export interface RobonoConnectionPushEvent extends RobonoPushEventBase {
  event: "connection.status_changed" | "connection.profile_updated";
  connection_id: string;
}

export interface RobonoMessagePushEvent extends RobonoPushEventBase {
  event:
    | "message.created"
    | "message.delivered"
    | "message.heard"
    | "message.reaction_updated";
  connection_id: string;
  robono_message_id: string;
}

export interface RobonoBridgeConnectionPushEvent
  extends RobonoPushEventBase {
  event:
    | "bridge.connection_requested"
    | "bridge.connection_status_changed"
    | "bridge.connection_updated";
  bridge_connection_id: string;
}

export interface RobonoBridgeDirectoryPushEvent extends RobonoPushEventBase {
  event: "bridge.directory_changed";
}

export interface RobonoBridgeMessagePushEvent extends RobonoPushEventBase {
  event: "bridge.message_created" | "bridge.message_status_changed";
  bridge_connection_id: string;
  bridge_message_id: string;
}

export interface RobonoGuardianMessagePushEvent extends RobonoPushEventBase {
  event:
    | "bridge.guardian_message_created"
    | "bridge.guardian_message_status_changed";
  bridge_connection_id: string;
  guardian_message_id: string;
}

export interface RobonoTransformPushEvent extends RobonoPushEventBase {
  event: "transform.completed" | "transform.failed";
  connection_id?: string;
  robono_message_id?: string;
  bridge_connection_id?: string;
  bridge_message_id?: string;
}

export interface RobonoDiagnosticPushEvent extends RobonoPushEventBase {
  event: "diagnostic.push_requested";
  push_diagnostic_id: string;
  diagnostic_token: string;
}

export type RobonoPushEvent =
  | RobonoConnectionPushEvent
  | RobonoMessagePushEvent
  | RobonoBridgeConnectionPushEvent
  | RobonoBridgeDirectoryPushEvent
  | RobonoBridgeMessagePushEvent
  | RobonoGuardianMessagePushEvent
  | RobonoTransformPushEvent
  | RobonoDiagnosticPushEvent;
