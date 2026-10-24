# Robono Calling SDK

Add one-to-one voice calls between people who are already connected across Robono Bridge networks. The SDK manages WebRTC negotiation, direct connections, relay fallback, call state and microphone cleanup. Your app supplies its interface, identity and platform audio/notification integration.

## Install

```sh
npm install https://github.com/IMLX16/robono-sdks/releases/download/calling-v0.1.0/robono-calling-0.1.0.tgz
```

This is a versioned npm-compatible package. Commit your package lockfile to retain its integrity checksum. The release includes `SHA256SUMS` and the package includes an SPDX software bill of materials.

- [Calling integration guide](https://robono.com/docs#calling)
- [HTTP API](https://robono.com/api-reference?spec=calling)
- [Developer calling workspace](https://robono.com/calling)

## Connect your backend

Enable calling for your network and obtain its admission URL through Robono support. Your server authenticates the user, then posts the following to that URL using a network API key with `calling:connect` scope:

```json
{"operation":"admit","kind":"network","protocolVersion":1,"externalUserId":"YOUR_AUTHENTICATED_USER_ID"}
```

Use the exact external user ID from the accepted Bridge relationship. Validate the returned `serviceUrl` against your configured calling service, then exchange the returned `ticket` within 60 seconds at `serviceUrl + '/sessions'` using `{ticket, connectionId}`. A connection ID is `bridge:CONNECTION_ID` between networks or `app:CONVERSATION_ID` for a Robono Messenger endpoint. Omit `connectionId` to listen across authorized contacts.

Return the service URL, resulting session token and expiry to that user's client over HTTPS. Keep network API keys on your server and tokens out of logs and URLs. Renew expired sessions through your authenticated backend; never silently reopen a microphone.

Both networks must allow voice on the accepted relationship:

```json
{"calling":{"voice":true,"video":false,"protocol_version":1}}
```

Keep the existing messaging capabilities and protocol version. Check live availability before enabling a call action.

## Browser integration

Create one client per signed-in device and keep it alive across screen navigation. Here `session` comes from your backend, `audio` is an HTML audio element, and `renderCall` updates your app's UI:

```js
import { RobonoCallingClient, createHttpTransport } from '@robono/calling';

const client = new RobonoCallingClient({
  request: createHttpTransport({ baseUrl: session.serviceUrl, token: session.token }),
  onChange: renderCall,
  onRemoteStream(stream) {
    audio.srcObject = stream;
    if (stream) audio.play().catch(() => showEnableAudioButton());
  }
});
await client.listen();
const { voiceAvailable } = await client.availability(connectionId);

// Bind these to user actions, with error handling in your UI:
// await client.call(connectionId);
// await client.answer();
// client.mute(true); client.mute(false);
// await client.hangUp();
// await client.dispose(); // logout or destruction of this device session
```

Use HTTPS and request microphone permission from the Call or Answer action. Browsers may require a user gesture to play remote audio. Do not call `answer()` just because a notification arrived. `forceRelay: true` is available for your relay acceptance test; normal calls prefer a direct route.

Use the `onChange` snapshot to render ringing, connecting and connected states. Start the timer at `call.connectedAt`, not when Answer is pressed. A preparation state can precede a server call ID; retain the same screen and allow cancellation. `hangUp()` handles cancellation, decline and ending an active call.

## Native hosts

Supply `getUserMedia`, `createPeerConnection` and, if needed, `createRemoteStream` adapters through the constructor. The microphone adapter receives an optional `{isCurrent}` callback: check it before capture after asynchronous permission or audio-session work. A late returned stream is stopped if the call has already been cancelled.

The headless SDK does not install iOS or Android native code. Your host manages microphone permission, audio sessions/focus, speaker/Bluetooth routing, interruptions, background execution, native incoming UI and push delivery. Select the speaker route before connection if requested and preserve it when media starts. Release native audio resources when the call ends. Use the same protocol on both platforms.

## Incoming notifications

Enable network notifications on your admission endpoint with `{"operation":"notifications","enabled":true}`. Robono sends signed `calling.incoming` and `calling.dismissed` events to your network webhook. Your backend sends push through your app's own provider; Robono does not receive your app's push keys through this SDK.

Use the matching backend release:

```sh
npm install https://github.com/IMLX16/robono-sdks/releases/download/calling-v0.1.0/robono-server-0.10.0.tgz
```

Verify the raw webhook body with `verifyRobonoWebhook`, then use `toCallingPushPayload` from `@robono/server`. Route only to devices owned by `recipient.external_user_id` in `recipient.child_app_id`. Durably queue verified events before acknowledging them. Deduplicate by `event_id`; retain the highest per-call sequence for at least 24 hours. A dismissal (sequence 2) overrides an invitation (sequence 1), even if events arrive out of order. Never ring past `ring_expires_at`. Dismissal clears ringing; it does not end an answered call.

When opened, a notification should authenticate the current user and refresh current call state. Notification content is routing information, not authorization. Platform settings control notification presentation and delivery.

## History

```js
import { mergeCallHistory, describeCall } from '@robono/calling/history';
const page = await client.history({ after: saved.cursor, limit: 100 });
const updated = mergeCallHistory(saved, page);
await saveHistory(updated); // Commit entries and cursor together.
const label = describeCall(updated.entries.at(-1));
```

Initialize `saved` as `{cursor: 0, entries: []}`. Continue while `hasMore` is true. Keep separate history cursors per account and query scope. Store entries by call ID and show them on the caller's side of the conversation. `durationMs` excludes ringing and setup. Refresh history on resume and hangup, and recheck availability before callback.

## Failure handling

- 401: stop media and obtain a new session through your backend.
- 403: refresh account and relationship permissions.
- 409: refresh call state; another device may control the call or a participant may be busy.
- 429: back off before retrying.
- 503/network failure: use bounded retries and show a recoverable error.

The client retries ambiguous Start responses with the same request ID, stops late microphone capture after cancellation, and releases media on signaling loss. Your UI should handle rejected actions and avoid automatic redial.

## Verify your integration

Use two sandbox networks and two devices. Check calls both ways, audible two-way speech, mute, speaker, Bluetooth, decline, caller cancellation, no answer, history, Wi-Fi/cellular and relay fallback. Repeat native foreground, background and locked-screen tests on iPhone and Android. Confirm messaging continues working during rollout.

The package uses ESM and includes TypeScript declarations. Node.js 22+ runs its development tests; browser/native hosts provide WebRTC.

## License and support

Use is governed by the included Robono SDK License Agreement. Contact [Robono support](https://robono.com/contact?topic=sdk).
