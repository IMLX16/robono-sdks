# @robono/linked-apps

Robono's user-authorized messaging API client, for independent applications.
Developer preview. Install the SDK and supply your app details through `app` in its configuration. No developer account, website registration, issued client ID or manual activation is required. Each user approves their own Robono account connection.
SDK installation alone does not enable account access.

Supports PKCE account linking, rotating credentials, typed conversations/messages,
text/voice/file sending, signed media upload/download, receipts, resumable change
watching over authenticated WebSockets and revocation.
No dependency on Matrix, TalkOpen, Loop, Expo or a specific UI framework.

Build/test from the repository:

```
npm --prefix packages/linked-apps test
```

Use one `RobonoLinkedApps` instance per connected account. Inject a Keychain/Keystore
`TokenStore` and native `CryptoProvider`; adapters are exported. Browser/server
runtimes may use WebCrypto. Use `beginPairing` to obtain a code, show it to the user, then call
`waitForPairing` to finish after approval in Robono. Store pending state securely.
Robono reuses its normal login; account linking adds no SMS verification.
Registered callback linking remains available for existing clients.

[Integration guide](./INTEGRATION.md) ·
[API reference](https://robono.com/api-reference-viewer.html?spec=linked-apps) ·
[Developer documentation](https://robono.com/linked-apps)

The watcher is explicit and cancellable. Stop on background/logout; resume on a push
hint or foreground. It checkpoints only after successful consumer callbacks, so
callbacks must tolerate redelivery. The SDK opens the connection, authenticates without
putting tokens in URLs, and reconnects from the last saved cursor. No webhook setup
or delivery endpoint is supported. For background notifications, a developer backend
can run the watcher and use its own app's push credentials. Phone sockets may be
suspended by the operating system. See the integration guide for secure token ownership.

Send retries must retain the original UUID. Refresh requests are serialized within
one instance; coordinate across processes yourself. A lost refresh response can
require relinking because reusing a spent refresh token revokes the grant.

## Preview distribution

The official distribution channel is npm. Install this exact preview version:

```sh
npm install --save-exact @robono/linked-apps@0.1.0-preview.4
```

Preview releases use the `preview` tag. Pin the version and commit your lockfile; review release notes and test before updating. The Robono website does not distribute SDK archives.

The SDK is covered by the included Robono SDK License Agreement. This package contains no client secret or credentials. The default Robono service URL is built in. Existing registered client IDs remain compatible; new integrations use app details.
