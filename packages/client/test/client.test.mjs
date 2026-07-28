import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createRobonoHttpTransport, RobonoClient } from "../dist/index.js";

function fakeTransport() {
  const directory = [
    {
      type: "connected_app",
      id: "network-2",
      slug: "network-2",
      display_name: "Network 2",
      description: "",
      icon_url: "",
      accepts_inbound_bridge_requests: true,
      accepted_identifier: {
        label: "Friend code",
        description: "",
        example: "BLUE-STAR",
        format: "text",
      },
      default_capabilities: {},
    },
    {
      type: "robono_phone",
      id: "robono-phone",
      slug: "robono-phone",
      display_name: "Robono",
      description: "",
      icon_url: "",
      accepts_inbound_bridge_requests: true,
      accepted_identifier: {
        label: "Phone number",
        description: "",
        example: "+15551234567",
        format: "e164",
      },
      default_capabilities: {},
    },
  ];
  const connection = {
    bridge_connection_id: "connection-1",
    status: "accepted",
    source: {
      external_user_id: "user-1",
      app: { id: "network-1", slug: "network-1" },
    },
    target: {
      external_user_id: "friend-1",
      app: { id: "network-2", slug: "network-2" },
    },
    guardian_messaging_enabled: false,
    capabilities: {},
    created_at: "2026-07-19T00:00:00.000Z",
  };
  const message = {
    bridge_message_id: "message-1",
    bridge_connection_id: "connection-1",
    direction: "inbound",
    sender_external_user_id: "friend-1",
    external_message_id: "external-1",
    message_kind: "text",
    text_body: "Hello",
    media: {},
    status: "accepted",
    accepted_at: "2026-07-19T00:00:01.000Z",
    accepted_via: "polling",
    delivered_at: null,
    read_at: null,
    heard_at: null,
    failed_at: null,
    failure_code: null,
    created_at: "2026-07-19T00:00:01.000Z",
  };
  const robonoConnection = {
    connection_id: "phone-1",
    conversation_id: "conversation-1",
    status: "active",
    external_user_id: "user-1",
    external_display_name: "Jordan",
    target_contact_label: "Taylor",
    capabilities: {},
    phone_masked: "***-***-4567",
    created_at: "2026-07-19T00:00:00.000Z",
  };
  const robonoMessage = {
    robono_message_id: "phone-message-1",
    connection_id: "phone-1",
    direction: "inbound",
    external_message_id: null,
    message_kind: "text",
    text_body: "Hello from Robono",
    media: {},
    status: "delivered",
    delivered_at: "2026-07-19T00:00:02.000Z",
    read_at: null,
    heard_at: null,
    failed_at: null,
    failure_code: null,
    created_at: "2026-07-19T00:00:02.000Z",
  };
  return {
    listNetworks: async () => ({ directory }),
    listLanguages: async () => ({
      languages: [
        { code: "en", name: "English" },
        { code: "es", name: "Spanish" },
      ],
    }),
    requestNetworkConnection: async () => connection,
    respondNetworkConnection: async () => connection,
    listNetworkConnections: async () => ({ connections: [connection], has_more: false, next_before: null }),
    disconnectNetworkConnection: async () => ({ ...connection, status: "disconnected" }),
    updateNetworkConnection: async () => connection,
    createRobonoConnection: async () => robonoConnection,
    listRobonoConnections: async () => ({ connections: [robonoConnection], has_more: false, next_before: null }),
    updateRobonoConnection: async () => robonoConnection,
    disconnectRobonoConnection: async () => ({ ...robonoConnection, status: "disconnected" }),
    sendNetworkMessage: async () => ({ bridge_message_id: "message-2", status: "accepted" }),
    listNetworkMessages: async () => ({ messages: [message], has_more: false, next_before: null }),
    markNetworkMessage: async (input) => ({ bridge_message_id: input.bridge_message_id, status: input.event }),
    sendRobonoMessage: async () => ({
      robono_message_id: "phone-message-2",
      status: "stored",
    }),
    listRobonoMessages: async () => ({ messages: [robonoMessage], has_more: false, next_before: null }),
    markRobonoMessage: async (input) => ({
      message_id: input.robono_message_id,
      status: input.event,
      occurred_at: input.occurred_at ?? "2026-07-19T00:00:03.000Z",
    }),
    sendGuardianMessage: async () => ({
      guardian_message_id: "guardian-message-1",
      status: "accepted",
    }),
    listGuardianMessages: async () => ({
      messages: [],
      has_more: false,
      next_before: null,
    }),
    markGuardianMessage: async (input) => ({
      guardian_message_id: input.guardian_message_id,
      status: input.event,
      occurred_at: input.occurred_at ?? "2026-07-19T00:00:03.000Z",
    }),
    transformMessage: async () => transformResponse(),
    transformSpeech: async () => transformResponse(),
    reportPushDiagnostic: async () => ({
      ok: true,
      request_id: "req-diagnostic",
      diagnostic: {},
    }),
  };
}

test("push examples compile with event-specific narrowing", () => {
  const result = spawnSync(
    "npx",
    [
      "--no-install",
      "tsc",
      "--ignoreConfig",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--types",
      "node",
      "test/fixtures/push-narrowing.ts",
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("malformed push payloads are rejected before synchronization", async () => {
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport: fakeTransport(),
    pollingEnabled: false,
  });
  await assert.rejects(
    client.receivePush({
      event: "bridge.message_created",
      bridge_connection_id: "connection-1",
    }),
    /bridge_message_id/,
  );
  assert.equal(client.getState().diagnostics.pushEventsReceived, 0);
});

function transformResponse() {
  return {
    ok: true,
    request_id: "req-transform",
    status: "completed",
    processing: "synchronous",
    artifacts: {},
    billing: {
      bill_to: "sandbox",
      charged: false,
      operation_count: 0,
      operations: [],
      cache_reused: false,
    },
  };
}

test("polling fallback exposes how an inbound message arrived", async () => {
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport: fakeTransport(),
    pollingEnabled: false,
  });
  await client.start();
  const state = client.getState();
  assert.equal(state.messagesByConnection["connection-1"][0].accepted_via, "polling");
  assert.equal(state.diagnostics.lastUpdateVia, "polling");
  assert.equal(state.diagnostics.pollingRecoveries, 2);
  client.stop();
});

test("unified state synchronizes connected-app and Robono endpoint conversations", async () => {
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport: fakeTransport(),
    pollingEnabled: false,
  });
  await client.start();
  const state = client.getState();
  assert.deepEqual(
    state.connections.map((item) => item.endpoint_type).sort(),
    ["connected_app", "robono_phone"],
  );
  assert.equal(
    state.messagesByConnection["phone-1"][0].text_body,
    "Hello from Robono",
  );
  client.stop();
});

test("push events are counted and trigger immediate synchronization", async () => {
  const client = new RobonoClient({ externalUserId: "user-1", transport: fakeTransport(), pollingEnabled: false });
  await client.receivePush({
    event: "bridge.message_created",
    bridge_connection_id: "connection-1",
    bridge_message_id: "message-1",
  });
  const state = client.getState();
  assert.equal(state.diagnostics.pushEventsReceived, 1);
  assert.equal(state.diagnostics.lastUpdateVia, "push");
  assert.ok(state.diagnostics.lastPushAt);
});

test("push refreshes only its connection and uses the message delta cursor", async () => {
  const transport = fakeTransport();
  const networkConnectionInputs = [];
  const networkMessageInputs = [];
  let robonoConnectionCalls = 0;
  const originalNetworkConnections = transport.listNetworkConnections;
  const originalNetworkMessages = transport.listNetworkMessages;
  transport.listNetworkConnections = async (input) => {
    networkConnectionInputs.push(input);
    return originalNetworkConnections(input);
  };
  transport.listRobonoConnections = async (...args) => {
    robonoConnectionCalls += 1;
    return fakeTransport().listRobonoConnections(...args);
  };
  transport.listNetworkMessages = async (input) => {
    networkMessageInputs.push(input);
    const page = await originalNetworkMessages(input);
    return {
      ...page,
      next_after: page.messages.at(-1)?.created_at ?? input.after ?? null,
      sync_cursor: page.messages.at(-1)?.created_at ?? input.after ?? null,
    };
  };
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  await client.start();
  networkConnectionInputs.length = 0;
  networkMessageInputs.length = 0;
  robonoConnectionCalls = 0;

  await client.receivePush({
    event: "bridge.message_created",
    bridge_connection_id: "connection-1",
    bridge_message_id: "message-1",
  });

  assert.equal(networkConnectionInputs.length, 1);
  assert.equal(
    networkConnectionInputs[0].bridge_connection_id,
    "connection-1",
  );
  assert.equal(robonoConnectionCalls, 0);
  assert.equal(
    networkMessageInputs[0].after,
    "2026-07-19T00:00:01.000Z",
  );
  client.stop();
});

test("HTTP transport exposes list routes for every endpoint type", async () => {
  const urls = [];
  const transport = createRobonoHttpTransport({
    baseUrl: "https://child.example",
    getAccessToken: () => "child-session",
    fetch: async (url) => {
      urls.push(url);
      return Response.json({ ok: true, status: "stored" });
    },
  });
  await transport.sendNetworkMessage({
    bridge_connection_id: "network-1",
    external_user_id: "user-1",
    external_message_id: "network-message-1",
    message_kind: "text",
    text_body: "Network",
  });
  await transport.listLanguages();
  await transport.sendRobonoMessage({
    connection_id: "phone-1",
    external_user_id: "user-1",
    external_message_id: "phone-message-1",
    message_kind: "text",
    text_body: "Phone",
  });
  await transport.listRobonoConnections({
    external_user_id: "user-1",
  });
  await transport.listRobonoMessages({
    connection_id: "phone-1",
    external_user_id: "user-1",
  });
  await transport.markRobonoMessage({
    connection_id: "phone-1",
    robono_message_id: "phone-message-1",
    external_user_id: "user-1",
    event: "read",
  });
  assert.deepEqual(urls, [
    "https://child.example/robono/network-messages",
    "https://child.example/robono/languages",
    "https://child.example/robono/messages",
    "https://child.example/robono/connections/list",
    "https://child.example/robono/messages/list",
    "https://child.example/robono/message-events",
  ]);
});

test("client transforms preserve caller idempotency and expose diagnostics", async () => {
  const calls = [];
  const transport = createRobonoHttpTransport({
    baseUrl: "https://child.example",
    getAccessToken: () => "child-session",
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/push-diagnostics/events")) {
        return Response.json({
          ok: true,
          request_id: "req-diagnostic",
          diagnostic: {},
        });
      }
      return Response.json(transformResponse());
    },
  });
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  await client.transforms.speech({
    input: { type: "text", text: "Hello" },
    outputs: ["voice"],
  }, { idempotencyKey: "translate-message-42" });
  await client.diagnostics.reportPush({
    diagnostic_id: "diagnostic-1",
    diagnostic_token: "diagnostic-token",
    stage: "device_received",
  });

  assert.equal(
    calls[0].init.headers["idempotency-key"],
    "translate-message-42",
  );
  assert.equal(
    calls[1].url,
    "https://child.example/robono/push-diagnostics/events",
  );
});

test("client writes preserve stable idempotency options", async () => {
  const transport = fakeTransport();
  let capturedOptions;
  transport.requestNetworkConnection = async (_input, options) => {
    capturedOptions = options;
    return fakeTransportConnection();
  };
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const endpoint = (await client.networks.list()).directory[0];
  await client.connections.connect({
    endpoint,
    external_display_name: "Jordan",
    target_identifier: "BLUE-STAR",
  }, {
    idempotencyKey: "stable-connection-request",
    requestId: "request-42",
  });
  assert.deepEqual(capturedOptions, {
    idempotencyKey: "stable-connection-request",
    requestId: "request-42",
  });
});

test("guardian messaging uses the protected client transport", async () => {
  const transport = fakeTransport();
  let captured;
  transport.sendGuardianMessage = async (input, options) => {
    captured = { input, options };
    return { guardian_message_id: "guardian-1", status: "accepted" };
  };
  const client = new RobonoClient({
    externalUserId: "guardian-7",
    transport,
    pollingEnabled: false,
  });
  await client.guardianMessages.send({
    bridge_connection_id: "connection-1",
    external_message_id: "external-guardian-1",
    text_body: "Pickup is at four.",
  }, { idempotencyKey: "guardian-message-1" });
  assert.equal(captured.input.external_guardian_id, "guardian-7");
  assert.equal(captured.options.idempotencyKey, "guardian-message-1");
});

test("initial synchronization failures reject start with a typed error", async () => {
  const transport = fakeTransport();
  transport.listNetworks = async () => {
    throw new Error("authentication failed");
  };
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  await assert.rejects(
    client.start(),
    (error) =>
      error?.name === "RobonoClientStartError" &&
      error?.code === "initial_sync_failed" &&
      error?.message.includes("authentication failed"),
  );
  assert.equal(client.getState().diagnostics.running, false);
  assert.equal(client.getState().lastError, "authentication failed");
});

test("concurrent starts wait for the same initial synchronization failure", async () => {
  const transport = fakeTransport();
  let rejectInitial;
  transport.listNetworks = () =>
    new Promise((_, reject) => {
      rejectInitial = reject;
    });
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const first = client.start();
  const second = client.start();
  let secondSettled = false;
  second.finally(() => {
    secondSettled = true;
  }).catch(() => undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(secondSettled, false);
  rejectInitial(new Error("initial auth failed"));
  await assert.rejects(first, /initial auth failed/);
  await assert.rejects(second, /initial auth failed/);
});

test("authoritative refresh removes connections no longer returned", async () => {
  const transport = fakeTransport();
  let present = true;
  transport.listNetworkConnections = async () => ({
    connections: present ? [fakeTransportConnection()] : [],
    has_more: false,
    next_before: null,
  });
  transport.listRobonoConnections = async () => ({
    connections: [],
    has_more: false,
    next_before: null,
  });
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  await client.start();
  assert.equal(client.getState().connections.length, 1);
  present = false;
  await client.sync();
  assert.equal(client.getState().connections.length, 0);
});

test("targeted refresh removes an inaccessible connection", async () => {
  const transport = fakeTransport();
  let present = true;
  transport.listNetworkConnections = async (input) => ({
    connections: present || !input.bridge_connection_id
      ? [fakeTransportConnection()]
      : [],
    has_more: false,
    next_before: null,
  });
  transport.listRobonoConnections = async () => ({
    connections: [],
    has_more: false,
    next_before: null,
  });
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  await client.start();
  const beforeTargetedSync =
    client.getState().diagnostics.lastConnectionSyncAt;
  await new Promise((resolve) => setTimeout(resolve, 2));
  present = false;
  await client.receivePush({
    event: "bridge.connection_status_changed",
    bridge_connection_id: "connection-1",
  });
  assert.equal(client.getState().connections.length, 0);
  assert.ok(
    client.getState().diagnostics.lastConnectionSyncAt >
      beforeTargetedSync,
  );
});

test("push arriving during polling receives an immediate follow-up sync", async () => {
  const transport = fakeTransport();
  let releaseFirst;
  let firstFull = true;
  const calls = [];
  transport.listNetworkConnections = async (input) => {
    calls.push(input);
    if (firstFull && !input.bridge_connection_id) {
      firstFull = false;
      await new Promise((resolve) => {
        releaseFirst = resolve;
      });
    }
    return {
      connections: [fakeTransportConnection()],
      has_more: false,
      next_before: null,
    };
  };
  transport.listRobonoConnections = async () => ({
    connections: [],
    has_more: false,
    next_before: null,
  });
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const polling = client.sync("polling");
  while (!releaseFirst) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const push = client.receivePush({
    event: "bridge.message_created",
    bridge_connection_id: "connection-1",
    bridge_message_id: "message-1",
  });
  releaseFirst();
  await Promise.all([polling, push]);
  assert.ok(
    calls.some((input) => input.bridge_connection_id === "connection-1"),
  );
  assert.equal(client.getState().diagnostics.lastUpdateVia, "push");
});

test("push arriving during initial startup cannot be erased by the older response", async () => {
  const transport = fakeTransport();
  let releaseInitial;
  let call = 0;
  transport.listNetworkConnections = async () => {
    call += 1;
    if (call === 1) {
      await new Promise((resolve) => {
        releaseInitial = resolve;
      });
      return { connections: [], has_more: false, next_before: null };
    }
    return {
      connections: [fakeTransportConnection()],
      has_more: false,
      next_before: null,
    };
  };
  transport.listRobonoConnections = async () => ({
    connections: [],
    has_more: false,
    next_before: null,
  });
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const startup = client.start();
  while (!releaseInitial) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const push = client.receivePush({
    event: "bridge.message_created",
    bridge_connection_id: "connection-1",
    bridge_message_id: "message-1",
  });
  releaseInitial();
  await Promise.all([startup, push]);
  assert.deepEqual(
    client.getState().connections.map((item) => item.connection_id),
    ["connection-1"],
  );
  assert.equal(client.getState().diagnostics.lastUpdateVia, "push");
});

test("directory refreshes after its TTL and on a directory push", async () => {
  const transport = fakeTransport();
  let directoryCalls = 0;
  const original = transport.listNetworks;
  transport.listNetworks = async () => {
    directoryCalls += 1;
    return original();
  };
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
    directoryTtlMs: 1,
  });
  await client.start();
  const afterStart = directoryCalls;
  await new Promise((resolve) => setTimeout(resolve, 2));
  await client.sync();
  assert.ok(directoryCalls > afterStart);
  const afterTtl = directoryCalls;
  await client.receivePush({ event: "bridge.directory_changed" });
  assert.equal(directoryCalls, afterTtl + 1);
});

test("HTTP transport cancels while access token retrieval is still pending", async () => {
  const transport = createRobonoHttpTransport({
    baseUrl: "https://child.example",
    getAccessToken: () => new Promise(() => undefined),
    fetch: async () => {
      throw new Error("fetch must not run");
    },
  });
  const controller = new AbortController();
  controller.abort(new Error("screen closed"));
  await assert.rejects(
    transport.requestNetworkConnection({
      external_user_id: "user-1",
      source_display_name: "Jordan",
      target_identifier: "BLUE-STAR",
    }, { signal: controller.signal }),
    (error) =>
      error?.code === "request_cancelled" &&
      error?.retryable === false &&
      !error?.message.includes("timed out"),
  );
});

test("HTTP transport exposes retry guidance from an API response", async () => {
  const transport = createRobonoHttpTransport({
    baseUrl: "https://child.example",
    getAccessToken: () => "child-session",
    fetch: async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "rate_limited",
            message: "Slow down.",
            retryable: true,
          },
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "3",
          },
        },
      ),
  });
  await assert.rejects(
    transport.requestNetworkConnection({
      external_user_id: "user-1",
      source_display_name: "Jordan",
      target_identifier: "BLUE-STAR",
    }, { retries: 0 }),
    (error) =>
      error?.code === "rate_limited" &&
      error?.retryable === true &&
      error?.retryAfterMs === 3_000,
  );
});

test("HTTP transport retries a transient write with one stable idempotency key", async () => {
  const idempotencyKeys = [];
  let calls = 0;
  const transport = createRobonoHttpTransport({
    baseUrl: "https://child.example",
    getAccessToken: () => "child-session",
    retries: 1,
    fetch: async (_url, init) => {
      calls += 1;
      idempotencyKeys.push(init.headers["idempotency-key"]);
      if (calls === 1) {
        return Response.json(
          {
            error: {
              code: "temporarily_unavailable",
              message: "Try again.",
              retryable: true,
            },
          },
          { status: 503, headers: { "retry-after": "0" } },
        );
      }
      return Response.json({
        bridge_connection_id: "connection-1",
        status: "pending_target_approval",
      });
    },
  });

  await transport.requestNetworkConnection({
    external_user_id: "user-1",
    source_display_name: "Jordan",
    target_identifier: "BLUE-STAR",
  });

  assert.equal(calls, 2);
  assert.ok(idempotencyKeys[0]?.startsWith("client_"));
  assert.equal(idempotencyKeys[1], idempotencyKeys[0]);
});

test("HTTP transport preserves validation fields and details", async () => {
  const fields = [{
    path: "target_identifier",
    code: "identifier_invalid",
    message: "Use the endpoint's identifier format.",
  }];
  const transport = createRobonoHttpTransport({
    baseUrl: "https://child.example",
    getAccessToken: () => "child-session",
    fetch: async () =>
      Response.json(
        {
          error: {
            code: "validation_failed",
            message: "The request is invalid.",
          },
          fields,
          details: { endpoint_slug: "network-b" },
        },
        { status: 422 },
      ),
  });

  await assert.rejects(
    transport.requestNetworkConnection({
      external_user_id: "user-1",
      source_display_name: "Jordan",
      target_identifier: "bad",
    }),
    (error) =>
      error?.code === "validation_failed" &&
      error?.fields?.[0]?.path === "target_identifier" &&
      error?.details?.endpoint_slug === "network-b",
  );
});

test("state snapshots cannot mutate internal connection data", async () => {
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport: fakeTransport(),
    pollingEnabled: false,
  });
  await client.start();
  const snapshot = client.getState();
  snapshot.connections[0].capabilities.changed = true;
  snapshot.connections[0].peer.display_name = "Mutated";
  assert.equal(client.getState().connections[0].capabilities.changed, undefined);
  assert.notEqual(client.getState().connections[0].peer.display_name, "Mutated");
});

test("listPage limits one page while listAll reports bounded truncation", async () => {
  const transport = fakeTransport();
  transport.listNetworkConnections = async (input) => ({
    connections: [
      fakeTransportConnection(`connection-${input.before ? "2" : "1"}`),
    ],
    has_more: !input.before,
    next_before: input.before ? null : "2026-07-18T00:00:00.000Z",
  });
  transport.listRobonoConnections = async () => ({
    connections: [],
    has_more: false,
    next_before: null,
  });
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const page = await client.connections.listPage({ limit: 1 });
  assert.equal(page.connections.length, 1);
  assert.equal(page.has_more, true);
  const bounded = await client.connections.listAll({
    pageSize: 1,
    maxItems: 1,
  });
  assert.equal(bounded.connections.length, 1);
  assert.equal(bounded.truncated, true);
  assert.equal(client.getState().diagnostics.connectionListTruncated, true);
});

test("connection pagination preserves opaque cursors when timestamps match", async () => {
  const transport = fakeTransport();
  const cursors = [];
  transport.listNetworkConnections = async (input) => {
    cursors.push(input.before ?? null);
    return input.before
      ? {
        connections: [fakeTransportConnection("connection-3")],
        has_more: false,
        next_before: null,
      }
      : {
        connections: [
          fakeTransportConnection("connection-1"),
          fakeTransportConnection("connection-2"),
        ],
        has_more: true,
        next_before: "opaque-network-page-2",
      };
  };
  transport.listRobonoConnections = async () => ({
    connections: [],
    has_more: false,
    next_before: null,
  });
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const result = await client.connections.listAll({ pageSize: 2 });
  assert.deepEqual(
    result.connections.map((connection) => connection.connection_id).sort(),
    ["connection-1", "connection-2", "connection-3"],
  );
  assert.deepEqual(cursors, [null, "opaque-network-page-2"]);
  assert.equal(result.truncated, false);
});

test("stop wins over an in-progress start", async () => {
  const transport = fakeTransport();
  let release;
  transport.listNetworks = () =>
    new Promise((resolve) => {
      release = () => resolve({
        directory: [],
        has_more: false,
        next_before: null,
      });
    });
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const starting = client.start();
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  client.stop();
  release();
  await assert.rejects(starting, /stopped before startup completed/);
  assert.equal(client.getState().diagnostics.running, false);
});

test("directory push failures are visible in client state", async () => {
  const transport = fakeTransport();
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  await client.start();
  transport.listNetworks = async () => {
    throw new Error("Directory temporarily unavailable.");
  };
  await assert.rejects(
    client.receivePush({ event: "bridge.directory_changed" }),
    /Directory temporarily unavailable/,
  );
  assert.equal(
    client.getState().lastError,
    "Directory temporarily unavailable.",
  );
});

test("unified app connection forwards approval evidence", async () => {
  const transport = fakeTransport();
  let captured;
  transport.requestNetworkConnection = async (input) => {
    captured = input;
    return fakeTransportConnection();
  };
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const endpoint = (await client.networks.list()).directory[0];
  await client.connections.connect({
    endpoint,
    external_display_name: "Jordan",
    target_identifier: "BLUE-STAR",
    monitoring_disclosure: "Guardians can review this connection.",
    external_approval: { approved_by: "guardian-1" },
  });
  assert.equal(
    captured.monitoring_disclosure,
    "Guardians can review this connection.",
  );
  assert.deepEqual(captured.external_approval, {
    approved_by: "guardian-1",
  });
});

test("unified connection listing follows every page", async () => {
  const transport = fakeTransport();
  let calls = 0;
  transport.listNetworkConnections = async (input) => {
    calls += 1;
    return calls === 1
      ? {
        connections: [fakeTransportConnection("connection-1")],
        has_more: true,
        next_before: "page-2",
      }
      : {
        connections: [fakeTransportConnection("connection-2")],
        has_more: false,
        next_before: null,
      };
  };
  transport.listRobonoConnections = async () => ({
    connections: [],
    has_more: false,
    next_before: null,
  });
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const connections = await client.connections.list();
  assert.equal(calls, 2);
  assert.deepEqual(
    connections.map((item) => item.connection_id).sort(),
    ["connection-1", "connection-2"],
  );
});

test("unified send returns the write response without a follow-up list", async () => {
  const transport = fakeTransport();
  let lists = 0;
  transport.listNetworkMessages = async () => {
    lists += 1;
    return { messages: [], has_more: false, next_before: null };
  };
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const connection = normalizeTestConnection();
  const sent = await client.messages.send({
    connection,
    external_message_id: "outbound-1",
    message_kind: "text",
    text_body: "Hello",
  });
  assert.equal(sent.message_id, "message-2");
  assert.equal(sent.status, "accepted");
  assert.equal(lists, 0);
});

test("unified send preserves attachment grouping and enforces its negotiated limit", async () => {
  const transport = fakeTransport();
  let captured;
  transport.sendNetworkMessage = async (input) => {
    captured = input;
    return { bridge_message_id: "message-batch-1", status: "accepted" };
  };
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const connection = normalizeTestConnection();
  connection.capabilities = {
    from_source_to_target: {
      allowed_message_kinds: ["image"],
      photo: { max_items_per_message: 3 },
    },
  };
  connection.raw.capabilities = connection.capabilities;
  const media = {
    source_url: "https://media.example/photo.jpg",
    mime_type: "image/jpeg",
    byte_size: 1200,
  };

  await client.messages.send({
    connection,
    external_message_id: "outbound-batch-1",
    message_kind: "image",
    media,
    attachment_batch: { id: "gallery-1", index: 0, count: 3 },
  });

  assert.deepEqual(captured.attachment_batch, {
    id: "gallery-1",
    index: 0,
    count: 3,
  });
  await assert.rejects(
    client.messages.send({
      connection,
      external_message_id: "outbound-batch-too-large",
      message_kind: "image",
      media,
      attachment_batch: { id: "gallery-2", index: 0, count: 4 },
    }),
    /limited to 3 items/,
  );
});

test("unified send rejects incompatible media before transport work", async () => {
  const transport = fakeTransport();
  let sends = 0;
  transport.sendNetworkMessage = async () => {
    sends += 1;
    throw new Error("Transport should not be called.");
  };
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const connection = normalizeTestConnection();
  connection.capabilities = {
    from_source_to_target: {
      allowed_message_kinds: ["voice"],
    },
  };
  connection.raw.capabilities = connection.capabilities;
  await assert.rejects(
    client.messages.send({
      connection,
      external_message_id: "outbound-image",
      message_kind: "image",
      media: {
        source_url: "https://media.example/photo.jpg",
        mime_type: "image/jpeg",
        byte_size: 1200,
      },
    }),
    /not allowed/,
  );
  assert.equal(sends, 0);
});

test("unified update, disconnect, and receipts route by endpoint type", async () => {
  const transport = fakeTransport();
  const calls = [];
  transport.updateNetworkConnection = async (input) => {
    calls.push(["network-update", input]);
    return fakeTransportConnection();
  };
  transport.disconnectNetworkConnection = async (input) => {
    calls.push(["network-disconnect", input]);
    return { ...fakeTransportConnection(), status: "disconnected" };
  };
  transport.markNetworkMessage = async (input) => {
    calls.push(["network-mark", input]);
    return { bridge_message_id: input.bridge_message_id, status: input.event };
  };
  transport.markRobonoMessage = async (input) => {
    calls.push(["robono-mark", input]);
    return {
      message_id: input.robono_message_id,
      status: input.event,
      occurred_at: "2026-07-19T00:00:03.000Z",
    };
  };
  const client = new RobonoClient({
    externalUserId: "user-1",
    transport,
    pollingEnabled: false,
  });
  const network = normalizeTestConnection();
  const phone = normalizeTestPhoneConnection();
  await client.connections.update({
    connection: network,
    display_name: "Updated",
  });
  await client.connections.disconnect({ connection: network });
  await client.messages.mark({
    connection: network,
    message_id: "network-message",
    event: "read",
  });
  await client.messages.mark({
    connection: phone,
    message_id: "phone-message",
    event: "heard",
  });
  assert.deepEqual(
    calls.map(([name]) => name),
    ["network-update", "network-disconnect", "network-mark", "robono-mark"],
  );
});

function fakeTransportConnection(id = "connection-1") {
  return {
    bridge_connection_id: id,
    status: "accepted",
    source: {
      external_user_id: "user-1",
      app: { id: "network-1", slug: "network-1" },
    },
    target: {
      external_user_id: "friend-1",
      app: { id: "network-2", slug: "network-2" },
    },
    guardian_messaging_enabled: false,
    capabilities: {},
    created_at: "2026-07-19T00:00:00.000Z",
  };
}

function normalizeTestConnection() {
  const raw = fakeTransportConnection();
  return {
    endpoint: {
      type: "connected_app",
      id: "network-2",
      slug: "network-2",
      display_name: "Network 2",
      description: "",
      icon_url: "",
      accepts_inbound_bridge_requests: true,
      accepted_identifier: {
        label: "Friend code",
        description: "",
        example: "BLUE-STAR",
        format: "text",
      },
      default_capabilities: {},
    },
    endpoint_type: "connected_app",
    connection_id: raw.bridge_connection_id,
    status: raw.status,
    capabilities: {},
    created_at: raw.created_at,
    raw,
  };
}

function normalizeTestPhoneConnection() {
  const raw = {
    connection_id: "phone-1",
    conversation_id: "conversation-1",
    status: "active",
    external_user_id: "user-1",
    external_display_name: "Jordan",
    target_contact_label: "Taylor",
    capabilities: {},
    phone_masked: "***-***-4567",
    created_at: "2026-07-19T00:00:00.000Z",
  };
  return {
    endpoint: {
      type: "robono_phone",
      id: "robono-phone",
      slug: "robono-phone",
      display_name: "Robono",
      description: "",
      icon_url: "",
      accepts_inbound_bridge_requests: true,
      accepted_identifier: {
        label: "Phone number",
        description: "",
        example: "+15551234567",
        format: "e164",
      },
      default_capabilities: {},
    },
    endpoint_type: "robono_phone",
    connection_id: raw.connection_id,
    status: raw.status,
    capabilities: {},
    created_at: raw.created_at,
    raw,
  };
}
