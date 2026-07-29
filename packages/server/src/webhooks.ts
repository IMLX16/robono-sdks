import { createHmac, timingSafeEqual } from "node:crypto";
import { RobonoWebhookError } from "./errors.js";
import type {
  RobonoWebhookEvent,
  RobonoWebhookEventName,
  VerifiedWebhook,
  WebhookHeaders,
  WebhookVerificationOptions,
} from "./types.js";

const webhookEventNames = new Set<RobonoWebhookEventName>([
  "connection.status_changed",
  "connection.profile_updated",
  "message.created",
  "message.delivered",
  "message.heard",
  "message.reaction_updated",
  "bridge.connection_requested",
  "bridge.connection_status_changed",
  "bridge.connection_updated",
  "bridge.directory_changed",
  "bridge.message_created",
  "bridge.message_status_changed",
  "bridge.guardian_message_created",
  "bridge.guardian_message_status_changed",
  "transform.completed",
  "transform.failed",
  "diagnostic.push_requested",
]);

export async function verifyRobonoWebhook<
  T extends RobonoWebhookEvent = RobonoWebhookEvent,
>(
  rawBody: string | Uint8Array,
  headers: Headers | WebhookHeaders,
  webhookSecret: string,
  options: WebhookVerificationOptions = {},
): Promise<VerifiedWebhook<T>> {
  const timestamp = header(headers, "robono-webhook-timestamp");
  const signatureHeader = header(headers, "robono-webhook-signature");
  const headerEventId = header(headers, "robono-webhook-id");
  const requestId = header(headers, "robono-request-id");
  if (!webhookSecret?.trim()) {
    throw new RobonoWebhookError(
      "The Robono webhook secret is missing.",
      "missing_webhook_secret",
    );
  }
  if (!timestamp || !signatureHeader) {
    throw new RobonoWebhookError(
      "The Robono webhook signature headers are missing.",
      "missing_webhook_signature",
    );
  }

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) {
    throw new RobonoWebhookError(
      "The Robono webhook timestamp is invalid.",
      "invalid_webhook_timestamp",
    );
  }
  const toleranceSeconds = options.toleranceSeconds ?? 300;
  const nowMs = (options.now ?? new Date()).getTime();
  if (Math.abs(nowMs - timestampMs) > toleranceSeconds * 1_000) {
    throw new RobonoWebhookError(
      "The Robono webhook is outside the accepted timestamp window.",
      "stale_webhook",
    );
  }

  const body = typeof rawBody === "string"
    ? rawBody
    : new TextDecoder().decode(rawBody);
  const received = signatureHeader.replace(/^v1=/i, "").trim().toLowerCase();
  const expected = createHmac("sha256", webhookSecret).update(
    `${timestamp}.${body}`,
  ).digest("hex");
  if (!safeEqual(received, expected)) {
    throw new RobonoWebhookError(
      "The Robono webhook signature does not match.",
      "webhook_signature_mismatch",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (cause) {
    throw new RobonoWebhookError(
      "The Robono webhook body is not valid JSON.",
      "invalid_webhook_json",
      { cause },
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RobonoWebhookError(
      "The Robono webhook event is missing.",
      "invalid_webhook_event",
    );
  }
  const eventName = (parsed as Record<string, unknown>).event;
  if (typeof eventName !== "string") {
    throw new RobonoWebhookError(
      "The Robono webhook event is missing.",
      "invalid_webhook_event",
    );
  }
  if (!webhookEventNames.has(eventName as RobonoWebhookEventName)) {
    throw new RobonoWebhookError(
      `The Robono webhook event "${eventName}" is not supported.`,
      "unsupported_webhook_event",
    );
  }
  assertWebhookEvent(parsed);
  const event = parsed as T;

  const eventId = event.event_id;
  if (event.event_id && headerEventId && event.event_id !== headerEventId) {
    throw new RobonoWebhookError(
      "The Robono webhook event ID does not match its header.",
      "webhook_event_id_mismatch",
    );
  }
  const duplicate = options.claimEvent
    ? !(await options.claimEvent(eventId))
    : options.hasProcessedEvent
    ? await options.hasProcessedEvent(eventId)
    : false;
  return {
    event,
    eventId,
    requestId: event.request_id || requestId || eventId,
    timestamp,
    duplicate,
  };
}

function assertWebhookEvent(
  value: unknown,
): asserts value is RobonoWebhookEvent {
  const event = record(value, "event");
  const name = string(event, "event");
  string(event, "event_id");
  string(event, "request_id");
  timestamp(event, "created_at");

  switch (name as RobonoWebhookEventName) {
    case "connection.status_changed":
    case "connection.profile_updated":
      string(event, "connection_id");
      oneOf(event, "status", [
        "active",
        "pending_invite",
        "blocked",
        "disconnected",
        "expired",
      ]);
      return;
    case "message.created":
      string(event, "connection_id");
      string(event, "robono_message_id");
      string(event, "external_user_id");
      assertRobonoSender(record(event.sender, "sender"));
      messageKind(event, "message_kind");
      nullableString(event, "text_body");
      if (event.media !== null) {
        assertMedia(record(event.media, "media"), "media");
      }
      if (event.attachment_batch !== undefined) {
        const batch = record(event.attachment_batch, "attachment_batch");
        string(batch, "id");
        const index = integer(batch, "index", "attachment_batch.index", 0, 9);
        const count = integer(batch, "count", "attachment_batch.count", 2, 10);
        if (index >= count) {
          throw new RobonoWebhookError(
            "attachment_batch.index must be smaller than count.",
            "invalid_webhook_payload",
          );
        }
      }
      return;
    case "message.delivered":
    case "message.heard":
      string(event, "connection_id");
      string(event, "robono_message_id");
      nullableString(event, "external_message_id");
      return;
    case "message.reaction_updated":
      string(event, "connection_id");
      string(event, "robono_message_id");
      nullableString(event, "external_message_id");
      string(event, "external_user_id");
      assertReaction(record(event.reaction, "reaction"));
      assertReactionSender(record(event.reactor, "reactor"));
      return;
    case "bridge.connection_requested": {
      string(event, "bridge_connection_id");
      assertBridgeSource(record(event.source, "source"));
      const target = record(event.target, "target");
      assertAppIdentity(record(target.app, "target.app"), "target.app");
      string(target, "identifier", "target.identifier");
      nullableString(target, "contact_label", "target.contact_label");
      assertIdentifierDescription(
        record(target.accepted_identifier, "target.accepted_identifier"),
        "target.accepted_identifier",
      );
      assertCapabilities(record(event.capabilities, "capabilities"), "capabilities");
      return;
    }
    case "bridge.connection_status_changed":
    case "bridge.connection_updated":
      string(event, "bridge_connection_id");
      assertBridgeConnection(record(event.connection, "connection"));
      return;
    case "bridge.directory_changed":
      string(event, "endpoint_id");
      oneOf(event, "change", ["created", "updated", "disabled", "removed"]);
      return;
    case "bridge.message_created": {
      string(event, "bridge_connection_id");
      string(event, "bridge_message_id");
      assertBridgeConnection(record(event.connection, "connection"));
      assertChildParticipant(record(event.sender, "sender"), "sender");
      assertChildParticipant(record(event.recipient, "recipient"), "recipient");
      const message = record(event.message, "message");
      string(message, "external_message_id", "message.external_message_id");
      messageKind(message, "message_kind", "message.message_kind");
      optionalString(message, "text_body", "message.text_body");
      if (message.media !== undefined) {
        assertMedia(record(message.media, "message.media"), "message.media");
      }
      if (message.attachment_batch !== undefined) {
        const batch = record(
          message.attachment_batch,
          "message.attachment_batch",
        );
        string(batch, "id", "message.attachment_batch.id");
        const index = integer(
          batch,
          "index",
          "message.attachment_batch.index",
          0,
          9,
        );
        const count = integer(
          batch,
          "count",
          "message.attachment_batch.count",
          2,
          10,
        );
        if (index >= count) {
          throw new RobonoWebhookError(
            "message.attachment_batch.index must be smaller than count.",
            "invalid_webhook_payload",
          );
        }
      }
      optionalRecord(message, "speech", "message.speech");
      timestamp(message, "created_at", "message.created_at");
      return;
    }
    case "bridge.message_status_changed":
      string(event, "bridge_connection_id");
      string(event, "bridge_message_id");
      oneOf(event, "status", [
        "stored",
        "accepted",
        "delivered",
        "read",
        "heard",
        "failed",
        "replaced",
      ]);
      return;
    case "bridge.guardian_message_created": {
      string(event, "bridge_connection_id");
      string(event, "guardian_message_id");
      assertBridgeConnection(record(event.connection, "connection"));
      assertGuardian(record(event.sender_guardian, "sender_guardian"), "sender_guardian");
      const recipientGuardians = array(
        event.recipient_guardians,
        "recipient_guardians",
      );
      recipientGuardians.forEach((item, index) =>
        assertGuardian(
          record(item, `recipient_guardians[${index}]`),
          `recipient_guardians[${index}]`,
        )
      );
      assertNamedChild(record(event.sender_child, "sender_child"), "sender_child");
      assertNamedChild(
        record(event.recipient_child, "recipient_child"),
        "recipient_child",
      );
      const message = record(event.message, "message");
      string(message, "external_message_id", "message.external_message_id");
      oneOf(message, "message_kind", ["text"], "message.message_kind");
      string(message, "text_body", "message.text_body");
      timestamp(message, "created_at", "message.created_at");
      return;
    }
    case "bridge.guardian_message_status_changed":
      string(event, "bridge_connection_id");
      string(event, "guardian_message_id");
      oneOf(event, "status", [
        "stored",
        "accepted",
        "delivered",
        "read",
        "failed",
        "replaced",
      ]);
      return;
    case "transform.completed": {
      oneOf(event, "transform_kind", ["message", "speech"]);
      oneOf(event, "status", ["completed"]);
      optionalString(event, "connection_id");
      optionalString(event, "message_id");
      optionalNullableString(event, "external_request_id");
      assertTransformArtifacts(record(event.artifacts, "artifacts"));
      assertTransformBilling(record(event.billing, "billing"));
      return;
    }
    case "transform.failed": {
      oneOf(event, "transform_kind", ["message", "speech"]);
      oneOf(event, "status", ["failed"]);
      optionalString(event, "connection_id");
      optionalString(event, "message_id");
      optionalNullableString(event, "external_request_id");
      const error = record(event.error, "error");
      string(error, "code", "error.code");
      string(error, "message", "error.message");
      return;
    }
    case "diagnostic.push_requested":
      string(event, "push_diagnostic_id");
      string(event, "diagnostic_token");
      string(event, "external_user_id");
      return;
  }
}

function assertRobonoSender(sender: Record<string, unknown>) {
  oneOf(sender, "type", ["robono_user"], "sender.type");
  string(sender, "robono_user_id", "sender.robono_user_id");
  string(sender, "display_name", "sender.display_name");
  for (const key of [
    "avatar_url",
    "avatar_version",
    "avatar_updated_at",
    "profile_updated_at",
    "phone_masked",
  ]) {
    nullableString(sender, key, `sender.${key}`);
  }
}

function assertBridgeSource(source: Record<string, unknown>) {
  assertAppIdentity(record(source.app, "source.app"), "source.app");
  string(source, "external_user_id", "source.external_user_id");
  string(source, "display_name", "source.display_name");
  if (source.profile !== undefined) {
    assertExternalProfile(record(source.profile, "source.profile"), "source.profile");
  }
  if (source.guardians !== undefined) {
    assertGuardians(source.guardians, "source.guardians");
  }
}

function assertBridgeConnection(connection: Record<string, unknown>) {
  string(connection, "bridge_connection_id", "connection.bridge_connection_id");
  oneOf(connection, "status", [
    "pending_target_approval",
    "accepted",
    "rejected",
    "not_found",
    "blocked",
    "disconnected",
    "expired",
  ], "connection.status");
  assertBridgeSource(record(connection.source, "connection.source"));
  const target = record(connection.target, "connection.target");
  assertAppIdentity(
    record(target.app, "connection.target.app"),
    "connection.target.app",
  );
  string(target, "identifier", "connection.target.identifier");
  nullableString(
    target,
    "external_user_id",
    "connection.target.external_user_id",
  );
  nullableString(target, "display_name", "connection.target.display_name");
  if (target.profile !== undefined) {
    assertExternalProfile(
      record(target.profile, "connection.target.profile"),
      "connection.target.profile",
    );
  }
  if (target.contact_label !== undefined) {
    nullableString(target, "contact_label", "connection.target.contact_label");
  }
  if (target.guardians !== undefined) {
    assertGuardians(target.guardians, "connection.target.guardians");
  }
  boolean(
    connection,
    "guardian_messaging_enabled",
    "connection.guardian_messaging_enabled",
  );
  assertCapabilities(
    record(connection.capabilities, "connection.capabilities"),
    "connection.capabilities",
  );
  for (const key of [
    "expires_at",
    "accepted_at",
    "responded_at",
    "created_at",
  ]) {
    optionalNullableTimestamp(connection, key, `connection.${key}`);
  }
}

function assertAppIdentity(
  app: Record<string, unknown>,
  path: string,
) {
  string(app, "id", `${path}.id`);
  optionalString(app, "slug", `${path}.slug`);
  optionalString(app, "display_name", `${path}.display_name`);
}

function assertChildParticipant(
  participant: Record<string, unknown>,
  path: string,
) {
  string(participant, "child_app_id", `${path}.child_app_id`);
  string(participant, "external_user_id", `${path}.external_user_id`);
}

function assertNamedChild(
  participant: Record<string, unknown>,
  path: string,
) {
  assertChildParticipant(participant, path);
  string(participant, "display_name", `${path}.display_name`);
}

function assertExternalProfile(
  profile: Record<string, unknown>,
  path: string,
) {
  optionalString(profile, "display_name", `${path}.display_name`);
  if (profile.avatar === undefined) return;
  const avatar = record(profile.avatar, `${path}.avatar`);
  uri(avatar, "source_url", `${path}.avatar.source_url`);
  optionalString(avatar, "mime_type", `${path}.avatar.mime_type`);
  optionalString(avatar, "version", `${path}.avatar.version`);
  if (avatar.updated_at !== undefined) {
    timestamp(avatar, "updated_at", `${path}.avatar.updated_at`);
  }
}

function assertGuardians(value: unknown, path: string) {
  const guardians = array(value, path);
  guardians.forEach((item, index) => {
    const guardianPath = `${path}[${index}]`;
    assertGuardian(record(item, guardianPath), guardianPath);
  });
}

function assertGuardian(
  guardian: Record<string, unknown>,
  path: string,
) {
  string(guardian, "external_guardian_id", `${path}.external_guardian_id`);
  optionalNullableString(guardian, "display_name", `${path}.display_name`);
  optionalNullableString(
    guardian,
    "relationship_to_child",
    `${path}.relationship_to_child`,
  );
  if (guardian.avatar_url !== undefined && guardian.avatar_url !== null) {
    uri(guardian, "avatar_url", `${path}.avatar_url`);
  }
}

function assertIdentifierDescription(
  identifier: Record<string, unknown>,
  path: string,
) {
  string(identifier, "label", `${path}.label`);
  string(identifier, "description", `${path}.description`);
  string(identifier, "example", `${path}.example`);
  string(identifier, "format", `${path}.format`);
  oneOf(
    identifier,
    "input_type",
    ["text", "tel", "email", "number"],
    `${path}.input_type`,
  );
  optionalString(identifier, "pattern", `${path}.pattern`);
  integer(identifier, "min_length", `${path}.min_length`, 1, 240);
  integer(identifier, "max_length", `${path}.max_length`, 1, 240);
  oneOf(
    identifier,
    "normalization",
    ["none", "trim", "lowercase", "uppercase", "e164"],
    `${path}.normalization`,
  );
  boolean(identifier, "case_sensitive", `${path}.case_sensitive`);
}

function assertReaction(reaction: Record<string, unknown>) {
  nullableString(reaction, "emoji", "reaction.emoji");
  boolean(reaction, "removed", "reaction.removed");
  timestamp(reaction, "reacted_at", "reaction.reacted_at");
}

function assertReactionSender(sender: Record<string, unknown>) {
  oneOf(sender, "type", ["robono_user"], "reactor.type");
  string(sender, "robono_user_id", "reactor.robono_user_id");
  string(sender, "display_name", "reactor.display_name");
  nullableString(sender, "phone_masked", "reactor.phone_masked");
}

function assertCapabilities(
  capabilities: Record<string, unknown>,
  path: string,
  depth = 0,
) {
  if (depth > 6) {
    invalid(path, "a capability object no more than 6 levels deep");
  }
  optionalString(capabilities, "protocol_version", `${path}.protocol_version`);
  optionalMessageKinds(
    capabilities,
    "allowed_outbound_message_kinds",
    `${path}.allowed_outbound_message_kinds`,
  );
  optionalMessageKinds(
    capabilities,
    "allowed_inbound_message_kinds",
    `${path}.allowed_inbound_message_kinds`,
  );
  if (capabilities.history !== undefined) {
    const history = record(capabilities.history, `${path}.history`);
    nullableInteger(history, "max_items", `${path}.history.max_items`, 0);
    nullableInteger(
      history,
      "message_expires_after_seconds",
      `${path}.history.message_expires_after_seconds`,
      1,
    );
  }
  if (capabilities.text !== undefined) {
    assertTextCapabilities(
      record(capabilities.text, `${path}.text`),
      `${path}.text`,
    );
  }
  for (const key of ["voice", "photo", "video", "document"]) {
    if (capabilities[key] !== undefined) {
      assertMediaCapabilities(
        record(capabilities[key], `${path}.${key}`),
        `${path}.${key}`,
      );
    }
  }
  for (const key of [
    "receive_voice_waveforms",
    "receive_delivery_events",
    "receive_message_heard_events",
  ]) {
    if (capabilities[key] !== undefined) {
      boolean(capabilities, key, `${path}.${key}`);
    }
  }
  if (capabilities.emoji_reactions !== undefined) {
    if (typeof capabilities.emoji_reactions !== "boolean") {
      const reactions = record(
        capabilities.emoji_reactions,
        `${path}.emoji_reactions`,
      );
      boolean(reactions, "allowed", `${path}.emoji_reactions.allowed`);
    }
  }
  for (const key of ["from_source_to_target", "from_target_to_source"]) {
    if (capabilities[key] !== undefined) {
      assertDirectionCapabilities(
        record(capabilities[key], `${path}.${key}`),
        `${path}.${key}`,
      );
    }
  }
  for (const key of ["source", "target"]) {
    if (capabilities[key] !== undefined) {
      assertCapabilities(
        record(capabilities[key], `${path}.${key}`),
        `${path}.${key}`,
        depth + 1,
      );
    }
  }
}

function assertDirectionCapabilities(
  capabilities: Record<string, unknown>,
  path: string,
) {
  messageKinds(
    capabilities,
    "allowed_message_kinds",
    `${path}.allowed_message_kinds`,
  );
  if (capabilities.text !== undefined) {
    assertTextCapabilities(
      record(capabilities.text, `${path}.text`),
      `${path}.text`,
    );
  }
  for (const key of ["voice", "photo", "video", "document"]) {
    if (capabilities[key] !== undefined) {
      assertMediaCapabilities(
        record(capabilities[key], `${path}.${key}`),
        `${path}.${key}`,
      );
    }
  }
  if (capabilities.limitations !== undefined) {
    array(capabilities.limitations, `${path}.limitations`);
  }
}

function assertTextCapabilities(
  capabilities: Record<string, unknown>,
  path: string,
) {
  if (capabilities.max_characters !== undefined) {
    integer(capabilities, "max_characters", `${path}.max_characters`, 1);
  }
}

function assertMediaCapabilities(
  capabilities: Record<string, unknown>,
  path: string,
) {
  for (const key of [
    "max_duration_ms",
    "max_file_bytes",
    "max_width_px",
    "max_height_px",
    "max_items_per_message",
  ]) {
    if (capabilities[key] !== undefined) {
      integer(capabilities, key, `${path}.${key}`, 1);
    }
  }
  if (capabilities.allowed_input_mime_types !== undefined) {
    arrayOfStrings(
      capabilities.allowed_input_mime_types,
      `${path}.allowed_input_mime_types`,
    );
  }
  if (capabilities.strip_metadata !== undefined) {
    boolean(capabilities, "strip_metadata", `${path}.strip_metadata`);
  }
  if (capabilities.output !== undefined) {
    const output = record(capabilities.output, `${path}.output`);
    optionalString(
      output,
      "preferred_mime_type",
      `${path}.output.preferred_mime_type`,
    );
    optionalString(
      output,
      "preferred_codec",
      `${path}.output.preferred_codec`,
    );
    if (output.transcoding !== undefined) {
      oneOf(
        output,
        "transcoding",
        ["off", "preferred", "required"],
        `${path}.output.transcoding`,
      );
    }
  }
}

function assertMedia(media: Record<string, unknown>, path: string) {
  httpsUri(media, "source_url", `${path}.source_url`);
  string(media, "mime_type", `${path}.mime_type`);
  if (media.byte_size !== undefined) {
    integer(media, "byte_size", `${path}.byte_size`, 1);
  }
  if (media.duration_ms !== undefined) {
    integer(media, "duration_ms", `${path}.duration_ms`, 1);
  }
  optionalString(media, "file_name", `${path}.file_name`);
  if (media.waveform !== undefined) {
    arrayOfNumbers(media.waveform, `${path}.waveform`);
  }
}

function assertTransformArtifacts(artifacts: Record<string, unknown>) {
  const allowed = new Set([
    "transcript",
    "translated_text",
    "voice",
    "translated_voice",
  ]);
  for (const key of Object.keys(artifacts)) {
    if (!allowed.has(key)) invalid(`artifacts.${key}`, "a supported artifact");
  }
  for (const key of ["transcript", "translated_text"]) {
    if (artifacts[key] === undefined) continue;
    const path = `artifacts.${key}`;
    const artifact = record(artifacts[key], path);
    string(artifact, "text", `${path}.text`);
    nullableString(artifact, "language", `${path}.language`);
    optionalString(artifact, "target_language", `${path}.target_language`);
    boolean(artifact, "cached", `${path}.cached`);
  }
  for (const key of ["voice", "translated_voice"]) {
    if (artifacts[key] === undefined) continue;
    const path = `artifacts.${key}`;
    const artifact = record(artifacts[key], path);
    nullableString(artifact, "media_object_id", `${path}.media_object_id`);
    if (!("media" in artifact)) invalid(`${path}.media`, "an object or null");
    if (artifact.media !== null) {
      assertGeneratedSpeechMedia(
        record(artifact.media, `${path}.media`),
        `${path}.media`,
      );
    }
    nullableString(artifact, "language", `${path}.language`);
    optionalString(artifact, "target_language", `${path}.target_language`);
    boolean(artifact, "cached", `${path}.cached`);
    oneOf(artifact, "disclosure", ["Generated voice"], `${path}.disclosure`);
  }
}

function assertGeneratedSpeechMedia(
  media: Record<string, unknown>,
  path: string,
) {
  uri(media, "source_url", `${path}.source_url`);
  timestamp(
    media,
    "source_url_expires_at",
    `${path}.source_url_expires_at`,
  );
  string(media, "mime_type", `${path}.mime_type`);
  nullableInteger(media, "duration_ms", `${path}.duration_ms`, 0);
  integer(media, "byte_size", `${path}.byte_size`, 0);
  if (media.waveform !== undefined) {
    arrayOfNumbers(media.waveform, `${path}.waveform`);
  }
  oneOf(media, "generated_by", ["robono"], `${path}.generated_by`);
  oneOf(media, "generated_kind", ["tts_audio"], `${path}.generated_kind`);
}

function assertTransformBilling(billing: Record<string, unknown>) {
  oneOf(billing, "bill_to", ["integration", "sandbox"], "billing.bill_to");
  boolean(billing, "charged", "billing.charged");
  integer(billing, "operation_count", "billing.operation_count", 0);
  const operations = array(billing.operations, "billing.operations");
  operations.forEach((item, index) => {
    const path = `billing.operations[${index}]`;
    const operation = record(item, path);
    oneOf(
      operation,
      "type",
      ["transcription", "translation", "tts"],
      `${path}.type`,
    );
    exactNumber(operation, "quantity", 1, `${path}.quantity`);
    boolean(operation, "billable", `${path}.billable`);
  });
  boolean(billing, "cache_reused", "billing.cache_reused");
}

function record(value: unknown, path: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(path, "an object");
  }
  return value as Record<string, unknown>;
}

function optionalRecord(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  if (parent[key] !== undefined) record(parent[key], path);
}

function string(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  const value = parent[key];
  if (typeof value !== "string" || !value.trim()) invalid(path, "a string");
  return value;
}

function optionalString(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  if (parent[key] !== undefined) string(parent, key, path);
}

function optionalNullableString(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  if (parent[key] !== undefined && parent[key] !== null) {
    string(parent, key, path);
  }
}

function nullableString(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  if (!(key in parent)) invalid(path, "a string or null");
  if (parent[key] !== null) string(parent, key, path);
}

function number(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  if (typeof parent[key] !== "number" || !Number.isFinite(parent[key])) {
    invalid(path, "a number");
  }
}

function exactNumber(
  parent: Record<string, unknown>,
  key: string,
  expected: number,
  path = key,
) {
  number(parent, key, path);
  if (parent[key] !== expected) invalid(path, `${expected}`);
}

function integer(
  parent: Record<string, unknown>,
  key: string,
  path = key,
  minimum?: number,
  maximum?: number,
) {
  number(parent, key, path);
  const value = parent[key] as number;
  if (!Number.isInteger(value)) invalid(path, "an integer");
  if (minimum !== undefined && value < minimum) {
    invalid(path, `an integer greater than or equal to ${minimum}`);
  }
  if (maximum !== undefined && value > maximum) {
    invalid(path, `an integer less than or equal to ${maximum}`);
  }
  return value;
}

function nullableInteger(
  parent: Record<string, unknown>,
  key: string,
  path = key,
  minimum?: number,
) {
  if (!(key in parent)) invalid(path, "an integer or null");
  if (parent[key] !== null) integer(parent, key, path, minimum);
}

function boolean(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  if (typeof parent[key] !== "boolean") invalid(path, "a boolean");
}

function timestamp(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  const value = string(parent, key, path);
  if (!Number.isFinite(Date.parse(value))) invalid(path, "an ISO timestamp");
}

function nullableTimestamp(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  if (!(key in parent)) invalid(path, "an ISO timestamp or null");
  if (parent[key] !== null) timestamp(parent, key, path);
}

function optionalNullableTimestamp(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  if (parent[key] !== undefined && parent[key] !== null) {
    timestamp(parent, key, path);
  }
}

function uri(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  const value = string(parent, key, path);
  try {
    new URL(value);
  } catch {
    invalid(path, "a URL");
  }
}

function httpsUri(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  uri(parent, key, path);
  if (!String(parent[key]).startsWith("https://")) {
    invalid(path, "an HTTPS URL");
  }
}

function oneOf(
  parent: Record<string, unknown>,
  key: string,
  values: readonly string[],
  path = key,
) {
  if (!values.includes(parent[key] as string)) {
    invalid(path, `one of ${values.join(", ")}`);
  }
}

function messageKind(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  oneOf(parent, key, ["text", "voice", "image", "video", "document"], path);
}

function messageKinds(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  const values = array(parent[key], path);
  values.forEach((value, index) => {
    if (!["text", "voice", "image", "video", "document"].includes(
      value as string,
    )) {
      invalid(`${path}[${index}]`, "a supported message kind");
    }
  });
}

function optionalMessageKinds(
  parent: Record<string, unknown>,
  key: string,
  path = key,
) {
  if (parent[key] !== undefined) messageKinds(parent, key, path);
}

function array(value: unknown, path: string) {
  if (!Array.isArray(value)) invalid(path, "an array");
  return value;
}

function arrayOfStrings(value: unknown, path: string) {
  const values = array(value, path);
  values.forEach((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      invalid(`${path}[${index}]`, "a string");
    }
  });
}

function arrayOfNumbers(value: unknown, path: string) {
  const values = array(value, path);
  values.forEach((item, index) => {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      invalid(`${path}[${index}]`, "a number");
    }
  });
}

function arrayOfRecords(value: unknown, path: string) {
  array(value, path).forEach((item, index) =>
    record(item, `${path}[${index}]`)
  );
}

function invalid(path: string, expected: string): never {
  throw new RobonoWebhookError(
    `The Robono webhook field "${path}" must be ${expected}.`,
    "invalid_webhook_payload",
  );
}

function header(headers: Headers | WebhookHeaders, name: string) {
  if (headers instanceof Headers) return headers.get(name) ?? "";
  const match = Object.entries(headers).find(([key]) =>
    key.toLowerCase() === name
  );
  const value = match?.[1];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function safeEqual(received: string, expected: string) {
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  const left = Buffer.from(received, "hex");
  const right = Buffer.from(expected, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
