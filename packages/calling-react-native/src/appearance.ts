/** Shared website/SDK contract. Values contain presentation only, never credentials. */
export const callingColors = {
  background: "#080808",
  foreground: "#fafafa",
  secondary: "#aaaaaa",
  control: "#222222",
  accent: "#ed8a36",
  answer: "#247949",
  end: "#bd2929",
};
export const callingText = {
  call: "Voice call",
  contact: "Contact",
  incoming: "Incoming voice call",
  outgoing: "Calling…",
  connecting: "Connecting…",
  held: "Call on hold",
  resume: "Resume call",
  resuming: "Resuming…",
  resumeFailed: "Unable to resume. Check your connection and try again.",
  audioBusy: "Finish the other call, then try again.",
  localHold: "Finish the other call to resume.",
  loading: "Opening call…",
  answer: "Answer",
  decline: "Decline",
  mute: "Mute",
  unmute: "Unmute",
  speaker: "Speaker",
  end: "End call",
  close: "Close",
  unavailable: "This call is no longer available.",
  failed: "The call could not connect. Please try again.",
};
export const soundCatalog = {
  none: "Silent",
  ringing: "Robono chime",
  connecting: "Soft pulse",
  ended: "Soft finish",
  bell: "Gentle bells",
  marimba: "Warm marimba",
  pulse: "Low pulse",
  click: "Light tap",
};
export const callingSounds = {
  incoming: "ringing",
  outgoing: "connecting",
  connecting: "connecting",
  connected: "none",
  ended: "ended",
  declined: "none",
  unanswered: "none",
  held: "none",
  resumed: "none",
} as Record<SoundEvent, SoundChoice>;
export type SoundChoice = keyof typeof soundCatalog;
export type SoundEvent =
  | "incoming"
  | "outgoing"
  | "connecting"
  | "connected"
  | "ended"
  | "declined"
  | "unanswered"
  | "held"
  | "resumed";
export interface CallingAppearance {
  schemaVersion: 1;
  appName: string;
  logoUrl: string | null;
  theme: typeof callingColors;
  labels: typeof callingText;
  sounds: Record<SoundEvent, SoundChoice>;
}
export function defaultCallingAppearance(appName = ""): CallingAppearance {
  return {
    schemaVersion: 1,
    appName:appName.trim().slice(0,60),
    logoUrl: null,
    theme: { ...callingColors },
    labels: { ...callingText },
    sounds: { ...callingSounds },
  };
}
export function validateCallingAppearance(input: unknown): CallingAppearance {
  const v = input as CallingAppearance;
  if (
    !v || v.schemaVersion !== 1 || typeof v.appName !== "string" ||
    v.appName.length > 60 || /[\u0000-\u001f]/.test(v.appName)
  ) throw Error("Use an app name of up to 60 characters.");
  if (
    v.logoUrl !== null &&
    (typeof v.logoUrl !== "string" || v.logoUrl.length > 2048 ||
      !/^https:\/\//.test(v.logoUrl) || new URL(v.logoUrl).username ||
      new URL(v.logoUrl).password)
  ) throw Error("Use an HTTPS logo address.");
  const out = defaultCallingAppearance(v.appName.trim());
  out.logoUrl = v.logoUrl;
  for (
    const key of Object.keys(callingColors) as (keyof typeof callingColors)[]
  ) {
    const x = v.theme?.[key];
    if (typeof x !== "string" || !/^#[0-9a-f]{6}$/i.test(x)) {
      throw Error("Choose a valid color for " + key + ".");
    }
    out.theme[key] = x;
  }
  for (const key of Object.keys(callingText) as (keyof typeof callingText)[]) {
    const x = v.labels?.[key];
    if (
      typeof x !== "string" || !x.trim() ||
      x.length >
        ([
            "answer",
            "decline",
            "mute",
            "unmute",
            "speaker",
            "end",
            "close",
            "resume",
          ].includes(key)
          ? 32
          : 160) ||
      /[\u0000-\u001f]/.test(x)
    ) throw Error("Enter a short, non-empty label for " + key + ".");
    out.labels[key] = x.trim();
  }
  for (const key of Object.keys(callingSounds) as SoundEvent[]) {
    if (!Object.hasOwn(soundCatalog, v.sounds?.[key])) {
      throw Error("Choose a supported sound for " + key + ".");
    }
    out.sounds[key] = v.sounds[key];
  }
  return out;
}

/** Choose readable icon/status-bar ink against a brand color. */
export function callingInk(color: string): "#ffffff" | "#000000" {
  const channels = [1, 3, 5].map((i) =>
    parseInt(color.slice(i, i + 2), 16) / 255
  ).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = .2126 * channels[0] + .7152 * channels[1] +
    .0722 * channels[2];
  return (luminance + .05) / .05 > 1.05 / (luminance + .05)
    ? "#000000"
    : "#ffffff";
}

export const callingIcons = {
  answer:
    "M6 3H3c-1 0-1 1-1 2 1 9 8 16 17 17 1 0 2 0 2-1v-4l-5-2-2 3C9 16 6 13 5 9l3-2-2-4Z",
  end: "M2 11c6-5 14-5 20 0v5l-5-1v-4c-3-1-7-1-10 0v4l-5 1v-5Z",
  mute:
    "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11v1a7 7 0 0 0 6 7v3h2v-3a7 7 0 0 0 6-7v-1h-2v1a5 5 0 0 1-10 0v-1H5Z",
  speaker:
    "M3 9v6h4l5 4V5L7 9H3Zm12-3v2a5 5 0 0 1 0 8v2a7 7 0 0 0 0-12Zm3-3v2a9 9 0 0 1 0 14v2a11 11 0 0 0 0-18Z",
};
