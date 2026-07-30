import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse as parseYaml } from "yaml";
import {
  restrictionsFor,
  createRobonoBackendAdapter,
  RobonoAuthenticationError,
  RobonoError,
  RobonoServer,
  toClientPushPayload,
  verifyRobonoWebhook,
} from "../dist/index.js";
import { adapterNetworksUrl } from "../dist/adapter-url.js";

function bridgeConnection() {
  return {
    bridge_connection_id: "connection-1",
    status: "accepted",
    source: {
      app: { id: "app-a" },
      external_user_id: "user-a",
      display_name: "Alex",
      guardians: [],
    },
    target: {
      app: { id: "app-b" },
      identifier: "FRIEND-B",
      external_user_id: "user-b",
      display_name: "Bailey",
      guardians: [],
    },
    guardian_messaging_enabled: false,
    capabilities: {},
    expires_at: null,
    accepted_at: "2026-07-19T12:00:00.000Z",
    responded_at: "2026-07-19T12:00:00.000Z",
    created_at: "2026-07-19T12:00:00.000Z",
  };
}

function bridgeMessageCreated(timestamp, overrides = {}) {
  return {
    event: "bridge.message_created",
    event_id: "evt_123",
    request_id: "req_123",
    created_at: timestamp,
    bridge_connection_id: "connection-1",
    bridge_message_id: "message-1",
    connection: bridgeConnection(),
    sender: { child_app_id: "app-a", external_user_id: "user-a" },
    recipient: { child_app_id: "app-b", external_user_id: "user-b" },
    message: {
      external_message_id: "external-message-1",
      message_kind: "text",
      text_body: "Hello",
      created_at: timestamp,
    },
    ...overrides,
  };
}

function webhookEvents(timestamp) {
  const base = (event) => ({
    event,
    event_id: `evt_${event.replaceAll(".", "_")}`,
    request_id: "req_contract",
    created_at: timestamp,
  });
  const connection = bridgeConnection();
  return [
    [{ ...base("connection.status_changed"), connection_id: "direct-1", status: "active" }, "connection_id"],
    [{ ...base("connection.profile_updated"), connection_id: "direct-1", status: "active" }, "status"],
    [{
      ...base("message.created"),
      connection_id: "direct-1",
      robono_message_id: "direct-message-1",
      external_user_id: "user-a",
      sender: {
        type: "robono_user",
        robono_user_id: "robono-user-1",
        display_name: "Alex",
        avatar_url: null,
        avatar_version: null,
        avatar_updated_at: null,
        profile_updated_at: null,
        phone_masked: null,
      },
      message_kind: "text",
      text_body: "Hello",
      media: null,
    }, "sender"],
    [{
      ...base("message.delivered"),
      connection_id: "direct-1",
      robono_message_id: "direct-message-1",
      external_message_id: null,
    }, "external_message_id"],
    [{
      ...base("message.heard"),
      connection_id: "direct-1",
      robono_message_id: "direct-message-1",
      external_message_id: "external-1",
    }, "robono_message_id"],
    [{
      ...base("message.reaction_updated"),
      connection_id: "direct-1",
      robono_message_id: "direct-message-1",
      external_message_id: "external-message-1",
      external_user_id: "user-a",
      reaction: {
        emoji: "❤️",
        removed: false,
        reacted_at: timestamp,
      },
      reactor: {
        type: "robono_user",
        robono_user_id: "robono-user-1",
        display_name: "Alex",
        phone_masked: null,
      },
    }, "reaction"],
    [{
      ...base("bridge.connection_requested"),
      bridge_connection_id: "connection-1",
      source: connection.source,
      target: {
        app: { id: "app-b" },
        identifier: "FRIEND-B",
        contact_label: null,
        accepted_identifier: {
          label: "Friend code",
          description: "Enter the code shown in the friend's app.",
          example: "FRIEND-B",
          format: "App-issued friend code",
          input_type: "text",
          min_length: 6,
          max_length: 32,
          normalization: "uppercase",
          case_sensitive: false,
        },
      },
      capabilities: {},
    }, "target"],
    [{
      ...base("bridge.connection_status_changed"),
      bridge_connection_id: "connection-1",
      connection,
    }, "connection"],
    [{
      ...base("bridge.connection_updated"),
      bridge_connection_id: "connection-1",
      connection,
    }, "bridge_connection_id"],
    [{
      ...base("bridge.directory_changed"),
      endpoint_id: "app-b",
      change: "updated",
    }, "change"],
    [bridgeMessageCreated(timestamp), "message"],
    [{
      ...base("bridge.message_status_changed"),
      bridge_connection_id: "connection-1",
      bridge_message_id: "message-1",
      status: "read",
    }, "status"],
    [{
      ...base("bridge.guardian_message_created"),
      bridge_connection_id: "connection-1",
      guardian_message_id: "guardian-message-1",
      connection,
      sender_guardian: {
        external_guardian_id: "guardian-a",
        display_name: "Alex",
        relationship_to_child: "parent",
        avatar_url: null,
      },
      recipient_guardians: [{
        external_guardian_id: "guardian-b",
        display_name: "Taylor",
        relationship_to_child: "parent",
        avatar_url: null,
      }],
      sender_child: {
        child_app_id: "app-a",
        external_user_id: "user-a",
        display_name: "Alex",
      },
      recipient_child: {
        child_app_id: "app-b",
        external_user_id: "user-b",
        display_name: "Bailey",
      },
      message: {
        external_message_id: "guardian-external-1",
        message_kind: "text",
        text_body: "Pickup is at four.",
        created_at: timestamp,
      },
    }, "sender_guardian"],
    [{
      ...base("bridge.guardian_message_status_changed"),
      bridge_connection_id: "connection-1",
      guardian_message_id: "guardian-message-1",
      status: "read",
    }, "status"],
    [{
      ...base("transform.completed"),
      transform_kind: "speech",
      status: "completed",
      artifacts: {
        transcript: {
          text: "Hello",
          language: "en",
          cached: false,
        },
        voice: {
          media_object_id: "media-object-1",
          media: {
            source_url: "https://cdn.example.test/generated.mp3",
            source_url_expires_at: "2026-07-25T12:05:00.000Z",
            mime_type: "audio/mpeg",
            duration_ms: 800,
            byte_size: 4096,
            waveform: [0.1, 0.8, 0.2],
            generated_by: "robono",
            generated_kind: "tts_audio",
          },
          language: "en",
          cached: false,
          disclosure: "Generated voice",
        },
      },
      billing: {
        bill_to: "sandbox",
        charged: false,
        operation_count: 2,
        operations: [
          { type: "transcription", quantity: 1, billable: false },
          { type: "tts", quantity: 1, billable: false },
        ],
        cache_reused: false,
      },
    }, "billing"],
    [{
      ...base("transform.failed"),
      transform_kind: "message",
      status: "failed",
      error: { code: "failed", message: "Transform failed." },
    }, "error"],
    [{
      ...base("diagnostic.push_requested"),
      push_diagnostic_id: "diagnostic-1",
      diagnostic_token: "diagnostic-token",
      external_user_id: "user-a",
    }, "diagnostic_token"],
    [{
      ...base("data.deletion_completed"),
      data_request_id: "data-request-1",
      request_type: "deletion",
      status: "completed",
      external_request_id: "privacy-request-1",
      result_summary: { network_connections_deleted: 1 },
      failure_code: null,
    }, "result_summary"],
  ];
}

test("directory request authenticates and normalizes options", async () => {
  let captured;
  const client = new RobonoServer({
    apiKey: "rbn_test_example",
    baseUrl: "https://sandbox.example/v1",
    fetch: async (url, init) => {
      captured = { url, init };
      return Response.json({ ok: true, request_id: "req_1", directory: [] });
    },
  });
  const response = await client.directory.list({
    includePhoneRobono: false,
    includeSelf: true,
  });
  assert.equal(response.ok, true);
  assert.equal(captured.url, "https://sandbox.example/v1/networks");
  assert.equal(captured.init.headers.authorization, "Bearer rbn_test_example");
  assert.equal(captured.init.headers["robono-api-version"], "2026-07-25");
  assert.equal(captured.init.headers["x-client-info"], "@robono/server/0.8.1");
  assert.deepEqual(JSON.parse(captured.init.body), {
    include_phone_robono: false,
    include_self: true,
  });
});

test("health follows the production GET contract without authentication", async () => {
  let captured;
  const client = new RobonoServer({
    apiKey: "rbn_test_example",
    fetch: async (url, init) => {
      captured = { url, init };
      return Response.json({ ok: true, service: "robono-api" });
    },
  });

  const response = await client.health();

  assert.deepEqual(response, { ok: true, service: "robono-api" });
  assert.equal(captured.url, "https://api.robono.com/health");
  assert.equal(captured.init.method, "GET");
  assert.equal(captured.init.body, undefined);
  assert.equal(captured.init.headers.authorization, undefined);
  assert.equal(captured.init.headers["content-type"], undefined);
});

test("backend adapter replaces untrusted user ids with the authenticated child app user", async () => {
  let body;
  let targetUrl;
  const robono = new RobonoServer({
    apiKey: "rbn_test_example",
    fetch: async (url, init) => {
      targetUrl = url;
      body = JSON.parse(init.body);
      return Response.json({
        ok: true,
        request_id: "req_1",
        connections: [],
        has_more: false,
        next_before: null,
      });
    },
  });
  const adapter = createRobonoBackendAdapter({
    robono,
    authenticate: async () => "authenticated-user",
    authorize: async () => true,
  });
  const response = await adapter(new Request("https://child.example/robono/network-connections/list", {
    method: "POST",
    body: JSON.stringify({ external_user_id: "different-user" }),
  }));
  assert.equal(response.status, 200);
  assert.equal(targetUrl, "https://api.robono.com/v1/network-connections/list");
  assert.equal(body.external_user_id, "authenticated-user");
});

test("backend adapter keeps Phone / Robono calls separate from network calls", async () => {
  let targetUrl;
  let body;
  const robono = new RobonoServer({
    apiKey: "rbn_live_example",
    fetch: async (url, init) => {
      targetUrl = url;
      body = JSON.parse(init.body);
      return Response.json({ ok: true, request_id: "req_1", connection_id: "phone_1", status: "active" });
    },
  });
  const adapter = createRobonoBackendAdapter({
    robono,
    authenticate: async () => "authenticated-user",
    authorize: async () => true,
  });
  const response = await adapter(new Request("https://child.example/robono/connections", {
    method: "POST",
    body: JSON.stringify({
      target_phone_e164: "+15550100101",
      external_display_name: "Jordan",
      external_user_id: "untrusted-user",
    }),
  }));
  assert.equal(response.status, 200);
  assert.equal(targetUrl, "https://api.robono.com/v1/connections");
  assert.equal(body.external_user_id, "authenticated-user");
});

test("backend adapter denies an operation unless the child app authorizes it", async () => {
  let apiCalled = false;
  let authorization;
  const robono = new RobonoServer({
    apiKey: "rbn_test_example",
    fetch: async () => {
      apiCalled = true;
      return Response.json({ ok: true, request_id: "req_1" });
    },
  });
  const adapter = createRobonoBackendAdapter({
    robono,
    authenticate: async () => "authenticated-user",
    authorize: async (context) => {
      authorization = context;
      return false;
    },
  });
  const response = await adapter(new Request("https://child.example/robono/network-connections", {
    method: "POST",
    body: JSON.stringify({
      source_external_user_id: "spoofed-user",
      source_display_name: "Jordan",
      target_identifier: "BLUE-STAR",
    }),
  }));
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "operation_not_authorized");
  assert.equal(apiCalled, false);
  assert.equal(authorization.action, "network_connections.request");
  assert.equal(authorization.userId, "authenticated-user");
  assert.equal(authorization.input.source_external_user_id, "authenticated-user");
});

test("backend adapter denies operations when authorization is missing at runtime", async () => {
  let apiCalled = false;
  const robono = new RobonoServer({
    apiKey: "rbn_test_example",
    fetch: async () => {
      apiCalled = true;
      return Response.json({ ok: true, request_id: "req_1" });
    },
  });
  const adapter = createRobonoBackendAdapter({
    robono,
    authenticate: async () => "authenticated-user",
  });
  const response = await adapter(new Request("https://child.example/robono/networks", {
    method: "POST",
    body: "{}",
  }));

  assert.equal(response.status, 403);
  assert.equal(apiCalled, false);
});

test("backend adapter requests authorization for every exposed operation", async () => {
  const expected = new Map([
    ["/networks", "networks.list"],
    ["/languages", "languages.list"],
    ["/network-connections", "network_connections.request"],
    ["/network-connections/respond", "network_connections.respond"],
    ["/network-connections/list", "network_connections.list"],
    ["/network-connections/disconnect", "network_connections.disconnect"],
    ["/network-connections/update", "network_connections.update"],
    ["/connections", "robono_connections.create"],
    ["/connections/list", "robono_connections.list"],
    ["/connections/profile", "robono_connections.update_profile"],
    ["/connections/disconnect", "robono_connections.disconnect"],
    ["/network-messages", "network_messages.send"],
    ["/network-messages/list", "network_messages.list"],
    ["/network-messages/events", "network_messages.mark"],
    ["/messages", "robono_messages.send"],
    ["/messages/list", "robono_messages.list"],
    ["/message-events", "robono_messages.mark"],
    ["/guardian-messages", "guardian_messages.send"],
    ["/guardian-messages/list", "guardian_messages.list"],
    ["/guardian-messages/events", "guardian_messages.mark"],
    ["/transforms/message", "message_transforms.create"],
    ["/transforms/speech", "speech_transforms.create"],
    ["/push-diagnostics/events", "push_diagnostics.report"],
  ]);
  const actions = [];
  const robono = new RobonoServer({
    apiKey: "rbn_test_example",
    fetch: async () => {
      throw new Error("A denied operation reached the Robono API.");
    },
  });
  const adapter = createRobonoBackendAdapter({
    robono,
    authenticate: () => "authenticated-user",
    authorize: ({ action }) => {
      actions.push(action);
      return false;
    },
  });

  for (const path of expected.keys()) {
    const response = await adapter(new Request(`https://child.example/robono${path}`, {
      method: "POST",
      body: "{}",
    }));
    assert.equal(response.status, 403, path);
  }
  assert.deepEqual(actions, [...expected.values()]);
});

test("published CLIs show help without requiring credentials", () => {
  for (const cli of ["sandbox-test.js", "adapter-smoke-test.js"]) {
    const result = spawnSync(
      process.execPath,
      [new URL(`../dist/${cli}`, import.meta.url).pathname, "--help"],
      { encoding: "utf8", env: {} },
    );
    assert.equal(result.status, 0, `${cli}: ${result.stderr}`);
    assert.match(result.stdout, /Usage:/);
  }
});

test("adapter smoke test treats ROBONO_ADAPTER_URL as the full mount URL", () => {
  assert.equal(
    adapterNetworksUrl("https://child.example/robono"),
    "https://child.example/robono/networks",
  );
  assert.equal(
    adapterNetworksUrl("https://child.example/bridge/robono/"),
    "https://child.example/bridge/robono/networks",
  );
});

test("published documentation examples compile under strict TypeScript", () => {
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
      "test/fixtures/docs-incoming-connection.ts",
      "test/fixtures/docs-core-examples.ts",
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("guardian adapter operations use the authenticated adult identity", async () => {
  let captured;
  const robono = new RobonoServer({
    apiKey: "rbn_test_example",
    fetch: async (url, init) => {
      captured = { url, body: JSON.parse(init.body) };
      return Response.json({
        ok: true,
        request_id: "req_guardian",
        guardian_message_id: "guardian-message-1",
        status: "accepted",
      });
    },
  });
  const adapter = createRobonoBackendAdapter({
    robono,
    authenticate: () => "guardian-authenticated",
    authorize: ({ action, input }) =>
      action === "guardian_messages.send" &&
      input.external_guardian_id === "guardian-authenticated",
  });
  const response = await adapter(new Request(
    "https://child.example/robono/guardian-messages",
    {
      method: "POST",
      headers: { "idempotency-key": "guardian-operation-1" },
      body: JSON.stringify({
        bridge_connection_id: "connection-1",
        external_guardian_id: "untrusted-id",
        external_message_id: "external-1",
        text_body: "Pickup at four.",
      }),
    },
  ));
  assert.equal(response.status, 200);
  assert.equal(captured.url.endsWith("/guardian-messages"), true);
  assert.equal(captured.body.external_guardian_id, "guardian-authenticated");
});

test("receipt authorization uses a targeted connection ownership lookup", async () => {
  const listBodies = [];
  const robono = new RobonoServer({
    apiKey: "rbn_test_example",
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      if (url.endsWith("/network-connections/list")) {
        listBodies.push(body);
        return Response.json({
          ok: true,
          request_id: "req_lookup",
          connections: [{ bridge_connection_id: "connection-101" }],
          has_more: false,
          next_before: null,
        });
      }
      if (url.endsWith("/network-messages/events")) {
        return Response.json({
          ok: true,
          request_id: "req_receipt",
          bridge_message_id: "message-101",
          status: "read",
          occurred_at: "2026-07-25T12:01:00.000Z",
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  const adapter = createRobonoBackendAdapter({
    robono,
    authenticate: () => "user-101",
    authorize: () => true,
  });
  const response = await adapter(new Request(
    "https://child.example/robono/network-messages/events",
    {
      method: "POST",
      body: JSON.stringify({
        bridge_connection_id: "connection-101",
        bridge_message_id: "message-101",
        event: "read",
      }),
    },
  ));

  assert.equal(response.status, 200);
  assert.equal(listBodies.length, 1);
  assert.equal(listBodies[0].bridge_connection_id, "connection-101");
  assert.equal(listBodies[0].external_user_id, "user-101");
  assert.equal(listBodies[0].limit, 1);
});

test("adapter separates validation failures from sanitized internal failures", async () => {
  const robono = new RobonoServer({
    apiKey: "rbn_test_example",
    fetch: async () => {
      throw new Error("database password appeared in an internal error");
    },
  });
  const validationAdapter = createRobonoBackendAdapter({
    robono,
    authenticate: () => "user-1",
    authorize: () => true,
  });
  const invalid = await validationAdapter(new Request(
    "https://child.example/robono/network-connections",
    { method: "POST", body: "{}" },
  ));
  assert.equal(invalid.status, 422);

  const failureAdapter = createRobonoBackendAdapter({
    robono,
    authenticate: () => {
      throw new Error("database password appeared in an internal error");
    },
    authorize: () => true,
  });
  const failed = await failureAdapter(new Request(
    "https://child.example/robono/networks",
    { method: "POST", body: "{}" },
  ));
  const payload = await failed.json();
  assert.equal(failed.status, 500);
  assert.equal(payload.error.code, "adapter_internal_error");
  assert.doesNotMatch(JSON.stringify(payload), /database password/);
});

test("backend adapter maps documented authentication rejection to 401", async () => {
  const robono = new RobonoServer({
    apiKey: "rbn_test_example",
    fetch: async () => {
      throw new Error("The API should not be called.");
    },
  });
  for (const authenticate of [
    () => null,
    () => {
      throw new RobonoAuthenticationError("expired session");
    },
  ]) {
    const adapter = createRobonoBackendAdapter({
      robono,
      authenticate,
      authorize: () => true,
    });
    const response = await adapter(new Request(
      "https://child.example/robono/networks",
      { method: "POST", body: "{}" },
    ));
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.error.code, "user_authentication_required");
    assert.doesNotMatch(JSON.stringify(payload), /expired session/);
  }
});

test("unified connection and message methods route by directory endpoint type", async () => {
  const urls = [];
  const client = new RobonoServer({
    apiKey: "rbn_test_example",
    baseUrl: "https://sandbox.example/v1",
    fetch: async (url) => {
      urls.push(url);
      if (url.endsWith("/connections")) {
        return Response.json({
          ok: true,
          request_id: "req_phone",
          connection_id: "phone-1",
          conversation_id: "conversation-1",
          status: "active",
          external_user_id: "user-1",
          external_display_name: "Jordan",
          target_contact_label: "Taylor",
          capabilities: {},
          robono_user: null,
          phone_masked: "***-***-4567",
        });
      }
      if (url.endsWith("/network-connections")) {
        return Response.json({
          ok: true,
          request_id: "req_network",
          bridge_connection_id: "network-1",
          status: "pending_target_approval",
          source: {
            app: { id: "source" },
            external_user_id: "user-1",
            display_name: "Jordan",
          },
          target: {
            app: { id: "target" },
            identifier: "BLUE-STAR",
            external_user_id: null,
            display_name: null,
          },
          guardian_messaging_enabled: false,
          capabilities: {},
          expires_at: null,
          accepted_at: null,
          responded_at: null,
          created_at: null,
        });
      }
      if (url.endsWith("/messages")) {
        return Response.json({
          ok: true,
          request_id: "req_message",
          robono_message_id: "message-1",
          status: "stored",
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  const phoneEndpoint = {
    type: "robono_phone",
    id: "robono-phone",
    slug: "robono-phone",
    display_name: "Robono",
    description: "",
    icon_url: "",
    accepts_inbound_bridge_requests: true,
    accepted_identifier: {
      label: "Phone",
      description: "",
      example: "+15550100101",
      format: "e164",
    },
    default_capabilities: {},
  };
  const connectedEndpoint = {
    ...phoneEndpoint,
    type: "connected_app",
    id: "target",
    slug: "target",
    accepted_identifier: {
      label: "Friend code",
      description: "",
      example: "BLUE-STAR",
      format: "text",
    },
  };
  const phoneConnection = await client.connections.connect({
    endpoint: phoneEndpoint,
    external_user_id: "user-1",
    external_display_name: "Jordan",
    target_identifier: "+15550100101",
  });
  const networkConnection = await client.connections.connect({
    endpoint: connectedEndpoint,
    external_user_id: "user-1",
    external_display_name: "Jordan",
    target_identifier: "BLUE-STAR",
  });
  const message = await client.messages.send({
    connection: phoneConnection,
    external_user_id: "user-1",
    external_message_id: "local-1",
    message_kind: "text",
    text_body: "Hello",
  });

  assert.equal(phoneConnection.connection_id, "phone-1");
  assert.equal(networkConnection.connection_id, "network-1");
  assert.equal(message.message_id, "message-1");
  assert.deepEqual(urls, [
    "https://sandbox.example/v1/connections",
    "https://sandbox.example/v1/network-connections",
    "https://sandbox.example/v1/messages",
  ]);
});

test("normalized connection pagination does not skip the other endpoint family", async () => {
  const listBodies = [];
  const client = new RobonoServer({
    apiKey: "rbn_test_example",
    baseUrl: "https://sandbox.example/v1",
    fetch: async (url, init) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      if (url.endsWith("/networks")) {
        return Response.json({
          ok: true,
          request_id: "req_directory",
          directory: [
            {
              type: "robono_phone",
              id: "phone_robono",
              slug: "phone-robono",
              display_name: "Robono",
              description: "",
              icon_url: "",
              accepts_inbound_bridge_requests: true,
              accepted_identifier: {
                label: "Phone",
                description: "",
                example: "+15550100101",
                format: "e164",
              },
              default_capabilities: {},
            },
            {
              type: "connected_app",
              id: "target-app",
              slug: "target-app",
              display_name: "Target app",
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
          ],
        });
      }
      if (url.endsWith("/network-connections/list")) {
        listBodies.push({ route: "network", body });
        return Response.json({
          ok: true,
          request_id: "req_network_list",
          connections: body.before
            ? []
            : [{
              bridge_connection_id: "network-1",
              status: "accepted",
              source: {
                app: { id: "source-app" },
                external_user_id: "user-1",
                display_name: "Jordan",
                profile: {},
              },
              target: {
                app: { id: "target-app", slug: "target-app" },
                identifier: "BLUE-STAR",
                external_user_id: "target-1",
                display_name: "Riley",
                profile: {},
              },
              guardian_messaging_enabled: false,
              capabilities: {},
              expires_at: null,
              accepted_at: "2026-07-25T12:00:00.000Z",
              responded_at: "2026-07-25T12:00:00.000Z",
              created_at: "2026-07-25T12:00:00.000Z",
            }],
          has_more: false,
          next_before: null,
        });
      }
      if (url.endsWith("/connections/list")) {
        listBodies.push({ route: "robono", body });
        return Response.json({
          ok: true,
          request_id: "req_robono_list",
          connections: [{
            connection_id: "robono-1",
            conversation_id: "conversation-1",
            status: "active",
            external_user_id: "user-1",
            external_display_name: "Jordan",
            target_contact_label: "Taylor",
            capabilities: {},
            robono_user: {
              id: "robono-user-1",
              display_name: "Taylor",
              avatar_url: null,
              avatar_version: null,
            },
            phone_masked: "***-***-0101",
            created_at: "2026-07-25T11:00:00.000Z",
            updated_at: "2026-07-25T11:00:00.000Z",
          }],
          has_more: false,
          next_before: null,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const first = await client.endpointConnections.list({
    external_user_id: "user-1",
    limit: 1,
  });
  assert.equal(first.connections[0].connection_id, "network-1");
  assert.equal(first.has_more, true);
  assert.deepEqual(first.next_cursor, {
    phase: "robono_phone",
  });

  const second = await client.endpointConnections.list({
    external_user_id: "user-1",
    limit: 1,
    cursor: first.next_cursor,
  });
  assert.equal(second.connections[0].connection_id, "robono-1");
  assert.equal(second.has_more, false);
  assert.equal(listBodies[1].body.before, undefined);
});

test("server connection pagination preserves opaque cursors when timestamps match", async () => {
  const listCursors = [];
  const client = new RobonoServer({
    apiKey: "rbn_test_example",
    baseUrl: "https://sandbox.example/v1",
    fetch: async (url, init) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      if (url.endsWith("/networks")) {
        return Response.json({
          ok: true,
          request_id: "req_directory",
          directory: [{
            type: "connected_app",
            id: "target-app",
            slug: "target-app",
            display_name: "Target",
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
          }, {
            type: "robono_phone",
            id: "phone",
            slug: "phone",
            display_name: "Robono",
            description: "",
            icon_url: "",
            accepts_inbound_bridge_requests: true,
            accepted_identifier: {
              label: "Phone",
              description: "",
              example: "+15550100101",
              format: "e164",
            },
            default_capabilities: {},
          }],
        });
      }
      if (url.endsWith("/network-connections/list")) {
        listCursors.push(body.before ?? null);
        const ids = body.before
          ? ["connection-3"]
          : ["connection-1", "connection-2"];
        return Response.json({
          ok: true,
          request_id: "req_connections",
          connections: ids.map((id) => ({
            bridge_connection_id: id,
            status: "accepted",
            source: {
              app: { id: "source-app" },
              external_user_id: "user-1",
              display_name: "Jordan",
            },
            target: {
              app: { id: "target-app" },
              identifier: "BLUE-STAR",
              external_user_id: "friend-1",
              display_name: "Taylor",
            },
            guardian_messaging_enabled: false,
            capabilities: {},
            created_at: "2026-07-25T12:00:00.000Z",
          })),
          has_more: !body.before,
          next_before: body.before ? null : "opaque-network-page-2",
        });
      }
      if (url.endsWith("/connections/list")) {
        return Response.json({
          ok: true,
          request_id: "req_phone",
          connections: [],
          has_more: false,
          next_before: null,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  const all = [];
  let cursor;
  for (;;) {
    const page = await client.endpointConnections.list({
      external_user_id: "user-1",
      limit: 2,
      ...(cursor ? { cursor } : {}),
    });
    all.push(...page.connections);
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  assert.deepEqual(
    all.map((connection) => connection.connection_id).sort(),
    ["connection-1", "connection-2", "connection-3"],
  );
  assert.deepEqual(listCursors, [null, "opaque-network-page-2"]);
});

test("unified server send rejects incompatible media before the API request", async () => {
  let apiCalls = 0;
  const client = new RobonoServer({
    apiKey: "rbn_test_example",
    fetch: async () => {
      apiCalls += 1;
      throw new Error("The API should not be called.");
    },
  });
  const raw = {
    bridge_connection_id: "network-1",
    status: "accepted",
    source: {
      app: { id: "source" },
      external_user_id: "user-1",
      display_name: "Jordan",
    },
    target: {
      app: { id: "target" },
      identifier: "BLUE-STAR",
      external_user_id: "user-2",
      display_name: "Bailey",
    },
    guardian_messaging_enabled: false,
    capabilities: {
      from_source_to_target: {
        allowed_message_kinds: ["voice"],
      },
    },
    expires_at: null,
    accepted_at: null,
    responded_at: null,
    created_at: null,
  };
  await assert.rejects(
    client.messages.send({
      connection: {
        endpoint: {
          type: "connected_app",
          id: "target",
          slug: "target",
          display_name: "Target",
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
        external_user_id: "user-1",
        capabilities: raw.capabilities,
        raw,
      },
      external_user_id: "user-1",
      external_message_id: "photo-1",
      message_kind: "image",
      media: {
        source_url: "https://media.example/photo.jpg",
        mime_type: "image/jpeg",
        byte_size: 1200,
      },
    }),
    (error) => error?.code === "message_kind_not_allowed",
  );
  assert.equal(apiCalls, 0);
});

test("write requests receive an idempotency key", async () => {
  let headers;
  const client = new RobonoServer({
    apiKey: "rbn_test_example",
    fetch: async (_url, init) => {
      headers = init.headers;
      return Response.json({
        ok: true,
        request_id: "req_1",
        bridge_message_id: "msg_1",
        status: "delivered",
      });
    },
  });
  await client.messages.send({
    bridge_connection_id: "con_1",
    external_user_id: "child_1",
    external_message_id: "local_1",
    message_kind: "text",
    text_body: "Hello",
  });
  assert.match(headers["idempotency-key"], /^idem_/);
});

test("an already-aborted request never reaches fetch", async () => {
  let fetchCalls = 0;
  const client = new RobonoServer({
    apiKey: "rbn_test_example",
    fetch: async () => {
      fetchCalls += 1;
      return Response.json({ ok: true });
    },
  });
  const controller = new AbortController();
  controller.abort(new Error("screen closed"));
  await assert.rejects(
    client.directory.list({}, { signal: controller.signal }),
    (error) =>
      error?.code === "request_cancelled" &&
      error?.retryable === false,
  );
  assert.equal(fetchCalls, 0);
});

test("rate-limit errors expose Retry-After guidance", async () => {
  const client = new RobonoServer({
    apiKey: "rbn_test_example",
    retries: 0,
    fetch: async () =>
      Response.json(
        {
          error: {
            code: "rate_limited",
            message: "Slow down.",
          },
          request_id: "req_rate_limit",
        },
        {
          status: 429,
          headers: { "retry-after": "4" },
        },
      ),
  });
  await assert.rejects(
    client.directory.list(),
    (error) =>
      error?.code === "rate_limited" &&
      error?.retryable === true &&
      error?.retryAfterMs === 4_000,
  );
});

test("push diagnostic reports use the dedicated authenticated route", async () => {
  let captured;
  const client = new RobonoServer({
    apiKey: "rbn_test_example",
    baseUrl: "https://sandbox.example/v1",
    fetch: async (url, init) => {
      captured = { url, init };
      return Response.json({ ok: true, request_id: "req_push", diagnostic: { status: "device_received" } });
    },
  });
  const response = await client.diagnostics.reportPush({
    diagnostic_id: "diagnostic-1",
    diagnostic_token: "token-1",
    stage: "device_received",
    platform: "ios",
  });
  assert.equal(response.ok, true);
  assert.equal(captured.url, "https://sandbox.example/v1/push-diagnostics/events");
  assert.equal(captured.init.headers.authorization, "Bearer rbn_test_example");
  assert.deepEqual(JSON.parse(captured.init.body), {
    diagnostic_id: "diagnostic-1",
    diagnostic_token: "token-1",
    stage: "device_received",
    platform: "ios",
  });
});

test("data request helpers create exports, create deletions, and read status", async () => {
  const captured = [];
  const client = new RobonoServer({
    apiKey: "rbn_test_example",
    baseUrl: "https://sandbox.example/v1",
    fetch: async (url, init) => {
      captured.push({
        url,
        body: JSON.parse(init.body),
        headers: init.headers,
      });
      return Response.json({
        ok: true,
        request_id: "req_data",
        data_request: {
          id: "data-request-1",
          request_type: "export",
          external_request_id: "privacy-1",
          status: "completed",
          result_summary: {},
          requested_at: "2026-07-29T12:00:00.000Z",
          completed_at: "2026-07-29T12:00:01.000Z",
          result_expires_at: "2026-08-28T12:00:01.000Z",
        },
      });
    },
  });

  await client.dataRequests.export({
    external_user_id: "user-1",
    external_request_id: "privacy-1",
  });
  await client.dataRequests.deleteUser({
    external_user_id: "user-1",
    external_request_id: "privacy-2",
  }, { idempotencyKey: "delete-user-1" });
  await client.dataRequests.status("data-request-1");

  assert.deepEqual(captured.map((item) => item.body), [{
    action: "create",
    request_type: "export",
    format: "json",
    external_user_id: "user-1",
    external_request_id: "privacy-1",
  }, {
    action: "create",
    request_type: "deletion",
    external_user_id: "user-1",
    external_request_id: "privacy-2",
  }, {
    action: "status",
    data_request_id: "data-request-1",
  }]);
  assert.equal(captured[1].headers["idempotency-key"], "delete-user-1");
  assert.equal(captured[2].headers["idempotency-key"], undefined);
});

test("webhook events convert to content-free client push signals", () => {
  const payload = toClientPushPayload({
    event: "bridge.message_created",
    event_id: "event-1",
    request_id: "request-1",
    created_at: "2026-07-26T12:00:00.000Z",
    bridge_connection_id: "connection-1",
    bridge_message_id: "message-1",
    status: "accepted",
  });
  assert.deepEqual(payload, {
    event: "bridge.message_created",
    event_id: "event-1",
    bridge_connection_id: "connection-1",
    bridge_message_id: "message-1",
  });
  assert.equal("message" in payload, false);

  const directoryPayload = toClientPushPayload({
    event: "bridge.directory_changed",
    event_id: "event-directory-1",
    request_id: "request-directory-1",
    created_at: "2026-07-26T12:00:00.000Z",
    endpoint_id: "endpoint-1",
    change: "updated",
  });
  assert.deepEqual(directoryPayload, {
    event: "bridge.directory_changed",
    event_id: "event-directory-1",
  });
});

test("understandable API errors preserve fields and request id", async () => {
  const client = new RobonoServer({
    apiKey: "rbn_test_example",
    retries: 0,
    fetch: async () =>
      Response.json({
        error: {
          code: "message_kind_not_allowed",
          message: "Voice is not allowed.",
        },
        request_id: "req_problem",
        fields: [{ path: "message_kind" }],
      }, { status: 422 }),
  });
  await assert.rejects(
    () =>
      client.messages.sendGuardian({
        bridge_connection_id: "con_1",
        external_guardian_id: "parent_1",
        external_message_id: "msg_1",
        text_body: "Hello",
      }),
    (error) => {
      assert.equal(error instanceof RobonoError, true);
      assert.equal(error.code, "message_kind_not_allowed");
      assert.equal(error.requestId, "req_problem");
      assert.equal(error.fields.length, 1);
      return true;
    },
  );
});

test("webhook verifier checks signatures and duplicates", async () => {
  const secret = "whsec_example";
  const timestamp = "2026-07-19T12:00:00.000Z";
  const body = JSON.stringify(bridgeMessageCreated(timestamp));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`)
    .digest("hex");
  const verified = await verifyRobonoWebhook(
    body,
    {
      "Robono-Webhook-Timestamp": timestamp,
      "Robono-Webhook-Signature": `v1=${signature}`,
      "Robono-Webhook-Id": "evt_123",
    },
    secret,
    {
      now: new Date(timestamp),
      hasProcessedEvent: (id) => id === "evt_123",
    },
  );
  assert.equal(verified.event.event, "bridge.message_created");
  assert.equal(verified.duplicate, true);
});

test("webhook verifier accepts directory-change synchronization signals", async () => {
  const secret = "whsec_example";
  const timestamp = "2026-07-26T12:00:00.000Z";
  const body = JSON.stringify({
    event: "bridge.directory_changed",
    event_id: "evt_directory",
    request_id: "req_directory",
    created_at: timestamp,
    endpoint_id: "endpoint-1",
    change: "updated",
  });
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`)
    .digest("hex");
  const verified = await verifyRobonoWebhook(body, {
    "robono-webhook-timestamp": timestamp,
    "robono-webhook-signature": `v1=${signature}`,
    "robono-webhook-id": "evt_directory",
  }, secret, { now: new Date(timestamp) });
  assert.equal(verified.event.event, "bridge.directory_changed");
});

test("webhook verifier accepts either signature during secret rotation", async () => {
  const oldSecret = "whsec_old";
  const newSecret = "whsec_new";
  const timestamp = "2026-07-26T12:00:00.000Z";
  const body = JSON.stringify({
    event: "bridge.directory_changed",
    event_id: "evt_rotation",
    request_id: "req_rotation",
    created_at: timestamp,
    endpoint_id: "endpoint-1",
    change: "updated",
  });
  const newSignature = createHmac("sha256", newSecret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const oldSignature = createHmac("sha256", oldSecret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const headers = {
    "robono-webhook-timestamp": timestamp,
    "robono-webhook-signature": `v1=${newSignature},v1=${oldSignature}`,
    "robono-webhook-id": "evt_rotation",
  };

  assert.equal(
    (await verifyRobonoWebhook(body, headers, oldSecret, { now: new Date(timestamp) })).event.event,
    "bridge.directory_changed",
  );
  assert.equal(
    (await verifyRobonoWebhook(body, headers, newSecret, { now: new Date(timestamp) })).event.event,
    "bridge.directory_changed",
  );
});

test("every official OpenAPI webhook example passes the published verifier", async () => {
  const secret = "whsec_openapi_contract";
  const contract = parseYaml(
    readFileSync(
      new URL("../../../docs/api/openapi.yaml", import.meta.url),
      "utf8",
    ),
  );
  const examples =
    contract.webhooks.robonoEvent.post.requestBody.content["application/json"]
      .examples;

  for (const [name, example] of Object.entries(examples)) {
    const timestamp = example.value.created_at;
    const body = JSON.stringify(example.value);
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    const verified = await verifyRobonoWebhook(body, {
      "robono-webhook-timestamp": timestamp,
      "robono-webhook-signature": `v1=${signature}`,
      "robono-webhook-id": example.value.event_id,
    }, secret, { now: new Date(timestamp) });

    assert.equal(
      verified.event.event,
      example.value.event,
      `${name} should pass the SDK verifier`,
    );
  }
});

test("webhook verifier atomically claims events and rejects mismatched IDs", async () => {
  const secret = "whsec_example";
  const timestamp = "2026-07-25T12:00:00.000Z";
  const body = JSON.stringify(bridgeMessageCreated(timestamp, {
    event_id: "evt_body",
  }));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`)
    .digest("hex");
  let claimed = "";
  const verified = await verifyRobonoWebhook(
    body,
    {
      "Robono-Webhook-Timestamp": timestamp,
      "Robono-Webhook-Signature": `v1=${signature}`,
      "Robono-Webhook-Id": "evt_body",
    },
    secret,
    {
      now: new Date(timestamp),
      claimEvent: (eventId) => {
        claimed = eventId;
        return true;
      },
    },
  );
  assert.equal(claimed, "evt_body");
  assert.equal(verified.duplicate, false);

  await assert.rejects(
    verifyRobonoWebhook(
      body,
      {
        "Robono-Webhook-Timestamp": timestamp,
        "Robono-Webhook-Signature": `v1=${signature}`,
        "Robono-Webhook-Id": "evt_header",
      },
      secret,
      { now: new Date(timestamp) },
    ),
    (error) => error?.code === "webhook_event_id_mismatch",
  );
});

test("webhook verifier rejects signed events with missing typed fields", async () => {
  const secret = "whsec_example";
  const timestamp = "2026-07-25T12:00:00.000Z";
  const body = JSON.stringify({
    event: "bridge.message_created",
    event_id: "evt_malformed",
    request_id: "req_malformed",
    created_at: timestamp,
  });
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`)
    .digest("hex");

  await assert.rejects(
    verifyRobonoWebhook(body, {
      "Robono-Webhook-Timestamp": timestamp,
      "Robono-Webhook-Signature": `v1=${signature}`,
      "Robono-Webhook-Id": "evt_malformed",
    }, secret, { now: new Date(timestamp) }),
    (error) =>
      error?.code === "invalid_webhook_payload" &&
      /bridge_connection_id/.test(error.message),
  );
});

test("every webhook event type is runtime validated", async () => {
  const secret = "whsec_example";
  const timestamp = "2026-07-25T12:00:00.000Z";

  for (const [event, requiredKey] of webhookEvents(timestamp)) {
    const validBody = JSON.stringify(event);
    const validSignature = createHmac("sha256", secret)
      .update(`${timestamp}.${validBody}`)
      .digest("hex");
    const verified = await verifyRobonoWebhook(validBody, {
      "Robono-Webhook-Timestamp": timestamp,
      "Robono-Webhook-Signature": `v1=${validSignature}`,
      "Robono-Webhook-Id": event.event_id,
    }, secret, { now: new Date(timestamp) });
    assert.equal(verified.event.event, event.event);

    const malformed = structuredClone(event);
    delete malformed[requiredKey];
    const malformedBody = JSON.stringify(malformed);
    const malformedSignature = createHmac("sha256", secret)
      .update(`${timestamp}.${malformedBody}`)
      .digest("hex");
    await assert.rejects(
      verifyRobonoWebhook(malformedBody, {
        "Robono-Webhook-Timestamp": timestamp,
        "Robono-Webhook-Signature": `v1=${malformedSignature}`,
        "Robono-Webhook-Id": event.event_id,
      }, secret, { now: new Date(timestamp) }),
      (error) => error?.code === "invalid_webhook_payload",
      `${event.event} should reject a missing ${requiredKey}`,
    );
  }
});

test("webhook verifier rejects malformed nested contract objects", async () => {
  const secret = "whsec_example";
  const timestamp = "2026-07-25T12:00:00.000Z";
  const fixtures = new Map(
    webhookEvents(timestamp).map(([event]) => [event.event, event]),
  );
  const cases = [
    {
      label: "direct message media",
      event: "message.created",
      mutate(payload) {
        payload.message_kind = "image";
        payload.media = { source_url: "https://cdn.example.test/photo.jpg" };
      },
      field: "media.mime_type",
    },
    {
      label: "attachment batch bounds",
      event: "message.created",
      mutate(payload) {
        payload.attachment_batch = { id: "batch-1", index: 0, count: 1 };
      },
      field: "attachment_batch.count",
    },
    {
      label: "attachment batch order",
      event: "message.created",
      mutate(payload) {
        payload.attachment_batch = { id: "batch-1", index: 2, count: 2 };
      },
      field: "attachment_batch.index",
    },
    {
      label: "bridge attachment batch order",
      event: "bridge.message_created",
      mutate(payload) {
        payload.message.message_kind = "image";
        payload.message.media = {
          source_url: "https://cdn.example.test/photo.jpg",
          mime_type: "image/jpeg",
        };
        payload.message.attachment_batch = {
          id: "batch-bridge-1",
          index: 3,
          count: 3,
        };
      },
      field: "message.attachment_batch.index",
    },
    {
      label: "guardian identity",
      event: "bridge.connection_requested",
      mutate(payload) {
        payload.source.guardians = [{}];
      },
      field: "external_guardian_id",
    },
    {
      label: "accepted identifier contract",
      event: "bridge.connection_requested",
      mutate(payload) {
        delete payload.target.accepted_identifier.normalization;
      },
      field: "target.accepted_identifier.normalization",
    },
    {
      label: "reaction contract",
      event: "message.reaction_updated",
      mutate(payload) {
        payload.reaction.removed = "false";
      },
      field: "reaction.removed",
    },
    {
      label: "reaction sender contract",
      event: "message.reaction_updated",
      mutate(payload) {
        delete payload.reactor.robono_user_id;
      },
      field: "reactor.robono_user_id",
    },
    {
      label: "direct connection status",
      event: "connection.status_changed",
      mutate(payload) {
        payload.status = "accepted";
      },
      field: "status",
    },
    {
      label: "guardian webhook identity",
      event: "bridge.guardian_message_created",
      mutate(payload) {
        delete payload.sender_guardian.external_guardian_id;
      },
      field: "sender_guardian.external_guardian_id",
    },
    {
      label: "guardian webhook status",
      event: "bridge.guardian_message_status_changed",
      mutate(payload) {
        payload.status = "heard";
      },
      field: "status",
    },
    {
      label: "capability message kinds",
      event: "bridge.connection_requested",
      mutate(payload) {
        payload.capabilities = {
          allowed_outbound_message_kinds: ["animated-gif"],
        };
      },
      field: "allowed_outbound_message_kinds",
    },
    {
      label: "profile avatar",
      event: "bridge.connection_updated",
      mutate(payload) {
        payload.connection.target.profile = { avatar: {} };
      },
      field: "avatar.source_url",
    },
    {
      label: "bridge media URL",
      event: "bridge.message_created",
      mutate(payload) {
        payload.message.message_kind = "image";
        payload.message.media = {
          source_url: "http://cdn.example.test/photo.jpg",
          mime_type: "image/jpeg",
        };
      },
      field: "message.media.source_url",
    },
    {
      label: "transform text artifact",
      event: "transform.completed",
      mutate(payload) {
        payload.artifacts.transcript = { text: "Hello", cached: false };
      },
      field: "artifacts.transcript.language",
    },
    {
      label: "generated speech media",
      event: "transform.completed",
      mutate(payload) {
        delete payload.artifacts.voice.media.generated_kind;
      },
      field: "generated_kind",
    },
    {
      label: "billing operation shape",
      event: "transform.completed",
      mutate(payload) {
        payload.billing.operations = [{}];
      },
      field: "billing.operations[0].type",
    },
    {
      label: "billing operation quantity",
      event: "transform.completed",
      mutate(payload) {
        payload.billing.operations[0].quantity = 2;
      },
      field: "billing.operations[0].quantity",
    },
  ];

  for (const item of cases) {
    const malformed = structuredClone(fixtures.get(item.event));
    item.mutate(malformed);
    const body = JSON.stringify(malformed);
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    await assert.rejects(
      verifyRobonoWebhook(body, {
        "Robono-Webhook-Timestamp": timestamp,
        "Robono-Webhook-Signature": `v1=${signature}`,
        "Robono-Webhook-Id": malformed.event_id,
      }, secret, { now: new Date(timestamp) }),
      (error) =>
        error?.code === "invalid_webhook_payload" &&
        error.message.includes(item.field),
      `${item.label} should reject ${item.field}`,
    );
  }
});

test("restrictions are read in either bridge direction", () => {
  const connection = {
    capabilities: {
      from_source_to_target: { allowed_message_kinds: ["voice"] },
      from_target_to_source: { allowed_message_kinds: ["text", "voice"] },
    },
  };
  assert.deepEqual(
    restrictionsFor(connection, "source_to_target").allowed_message_kinds,
    ["voice"],
  );
  assert.deepEqual(
    restrictionsFor(connection, "target_to_source").allowed_message_kinds,
    ["text", "voice"],
  );
});

test("OpenAPI documents every public server SDK route", () => {
  const openapi = readFileSync(
    new URL("../../../docs/api/openapi.yaml", import.meta.url),
    "utf8",
  );
  const routes = [
    "/networks",
    "/connections",
    "/connections/list",
    "/connections/profile",
    "/connections/disconnect",
    "/network-connections",
    "/network-connections/respond",
    "/network-connections/list",
    "/network-connections/disconnect",
    "/network-connections/update",
    "/messages",
    "/messages/list",
    "/message-events",
    "/network-messages",
    "/network-messages/list",
    "/network-messages/events",
    "/guardian-messages",
    "/guardian-messages/list",
    "/guardian-messages/events",
    "/languages",
    "/message-transforms",
    "/speech-transforms",
    "/push-diagnostics/events",
  ];
  for (const route of routes) {
    assert.match(openapi, new RegExp(`^  ${route}:$`, "m"), route);
  }
});

test("adapter OpenAPI documents every protected client route", () => {
  const adapterOpenapi = readFileSync(
    new URL("../../../docs/api/adapter-openapi.yaml", import.meta.url),
    "utf8",
  );
  const routes = [
    "/networks",
    "/languages",
    "/network-connections",
    "/network-connections/respond",
    "/network-connections/list",
    "/network-connections/disconnect",
    "/network-connections/update",
    "/connections",
    "/connections/list",
    "/connections/profile",
    "/connections/disconnect",
    "/network-messages",
    "/network-messages/list",
    "/network-messages/events",
    "/messages",
    "/messages/list",
    "/message-events",
    "/guardian-messages",
    "/guardian-messages/list",
    "/guardian-messages/events",
    "/transforms/message",
    "/transforms/speech",
    "/push-diagnostics/events",
  ];
  for (const route of routes) {
    assert.match(
      adapterOpenapi,
      new RegExp(`^  /robono${route}:$`, "m"),
      route,
    );
  }
});
