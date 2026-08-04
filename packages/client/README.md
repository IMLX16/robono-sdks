# `@robono/client`

Headless client core shared by the Robono Web and React Native SDKs. It keeps Robono server credentials out of browsers and phones while providing Bridge calls, push-triggered synchronization, polling recovery, state subscriptions, and delivery diagnostics.

## License

Licensed for authorized Robono integrations. Redistribution as a standalone SDK, bypassing Robono, and competing bridge services are prohibited. See the included `LICENSE` and [license FAQ](https://robono.com/sdk-license).

Most applications should install `@robono/web` or `@robono/react-native`. Install this package directly only when building another platform wrapper:

This package is ESM-only. CommonJS applications must load it with
`await import("@robono/client")`.

```bash
npm install @robono/client
```

The package includes TypeScript declarations and `SBOM.spdx.json`.

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
  // Initial authentication, CORS, and configuration failures reject.
  showBridgeUnavailable(error);
}
```

`networks.list()` returns the available endpoints and the identifier each one requires. The unified `connections` methods connect, list every page, update, and disconnect either endpoint type. The unified `messages` methods send, list, and mark messages delivered, read, or heard. The synchronized `state.connections` and `state.messagesByConnection` collections use the same normalized shape for every endpoint.

When a user ends a friendship, call `connections.disconnect(...)`. For a disconnected connection, preserve history and remove sending, reply, and quote controls. Requesting the same endpoint and identifier again creates a reconnect request; keep communication disabled until the connection becomes active or accepted. The [connection lifecycle](https://robono.com/docs#lifecycle) covers both the initiating and receiving endpoint.

Call `networks.refresh()` when opening Add Friend. The client also refreshes the
directory after its five-minute TTL and when it receives
`bridge.directory_changed`.

Pass verified Robono push data to `client.receivePush(data)` for immediate synchronization. Recovery polling defaults to about 60 seconds with jitter, backs off after failures, and can be disabled with `pollingEnabled: false` when another reliable recovery signal exists. Call `client.stop()` and `unsubscribe()` when the owning lifecycle ends.

Optional language and speech operations are typed and available through the protected backend route. See the [developer guide](https://robono.com/docs#advanced).

Use `connections.listPage({ limit, cursor })` when rendering one page. Use
`connections.listAll({ pageSize, maxItems })` for a bounded full refresh and
check its `truncated` result before treating it as complete. `connections.list()`
is retained as the convenience full-list form.

Every client write accepts `{ idempotencyKey, requestId, signal, retries }` as
its final argument. The HTTP transport retries transient failures at most twice
by default and reuses one key within that call. Persist your own stable key and
reuse it across later retries, jobs, restarts, or devices.

For media composed as one message, give each item the same
`attachment_batch.id`, its zero-based `index`, and the common `count`. The
negotiated attachment limit is validated before the request.

Guardian messaging uses the same authenticated client. Your backend must authorize guardian operations independently from ordinary chat.

Subscribed state is temporary synchronization state, not your permanent database. Persist signed events and required records in your existing backend. That backend must authenticate the user and authorize every operation.

The package is ESM-only, requires `fetch`, and includes TypeScript declarations.
This is an early-access `0.x` package: patch releases are compatible fixes, while
a minor release before `1.0` may include a documented breaking change. Each
minor package line receives critical security and Bridge compatibility fixes
for at least 12 months after its successor is published. Read the packaged
`CHANGELOG.md` before upgrading and report SDK problems at
[robono.com/contact?topic=sdk](https://robono.com/contact?topic=sdk).

Full documentation is at [robono.com/docs](https://robono.com/docs).
