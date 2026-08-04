# Changelog

## 0.5.8

- Exposes pending reconnect state and reconnect lifecycle timestamps for normalized endpoint connections.
- Keeps disconnected history synchronized while communication remains disabled until acceptance.

## 0.5.7

- Simplifies integration guidance and aligns the documented support policy with the tested 12-month compatibility commitment.

## 0.5.6

- Publishes the tested July 2026 compatibility set with provenance, SBOM, and public license-review guidance.

## 0.5.5

- Added protected language discovery without breaking existing custom transports.
- Added bounded HTTP retries with stable per-call idempotency and complete structured errors.
- Preserved and validated composed attachment batches in normalized message state.

## 0.5.4

- Added verified public source, package ownership, support contact, and npm provenance metadata.

## 0.5.3

- Replaced loose push data with a runtime-validated discriminated event union.
- Added strict compilation coverage for event-specific push fields.
- Rejects incomplete routing payloads before they trigger synchronization.
- Added a packaged SPDX software bill of materials.

## 0.5.2

- Preserved opaque connection cursors so identical timestamps cannot omit records.
- Completed directory, guardian, and push-diagnostic event typing.
- Made stop win over in-progress startup and improved synchronization diagnostics.

## 0.5.1

- Serialized initial synchronization with push updates so an older startup response cannot erase newer state.
- Added a five-minute endpoint-directory TTL, explicit refresh, and directory-change push handling.
- Made access-token lookup cancellable and exposed cancellation, timeout, retryability, and `Retry-After` guidance distinctly.
- Strengthened participant, profile, guardian, capability, media, and message types.

## 0.5.0

- Made concurrent startup share the real initial synchronization result.
- Queued push refreshes that arrive during polling and removed connections no longer returned by authoritative refreshes.
- Added explicit paged and bounded full connection listing with truncation diagnostics.
- Added deep state snapshots, stable request options for every write, machine-readable endpoint identifier validation, and guardian messaging.

## 0.4.0

- Added caller-controlled transform idempotency keys so retries cannot duplicate processing charges.
- Added normalized peer display, identifier, avatar, and profile data for every endpoint type.
- Added direct push refreshes, message delta cursors, pagination metadata, and bounded parallel synchronization.
- Added end-to-end push diagnostic reporting through the protected backend adapter.

## 0.3.0

- Changed polling to a 60-second jittered recovery interval with failure backoff.
- Initial startup now returns a typed result and rejects with `RobonoClientStartError` when synchronization fails.
- Added unified connection update/disconnect and message receipt methods for every endpoint.
- Fixed forwarding of approval evidence to connected-app endpoints.
- Added full connection pagination, typed transforms, early capability validation, and direct send results without a follow-up list request.
- Added transform-aware request timeouts for synchronous language and speech processing.

## 0.2.0

- Added unified endpoint connection and message methods.
- Added synchronized connection and message state for Robono-owned endpoints.
- Added direct-endpoint polling recovery alongside connected-app recovery.

## 0.1.0

- Initial headless client release with push-triggered synchronization, polling recovery, and delivery diagnostics.
