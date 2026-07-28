import assert from "node:assert/strict";
import { RobonoServer } from "../dist/index.js";

const keyA = process.env.ROBONO_SANDBOX_KEY_A;
const keyB = process.env.ROBONO_SANDBOX_KEY_B;
const networkBId = process.env.ROBONO_SANDBOX_NETWORK_B_ID;
const baseUrl = process.env.ROBONO_SANDBOX_BASE_URL ??
  "https://api.robono.com/v1";

if (!keyA || !keyB || !networkBId) {
  throw new Error(
    "Set ROBONO_SANDBOX_KEY_A, ROBONO_SANDBOX_KEY_B, and ROBONO_SANDBOX_NETWORK_B_ID.",
  );
}

const networkA = new RobonoServer({ apiKey: keyA, baseUrl });
const networkB = new RobonoServer({ apiKey: keyB, baseUrl });
const runId = Date.now().toString(36);
const userA = `sandbox-a-${runId}`;
const userB = `sandbox-b-${runId}`;

const directory = await networkA.directory.list();
assert.equal(directory.directory.some((item) => item.id === networkBId), true);
assert.equal(
  directory.directory.some((item) => item.type === "robono_phone"),
  false,
);

const requested = await networkA.networkConnections.request({
  target_app_id: networkBId,
  source_external_user_id: userA,
  source_display_name: "Alex",
  target_identifier: `B-FRIEND-${runId}`,
});
assert.equal(requested.status, "pending_target_approval");

const pending = await networkB.networkConnections.list({
  status: "pending_target_approval",
});
assert.equal(
  pending.connections.some((item) =>
    item.bridge_connection_id === requested.bridge_connection_id
  ),
  true,
);

const accepted = await networkB.networkConnections.respond({
  bridge_connection_id: requested.bridge_connection_id,
  status: "accepted",
  target_external_user_id: userB,
  target_display_name: "Bailey",
});
assert.equal(accepted.status, "accepted");

const sent = await networkA.messages.send({
  bridge_connection_id: requested.bridge_connection_id,
  external_user_id: userA,
  external_message_id: `message-${runId}`,
  message_kind: "text",
  text_body: "Hello from the Robono stateful sandbox.",
});
assert.ok(["stored", "accepted"].includes(sent.status));

const received = await networkB.messages.list({
  bridge_connection_id: requested.bridge_connection_id,
  external_user_id: userB,
});
const inbound = received.messages.find((item) =>
  item.bridge_message_id === sent.bridge_message_id
);
assert.ok(inbound);
assert.equal(inbound.direction, "inbound");
assert.equal(inbound.status, "accepted");
assert.ok(["push", "polling"].includes(inbound.accepted_via));

await networkB.messages.mark({
  bridge_connection_id: requested.bridge_connection_id,
  bridge_message_id: sent.bridge_message_id,
  event: "read",
});
const synchronized = await networkA.messages.list({
  bridge_connection_id: requested.bridge_connection_id,
  external_user_id: userA,
});
assert.equal(
  synchronized.messages.find((item) =>
    item.bridge_message_id === sent.bridge_message_id
  )?.status,
  "read",
);

await networkA.networkConnections.disconnect({
  bridge_connection_id: requested.bridge_connection_id,
  external_user_id: userA,
  reason: "sandbox_test_complete",
});

console.log(
  JSON.stringify({
    ok: true,
    bridge_connection_id: requested.bridge_connection_id,
    bridge_message_id: sent.bridge_message_id,
    accepted_via: inbound.accepted_via,
  }, null, 2),
);
