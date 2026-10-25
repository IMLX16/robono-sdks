# Changelog

## 0.1.2

- Add an optional availability reason while preserving voiceAvailable and existing call-control behavior.

## 0.1.1

- Stop unanswered ringing locally at the server deadline even if polling stalls.
- Add ordered, repeatable hold/resume, silenced tracks, a bounded held lease and fresh authorization before resuming.
- Dismiss locally failed media instead of leaving connected controls visible.

- Back off state polling after rate limits and temporary failures, honoring Retry-After.
- Preserve HTTP failure status when a proxy returns a non-JSON response.
- Share concurrent state refreshes so background scheduling and foreground polling cannot apply the same signaling state twice.
- Keep the calling engine independent of the optional mobile screen package.

## 0.1.0

- One-to-one WebRTC audio with direct connections and relay fallback.
- Stable start request IDs, cancellation during microphone permission or signaling, bounded transport deadlines and media cleanup.
- Per-contact availability, answer, mute, hangup, connection state and call history.
- Browser defaults and injectable media adapters for native hosts.
- TypeScript declarations and history merge/display helpers.

This headless package connects your app's own interface and native integrations. It does not install mobile screens, push credentials or native notification services. Calling access is configured separately for each network.
