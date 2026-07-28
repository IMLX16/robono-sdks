#!/usr/bin/env node

import { RobonoServer } from "./client.js";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: robono-sandbox-test

Runs a stateful Bridge lifecycle against two Robono sandbox endpoints.

Required environment variables:
  ROBONO_SANDBOX_KEY_A
  ROBONO_SANDBOX_KEY_B
  ROBONO_SANDBOX_NETWORK_B_ID

Optional:
  ROBONO_SANDBOX_BASE_URL  Default: https://api.robono.com/v1`);
  process.exit(0);
}

const keyA = requiredEnvironmentVariable("ROBONO_SANDBOX_KEY_A");
const keyB = requiredEnvironmentVariable("ROBONO_SANDBOX_KEY_B");
const networkBId = requiredEnvironmentVariable(
  "ROBONO_SANDBOX_NETWORK_B_ID",
);
const baseUrl = process.env.ROBONO_SANDBOX_BASE_URL?.trim() ||
  "https://api.robono.com/v1";

const networkA = new RobonoServer({ apiKey: keyA, baseUrl });
const networkB = new RobonoServer({ apiKey: keyB, baseUrl });
const runId = Date.now().toString(36);
const userA = `sandbox-a-${runId}`;
const userB = `sandbox-b-${runId}`;
let bridgeConnectionId: string | null = null;
let robonoConnectionId: string | null = null;

try {
  const directory = await networkA.directory.list();
  const target = directory.directory.find((item) => item.id === networkBId);
  const robonoEndpoint = directory.directory.find((item) =>
    item.type === "robono_phone"
  );
  assert(target, "Network B is not visible to Network A.");
  assert(robonoEndpoint, "The Robono-owned sandbox endpoint is unavailable.");

  const requested = await networkA.connections.connect({
    endpoint: target,
    external_user_id: userA,
    external_display_name: "Alex",
    target_identifier: `B-FRIEND-${runId}`,
    monitoring_disclosure:
      "Sandbox approval evidence is visible to the receiving endpoint.",
    external_approval: {
      approved: true,
      source: "robono_stateful_sandbox",
    },
  });
  bridgeConnectionId = requested.connection_id;
  assert(
    requested.status === "pending_target_approval",
    `Expected a pending request; received ${requested.status}.`,
  );

  const pending = await networkB.networkConnections.list({
    status: "pending_target_approval",
  });
  assert(
    pending.connections.some((item) =>
      item.bridge_connection_id === bridgeConnectionId
    ),
    "Network B did not receive the pending connection.",
  );

  const accepted = await networkB.networkConnections.respond({
    bridge_connection_id: bridgeConnectionId,
    status: "accepted",
    target_external_user_id: userB,
    target_display_name: "Bailey",
  });
  assert(
    accepted.status === "accepted",
    `Network B did not accept the connection; received ${accepted.status}.`,
  );

  const sent = await networkA.messages.send({
    connection: requested,
    external_user_id: userA,
    external_message_id: `message-${runId}`,
    message_kind: "text",
    text_body: "Hello from the Robono stateful sandbox.",
  });
  assert(sent.message_id, "Robono did not return a bridge message ID.");

  const received = await networkB.messages.list({
    bridge_connection_id: bridgeConnectionId,
    external_user_id: userB,
  });
  const inbound = received.messages.find((item) =>
    item.bridge_message_id === sent.message_id
  );
  assert(inbound, "Network B could not retrieve the sent message.");
  assert(inbound.direction === "inbound", "The retrieved message is not inbound.");
  assert(
    inbound.accepted_via === "push" || inbound.accepted_via === "polling",
    "The message does not show whether push or polling accepted it.",
  );

  await networkB.messages.mark({
    bridge_connection_id: bridgeConnectionId,
    bridge_message_id: sent.message_id,
    event: "read",
  });
  const synchronized = await networkA.messages.list({
    bridge_connection_id: bridgeConnectionId,
    external_user_id: userA,
  });
  assert(
    synchronized.messages.find((item) =>
      item.bridge_message_id === sent.message_id
    )?.status === "read",
    "The read event did not synchronize to Network A.",
  );

  const robonoConnection = await networkA.connections.connect({
    endpoint: robonoEndpoint,
    external_user_id: userA,
    external_display_name: "Alex",
    target_identifier: "+15550100101",
  });
  robonoConnectionId = robonoConnection.connection_id;
  assert(
    robonoConnection.endpoint_type === "robono_phone",
    "The unified SDK did not preserve the Robono endpoint type.",
  );
  const robonoMessage = await networkA.messages.send({
    connection: robonoConnection,
    external_user_id: userA,
    external_message_id: `robono-message-${runId}`,
    message_kind: "text",
    text_body: "Robono endpoint sandbox validation.",
    dry_run: true,
  });
  assert(
    robonoMessage.status === "validated",
    `Expected Robono endpoint validation; received ${robonoMessage.status}.`,
  );
  await networkA.connections.disconnect({
    connection_id: robonoConnectionId,
    external_user_id: userA,
    reason: "sandbox_test_complete",
  });
  robonoConnectionId = null;

  console.log(JSON.stringify({
    ok: true,
    bridge_connection_id: bridgeConnectionId,
    bridge_message_id: sent.message_id,
    accepted_via: inbound.accepted_via,
    robono_endpoint: {
      connection_id: robonoConnection.connection_id,
      message_status: robonoMessage.status,
      real_delivery: false,
    },
  }, null, 2));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "The sandbox test failed.",
  );
  process.exitCode = 1;
} finally {
  if (bridgeConnectionId) {
    await networkA.networkConnections.disconnect({
      bridge_connection_id: bridgeConnectionId,
      external_user_id: userA,
      reason: "sandbox_test_complete",
    }).catch(() => undefined);
  }
  if (robonoConnectionId) {
    await networkA.connections.disconnect({
      connection_id: robonoConnectionId,
      external_user_id: userA,
      reason: "sandbox_test_cleanup",
    }).catch(() => undefined);
  }
}

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(
      `Set ${name}. Create Network A and Network B test credentials in the Robono Sandbox first.`,
    );
    process.exit(1);
  }
  return value;
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
