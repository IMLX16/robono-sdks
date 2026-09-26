export type DeliveryHint = {
  version: 1;
  id: string;
  type: "sync_available";
  client_id: string;
  grant_id: string;
  cursor: string;
};
/** SERVER ONLY. Verify the exact raw request body, before parsing or using it.
 * Keep signing keys on your backend. Deduplicate id after durably queuing the hint.
 */
export async function verifyWebhook(input: {
  body: string;
  timestamp: string;
  signature: string;
  secret: string;
  nowMs?: number;
  crypto?: Crypto;
}): Promise<DeliveryHint> {
  const engine = input.crypto ?? globalThis.crypto;
  const timestamp = Number(input.timestamp);
  if (
    input.secret.length < 32 || !/^\d{10}$/.test(input.timestamp) ||
    Math.abs((input.nowMs ?? Date.now()) / 1000 - timestamp) > 300 ||
    !/^v1=[a-f0-9]{64}$/.test(input.signature) || input.body.length > 8192
  ) throw new Error("Invalid webhook");
  const key = await engine.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(
    input.signature.slice(3).match(/../g)!,
    (part) => parseInt(part, 16),
  );
  if (
    !await engine.subtle.verify(
      "HMAC",
      key,
      bytes,
      new TextEncoder().encode(`${input.timestamp}.${input.body}`),
    )
  ) throw new Error("Invalid webhook");
  const data = JSON.parse(input.body) as DeliveryHint;
  if (
    data.version !== 1 || data.type !== "sync_available" ||
    typeof data.id !== "string" ||
    typeof data.client_id !== "string" || typeof data.grant_id !== "string" ||
    typeof data.cursor !== "string" || !/^\d+$/.test(data.cursor)
  ) throw new Error("Invalid webhook");
  return data;
}
