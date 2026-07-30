# `@robono/server`

Headless Node/TypeScript SDK for connecting an existing app or private ecosystem to Robono Bridge.

## License

Licensed for authorized Robono integrations. Redistribution as a standalone SDK, bypassing Robono, and competing bridge services are prohibited. See the included `LICENSE` and [license FAQ](https://robono.com/sdk-license).

Robono's own app and third-party connected apps appear as endpoints in the same directory. Your product keeps its existing accounts, screens, storage, safety rules, and notifications.

## Install

```bash
npm install @robono/server
```

The package is ESM-only, supports Node.js 18+ and Deno 2.x through npm compatibility, and includes TypeScript declarations and `SBOM.spdx.json`.

CommonJS applications must use a dynamic import:

```js
const { RobonoServer } = await import("@robono/server");
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

The normalized `connection.connection_id` is valid for subsequent unified SDK calls.

The unified send validates negotiated message type, text length, media size, duration, MIME type, and attachment count before making the API request. For media composed as one message, give every item the same `attachment_batch.id`, its zero-based `index`, and the common `count`.
The same normalized namespaces list, update, and disconnect connections; load message history; and mark messages delivered, read, or heard. See the [Server SDK reference](https://robono.com/sdk-reference/server/).

## Protect client operations

Keep the API key on your server. Mount the app-facing route at `/robono/*` behind your existing authentication:

```ts
const handleRobono = createRobonoBackendAdapter({
  robono,
  authenticate: async request =>
    (await yourAuth.findUser(request))?.id ?? null,
  authorize: context =>
    yourPermissions.allowRobonoAction(context),
});
```

`authenticate` proves identity. The required `authorize` callback checks the exact action against your account, relationship, guardian, safety, and processing rules. Missing or false decisions are denied. The route uses standard Web `Request` and `Response` objects, so it works with common Node, serverless, and Deno frameworks.

## Verify signed events

Verify the signature against the exact raw request body before parsing JSON:

```ts
import { verifyRobonoWebhook } from "@robono/server";

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
return new Response("accepted", { status: 202 });
```

Store each event once by event ID, return HTTP 2xx within 10 seconds, and process it asynchronously. Duplicate events must not create duplicate work. Connection requests must be resolved and approved only by an authorized server action.

## Run the sandbox lifecycle

```bash
ROBONO_SANDBOX_KEY_A=rbn_test_... \
ROBONO_SANDBOX_KEY_B=rbn_test_... \
ROBONO_SANDBOX_NETWORK_B_ID=... \
npx --package @robono/server robono-sandbox-test
```

The lifecycle runner tests Robono's isolated Sandbox. Test your own authentication, authorization, and CORS separately:

```bash
ROBONO_ADAPTER_URL=https://your-backend.example/robono \
ROBONO_ADAPTER_ACCESS_TOKEN=your_test_user_token \
ROBONO_ADAPTER_EXPECTED_ORIGIN=https://your-app.example \
npx --package @robono/server robono-adapter-test
```

## Versions and support

All packages are currently early-access `0.x` releases. Patch releases contain
compatible fixes. Before `1.0`, a minor release may contain a breaking change;
read the packaged `CHANGELOG.md` before upgrading. Each minor package line
receives critical security and Bridge compatibility fixes for at least 12
months after its successor is published. Public API versions receive at least
12 months' notice before retirement unless continued support would create an
active security risk.

Report SDK problems at [robono.com/contact?topic=sdk](https://robono.com/contact?topic=sdk).
Include the package version, runtime, safe reproduction steps, and request ID;
never include credentials or private message content.

See the complete build flow, optional language and privacy operations, platform support, and testing guide at [robono.com/docs](https://robono.com/docs).
