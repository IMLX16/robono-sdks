# Robono mobile calling

Optional React Native screens, sounds and audio adapters for one-to-one Robono Bridge calls. Each person stays in the app they use. This package has no network-specific accounts, branding or navigation.

Choose the pieces you want:

| Your app needs | Use |
| --- | --- |
| Its own calling interface | `@robono/calling` alone, or the calling HTTP API |
| Ready-made screens and controls | `CallingOverlay` with `createCallingController` |
| A screen inside its own navigation | `CallingScreen` with controlled state and callbacks |
| Mobile microphone and audio handling | `createNativeCallAdapters` from the separate `/native` entry point |
| Incoming notification routing | `/expo-notifications` for Expo, or `/notification-router` with your existing push provider |
| Background call lifetime | `/runtime` for Android ongoing-call service and iPhone audio interruptions |
| Entries inside an existing conversation | `CallHistoryItem` with your chat bubble colors |

Installing the engine never installs or opens these screens. Importing this package does not register a push handler, ask for permissions, modify navigation or start audio. Screens appear only where your app explicitly renders them. You can use your own screens with the supplied audio adapter, or the supplied screens with your own audio adapter.

## Install and configure

Install the versioned `@robono/calling` and `@robono/calling-react-native` packages from the Robono SDK release. The screen package needs React, React Native, `react-native-svg` and `react-native-safe-area-context` 5. The `/native` adapter additionally uses `react-native-webrtc` 124, `react-native-incall-manager` 4, `expo-audio` 56 and `expo-crypto` 56. These native dependencies are optional peers; screens-only users do not need them. Choose dependency versions compatible with your app, and commit the lockfile.

For an Expo application using the native adapter:

```sh
npx expo install react-native-svg react-native-safe-area-context expo-audio expo-crypto
npm install react-native-webrtc@124.0.8 react-native-incall-manager@4.3.0
npm install @config-plugins/react-native-webrtc@15.0.2
```

Add `@config-plugins/react-native-webrtc`, `expo-audio`, and `@robono/calling-react-native` to your Expo plugins, then make a development or release build. For the supplied notification connection, also install and configure `expo-notifications` 56 using your app’s existing push credentials. Expo Go cannot load the WebRTC native module. A native dependency change needs a new binary; ordinary screen and copy changes do not.

On iPhone, configure `NSMicrophoneUsageDescription` with your app's explanation and the `audio` background mode for ongoing calls. On Android, declare `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, and `INTERNET`; obtain notification permission on Android 13+. For Bluetooth audio on Android 12+, declare and obtain `BLUETOOTH_CONNECT` through your app's permission flow. The optional native runtime supplies Android’s microphone foreground service and its ongoing-call notification. It starts only after microphone permission, while the app is visible, when the user makes or answers a call. Locking the phone after answering keeps that service running. Tapping its notification returns to your app; End releases the call. The service does not restart a call after the app is terminated. On iPhone, the runtime observes audio interruptions and holds an established call when another call takes the microphone; it never installs CallKit. If your app already owns call lifetime, pass your existing adapter instead of starting a second service. Screens-only applications can disable native autolinking for this package in their React Native configuration.

Unanswered calls stop after 30 seconds from call creation. The service records No answer for the caller and the history helper displays Missed call for the recipient. The client also stops ringing at the supplied deadline if a status request stalls. Answering does not restart the ringing deadline.

## Add the optional interface

The complete `examples/CallingHost.tsx` component accepts your authenticated session function, service origin, contact information and accepted Bridge connection. Mount it under your account provider. `getSession` calls your backend, which authenticates the current user and exchanges a Robono admission ticket; network API keys never belong in mobile code.

```tsx
import { createHttpTransport } from '@robono/calling';
import { createCallingController, CallingOverlay } from '@robono/calling-react-native';
import { createNativeCallAdapters } from '@robono/calling-react-native/native';
import { createNativeCallRuntime } from '@robono/calling-react-native/runtime';

const runtime = createNativeCallRuntime({
  notificationTitle: 'Voice call', notificationText: 'Call in progress',
  channelName: 'Ongoing calls', endLabel: 'End call', onError: showCallError,
});
const adapters = createNativeCallAdapters({
  runtime,
  ringtone: 'robono',
  restoreAudio: restoreYourNormalAudioMode,
  onError: showAudioError,
});
const calling = createCallingController({
  request: createHttpTransport({baseUrl: session.serviceUrl, token: session.token}),
  ...adapters,
  resolveContact: id => contactsByConnectionId[id] || null,
  onError: showCallError,
});
runtime.attach(calling);
await calling.listen();

// Render once at your app's root, above ordinary chat navigation:
<CallingOverlay controller={calling} labels={{call: 'Voice call'}} />

// From your contact's call action, after checking availability:
await calling.call(connectionId, {name: contact.name, avatarUri: contact.avatar});
// On logout, dispose before creating another account's controller:
try { await calling.dispose(); } finally { await runtime.dispose(); }
```

Keep one controller per signed-in device across navigation. Dispose it on logout. Stop your app's other recorder before starting a call. `restoreAudio` restores the host's normal audio mode after a call, so voice messages and other playback keep their existing behavior. The supplied runtime connects native interruption callbacks to `calling.interrupt()`: microphone, received audio and cues are silenced, and both screens show Call on hold. The existing call remains available for up to five minutes. Android audio-focus gain and iPhone interruption-end with permission to resume trigger a fresh server check before audio returns. If automatic resumption does not occur, the local screen offers Resume call on both iPhone and Android. While checking the call it shows Resuming; if audio is still in use or the service cannot be reached, it explains the problem and allows another attempt. This checks audio availability and the current call before enabling tracks; it preserves mute and speaker preferences. Either person can end the held call. A lost transport, expired hold or revoked connection cannot be silently reopened. If you supply your own lifetime adapter, connect those same interruption and resume actions. For your own interface, use `resumePending` to prevent duplicate taps and `resumeError` to explain a failed attempt. For a controlled `CallingScreen`, pass `onResume={() => calling.resume()}` as well as the ordinary controls. Calls still being set up end silently if audio is interrupted.

The host example refreshes contact availability and respects the server's retry delay. It renews sessions before expiry while idle, waits for previous audio cleanup on account changes, and offers reconnection after access ends. It never transfers an active call to a newly admitted session. Pass `expiresAt` as Unix milliseconds from the session response. Keep the controller at app level so changing chat screens does not end an ongoing call.

`CallingScreen` accepts state and callbacks rather than owning navigation. `CallingOverlay` is the optional full-screen wrapper. Both allow theme and label overrides, a contact avatar, safe-area insets and a friendly error formatter. The overlay and supplied host provide safe-area measurement inside their modal, keeping controls clear of system navigation. When embedding `CallingScreen` directly, use your existing safe-area provider or pass `insets`. Labels can be translated. Answer is on the right, Decline on the left. Speaker is available while calling and connecting. The timer starts at the media connection time. End dismisses the screen; there is no separate ended-call page.

## Sounds and routes

The package includes original Robono WAV assets: `ringing.wav`, `connecting.wav` and `ended.wav`. The adapter defaults to the person's system ringtone; choose `ringtone: 'robono'` for the supplied melody. A quiet repeating pulse indicates connecting. A brief descending chime follows an established call ending, including when the other person hangs up. Decline and unanswered cancellation are silent on the recipient's device. Ringing stops when Answer is pressed. Each new call starts with Speaker off. A selection made during connection setup carries through connection; switching Speaker off restores the system's automatic earpiece/headset/Bluetooth choice.

The supplied assets may also be used by your own audio implementation under the SDK license. They contain no speech or third-party recordings.

## Use your existing notifications

Keep the app's push registration, permission requests, privacy preferences, icon and notification handler. Robono's signed `calling.incoming` and `calling.dismissed` webhooks go to your backend. Verify them and use `toCallingPushPayload` from `@robono/server` to create the routing payload. Send it only to devices belonging to the recipient account. Set expiration to the ringing deadline.

`createCallingNotificationStore(AsyncStorage)` supplies account-scoped durable ordering using your existing AsyncStorage installation. Corrupt storage fails closed rather than reopening an old invitation.

For Expo, use the included `examples/ExpoCallingHost.tsx` above your chat navigation. It connects initial notification responses, later taps and received events to the same call layer. Supply your account, session function, contacts, durable store, and `recipientAccount(data)` to read the account identifier your backend attaches to each push. Only a matching signed-in account can consume that notification. The helper leaves unrelated notifications and the app’s global notification handler intact. No permission prompt or token registration happens on import.

Wrap your existing Expo handler with `withCallingNotificationPresentation(existingHandler, canPresentCall)` when registering it with `Notifications.setNotificationHandler`. `canPresentCall` returns true only when your signed-in call layer is ready; until then, normal alerts remain enabled. This preserves all ordinary message notifications. For another provider, call `callingNotificationPresentation(data, isForeground)`: `screen` means suppress the duplicate banner and sound, `notification` means use your ordinary alert, `dismiss` means suppress a stale/cancelled invitation, and `null` means keep your normal handling. Background alerts are sent by your backend through your existing push provider; the mobile library does not send push notifications.

For another provider, use `createCallingNotificationRouter` with the same durable store, recipient check, `open`, `refresh` and `dismiss` callbacks. `open` sets the root call layer immediately; it does not wait for the calling session request.

`createCallingNotificationHandler` accepts your controller, an account-specific durable store and a function that dismisses your app's notification by call ID. Pass notification data to `handle(data)` on receipt and `handle(data, {opened: true})` when tapped. It deduplicates events, retains dismissal ordering for 24 hours, rejects expired invitations, and refreshes the authenticated call before enabling Answer. Disposal prevents a late event from operating a signed-out account. A notification never answers or opens the microphone by itself.

Mount the call layer above normal navigation during startup. Once authentication is restored, pass the tapped call ID to `openIncoming`; its loading state stays on the same call screen until the server confirms the call. Check the initial notification response as well as subsequent taps. Clear the consumed response so restarting the app does not reopen it. Dismissal removes an incoming notification; it must not end a call that was already answered.

The host example keeps one full-screen layer visible while the session and incoming call load. Pass `notificationCallId` as soon as the tap is known, and use `onNotificationConsumed` to clear it from your router and notification provider. Closing during startup prevents the delayed lookup from reopening that notification. Render this host above any authentication-loading page; only mount it for the account that owns the notification.

When the app is open, use the screen and suppress the additional incoming notification banner and sound through your existing foreground handler. When another app is open or the phone is locked, use the receiving app's ordinary notification. A tap opens the receiving app, with unlocking when required. iOS controls banner presentation and alert delivery. An ordinary notification does not provide a custom locked-screen Answer button or guaranteed ringing. Android apps that already provide native calling notifications can keep those and forward their explicit Answer action after validating current call state.

## Relationships and existing calls

The UI does not impose a network topology. The engine accepts the authorized Bridge connection ID: `bridge:…` for two connected networks, or `app:…` for a Messenger endpoint. A local chat ID is not a Bridge connection ID. Existing calls between people inside one external network can continue through that network's own engine, using `CallingScreen` if desired. For two users inside your own network, your backend registers their existing calling permission with `setRelationship` and uses the returned `network:…` connection. Updates carry a monotonically increasing revision so a delayed permission grant cannot undo a later block. The Bridge does not invent friendships between arbitrary users.

## Verify in your app

Use the developer workspace to verify the Bridge connection, then test the chosen interface and native integration on physical iPhone and Android devices. Check two-way speech, speaker before and after connection, mute, Bluetooth, interruptions, cancellation during permission prompts, notification taps on a cold start, account switching and background operation. Verify existing messages, voice recordings and calls still work.

[Calling guide](https://robono.com/docs#calling) · [Calling API](https://robono.com/api-reference?spec=calling) · [Support](https://robono.com/contact?topic=sdk)
