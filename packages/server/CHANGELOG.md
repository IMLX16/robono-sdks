# Changelog

## 0.7.7

- Accepts webhook fields that the public contract marks optional while continuing to validate them when supplied.
- Verifies every official OpenAPI webhook example through the published runtime verifier during tests.
- Completes the child-app adapter API description with operation summaries and explicit error responses.
- Improves sandbox diagnostics and avoids disconnecting a deliberately non-persistent Robono-endpoint dry run.

## 0.7.6

- Added protected language discovery and documented the canonical endpoint-neutral namespaces.
- Preserved composed attachment batches through direct and connected-app messages, lists, and signed webhooks.
- Strengthened attachment webhook validation and exported complete typed-reference dependencies.

## 0.7.5

- Defined concrete reaction, identifier, guardian, and status webhook types and runtime validation.
- Corrected the official message webhook example and documented the exact 2xx, timeout, and retry contract.
- Made the packaged sandbox runner clean up both connected-app and Robono-endpoint test connections.
- Added verified public source, package ownership, support contact, and npm provenance metadata.

## 0.7.4

- Added schema-level validation for nested webhook media, profiles, guardians, capabilities, transform artifacts, and billing operations.
- Rejects malformed signed billing operations before an application processes them.

## 0.7.3

- Added runtime payload validation for every signed webhook event type.
- Corrected webhook target, guardian, directory, and push contracts.
- Defined adapter test URLs as full mount URLs and added a regression test.
- Replaced claim-before-processing guidance with a durable pending-inbox flow.
- Added a packaged SPDX software bill of materials.

## 0.7.2

- Preserved opaque connection cursors so identical timestamps cannot omit records.
- Added safe HTTP 401 authentication rejection and direct receipt ownership lookup.
- Completed directory-change webhook verification and client-push forwarding.
- Corrected the reported SDK version and expanded strict documentation checks.

## 0.7.1

- Added provider-neutral webhook-to-client push payload generation without message content.
- Added `Retry-After` support, immediate abort handling, and public retry guidance.
- Corrected and strengthened message webhook, participant, profile, capability, and media types.
- Added child-app adapter contract coverage and a strict-TypeScript documentation example check.

## 0.7.0

- Added authenticated guardian messaging to the protected backend adapter.
- Added machine-readable directory identifier rules and aligned public pending-status handling.
- Added credential-free CLI help and contract checks for the corrected OpenAPI profile fields.
- Expanded the receiving-app, fail-closed authorization, capabilities, media, receipt, and reaction documentation.

## 0.6.0

- Fixed `health()` to use the production `GET /health` contract.
- Added normalized connection peers and complete endpoint-neutral connection and message namespaces.
- Added app-to-app profile propagation, delta message cursors, push diagnostics through the adapter, and an adapter smoke-test command.
- Added atomic webhook event claims, stronger webhook validation, paginated receipt authorization, and sanitized server errors.
- Corrected the generated OpenAPI contract and removed misleading package source links.

## 0.5.0

- Added typed message and standalone speech transform contracts, operation-level billing details, generated-media URL expiration, and typed webhook event unions.
- Added protected adapter routes for message transforms and direct-endpoint delivered, read, and heard receipts.
- Added transform completion and failure webhook contracts and API version `2026-07-25`.
- Added transform-aware request timeouts so synchronous language work is not cut off by the ordinary API timeout.

## 0.4.0

- Added one directory-driven `connections.connect()` method and one endpoint-neutral `messages.send()` method.
- Added typed connection and message synchronization routes for Robono-owned endpoints.
- Updated the default SDK user agent and package support metadata.

## 0.3.0

- Added required per-operation authorization to the safe backend adapter.
- Sensitive adapter operations now deny access unless the child app explicitly authorizes them.
- Added the consumer-runnable `robono-sandbox-test` command to the published package.

## 0.2.0

- Added authenticated end-to-end push diagnostic reporting.
- Added typed provider, device, content-fetch, render, polling-recovery, and failure stages.

## 0.1.0

- Initial public server SDK for connections, messaging, capability restrictions, webhooks, transformations, retries, and idempotency.
