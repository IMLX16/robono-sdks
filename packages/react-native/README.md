# `@robono/react-native`

Headless React Native SDK for Robono Bridge. It keeps your existing authentication and screens, synchronizes after push, uses limited polling as recovery, and pauses polling in the background.

## License

Licensed for authorized Robono integrations. Redistribution as a standalone SDK, bypassing Robono, and competing bridge services are prohibited. See the included `LICENSE` and [license FAQ](https://robono.com/sdk-license).

It is pure JavaScript/TypeScript, works in Expo Go, and does not require CocoaPods or a native rebuild by itself. Your push provider may still require its normal native configuration.
The package is ESM-only, as expected by current React Native and Expo tooling.

## Install

```bash
npm install @robono/react-native
```

The package includes TypeScript declarations and `SBOM.spdx.json`.

## Start

```ts
import { AppState } from "react-native";
import { createRobonoReactNative } from "@robono/react-native";

const bridge = createRobonoReactNative({
  externalUserId: signedInUser.id,
  appState: AppState,
  http: {
    baseUrl: "https://your-app.example",
    getAccessToken: () => yourAuth.getAccessToken(),
  },
});

const unsubscribe = bridge.client.subscribe(
  updateYourExistingChatState,
);

try {
  await bridge.start();
} catch (error) {
  // Initial authentication and configuration failures reject.
  showBridgeUnavailable(error);
}
```

The subscribed state uses one connection and message shape for every endpoint returned by the directory. Use the unified `connections.connect/list/update/disconnect` and `messages.send/list/mark` methods without branching on endpoint type in your UI.

When a user ends a friendship, call `connections.disconnect(...)`. For a disconnected connection, preserve history and remove sending, reply, and quote controls. Follow the [connection lifecycle](https://robono.com/docs#lifecycle) for changes initiated by either endpoint.

Forward the notification from your existing notification handler. The SDK
accepts both the Expo notification shape and a provider-neutral data object:

```ts
await bridge.receivePushNotification(notification);
```

Push data should include `event` and the available event, request, connection, and message IDs. Never include a Robono API key, webhook secret, or message content.

Push initiates immediate synchronization. Recovery polling runs about once a minute with jitter, backs off after failures, and pauses in the background. Call `bridge.dispose()` and `unsubscribe()` when the owning app lifecycle ends. Subscribed state is temporary synchronization state, not your permanent database.

Your backend must mount the authenticated and authorized `/robono/*` route supplied by `@robono/server`.

This is an early-access `0.x` package. Patch releases are compatible fixes; a
minor release before `1.0` may contain a documented breaking change. Each minor
line receives critical security and Bridge compatibility fixes for at least 12
months after its successor is published. Read the packaged `CHANGELOG.md` before upgrading and
report SDK problems at
[robono.com/contact?topic=sdk](https://robono.com/contact?topic=sdk).

Full documentation is at [robono.com/docs](https://robono.com/docs).
