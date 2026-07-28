import type {
  RobonoClientPushPayload,
  RobonoTransformPushPayload,
  RobonoWebhookEvent,
} from "./types.js";

/**
 * Converts a verified Robono webhook into the provider-neutral data expected
 * by @robono/react-native and @robono/web.
 *
 * The result is intentionally a synchronization signal, not message content.
 * Resolve the affected child-app user on the backend, place this object in the
 * provider's custom data field, and let the authenticated client fetch current
 * state through the child-app adapter.
 */
export function toClientPushPayload(
  event: RobonoWebhookEvent,
): RobonoClientPushPayload {
  const event_id = event.event_id;
  switch (event.event) {
    case "connection.status_changed":
    case "connection.profile_updated":
      return { event: event.event, event_id, connection_id: event.connection_id };
    case "message.created":
    case "message.delivered":
    case "message.heard":
    case "message.reaction_updated":
      return {
        event: event.event,
        event_id,
        connection_id: event.connection_id,
        robono_message_id: event.robono_message_id,
      };
    case "bridge.connection_requested":
    case "bridge.connection_status_changed":
    case "bridge.connection_updated":
      return {
        event: event.event,
        event_id,
        bridge_connection_id: event.bridge_connection_id,
      };
    case "bridge.directory_changed":
      return { event: event.event, event_id };
    case "bridge.message_created":
    case "bridge.message_status_changed":
      return {
        event: event.event,
        event_id,
        bridge_connection_id: event.bridge_connection_id,
        bridge_message_id: event.bridge_message_id,
      };
    case "bridge.guardian_message_created":
    case "bridge.guardian_message_status_changed":
      return {
        event: event.event,
        event_id,
        bridge_connection_id: event.bridge_connection_id,
        guardian_message_id: event.guardian_message_id,
      };
    case "transform.completed":
    case "transform.failed": {
      const payload: RobonoTransformPushPayload = {
        event: event.event,
        event_id,
      };
      if (event.connection_id) payload.connection_id = event.connection_id;
      if (event.message_id) payload.robono_message_id = event.message_id;
      return payload;
    }
    case "diagnostic.push_requested":
      return {
        event: event.event,
        event_id,
        push_diagnostic_id: event.push_diagnostic_id,
        diagnostic_token: event.diagnostic_token,
      };
  }
}
