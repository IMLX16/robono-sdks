# Changelog

## 0.1.0

- One-to-one WebRTC audio with direct connections and relay fallback.
- Stable start request IDs, cancellation during microphone permission or signaling, bounded transport deadlines and media cleanup.
- Per-contact availability, answer, mute, hangup, connection state and call history.
- Browser defaults and injectable media adapters for native hosts.
- TypeScript declarations and history merge/display helpers.

This headless package connects your app's own interface and native integrations. It does not install mobile screens, push credentials or native notification services. Calling access is configured separately for each network.
