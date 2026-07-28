import type {
  JsonObject,
  RobonoPushEvent,
  RobonoPushEventName,
} from "./types.js";

const eventNames = new Set<RobonoPushEventName>([
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

export function parseRobonoPushEvent(value: unknown): RobonoPushEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Robono push data must be an object.");
  }
  const data = value as JsonObject;
  const event = requiredString(data, "event") as RobonoPushEventName;
  if (!eventNames.has(event)) {
    throw new Error(`Robono push event "${event}" is not supported.`);
  }
  optionalString(data, "event_id");

  switch (event) {
    case "connection.status_changed":
    case "connection.profile_updated":
      requiredString(data, "connection_id");
      break;
    case "message.created":
    case "message.delivered":
    case "message.heard":
    case "message.reaction_updated":
      requiredString(data, "connection_id");
      requiredString(data, "robono_message_id");
      break;
    case "bridge.connection_requested":
    case "bridge.connection_status_changed":
    case "bridge.connection_updated":
      requiredString(data, "bridge_connection_id");
      break;
    case "bridge.directory_changed":
      break;
    case "bridge.message_created":
    case "bridge.message_status_changed":
      requiredString(data, "bridge_connection_id");
      requiredString(data, "bridge_message_id");
      break;
    case "bridge.guardian_message_created":
    case "bridge.guardian_message_status_changed":
      requiredString(data, "bridge_connection_id");
      requiredString(data, "guardian_message_id");
      break;
    case "transform.completed":
    case "transform.failed":
      optionalString(data, "connection_id");
      optionalString(data, "robono_message_id");
      optionalString(data, "bridge_connection_id");
      optionalString(data, "bridge_message_id");
      break;
    case "diagnostic.push_requested":
      requiredString(data, "push_diagnostic_id");
      requiredString(data, "diagnostic_token");
      break;
  }

  return data as RobonoPushEvent;
}

function requiredString(data: JsonObject, key: string) {
  const value = data[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Robono push field "${key}" must be a string.`);
  }
  return value;
}

function optionalString(data: JsonObject, key: string) {
  if (data[key] !== undefined) requiredString(data, key);
}
