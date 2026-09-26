# Integrating an independent app

Use a separate registration for development and production. Robono supplies its
functions URL, client ID and reviewed redirect URI/scopes. Client IDs are public.
A backend webhook signing secret is confidential and must never enter a mobile bundle.

## Link an account with a code

Pairing support requires SDK 0.1.0-preview.2 or newer. The currently registered
client ID is public; users never need a developer account. Pairing-only clients
use an empty `redirect_uris` list and do not need callback URLs.

```ts
import { RobonoLinkedApps, secureTokenStore, nativeCryptoProvider } from '@robono/linked-apps';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const robono = new RobonoLinkedApps({
  functionsUrl: 'https://vzoqxavqacydtwypjsrd.supabase.co/functions/v1',
  clientId: config.robonoClientId,
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

HTTP clients: POST `linked-app-pair` with client_id, scopes, S256 code_challenge
and code_challenge_method. Poll `linked-app-token` using grant_type
`urn:ietf:params:oauth:grant-type:device_code`, client_id, device_code and
code_verifier. Wait at least the returned interval (initially five seconds).
`authorization_pending` means keep waiting; `slow_down` increases the interval
by five seconds (up to sixty). Stop on `access_denied`, `expired_token`, or
`invalid_grant`. A 429 requires backoff. Only a successful response contains tokens.

The older registered-callback `beginLink` / `completeLink` APIs remain supported
for existing clients. New code pairing requires no callback handler.

## Display and send

```ts
const snapshot = await ot.conversations();
const page = await ot.messages(conversationId, { limit: 50 });
// Generate and persist this ID before sending; use it again on every retry.
const result = await ot.send({ conversationId, messageKind: 'text',
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
const watching = ot.watch({
  signal: controller.signal,
  cursorStore: persistedCursors, // keyed by grant ID
  onResync: async () => reconcile(await ot.conversations()),
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

Polling stores its cursor only after successful processing. A callback can run again
after a crash, so make local writes idempotent. Failed callbacks keep the previous
cursor. Abort does not advance past unfinished work. Grant changes terminate the old
watcher; cursors and cached data must never move to a different account.

## Background notices

1. Configure a reviewed HTTPS backend webhook with Robono.
2. Your backend associates a grant with an authenticated account in your own service.
   Verify it by calling `account.get` using that account's linked token; never trust
   a client-supplied grant ID to route another user's notifications.
3. Call `configureBackgroundDelivery(true)` after the mapping is ready.
4. Verify the **raw** webhook body before parsing/queuing it:

```ts
import { verifyWebhook } from '@robono/linked-apps';
const hint = await verifyWebhook({ body: rawBody,
  timestamp: request.headers.get('x-robono-timestamp')!,
  signature: request.headers.get('x-robono-signature')!,
  secret: backendOnlySigningKey });
// Check expected client_id; atomically deduplicate hint.id and enqueue the hint.
// Return 2xx only after the queue write commits.
```

The signature covers `timestamp + '.' + rawBody` with HMAC-SHA256, accepted within
five minutes. Delivery IDs remain stable across retries; attempt timestamps change.
Reject replayed IDs after verification, check client identity, limit request size and
retain dedup IDs for at least seven days. Invalid signatures receive no processing.

5. Send a content-free sync hint through **your app's** APNs/FCM/Expo credentials.
6. On wake/resume, call `events(cursor)` or restart `watch`; do not trust a webhook's
   cursor as proof you already applied earlier events. Never overwrite the local
   cursor with the pushed cursor. Keep Robono notifications as the default alert and
   companion hints silent to avoid duplicate sounds.

Disconnect: call `ot.disconnect()`; clear your local cached account content and stop
watchers after revocation succeeds. A lost response may require retry/relink UI; a
user can always revoke from Robono's Linked apps screen. Account deletion, revoked
permissions or `invalid_token` must not trigger repeated unauthorized background work.
