import type {
  BridgeConnectionRequestedWebhookEvent,
} from "../../dist/index.js";

declare const pendingRequests: {
  store(input: {
    bridgeConnectionId: string;
    identifier: string;
    sourceDisplayName: string;
  }): Promise<void>;
};

declare const networkConnections: {
  respond(input: {
    bridge_connection_id: string;
    target_external_user_id: string;
    status: "accepted" | "rejected" | "not_found";
  }): Promise<unknown>;
};

export async function receiveConnectionRequest(
  event: BridgeConnectionRequestedWebhookEvent,
) {
  await pendingRequests.store({
    bridgeConnectionId: event.bridge_connection_id,
    identifier: event.target.identifier,
    sourceDisplayName: event.source.display_name,
  });

  await networkConnections.respond({
    bridge_connection_id: event.bridge_connection_id,
    target_external_user_id: "authorized-child-user",
    status: "accepted",
  });
}
