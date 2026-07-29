# `@robono/web`

Headless Web SDK for Robono Bridge. It uses your product's existing login, screens, storage, and notifications, synchronizes after realtime or push events, retains polling as recovery, and pauses polling while the page is hidden.

## License in plain English

You may use this SDK to build, test, and ship an authorized application that connects to Robono, including its compiled or bundled SDK code. You may not redistribute it as a standalone SDK, use it to bypass Robono, or use it to build a competing bridge service. Service access, pricing, and support are separate. If you and Robono sign a written agreement that expressly replaces this SDK license, that agreement controls to the extent it says so. The included `LICENSE` is the complete, controlling text.

See the [SDK license FAQ](https://robono.com/sdk-license) for procurement guidance and the route for organization terms.

## Install

The package is ESM-only. CommonJS build tooling must load it with
`await import("@robono/web")`.

```bash
npm install @robono/web
```

The package includes `SBOM.spdx.json`, a machine-readable inventory of its
production components.

## Start

```ts
import { createRobonoWeb } from "@robono/web";

const bridge = createRobonoWeb({
  externalUserId: signedInUser.id,
  http: {
    baseUrl: window.location.origin,
    getAccessToken: () => yourAuth.getAccessToken(),
  },
});

const unsubscribe = bridge.client.subscribe(
  renderWithYourExistingScreens,
);

try {
  await bridge.start();
} catch (error) {
  // Initial authentication, adapter, CORS, and configuration failures reject.
  showBridgeUnavailable(error);
}
```

The subscribed state uses one connection and message shape for every endpoint returned by the directory. Use the unified `connections.connect/list/update/disconnect` and `messages.send/list/mark` methods without branching on endpoint type in your UI.

When your existing realtime or push layer receives a Robono event:

```ts
await bridge.receivePush(pushData);
```

Push or realtime signals initiate immediate synchronization. Recovery polling runs about once a minute with jitter, backs off after failures, and pauses while the page is hidden. Call `bridge.dispose()` and `unsubscribe()` when the owning page ends. Subscribed state is temporary synchronization state, not your permanent database.

Never put a Robono API key in browser code. Your backend must mount the authenticated and authorized `/robono/*` adapter supplied by `@robono/server`.

For a separate backend origin, allow only your exact website origin, handle `OPTIONS`, and permit the authentication headers your app uses. Do not combine credentials with a wildcard origin.

This is an early-access `0.x` package. Patch releases are compatible fixes; a
minor release before `1.0` may contain a documented breaking change. The latest
minor line is supported. Read the packaged `CHANGELOG.md` before upgrading and
report SDK problems at
[robono.com/contact?topic=sdk](https://robono.com/contact?topic=sdk).

Full documentation is at [robono.com/docs](https://robono.com/docs).
