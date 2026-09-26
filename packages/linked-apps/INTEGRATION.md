# Integrating an independent app

Use a separate registration for development and production. Robono supplies its
functions URL, client ID and reviewed redirect URI/scopes. Client IDs are public.
A backend webhook signing secret is confidential and must never enter a mobile bundle.

## Link an account

```ts
import { RobonoLinkedApps, secureTokenStore, nativeCryptoProvider } from '@robono/linked-apps';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Linking } from 'react-native';

const ot = new RobonoLinkedApps({
  functionsUrl: config.robonoFunctionsUrl,
  clientId: config.robonoClientId,
  tokenStore: secureTokenStore(SecureStore, 'robono.linked.account.primary'),
  crypto: nativeCryptoProvider({
    getRandomBytes: Crypto.getRandomBytes,
    digest: (_, bytes) => Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)),
  }),
});
const link = await ot.beginLink('com.example.app://robono/callback',
  ['account:read', 'messages:read', 'messages:send', 'receipts:write']);
// Keep the verifier/state in Keychain/Keystore across the app switch.
await SecureStore.setItemAsync('robono.pending-link', JSON.stringify(link.pending));
await Linking.openURL(link.authorizationUrl);
// In your callback handler, after matching the registered route:
const pending = JSON.parse((await SecureStore.getItemAsync('robono.pending-link'))!);
await ot.completeLink(callbackUrl, pending);
await SecureStore.deleteItemAsync('robono.pending-link');
```

The native adapters are dependency-injected: bare React Native can supply equivalent
Keychain/Keystore and cryptography implementations. Never use Math.random or ordinary
AsyncStorage for credentials/verifiers. Choose platform key accessibility according
to your app's background needs; never opt into backup/sync of account secrets.

Register the callback on **both iOS and Android**. Prefer an owned HTTPS universal/app
link where possible. Private native schemes must be unique reverse-domain names;
PKCE protects code redemption from interception. Never accept arbitrary callback
hosts, skip state verification, or copy a Robono phone session into your app.

Only one SDK instance owns a connected account's refresh sequence. Multiple runtimes
or processes must coordinate access to secure storage. A lost refresh response or
crash before the rotated pair is persisted may require relinking; retrying a spent
refresh token revokes the grant. Do not automatically repeat token exchanges.

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
