import { RobonoError } from "./errors.js";
import type {
  BridgeConnection,
  ConnectionCapabilities,
  DirectionCapabilities,
  MediaInput,
  MessageKind,
} from "./types.js";

export type BridgeDirection = "source_to_target" | "target_to_source";

export function restrictionsFor(
  connection: Pick<BridgeConnection, "capabilities"> | {
    capabilities: ConnectionCapabilities;
  },
  direction: BridgeDirection,
): DirectionCapabilities {
  const key = direction === "source_to_target"
    ? "from_source_to_target"
    : "from_target_to_source";
  const value = connection.capabilities[key];
  if (value && typeof value === "object") return value;

  const allowed = direction === "source_to_target"
    ? intersection(
      connection.capabilities.source?.allowed_outbound_message_kinds,
      connection.capabilities.target?.allowed_inbound_message_kinds,
    )
    : intersection(
      connection.capabilities.target?.allowed_outbound_message_kinds,
      connection.capabilities.source?.allowed_inbound_message_kinds,
    );
  return { allowed_message_kinds: allowed };
}

export function isMessageAllowed(
  restrictions: DirectionCapabilities,
  kind: MessageKind,
) {
  return restrictions.allowed_message_kinds.includes(kind);
}

export function assertMessageAllowed(
  restrictions: DirectionCapabilities,
  input: { messageKind: MessageKind; textBody?: string; media?: MediaInput },
) {
  if (!isMessageAllowed(restrictions, input.messageKind)) {
    throw new RobonoError(
      `The negotiated connection does not allow ${input.messageKind} messages.`,
      {
        code: "message_kind_not_allowed",
        details: { allowedMessageKinds: restrictions.allowed_message_kinds },
      },
    );
  }

  if (input.messageKind === "text") {
    const max = restrictions.text?.max_characters;
    if (max && (input.textBody?.length ?? 0) > max) {
      throw new RobonoError(
        `Text messages can contain at most ${max} characters for this connection.`,
        {
          code: "text_too_long",
          details: { maxCharacters: max },
        },
      );
    }
    return;
  }

  const section = input.messageKind === "image"
    ? restrictions.photo
    : restrictions[input.messageKind];
  const bytes = input.media?.byte_size;
  if (section?.max_file_bytes && bytes && bytes > section.max_file_bytes) {
    throw new RobonoError(
      "The media file is larger than this connection permits.",
      {
        code: "media_too_large",
        details: { maxFileBytes: section.max_file_bytes },
      },
    );
  }
  const duration = input.media?.duration_ms;
  if (
    section?.max_duration_ms && duration && duration > section.max_duration_ms
  ) {
    throw new RobonoError(
      "The media duration is longer than this connection permits.",
      {
        code: "media_too_long",
        details: { maxDurationMs: section.max_duration_ms },
      },
    );
  }
  const mime = input.media?.mime_type;
  if (
    mime && section?.allowed_input_mime_types?.length &&
    !section.allowed_input_mime_types.includes(mime)
  ) {
    throw new RobonoError(
      `The negotiated connection does not accept ${mime}.`,
      {
        code: "media_type_not_allowed",
        details: { allowedMimeTypes: section.allowed_input_mime_types },
      },
    );
  }
}

function intersection(first?: MessageKind[], second?: MessageKind[]) {
  const left = first ?? ["voice"];
  const right = new Set(second ?? ["voice"]);
  return left.filter((kind) => right.has(kind));
}
