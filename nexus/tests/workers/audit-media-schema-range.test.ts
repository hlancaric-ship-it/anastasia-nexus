import { describe, expect, it } from "vitest";
import { handleMediaDelivery, parseRange, rewritePlaylist, verifyMediaToken } from "../../workers/api/routes/mediaDelivery";

const secret = "synthetic-new-audit-secret-2026-10-15-not-production";
const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function signed(payload: Record<string, unknown>) {
  const data = b64(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return data + "." + b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data))));
}
const base = () => ({ v: 1, c: "synthetic", p: "synthetic-product", k: "paid/synthetic/video.mp4", e: Math.floor(Date.now()/1000)+60, n: "synthetic" });
function fixture() {
  let reads = 0;
  const data = encoder.encode("SYNTHETIC");
  const env = { MEDIA_TOKEN_SECRET: secret, MEDIA_BUCKET: {
    head: async () => { reads++; return { size: data.length, httpEtag: "synthetic" }; },
    get: async () => { reads++; return { body: data, httpEtag: "synthetic" }; },
  }} as any;
  return { env, reads: () => reads };
}
describe("new independent audit: media token schema and range edge cases", () => {
  it("AUD-MEDIA-04 signed token without customer/product/nonce is currently accepted", async () => {
    const token = await signed({ v: 1, k: base().k, e: base().e });
    expect((await verifyMediaToken(secret, token)).ok).toBe(true);
  });
  it("AUD-MEDIA-05 signed token with far-future expiry has no maximum TTL", async () => {
    const token = await signed({ ...base(), e: Math.floor(Date.now()/1000)+86400*365 });
    expect((await verifyMediaToken(secret, token)).ok).toBe(true);
  });
  it("AUD-MEDIA-06 invalid signature prevents all R2 reads", async () => {
    const { env, reads } = fixture();
    const res = await handleMediaDelivery(new Request("https://synthetic.invalid/api/media/v1/paid/synthetic/video.mp4?t=invalid"), env);
    expect(res.status).toBe(403);
    expect(reads()).toBe(0);
  });
  it("AUD-MEDIA-07 HEAD on valid object does not return body", async () => {
    const { env } = fixture();
    const token = await signed(base());
    const res = await handleMediaDelivery(new Request("https://synthetic.invalid/api/media/v1/paid/synthetic/video.mp4?t="+token, { method: "HEAD" }), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
  it("AUD-MEDIA-08 zero-length and malformed byte ranges are rejected", () => {
    for (const value of ["bytes=-0", "bytes=9-1", "bytes=100-", "bytes=1-2,3-4", "items=1-2"]) {
      expect(parseRange(value, 8)).toBe("invalid");
    }
  });
  it("AUD-MEDIA-09 integer overflow in Range must not yield invalid offsets", () => {
    const result = parseRange("bytes=999999999999999999999999999-999999999999999999999999999", 8);
    expect(result).toBe("invalid");
  });
  it("AUD-MEDIA-10 external playlist URI is not given a bearer token", () => {
    const result = rewritePlaylist("#EXTM3U\nhttps://outside.invalid/video.ts\nsegment.ts", "synthetic-token");
    expect(result).toContain("https://outside.invalid/video.ts");
    expect(result).not.toContain("https://outside.invalid/video.ts?t=");
    expect(result).toContain("segment.ts?t=synthetic-token");
  });
  it("AUD-MEDIA-11 playlist fragment/query syntax remains parseable", () => {
    const result = rewritePlaylist("#EXTM3U\nsegment.ts?x=1\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"", "synthetic-token");
    expect(result).toContain("segment.ts?x=1&t=synthetic-token");
    expect(result).toContain('URI="key.bin?t=synthetic-token"');
  });
});
