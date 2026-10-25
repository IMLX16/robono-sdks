# Robono SDK lifecycle

## Supported packages

| Package | Platform | Current tested version |
| --- | --- | --- |
| `@robono/server` | Node.js, TypeScript, and Deno backends | `0.12.1` |
| `@robono/client` | Shared headless client core | `0.6.1` |
| `@robono/web` | Browser applications | `0.6.1` |
| `@robono/react-native` | React Native for iOS and Android | `0.6.1` |

The current API version is `2026-07-25`.
The four versions in this table are tested together in CI and are the
recommended production set.

Calling uses `@robono/calling` 0.1.2 and `@robono/server` 0.12.1. The optional
`@robono/calling-react-native` 0.2.1 adds reusable screens, sounds and native adapters.
The [versioned release](https://github.com/IMLX16/robono-sdks/releases/tag/calling-v0.2.1)
contains matching archives and checksums. Install the versioned packages through npm.
Published registry versions are recorded in `docs/sdk-registry-versions.json`.
Existing release archives remain unchanged. Networks choose whether to adopt each update.

The native adapter accepts Expo 54, 55 and 56 dependency families; use Expo’s installer
and the matching WebRTC config plugin listed in the mobile README. API/type compatibility
checks cover those families; physical device validation is separate from package checks.
The engine does not install the screen package. Messenger’s native runtime is not exported.
See [calling setup](https://robono.com/docs#calling) for integration and acceptance tests.
Calling access and incoming-call events are explicit per-network choices available together
in the developer workspace; SDK upgrades do not change either setting.

## Version promises

- Patch releases contain compatible fixes.
- Before `1.0`, minor releases may contain a documented breaking change.
- After `1.0`, major releases may contain breaking changes and require a migration guide.
- Robono provides critical security and Bridge compatibility fixes on supported releases. A fixed maintenance period for older releases requires a signed customer agreement; the package license continues to control SDK use.
- A production API-version deprecation receives at least 12 months' notice unless continued support would create an active security risk.

## Release process

1. Update the package version and changelog.
2. Run package, compatibility and affected integration checks.
3. Build and inspect the package archives, then verify them in a separate consumer.
4. Publish immutable versions to npm using an authorized maintainer or a configured trusted publisher.
5. Verify public registry downloads against the tested archives before updating installation instructions.
6. Publish a GitHub Release with the matching archives, checksums and changelog.

The SDK repository's `.github/workflows/publish.yml` verifies packages and can stage npm releases for maintainer approval. Trusted publishing must be configured in npm for each package; new packages require initial publication before staging is available. Previously published versions and release archives remain available.

## Push diagnostic webhook

The `diagnostic.push_requested` webhook asks the connected app to run a controlled push test. After each step, its backend calls:

```ts
await robono.diagnostics.reportPush({
  diagnostic_id: event.push_diagnostic_id,
  diagnostic_token: event.diagnostic_token,
  stage: "device_received",
  platform: "ios",
  provider: "apns",
  app_version: "1.4.0",
});
```

Valid stages are `provider_accepted`, `device_received`, `content_fetched`, `rendered`, `polling_recovered`, and `failed`.

## Relationship lifecycle

When a user ends a friendship, call the SDK disconnect operation and immediately apply the returned `disconnected` state. Preserve history and remove sending, reply, and quote controls.

To reconnect, request the same endpoint and identifier again. Robono reuses the relationship and its history, but requires a new recipient decision:

- A Robono endpoint returns `pending_reconnect` until the Robono recipient accepts.
- Another connected app receives `bridge.connection_requested` with `is_reconnect: true` and applies its normal protected approval process.
- Neither participant may send while approval is pending.
- A second request for the same pending reconnection returns `409 reconnect_already_pending`. Keep the original connection and continue showing its waiting state.
- A signed status-change event reports acceptance, rejection, or disconnection. Recipient blocking remains private. Push triggers immediate synchronization; polling is the recovery path.

## Account-deletion lifecycle

Ending one friendship and deleting a participant account are different operations. Call the connection disconnect operation for one friendship. After your protected backend authorizes deletion of the participant's account, call `dataRequests.deleteUser()` once with a persisted idempotency key.

Robono then:

- anonymizes the deleted participant's identifier, profile, guardians, preferences, and diagnostics;
- disconnects every direct and app-to-app relationship for that participant;
- preserves the existing conversation and message history held by friends;
- notifies Robono App friends immediately; and
- sends every affected connected app a durable `bridge.connection_status_changed` event with `reason: "account_deleted"`, a `deleted_participant` marker, and the anonymized connection.

Use the stable connection ID to update local records. The erased participant identifier is `null` in later connection responses and in preserved messages sent by that participant. Disable all communication on the disconnected relationship. The receiving app controls how it presents or retains its existing history under its own policies.

The requesting app receives `data.deletion_completed` only after peer notifications have either been accepted or placed in Robono's retry queue. The status operation remains the recovery path for a delayed completion webhook.

## Participant language lifecycle

- The stored preference belongs to one participant identified by connected app and external user ID. A guardian's viewing language remains a separate app-owned preference and is supplied when localizing a notice for that guardian.
- Call `participants.updateLanguage` after sign-in and whenever that participant changes language. One call updates every current direct and connected-app relationship.
- Pass the current viewer language on immediate operations. Keep stable codes and parameters for application logic and delayed events.
- Push contains identifiers only. Synchronize current records before showing visible wording.
- For a delayed webhook viewed by people with different languages, call `userMessages.localize` once per viewer. Do not reuse one participant's translated sentence for another viewer.
- Fallback is full requested locale, recognized script, base language, then English.
