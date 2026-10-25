# Changes

## 0.2.0

- Saved branding, labels and event sounds shared with the website preview.
- Optional component inventory; standalone and Bridge calling use the same interface.
- Existing audio-session ownership and interruption behavior retained.

## 0.1.0

- Optional incoming, outgoing, connecting and connected screens with theme and label overrides.
- A controller separate from rendering; no automatic navigation or notification registration.
- Mobile WebRTC, microphone, speaker and audio-cue adapter in a separate entry point.
- Original ringing, connecting and hangup assets.
- Account-scoped notification ordering and authenticated call lookup.
- A React Native integration example.
- Continuous notification startup, account cleanup, idle session renewal and availability recovery in the included host example.
- Per-call Speaker selection and repeatable local/remote hangup tones.
- Stopping audio cues preserves the iPhone's shared WebRTC audio session until call cleanup.
- Established calls hold during system audio interruptions, preserving mute and speaker choices. Resume revalidates the call and audio availability; Both platforms offer manual Resume when needed. Setup interruptions still end silently.
- Resume shows progress and actionable errors; repeated taps share one request, and late errors cannot reopen an ended call.
- Expired or revoked sessions clear connected-call controls.
- Safe-area-aware controls keep call actions above Android navigation bars and iPhone home indicators.

- Optional Android active-call service and iPhone audio-interruption runtime, with account/call ownership and cleanup.
- Call-scoped native scheduling keeps connection checks and audio cleanup running in the background, with connection-loss deadlines and release on hangup.
- Expo notification connection and provider-neutral router, durable per-account ordering, cold-start handoff and stale-notification dismissal.
- Expo configuration plugin and complete notification host example; existing native calling integrations can supply their own lifetime adapter.
