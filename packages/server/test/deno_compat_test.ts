import {
  createRobonoBackendAdapter,
  RobonoServer,
  verifyRobonoWebhook,
} from "../dist/index.js";
import { createHmac } from "node:crypto";

Deno.test("@robono/server works in Deno with npm compatibility", async () => {
  let authorization = "";
  const mockFetch: typeof fetch = async (_input, init) => {
    const headers = (init as {
      headers?: Record<string, string>;
    } | undefined)?.headers;
    authorization = String(
      headers?.authorization ?? "",
    );
    return Response.json({
      ok: true,
      request_id: "req_deno",
      directory: [],
    });
  };
  const robono = new RobonoServer({
    apiKey: "rbn_test_deno",
    fetch: mockFetch,
  });

  const directory = await robono.directory.list();
  assert(directory.ok, "The Deno server client did not return a response.");
  assertEquals(authorization, "Bearer rbn_test_deno");

  const adapter = createRobonoBackendAdapter({
    robono,
    authenticate: () => "deno-user",
    authorize: () => true,
  });
  assertEquals(typeof adapter, "function");
});

Deno.test("@robono/server verifies webhooks in Deno", async () => {
  const secret = "whsec_deno";
  const timestamp = "2026-07-24T12:00:00.000Z";
  const body = JSON.stringify({
    event: "diagnostic.push_requested",
    event_id: "evt_deno",
    request_id: "req_deno",
    created_at: timestamp,
    push_diagnostic_id: "diagnostic-deno",
    diagnostic_token: "diagnostic-token-deno",
    external_user_id: "deno-user",
  });
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const verified = await verifyRobonoWebhook(
    body,
    {
      "Robono-Webhook-Timestamp": timestamp,
      "Robono-Webhook-Signature": `v1=${signature}`,
    },
    secret,
    { now: new Date(timestamp) },
  );

  assertEquals(verified.eventId, "evt_deno");
});

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
