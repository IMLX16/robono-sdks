# `@robono/react-native`

Headless React Native SDK for Robono Bridge. It keeps your existing authentication and screens, synchronizes after push, uses limited polling as recovery, and pauses polling in the background.

## License in plain English

You may use this SDK to build, test, and ship an authorized application that connects to Robono, including its compiled or bundled SDK code. You may not redistribute it as a standalone SDK, use it to bypass Robono, or use it to build a competing bridge service. Service access, pricing, and support are separate. If you and Robono sign a written agreement that expressly replaces this SDK license, that agreement controls to the extent it says so. The included `LICENSE` is the complete, controlling text.

It is pure JavaScript/TypeScript, works in Expo Go, and does not require CocoaPods or a native rebuild by itself. Your push provider may still require its normal native configuration.
The package is ESM-only, as expected by current React Native and Expo tooling.

## Install

```bash
npm install @robono/react-native
```

The package includes `SBOM.spdx.json`, a machine-readable inventory of its
production components.

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
  // Initial authentication, adapter, and configuration failures reject.
  showBridgeUnavailable(error);
}
```

The subscribed state uses one connection and message shape for every endpoint returned by the directory. Use the unified `connections.connect/list/update/disconnect` and `messages.send/list/mark` methods without branching on endpoint type in your UI.

Forward the notification from your existing notification handler. The SDK
accepts both the Expo notification shape and a provider-neutral data object:

```ts
await bridge.receivePushNotification(notification);
```

Push data should include `event` and the available event, request, connection, and message IDs. Never include a Robono API key, webhook secret, or message content.

Push initiates immediate synchronization. Recovery polling runs about once a minute with jitter, backs off after failures, and pauses in the background. Call `bridge.dispose()` and `unsubscribe()` when the owning app lifecycle ends. Subscribed state is temporary synchronization state, not your permanent database.

Your backend must mount the authenticated and authorized `/robono/*` adapter supplied by `@robono/server`.

This is an early-access `0.x` package. Patch releases are compatible fixes; a
minor release before `1.0` may contain a documented breaking change. The latest
minor line is supported. Read the packaged `CHANGELOG.md` before upgrading and
report SDK problems at
[robono.com/contact?topic=sdk](https://robono.com/contact?topic=sdk).

Full documentation is at [robono.com/docs](https://robono.com/docs).
