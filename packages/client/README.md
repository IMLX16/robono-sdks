# `@robono/client`

Headless client core shared by the Robono Web and React Native SDKs. It keeps Robono server credentials out of browsers and phones while providing Bridge calls, push-triggered synchronization, polling recovery, state subscriptions, and delivery diagnostics.

## License in plain English

You may use this SDK to build, test, and ship an authorized application that connects to Robono, including its compiled or bundled SDK code. You may not redistribute it as a standalone SDK, use it to bypass Robono, or use it to build a competing bridge service. Service access, pricing, and support are separate. If you and Robono sign a written agreement that expressly replaces this SDK license, that agreement controls to the extent it says so. The included `LICENSE` is the complete, controlling text.

Most applications should install `@robono/web` or `@robono/react-native`. Install this package directly only when building another platform wrapper:

This package is ESM-only. CommonJS applications must load it with
`await import("@robono/client")`.

```bash
npm install @robono/client
```

The package includes `SBOM.spdx.json`, a machine-readable inventory of its
production components.

```ts
import {
  createRobonoHttpTransport,
  RobonoClient,
} from "@robono/client";

const client = new RobonoClient({
  externalUserId: signedInUser.id,
  transport: createRobonoHttpTransport({
    baseUrl: "https://your-app.example",
    getAccessToken: () => yourAuth.getAccessToken(),
  }),
});

const unsubscribe = client.subscribe(state => {
  renderWithYourExistingScreens(state);
  console.log(state.diagnostics.lastUpdateVia);
});

try {
  await client.start();
} catch (error) {
  // Initial authentication, adapter, CORS, and configuration failures reject.
  showBridgeUnavailable(error);
}
```

`networks.list()` returns the available endpoints and the identifier each one requires. The unified `connections` methods connect, list every page, update, and disconnect either endpoint type. The unified `messages` methods send, list, and mark messages delivered, read, or heard. The synchronized `state.connections` and `state.messagesByConnection` collections use the same normalized shape for every endpoint.
Call `networks.refresh()` when opening Add Friend. The client also refreshes the
directory after its five-minute TTL and when it receives
`bridge.directory_changed`.

Pass verified Robono push data to `client.receivePush(data)` for immediate synchronization. Recovery polling defaults to about 60 seconds with jitter, backs off after failures, and can be disabled with `pollingEnabled: false` when another reliable recovery signal exists. Call `client.stop()` and `unsubscribe()` when the owning lifecycle ends.

Language tools are typed. Create and persist the operation ID before the first
attempt, then reload the same value for any later retry:

```ts
const transformOperationId = transformJob.operationId;
const result = await client.transforms.speech({
  input: { type: "text", text: "Hello", language: "en" },
  outputs: ["translated_text", "translated_voice"],
  target_language: "es",
}, { idempotencyKey: transformOperationId });

console.log(result.artifacts, result.billing.operations);
```

Generated media includes `source_url_expires_at`. Full transform and webhook contracts are documented in the OpenAPI specification.

Use `connections.listPage({ limit, cursor })` when rendering one page. Use
`connections.listAll({ pageSize, maxItems })` for a bounded full refresh and
check its `truncated` result before treating it as complete. `connections.list()`
is retained as the convenience full-list form.

Every client write accepts `{ idempotencyKey, requestId, signal }` as its final
argument. Generate one stable idempotency key for an operation and reuse it when
retrying that same operation.

Guardian users can use the same protected adapter:

```ts
await client.guardianMessages.send({
  bridge_connection_id: connectionId,
  external_message_id: outgoingGuardianMessage.id,
  text_body: "Pickup is at 4:00.",
}, { idempotencyKey: outgoingGuardianMessage.operationId });
```

Subscribed state is temporary synchronization state, not your permanent database. Persist verified webhooks and required records in your existing backend. That backend must authenticate the user and authorize every adapter operation.

The package is ESM-only, requires `fetch`, and includes TypeScript declarations.
This is an early-access `0.x` package: patch releases are compatible fixes, while
a minor release before `1.0` may include a documented breaking change. The
latest minor line is supported. Read the packaged `CHANGELOG.md` before
upgrading and report SDK problems at
[robono.com/contact?topic=sdk](https://robono.com/contact?topic=sdk).

Full documentation is at [robono.com/docs](https://robono.com/docs).
