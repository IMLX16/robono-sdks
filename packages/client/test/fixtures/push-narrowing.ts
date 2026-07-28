import type { RobonoPushEvent } from "../../dist/index.js";

export function pushRouting(event: RobonoPushEvent) {
  switch (event.event) {
    case "diagnostic.push_requested":
      return {
        diagnosticId: event.push_diagnostic_id,
        diagnosticToken: event.diagnostic_token,
      };
    case "bridge.message_created":
    case "bridge.message_status_changed":
      return {
        connectionId: event.bridge_connection_id,
        messageId: event.bridge_message_id,
      };
    case "message.created":
      return {
        connectionId: event.connection_id,
        messageId: event.robono_message_id,
      };
    default:
      return null;
  }
}
