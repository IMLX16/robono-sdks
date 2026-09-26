/** App-supplied display details, not verified ownership or a credential. */
export interface AppIdentity {
  name: string;
  developerName: string;
  websiteUrl: string;
  privacyUrl: string;
}
export function normalizeAppIdentity(app: AppIdentity): AppIdentity {
  if (!app || typeof app !== "object" || Array.isArray(app)) throw new Error("Provide your app details.");
  const label = (value: unknown, max: number) => {
    if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value)) throw new Error("Invalid app details.");
    return value.trim();
  };
  const website = (value: unknown) => {
    const url = new URL(label(value, 2048));
    if (url.protocol !== "https:" || url.username || url.password || url.hash ||
        !url.hostname.includes(".") || /^(\d+\.){3}\d+$/.test(url.hostname) || url.hostname.includes(":")) throw new Error("Use a public HTTPS website and privacy-policy URL.");
    return url.toString();
  };
  return { name: label(app.name, 100), developerName: label(app.developerName, 150),
    websiteUrl: website(app.websiteUrl), privacyUrl: website(app.privacyUrl) };
}
/** Stable identifier derived from display details; never proof of app ownership. */
export async function directAppIdentity(app: AppIdentity, sha256: (bytes: Uint8Array) => Promise<Uint8Array>) {
  const profile = normalizeAppIdentity(app);
  const bytes = await sha256(new TextEncoder().encode(JSON.stringify([
    "robono-direct-app-v1", profile.name, profile.developerName, profile.websiteUrl, profile.privacyUrl,
  ])));
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  const clientId = `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
  return {clientId, profile};
}
