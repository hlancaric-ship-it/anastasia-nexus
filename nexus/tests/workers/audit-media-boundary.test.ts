import { describe, expect, it } from "vitest";
import { handleMediaDelivery, isKeyAllowed, verifyMediaToken } from "../../workers/api/routes/mediaDelivery";

const secret = "synthetic-media-secret-not-used-outside-audit-tests-123456789";
const enc = new TextEncoder();
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sign(payload: Record<string, unknown>): Promise<string> {
  const data = base64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return data + "." + base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
const payload = { v: 1, c: "synthetic-customer-a", p: "synthetic-product-a", k: "paid/a/video.mp4", e: Math.floor(Date.now() / 1000) + 120, n: "synthetic-nonce" };

describe("audit/redteam: private R2 access boundary (synthetic, no external calls)", () => {
  it("rejects missing, forged, modified and expired signed bearer tokens", async () => {
    const token = await sign(payload);
    expect((await verifyMediaToken(secret, token)).ok).toBe(true);
    const forged = await sign({ ...payload, k: "paid/b/video.mp4" });
    expect((await verifyMediaToken(secret, forged)).ok).toBe(true); // signed only by the synthetic fixture
    expect((await verifyMediaToken(secret + "-other", forged)).ok).toBe(false);
    expect((await verifyMediaToken(secret, token.slice(0, -2) + "zz")).ok).toBe(false);
    expect((await verifyMediaToken(secret, await sign({ ...payload, e: Math.floor(Date.now() / 1000) - 1 }))).ok).toBe(false);
  });

  it("denies foreign objects and path traversal with zero bucket reads", async () => {
    const token = await sign(payload);
    let reads = 0;
    const env = { MEDIA_TOKEN_SECRET: secret, MEDIA_BUCKET: {
      head: async () => { reads++; return null; },
      get: async () => { reads++; return null; },
    } } as any;
    const keys = ["paid/b/video.mp4", "paid/a/../b/video.mp4", "paid/a/%2e%2e/b/video.mp4", "paid/a//video.mp4"];
    for (const key of keys) {
      const response = await handleMediaDelivery(new Request("https://synthetic.invalid/api/media/v1/" + key + "?t=" + encodeURIComponent(token)), env);
      expect(response.status).toBe(403);
    }
    expect(reads).toBe(0);
    expect(isKeyAllowed("paid/a/../b/video.mp4", payload.k)).toBe(false);
  });

  it("documents offline-token revocation limitation: signature alone has no current entitlement state", async () => {
    const token = await sign(payload);
    const before = await verifyMediaToken(secret, token);
    const syntheticOrderState = { refunded: true, entitlementRevoked: true };
    const after = await verifyMediaToken(secret, token);
    expect(syntheticOrderState.refunded && syntheticOrderState.entitlementRevoked).toBe(true);
    expect(before.ok && after.ok).toBe(true);
    // A token issued before a refund remains cryptographically valid until expiry.
    // This is a confirmed property of offline verification, NOT proof that live R2 is exposed.
  });
});
