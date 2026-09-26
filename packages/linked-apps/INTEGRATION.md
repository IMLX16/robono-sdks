# Integrating an independent app

Install `@robono/linked-apps@0.1.0-preview.4` and supply your app details in SDK
configuration. No Robono developer account, website registration, API key, issued
client ID, callback URL or manual activation is needed. The SDK uses Robono's
published service address by default. This connects to Robono app accounts, not
the Robono Bridge network API.

App details are supplied by your app; Robono does not certify ownership of the name
or URLs. Use accurate names and public HTTPS website/privacy-policy links. Robono
creates its internal client identifier automatically. Keep these details stable:
a changed profile has a different identifier and needs new account connections.
For development, use a distinct app name and separate secure credential storage.
Your users still approve access inside Robono. Installing the SDK grants no access.

## Link an account with a code

Direct integration requires SDK 0.1.0-preview.4 or newer. Existing integrations
with registered client IDs remain supported, but new integrations should use `app`.

```ts
import { RobonoLinkedApps, secureTokenStore, nativeCryptoProvider } from '@robono/linked-apps';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const robono = new RobonoLinkedApps({
  app: {
    name: 'Your App',
    developerName: 'Your Company',
    websiteUrl: 'https://example.com',
    privacyUrl: 'https://example.com/privacy',
  },
  tokenStore: secureTokenStore(SecureStore, 'robono.linked.account.primary'),
  crypto: nativeCryptoProvider({
    getRandomBytes: Crypto.getRandomBytes,
    digest: (_, bytes) => Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)),
  }),
});
const pairing = await robono.beginPairing(
  ['account:read', 'messages:read', 'messages:send', 'receipts:write']);
// Show pairing.userCode with a five-minute expiry indication.
// Tell the user: Robono > Linked apps > Connect an app > enter this code.
// Optional: open pairing.verificationAppUrl to take them to Robono.
await SecureStore.setItemAsync('robono.pending-pair', JSON.stringify(pairing.pending));
const controller = new AbortController();
// Abort when this screen closes, the account changes, or the app backgrounds.
const tokens = await robono.waitForPairing(pairing.pending, controller.signal);
await SecureStore.deleteItemAsync('robono.pending-pair');
// Connected. Tokens are already saved by the configured TokenStore.
```

If backgrounded while the user opens Robono, cancel polling, preserve pending
state securely, then resume `waitForPairing` on foreground if it has not expired.
Use one poller per pairing and one SDK instance per connected account. You can
call `pollPairing` directly; it returns `pending` or `connected` and updates the
pending state's interval and next-poll time. Persist those updates if resuming
across process restarts. Network failures are surfaced: offer a retry with
backoff while the code remains valid. Never spin on errors.

Robono authenticates the owner using its existing phone session. A signed-out
user signs in through Robono's normal login first. There is no extra SMS check
for account linking. The code does not itself authorize access: the user must
review the app, account, and permissions and choose Allow connection in Robono.
Never request the user's Robono login code, password, or phone-session token.

The visible code expires after five minutes. The device code and PKCE verifier
are secrets; never show, log, put them in URLs, or send them to analytics. Native
clients use Keychain/Keystore; browser/server hosts must supply equivalent secure
storage. Only the app that initiated pairing can exchange the approved request.
Do not call completion repeatedly after receiving tokens. If the successful
exchange response is lost, start a new pairing; a consumed code cannot be reused.

HTTP clients: POST `linked-app-pair` with `app` (name, developerName, websiteUrl,
privacyUrl), scopes, S256 code_challenge and code_challenge_method. Do not send a
client_id with app. Save the returned client_id with the pending secret state; no
separate client-registration call is required. Poll `linked-app-token` using grant_type
`urn:ietf:params:oauth:grant-type:device_code`, the returned client_id, device_code and
code_verifier. Wait at least the returned interval (initially five seconds).
`authorization_pending` means keep waiting; `slow_down` increases the interval
by five seconds (up to sixty). Stop on `access_denied`, `expired_token`, or
`invalid_grant`. A 429 requires backoff. Only a successful response contains tokens.

The older `clientId` configuration and registered-callback `beginLink` / `completeLink`
APIs remain supported for existing clients. Do not combine `app` and `clientId`.
Direct integration uses code pairing and requires no callback handler. The internal
identifier is public; authorization still depends on PKCE and explicit account approval.
An app name or client ID is not proof of app ownership.

## Display and send

```ts
const snapshot = await robono.conversations();
const page = await robono.messages(conversationId, { limit: 50 });
// Generate and persist this ID before sending; use it again on every retry.
const result = await robono.send({ conversationId, messageKind: 'text',
  clientMessageId: durableOutgoingId, textBody: 'Hello' });
```

Show the allowed tools from each network's capabilities and connection status. The
server remains authoritative: never infer a successful delivery from a successful
send acknowledgement. Do not reveal another user's block. The API does not create
connections, bypass parental permissions, unblock contacts or change network rules.

For voice, retain the original recording and its measured duration, request an upload
ticket, upload the bytes, then send `messageKind:'voice'` with `mediaObjectId:ticket.media.id`.
Use `uploadBytes(ticket,bytes,mimeType)` or the equivalent native file streaming PUT to
`ticket.signedUrl`. Send **no account Authorization header** to that URL. If a send
times out, query/retry with the same message ID; do not record/upload/send a new copy
just because confirmation was lost. The existing server checks enforce format, size,
ownership, conversation membership and voice restrictions.

Download only when needed. A playback URL has an expiry, is sensitive, and may become
unavailable according to network retention. Only call `receipt(id,'heard')` after
actual listening. Use `delivered` and `read` for their corresponding user states.

## Synchronize

```ts
const controller = new AbortController();
const watching = robono.watch({
  signal: controller.signal,
  cursorStore: persistedCursors, // keyed by grant ID
  onResync: async () => reconcile(await robono.conversations()),
  onEvents: async events => {
    // Deduplicate message IDs. Fetch only relevant current pages; remove unavailable
    // or deleted content. Do not notify for receipt-only events or your own messages.
    await applyAuthoritativeChanges(events);
  },
  onError: reportTransientSyncFailure,
});
// Stop on background/logout/account change. Resume on foreground or a push hint.
controller.abort();
await watching;
```

`onResync` must reconcile active conversations and any visible message pages. Clear
stale local histories when `history_cleared_at` advances or a deleted conversation is
reported. Walkie-talkie replacement can invalidate an earlier message even if its ID
was previously downloaded. Read all pages with `has_more` using both returned page
markers; preserve microsecond timestamps as strings. Do not synthesize timestamps.

The watcher stores its cursor only after successful processing. A callback can run again
after a crash, so make local writes idempotent. Failed callbacks keep the previous
cursor. Abort does not advance past unfinished work. Grant changes terminate the old
watcher; cursors and cached data must never move to a different account.

## Live connections and background notifications

`watch()` opens a TLS WebSocket to `/linked-app-stream`, authenticates with the
linked account token, and resumes from its saved cursor. The SDK reconnects with
backoff, including routine server rotation. No webhook is offered.

Modern browsers, React Native and Node.js 22+ supply WebSocket. Other runtimes may
inject `webSocket: url => new WebSocketImplementation(url)` in the SDK constructor.
Do not disable TLS verification. Stop a phone's watcher when backgrounded; resume
it on foreground. A phone operating system can suspend its sockets.

For notifications while your phone app is suspended, your backend can run the same
watcher and send a content-free hint through your app's APNs/FCM/Expo credentials.
This uses an outbound connection to Robono, with no URL to register. First verify
the account/grant using `account()` before routing hints to your own user's devices.
Disclose server-side account access and protect its credentials. Use one token
owner to coordinate refreshes; do not let independent phone/server processes rotate
the same refresh token. Relay through that owner, or pair separately for each host.

Keep separate cursor stores for independent consumers. Maximum three connections
per grant. Events are retained for seven days. A longer absence triggers a fresh
snapshot, not silent event loss. Callbacks must be idempotent. The stream carries
change IDs, not message content; fetch the authoritative messages via the API.
Keep companion hints silent by default to avoid duplicating Robono's alerts.
Background execution and notification timing remain subject to iOS/Android rules.

### Protocol for clients not using the SDK

Connect to `wss://vzoqxavqacydtwypjsrd.supabase.co/functions/v1/linked-app-stream`
without query parameters. Within ten seconds send this JSON text frame:

```json
{"type":"authenticate","version":1,"access_token":"rla_…","cursor":null}
```

Use the last successfully processed cursor string, or null for initial sync. Never
put tokens in URLs or subprotocols. Require `messages:read` permission. The server
sends `{"type":"ready","grant_id":"…","heartbeat_seconds":15}`; verify the grant.
A `{"type":"page","page":…}` frame contains the same page as `events.poll`.
For initial sync or `resync_required`, reconcile conversations and current histories.
Otherwise apply its events, preserving their order and deduplicating IDs. Save the
page cursor only after processing succeeds, then send
`{"type":"ack","cursor":"<saved cursor>"}`. There is at most one outstanding page
and at most 100 events per page. ACK within 60 seconds or reconnect from the previous
saved cursor. Respond to `{"type":"ping"}` with `{"type":"pong"}`.

On `{"type":"reconnect"}`, reconnect with jitter from your saved cursor. The
current hosting environment rotates connections after about 85 seconds. The SDK
handles this. An error frame contains `error` and HTTP-style `status`; stop on
invalid/revoked credentials or insufficient permission. Back off on temporary
failures/rate limits. Rotate nearly expired access tokens through the existing
refresh API, then reconnect. Messages retained during interruptions are replayed.
`events(cursor)` remains available for a one-time reconciliation; `watch()` uses
the persistent connection rather than repeatedly polling the HTTP API.

Disconnect: call `robono.disconnect()`; clear your local cached account content and stop
watchers after revocation succeeds. A lost response may require retry/relink UI; a
user can always revoke from Robono's Linked apps screen. Account deletion, revoked
permissions or `invalid_token` must not trigger repeated unauthorized background work.
