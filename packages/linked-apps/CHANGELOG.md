# 0.1.0-preview.3

- `watch()` now uses an authenticated persistent WebSocket and automatic recovery.
- Acknowledgements follow successful processing and cursor persistence. Reconnects
  replay missed events; token refresh and account switching are handled explicitly.
- Remove `configureBackgroundDelivery`, `verifyWebhook` and `pollIntervalMs`.
  No webhook delivery option remains. Use a backend watcher for your own app's push.
- Global WebSocket is used in supported runtimes; other hosts can inject a factory.
- Self-service registration and code pairing require no delivery endpoint setup.

# 0.1.0-preview.2

- Add `beginPairing`, `pollPairing`, and cancellable `waitForPairing`.
- Codes expire after five minutes and require owner approval in Robono.
- Bind exchange to the originating client and PKCE verifier, enforce polling backoff,
  and serialize concurrent polls. Existing callback and messaging APIs remain supported.
- Pairing uses the existing Robono login. No extra SMS check or callback URL required.

# Changelog

## 0.1.0-preview.1

First distributable developer preview: user approval with PKCE, scoped messaging and media, receipts, secure native adapters, rotating credentials, resumable synchronization, verified background hints, and revocation. Requires an approved Robono registration and an activated environment.
