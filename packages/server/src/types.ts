export type MessageKind = "text" | "voice" | "image" | "video" | "document";
export type BridgeConnectionStatus =
  | "pending_target_approval"
  | "accepted"
  | "rejected"
  | "not_found"
  | "blocked"
  | "disconnected"
  | "expired";
export type RobonoConnectionStatus =
  | "active"
  | "pending_invite"
  | "blocked"
  | "disconnected"
  | "expired";
export type GuardianMessageStatus =
  | "stored"
  | "accepted"
  | "delivered"
  | "read"
  | "failed"
  | "replaced";

export type JsonObject = Record<string, unknown>;

export interface RobonoRequestOptions {
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
}

export interface RobonoServerOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  fetch?: typeof globalThis.fetch;
  userAgent?: string;
  apiVersion?: string;
}

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

export interface DirectoryEntry {
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

export interface DirectoryResponse {
  ok: true;
  request_id: string;
  directory: DirectoryEntry[];
}

export interface Guardian {
  external_guardian_id: string;
  display_name?: string | null;
  relationship_to_child?: string | null;
  avatar_url?: string | null;
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

export interface HistoryCapability {
  max_items: number | null;
  message_expires_after_seconds: number | null;
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
  history?: HistoryCapability;
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
  app: DirectoryEntry | AppIdentity;
  external_user_id: string;
  display_name: string;
  profile?: ExternalProfileInput;
  guardians?: Guardian[];
}

export interface BridgeTargetParticipant {
  app: DirectoryEntry | AppIdentity;
  identifier: string;
  external_user_id: string | null;
  display_name: string | null;
  profile?: ExternalProfileInput;
  contact_label?: string | null;
  guardians?: Guardian[];
}

export interface BridgeConnection {
  bridge_connection_id: string;
  status: BridgeConnectionStatus;
  source: BridgeSourceParticipant;
  target: BridgeTargetParticipant;
  guardian_messaging_enabled: boolean;
  capabilities: ConnectionCapabilities;
  expires_at: string | null;
  accepted_at: string | null;
  responded_at: string | null;
  created_at: string | null;
}

export interface BridgeConnectionResponse extends BridgeConnection {
  ok: true;
  request_id: string;
  push_status?: "accepted" | "retry_scheduled";
}

export interface BridgeConnectionListResponse {
  ok: true;
  request_id: string;
  connections: BridgeConnection[];
  has_more: boolean;
  next_before: string | null;
}

export interface RequestBridgeConnectionInput {
  target_app_id?: string;
  target_app_slug?: string;
  source_external_user_id: string;
  source_display_name: string;
  target_identifier: string;
  target_contact_label?: string;
  external_profile?: ExternalProfileInput;
  capabilities?: ConnectionCapabilities;
  guardian_messaging_enabled?: boolean;
  source_guardians?: Guardian[];
  monitoring_disclosure?: string;
  external_approval?: JsonObject;
}

export interface RespondBridgeConnectionInput {
  bridge_connection_id: string;
  status: "accepted" | "rejected" | "not_found";
  target_external_user_id?: string;
  target_display_name?: string;
  external_profile?: ExternalProfileInput;
  target_guardians?: Guardian[];
  capabilities?: ConnectionCapabilities;
  response_details?: JsonObject;
}

export interface UpdateBridgeConnectionInput {
  bridge_connection_id: string;
  external_user_id: string;
  display_name?: string;
  external_profile?: ExternalProfileInput;
  capabilities?: ConnectionCapabilities;
  guardians?: Guardian[];
}

export interface ExternalProfileInput {
  display_name?: string;
  avatar?: {
    source_url: string;
    mime_type?: string;
    version?: string;
    updated_at?: string;
  };
}

export interface CreateRobonoConnectionInput {
  target_phone_e164: string;
  external_user_id: string;
  external_display_name: string;
  external_profile?: ExternalProfileInput;
  target_contact_label?: string;
  monitoring_disclosure?: string;
  external_approval?: JsonObject;
  capabilities?: ConnectionCapabilities;
}

export interface RobonoUserSummary {
  id: string;
  display_name: string | null;
  phone_masked: string | null;
  avatar_url?: string | null;
  avatar_version?: string | null;
  avatar_updated_at?: string | null;
  profile_updated_at?: string | null;
}

export interface RobonoConnectionResponse {
  ok: true;
  request_id: string;
  connection_id: string;
  conversation_id: string | null;
  status: RobonoConnectionStatus;
  external_user_id: string;
  external_display_name: string | null;
  target_contact_label: string | null;
  capabilities: ConnectionCapabilities;
  robono_user: RobonoUserSummary | null;
  phone_masked: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RobonoConnectionListResponse {
  ok: true;
  request_id: string;
  connections: RobonoConnectionResponse[];
  has_more: boolean;
  next_before: string | null;
}

/**
 * A connection normalized across every endpoint advertised by the directory.
 * `connection_id` is the only identifier most integrations need to retain.
 * The endpoint-specific API response remains available in `raw`.
 */
export interface EndpointConnection {
  endpoint: DirectoryEntry;
  endpoint_type: DirectoryEntry["type"];
  connection_id: string;
  status: BridgeConnectionStatus | RobonoConnectionResponse["status"];
  external_user_id: string;
  capabilities: ConnectionCapabilities;
  peer: EndpointPeer;
  raw: BridgeConnectionResponse | RobonoConnectionResponse;
}

export interface EndpointPeer {
  endpoint: DirectoryEntry;
  external_user_id: string | null;
  display_name: string | null;
  identifier: string | null;
  avatar_url: string | null;
  avatar_version: string | null;
  profile: JsonObject;
}

export interface EndpointConnectionCursor {
  phase?: "connected_app" | "robono_phone";
  connected_app_before?: string;
  robono_before?: string;
}

export interface EndpointConnectionListResponse {
  connections: EndpointConnection[];
  has_more: boolean;
  next_cursor: EndpointConnectionCursor | null;
}

export interface UpdateEndpointConnectionInput {
  connection: EndpointConnection;
  external_user_id: string;
  display_name?: string;
  external_profile?: ExternalProfileInput;
  capabilities?: ConnectionCapabilities;
  guardians?: Guardian[];
}

export interface DisconnectEndpointConnectionInput {
  connection: EndpointConnection;
  external_user_id: string;
  reason?: string;
}

export interface ConnectEndpointInput {
  endpoint: DirectoryEntry;
  external_user_id: string;
  external_display_name: string;
  target_identifier: string;
  target_contact_label?: string;
  external_profile?: ExternalProfileInput;
  capabilities?: ConnectionCapabilities;
  guardian_messaging_enabled?: boolean;
  guardians?: Guardian[];
  monitoring_disclosure?: string;
  external_approval?: JsonObject;
}

export interface MediaInput extends JsonObject {
  source_url: string;
  mime_type: string;
  byte_size?: number;
  duration_ms?: number;
  file_name?: string;
  waveform?: number[];
}

export type MessageContent =
  | { message_kind: "text"; text_body: string }
  | {
    message_kind: "voice" | "image" | "video" | "document";
    media: MediaInput;
    text_body?: string;
  };

export type SendBridgeMessageInput = MessageContent & {
  bridge_connection_id: string;
  external_user_id: string;
  external_message_id: string;
  dry_run?: boolean;
};

export interface SendBridgeMessageResponse {
  ok: true;
  request_id: string;
  bridge_message_id?: string;
  status:
    | "validated"
    | "stored"
    | "accepted"
    | "delivered"
    | "read"
    | "heard"
    | "failed"
    | "replaced";
  duplicate?: boolean;
  dry_run?: boolean;
  accepted_at?: string | null;
  accepted_via?: "push" | "polling" | null;
  push_status?: "accepted" | "retry_scheduled";
  recipient?: { child_app_id: string; external_user_id: string };
  connection?: BridgeConnection;
}

export interface BridgeMessageRecord extends JsonObject {
  bridge_message_id: string;
  bridge_connection_id: string;
  direction: "inbound" | "outbound";
  sender_external_user_id: string;
  external_message_id: string;
  message_kind: MessageKind;
  text_body: string | null;
  media: MediaInput | JsonObject;
  status:
    | "stored"
    | "accepted"
    | "delivered"
    | "read"
    | "heard"
    | "failed"
    | "replaced";
  accepted_at: string | null;
  accepted_via: "push" | "polling" | null;
  delivered_at: string | null;
  read_at: string | null;
  heard_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  created_at: string;
}

export interface BridgeMessageListResponse {
  ok: true;
  request_id: string;
  messages: BridgeMessageRecord[];
  has_more: boolean;
  next_before: string | null;
  next_after?: string | null;
  sync_cursor?: string | null;
}

export interface BridgeMessageEventResponse {
  ok: true;
  request_id: string;
  bridge_message_id: string;
  status: BridgeMessageRecord["status"];
  occurred_at: string;
}

export type SendRobonoMessageInput = MessageContent & {
  connection_id: string;
  external_user_id: string;
  external_message_id: string;
  send_invite_sms_if_pending?: boolean;
  external_profile?: ExternalProfileInput;
  dry_run?: boolean;
};

export interface SendRobonoMessageResponse {
  ok: true;
  request_id: string;
  robono_message_id?: string;
  external_user_id?: string;
  status: string;
  invite_sms_sent?: boolean;
  dry_run?: boolean;
  connection_state?: JsonObject;
}

export interface RobonoMessageRecord extends JsonObject {
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
}

export interface RobonoMessageListResponse {
  ok: true;
  request_id: string;
  messages: RobonoMessageRecord[];
  has_more: boolean;
  next_before: string | null;
  next_after?: string | null;
  sync_cursor?: string | null;
}

export type SendEndpointMessageInput = MessageContent & {
  connection: EndpointConnection;
  external_user_id: string;
  external_message_id: string;
  send_invite_sms_if_pending?: boolean;
  external_profile?: ExternalProfileInput;
  dry_run?: boolean;
};

export interface EndpointMessageResponse {
  endpoint_type: DirectoryEntry["type"];
  connection_id: string;
  message_id: string | null;
  status: string;
  raw:
    | SendBridgeMessageResponse
    | SendRobonoMessageResponse
    | BridgeMessageEventResponse
    | JsonObject;
}

export interface EndpointMessageRecord {
  endpoint_type: DirectoryEntry["type"];
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
  raw: BridgeMessageRecord | RobonoMessageRecord;
}

export interface EndpointMessageListResponse {
  messages: EndpointMessageRecord[];
  has_more: boolean;
  next_before: string | null;
  next_after: string | null;
  sync_cursor: string | null;
}

export interface MarkEndpointMessageInput {
  connection: EndpointConnection;
  external_user_id: string;
  message_id: string;
  event: "delivered" | "read" | "heard";
  occurred_at?: string;
}

export interface SendGuardianMessageInput {
  bridge_connection_id: string;
  external_guardian_id: string;
  external_message_id: string;
  text_body: string;
  message_kind?: "text";
  dry_run?: boolean;
}

export interface SendGuardianMessageResponse {
  ok: true;
  request_id: string;
  guardian_message_id?: string;
  status: string;
  duplicate?: boolean;
  dry_run?: boolean;
}

export interface GuardianMessageRecord extends JsonObject {
  guardian_message_id: string;
  bridge_connection_id: string;
  direction: "inbound" | "outbound";
  sender_external_guardian_id: string;
  external_message_id: string;
  message_kind: "text";
  text_body: string;
  status: GuardianMessageStatus;
  accepted_at: string | null;
  accepted_via: "push" | "polling" | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  created_at: string;
}

export interface GuardianMessageListResponse {
  ok: true;
  request_id: string;
  messages: GuardianMessageRecord[];
  has_more: boolean;
  next_before: string | null;
}

export interface Language {
  code: string;
  name: string;
}

export interface LanguageResponse {
  ok: true;
  request_id: string;
  languages: Language[];
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

export interface TransformBillingOperation {
  type: "transcription" | "translation" | "tts";
  quantity: 1;
  billable: boolean;
}

export interface TransformBilling {
  bill_to: "integration" | "sandbox";
  charged: boolean;
  operation_count: number;
  operations: TransformBillingOperation[];
  cache_reused: boolean;
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
  billing: TransformBilling;
  test_mode?: boolean;
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

export type RobonoWebhookEventName =
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

export interface RobonoWebhookEventBase extends JsonObject {
  event: RobonoWebhookEventName;
  event_id: string;
  request_id: string;
  created_at: string;
}

export interface ConnectionWebhookEvent extends RobonoWebhookEventBase {
  event: "connection.status_changed" | "connection.profile_updated";
  connection_id: string;
  status: RobonoConnectionStatus;
}

export interface RobonoWebhookSender {
  type: "robono_user";
  robono_user_id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_version: string | null;
  avatar_updated_at: string | null;
  profile_updated_at: string | null;
  phone_masked: string | null;
}

export interface AttachmentBatch {
  id: string;
  index: number;
  count: number;
}

export interface MessageCreatedWebhookEvent extends RobonoWebhookEventBase {
  event: "message.created";
  connection_id: string;
  conversation_id?: string;
  robono_message_id: string;
  external_user_id: string;
  sender: RobonoWebhookSender;
  message_kind: MessageKind;
  text_body: string | null;
  media: MediaInput | JsonObject | null;
  attachment_batch?: AttachmentBatch;
}

export interface MessageReceiptWebhookEvent extends RobonoWebhookEventBase {
  event: "message.delivered" | "message.heard";
  connection_id: string;
  robono_message_id: string;
  external_message_id: string | null;
}

export interface MessageReactionWebhookEvent extends RobonoWebhookEventBase {
  event: "message.reaction_updated";
  connection_id: string;
  conversation_id?: string;
  robono_message_id: string;
  external_message_id: string | null;
  external_user_id: string;
  reaction: {
    emoji: string | null;
    removed: boolean;
    reacted_at: string;
  };
  reactor: {
    type: "robono_user";
    robono_user_id: string;
    display_name: string;
    phone_masked: string | null;
  };
}

export interface BridgeConnectionRequestedWebhookEvent
  extends RobonoWebhookEventBase {
  event: "bridge.connection_requested";
  bridge_connection_id: string;
  source: BridgeSourceParticipant;
  target: {
    app: DirectoryEntry | AppIdentity;
    identifier: string;
    contact_label: string | null;
    accepted_identifier: IdentifierDescription;
  };
  capabilities: ConnectionCapabilities;
}

export interface BridgeConnectionChangedWebhookEvent
  extends RobonoWebhookEventBase {
  event: "bridge.connection_status_changed" | "bridge.connection_updated";
  bridge_connection_id: string;
  connection: BridgeConnection;
}

export interface BridgeDirectoryChangedWebhookEvent
  extends RobonoWebhookEventBase {
  event: "bridge.directory_changed";
  endpoint_id: string;
  change: "created" | "updated" | "disabled" | "removed";
}

export interface BridgeMessageCreatedWebhookEvent
  extends RobonoWebhookEventBase {
  event: "bridge.message_created";
  bridge_connection_id: string;
  bridge_message_id: string;
  connection: BridgeConnection;
  sender: { child_app_id: string; external_user_id: string };
  recipient: { child_app_id: string; external_user_id: string };
  message: {
    external_message_id: string;
    message_kind: MessageKind;
    text_body?: string;
    media?: MediaInput | JsonObject;
    speech?: JsonObject;
    created_at: string;
  };
}

export interface BridgeMessageStatusWebhookEvent
  extends RobonoWebhookEventBase {
  event: "bridge.message_status_changed";
  bridge_connection_id: string;
  bridge_message_id: string;
  status: BridgeMessageRecord["status"];
}

export type BridgeMessageWebhookEvent =
  | BridgeMessageCreatedWebhookEvent
  | BridgeMessageStatusWebhookEvent;

export interface BridgeGuardianMessageCreatedWebhookEvent
  extends RobonoWebhookEventBase {
  event: "bridge.guardian_message_created";
  bridge_connection_id: string;
  guardian_message_id: string;
  connection: BridgeConnection;
  sender_guardian: Guardian;
  recipient_guardians: Guardian[];
  sender_child: {
    child_app_id: string;
    external_user_id: string;
    display_name: string;
  };
  recipient_child: {
    child_app_id: string;
    external_user_id: string;
    display_name: string;
  };
  message: {
    external_message_id: string;
    message_kind: "text";
    text_body: string;
    created_at: string;
  };
}

export interface BridgeGuardianMessageStatusWebhookEvent
  extends RobonoWebhookEventBase {
  event: "bridge.guardian_message_status_changed";
  bridge_connection_id: string;
  guardian_message_id: string;
  status: GuardianMessageStatus;
}

export type BridgeGuardianMessageWebhookEvent =
  | BridgeGuardianMessageCreatedWebhookEvent
  | BridgeGuardianMessageStatusWebhookEvent;

export interface TransformCompletedWebhookEvent
  extends RobonoWebhookEventBase {
  event: "transform.completed";
  transform_kind: "message" | "speech";
  status: "completed";
  artifacts: TransformArtifacts;
  billing: TransformBilling;
  connection_id?: string;
  message_id?: string;
  external_request_id?: string | null;
}

export interface TransformFailedWebhookEvent extends RobonoWebhookEventBase {
  event: "transform.failed";
  transform_kind: "message" | "speech";
  status: "failed";
  error: { code: string; message: string };
  connection_id?: string;
  message_id?: string;
  external_request_id?: string | null;
}

export interface DiagnosticPushWebhookEvent extends RobonoWebhookEventBase {
  event: "diagnostic.push_requested";
  push_diagnostic_id: string;
  diagnostic_token: string;
  external_user_id: string;
}

export type RobonoWebhookEvent =
  | ConnectionWebhookEvent
  | MessageCreatedWebhookEvent
  | MessageReceiptWebhookEvent
  | MessageReactionWebhookEvent
  | BridgeConnectionRequestedWebhookEvent
  | BridgeConnectionChangedWebhookEvent
  | BridgeDirectoryChangedWebhookEvent
  | BridgeMessageWebhookEvent
  | BridgeGuardianMessageWebhookEvent
  | TransformCompletedWebhookEvent
  | TransformFailedWebhookEvent
  | DiagnosticPushWebhookEvent;

/**
 * Provider-neutral data delivered to a client SDK. The payload contains
 * routing identifiers only; the client retrieves authoritative state from the
 * authenticated child-app adapter.
 */
export interface RobonoClientPushPayloadBase {
  event: RobonoWebhookEventName;
  event_id: string;
}

export interface RobonoConnectionPushPayload
  extends RobonoClientPushPayloadBase {
  event: "connection.status_changed" | "connection.profile_updated";
  connection_id: string;
}

export interface RobonoMessagePushPayload extends RobonoClientPushPayloadBase {
  event:
    | "message.created"
    | "message.delivered"
    | "message.heard"
    | "message.reaction_updated";
  connection_id: string;
  robono_message_id: string;
}

export interface RobonoBridgeConnectionPushPayload
  extends RobonoClientPushPayloadBase {
  event:
    | "bridge.connection_requested"
    | "bridge.connection_status_changed"
    | "bridge.connection_updated";
  bridge_connection_id: string;
}

export interface RobonoBridgeDirectoryPushPayload
  extends RobonoClientPushPayloadBase {
  event: "bridge.directory_changed";
}

export interface RobonoBridgeMessagePushPayload
  extends RobonoClientPushPayloadBase {
  event: "bridge.message_created" | "bridge.message_status_changed";
  bridge_connection_id: string;
  bridge_message_id: string;
}

export interface RobonoGuardianMessagePushPayload
  extends RobonoClientPushPayloadBase {
  event:
    | "bridge.guardian_message_created"
    | "bridge.guardian_message_status_changed";
  bridge_connection_id: string;
  guardian_message_id: string;
}

export interface RobonoTransformPushPayload
  extends RobonoClientPushPayloadBase {
  event: "transform.completed" | "transform.failed";
  connection_id?: string;
  robono_message_id?: string;
  bridge_connection_id?: string;
  bridge_message_id?: string;
}

export interface RobonoDiagnosticPushPayload
  extends RobonoClientPushPayloadBase {
  event: "diagnostic.push_requested";
  push_diagnostic_id: string;
  diagnostic_token: string;
}

export type RobonoClientPushPayload =
  | RobonoConnectionPushPayload
  | RobonoMessagePushPayload
  | RobonoBridgeConnectionPushPayload
  | RobonoBridgeDirectoryPushPayload
  | RobonoBridgeMessagePushPayload
  | RobonoGuardianMessagePushPayload
  | RobonoTransformPushPayload
  | RobonoDiagnosticPushPayload;

export interface VerifiedWebhook<
  T extends RobonoWebhookEvent = RobonoWebhookEvent,
> {
  event: T;
  eventId: string;
  requestId: string;
  timestamp: string;
  duplicate: boolean;
}

export interface WebhookHeaders {
  [name: string]: string | string[] | undefined;
}

export interface WebhookVerificationOptions {
  toleranceSeconds?: number;
  now?: Date;
  /**
   * Atomically inserts a durable inbox row with pending status. Return true
   * only when this delivery inserted the row. The inbox must retain the raw
   * payload outside this callback and must not treat a claim as completed
   * processing; failed work remains pending for a worker retry.
   */
  claimEvent?: (eventId: string) => boolean | Promise<boolean>;
  /**
   * Compatibility-only read of a durable inbox. Do not use this to skip an
   * event whose inbox row is still pending or failed.
   */
  hasProcessedEvent?: (eventId: string) => boolean | Promise<boolean>;
}
