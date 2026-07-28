# `@robono/server`

Headless Node/TypeScript SDK for connecting an existing app or closed ecosystem to Robono Bridge. It provides typed API calls, bounded retries, idempotency, restriction checks, speech tools, webhook verification, and the protected client adapter.

## License in plain English

You may use this SDK to build, test, and operate an authorized application that connects to Robono. You may not redistribute it as a standalone SDK, use it to bypass Robono, or use it to build a competing bridge service. Service access, pricing, maintenance, and support are separate. If you and Robono sign a written agreement that expressly replaces this SDK license, that agreement controls to the extent it says so. The included `LICENSE` is the complete, controlling text.

Robono's own app and third-party connected apps appear as endpoints in the same directory. Your product keeps its existing accounts, screens, storage, safety rules, and notifications.

## Install

```bash
npm install @robono/server
```

The package includes `SBOM.spdx.json`, a machine-readable inventory of its
production components.

The package is ESM-only and supports Node.js 18+ and Deno 2.x through npm compatibility, including Supabase Edge Functions:

CommonJS applications must use a dynamic import:

```js
const { RobonoServer } = await import("@robono/server");
```

```ts
import {
  createRobonoBackendAdapter,
  RobonoServer,
} from "npm:@robono/server@0.7.6";
```

## Discover endpoints

```ts
import { RobonoServer } from "@robono/server";

const robono = new RobonoServer({
  apiKey: process.env.ROBONO_API_KEY!,
});

const { directory } = await robono.directory.list();

for (const endpoint of directory) {
  console.log(
    endpoint.display_name,
    endpoint.accepted_identifier.label,
  );
}
```

Show the returned endpoints in your app and ask for the identifier described by the selected endpoint. Do not hard-code Robono as a separate integration path.
Each `accepted_identifier` also includes `input_type`, `pattern`, length,
normalization, and case rules so the same value can be validated consistently
before lookup.

Use the same methods after any endpoint is selected:

```ts
const endpoint = directory.find(item =>
  item.slug === selectedEndpointSlug
);
if (!endpoint) throw new Error("Endpoint is unavailable");

// Persist these IDs before the first network attempt. Reuse them after a
// timeout, worker retry, or application restart.
const connectionOperationId = connectionDraft.operationId;
const connection = await robono.endpointConnections.connect({
  endpoint,
  external_user_id: user.id,
  external_display_name: user.displayName,
  target_identifier: identifierEnteredByUser,
  capabilities: {
    allowed_outbound_message_kinds: ["text"],
    allowed_inbound_message_kinds: ["text"],
    text: { max_characters: 1000 },
  },
}, { idempotencyKey: connectionOperationId });

const messageOperationId = outgoingMessage.operationId;
const result = await robono.endpointMessages.send({
  connection,
  external_user_id: user.id,
  external_message_id: outgoingMessage.id,
  message_kind: "text",
  text_body: "Hello",
}, { idempotencyKey: messageOperationId });
```

The normalized `connection.connection_id` is valid for SDK state and subsequent unified calls. Endpoint-specific methods remain available for integrations that need lower-level control.

The unified send validates negotiated message type, text length, media size, duration, MIME type, and attachment count before making the API request. For media composed as one message, give every item the same `attachment_batch.id`, its zero-based `index`, and the common `count`.

New server-only integrations can use the normalized namespaces for the rest of the lifecycle without branching on endpoint type:

```ts
const page = await robono.endpointConnections.list({
  external_user_id: user.id,
  limit: 50,
});

const history = await robono.endpointMessages.list({
  connection,
  external_user_id: user.id,
  limit: 50,
});

const firstMessage = history.messages[0];
if (firstMessage) {
  await robono.endpointMessages.mark({
    connection,
    external_user_id: user.id,
    message_id: firstMessage.message_id,
    event: "read",
  }, { idempotencyKey: receiptOperation.id });
}

await robono.endpointConnections.update({
  connection,
  external_user_id: user.id,
  external_profile: currentProfile,
}, { idempotencyKey: profileUpdate.operationId });

await robono.endpointConnections.disconnect({
  connection,
  external_user_id: user.id,
}, { idempotencyKey: disconnectOperation.id });
```

Use `page.next_cursor` and `history.next_before` for older pages. Use `history.sync_cursor` as the next `after` value when checking only for newer messages.
Create and persist each operation ID before its first request, then reuse that ID
after a timeout, retry, or restart.

## Protect client operations

Keep the API key on your server. Mount the adapter at `/robono/*` behind your existing authentication:

```ts
const handleRobono = createRobonoBackendAdapter({
  robono,
  authenticate: async request =>
    (await yourAuth.findUser(request))?.id ?? null,
  authorize: async ({ action, userId, input }) => {
    const user = await accounts.findActiveUser(userId);
    if (!user) return false;
    if (action === "networks.list") return true;
    if (action === "network_connections.respond") {
      return guardianApprovals.mayRespond(user, input);
    }
    if (action.endsWith(".list")) return access.mayRead(user, input);
    if (
      action === "message_transforms.create" ||
      action === "speech_transforms.create"
    ) return processing.hasPermissionAndCredits(user, input);
    if (
      action.endsWith(".request") ||
      action.endsWith(".create") ||
      action.endsWith(".send") ||
      action.endsWith(".mark") ||
      action.endsWith(".update") ||
      action.endsWith(".update_profile") ||
      action.endsWith(".disconnect") ||
      action === "push_diagnostics.report"
    ) return access.mayChange(user, action, input);
    return false;
  },
});
```

`authenticate` proves the user's identity. The required `authorize` callback decides whether that user may perform the exact operation. Enforce relationship state, account rules, guardian approval when applicable, messaging restrictions, and processing allowances. Missing or false decisions are denied.
Return `null` or `undefined` for a normal missing or invalid session. If your
authentication library must throw for that case, throw
`RobonoAuthenticationError`; the adapter safely returns HTTP 401. Unexpected
authentication-system failures remain sanitized HTTP 500 responses.

The adapter uses standard Web `Request` and `Response` objects, so it can be mounted in Express, Fastify, Next.js, serverless functions, Supabase Edge Functions, or another compatible backend. Exact Express, Next.js, Supabase Edge, and Deno mounts are available in the website documentation.

## Language and speech tools

The typed transform methods cover transcription, translation, TTS, translated voice, and existing-message transforms:

```ts
const { languages } = await robono.languages();
showAvailableTransformLanguages(languages);

const result = await robono.transforms.speech({
  input: {
    type: "audio",
    source_url: audioUrl,
    mime_type: "audio/m4a",
    language: "en",
  },
  outputs: ["transcript", "translated_voice"],
  target_language: "es",
}, { idempotencyKey: transformOperationId });

console.log(result.status);             // "completed"
console.log(result.artifacts);          // Typed transcript and generated voice
console.log(result.billing.operations); // Exact transcription/translation/TTS steps
```

Transforms complete synchronously. SDK errors report request failures, while signed `transform.completed` and `transform.failed` webhooks provide an auditable server event. Generated media URLs include `source_url_expires_at` and currently expire after ten minutes. Reuse the same idempotency key when retrying the same operation; cached message artifacts are not charged again.

## Verify webhooks

Verify the signature against the exact raw request body before parsing JSON:

```ts
import {
  toClientPushPayload,
  verifyRobonoWebhook,
} from "@robono/server";

const webhookSecret = process.env.ROBONO_WEBHOOK_SECRET;
if (!webhookSecret) throw new Error("ROBONO_WEBHOOK_SECRET is required");

const verified = await verifyRobonoWebhook(
  rawBody,
  request.headers,
  webhookSecret,
);

await webhookInbox.insertPendingIfAbsent({
  eventId: verified.eventId,
  rawBody,
  event: verified.event,
});

// Return any HTTP 2xx within 10 seconds; 202 is recommended here.
// Timeouts, network failures, redirects, and non-2xx responses receive up to
// five retries with increasing delay capped at 15 minutes. Duplicate event IDs
// must also return 2xx. A worker polls durable pending rows and runs:
async function processPendingWebhook(pending: typeof verified) {
  switch (pending.event.event) {
    case "bridge.connection_requested":
      await pendingRequests.store(pending.event);
      break;
    case "connection.status_changed":
    case "bridge.connection_status_changed":
      await existingMessagingSystem.updateConnection(pending.event);
      break;
    case "message.created":
      await existingMessagingSystem.storeMessage(pending.event);
      break;
    case "bridge.message_created":
      await existingMessagingSystem.storeMessage(pending.event.message);
      break;
    case "transform.completed":
    case "transform.failed":
      await existingMessagingSystem.updateTransform(pending.event);
      break;
  }

  const externalUserId =
    await existingMessagingSystem.recipientFor(pending.event);
  if (externalUserId) {
    await yourPushProvider.send(externalUserId, {
      data: toClientPushPayload(pending.event),
    });
  }
  await webhookInbox.markComplete(pending.eventId);
}
```

`verified.event` is a runtime-validated, discriminated `RobonoWebhookEvent` union covering connection, message, receipt, guardian, transform, failure, and diagnostic events. The durable inbox must enforce a unique event ID and keep failed work pending; receiving a duplicate must never cause unfinished work to be marked complete.
Message-created webhooks contain the complete message: direct-endpoint content is
on the event itself and app-to-app content is in `event.message`. Client push
data contains routing IDs only; the authenticated client fetches current state.

For `bridge.connection_requested`, resolve `event.target.identifier` on your
backend, store the request pending any required guardian approval, and call
`networkConnections.respond()` only from an authorized server action. Use a
generic requester-facing result for `not_found`, rejection, and unauthorized
lookups so account existence cannot be tested.

## Run the sandbox lifecycle

```bash
ROBONO_SANDBOX_KEY_A=rbn_test_... \
ROBONO_SANDBOX_KEY_B=rbn_test_... \
ROBONO_SANDBOX_NETWORK_B_ID=... \
npx --package @robono/server robono-sandbox-test
```

The test runs the stateful network-to-network lifecycle, then validates the same unified connection and send methods against the test-only Robono endpoint. The Robono endpoint check cannot reach real users, SMS, billing, or production delivery.

The lifecycle runner tests Robono's sandbox API, not your authentication, CORS, or deployed adapter. Test those separately:

```bash
ROBONO_ADAPTER_URL=https://your-backend.example/robono \
ROBONO_ADAPTER_ACCESS_TOKEN=your_test_user_token \
ROBONO_ADAPTER_EXPECTED_ORIGIN=https://your-app.example \
npx --package @robono/server robono-adapter-test
```

## Versions and support

All packages are currently early-access `0.x` releases. Patch releases contain
compatible fixes. Before `1.0`, a minor release may contain a breaking change;
read the packaged `CHANGELOG.md` before upgrading. The latest minor line is the
supported line, and public API versions receive at least 90 days' notice before
retirement.

Report SDK problems at [robono.com/contact?topic=sdk](https://robono.com/contact?topic=sdk).
Include the package version, runtime, safe reproduction steps, and request ID;
never include credentials or private message content.

See the complete build flow, REST reference, platform support, capabilities, delivery behavior, and testing guide at [robono.com/docs](https://robono.com/docs).
