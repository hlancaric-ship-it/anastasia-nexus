import { describe, expect, it } from "vitest";
import { handleMediaDelivery } from "../../workers/api/routes/mediaDelivery";

const secret = "synthetic-only-audit-key-2026-10-15-that-is-not-production";
const encode = (v: Uint8Array) => btoa(String.fromCharCode(...v)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function mint(key: string, expiresAt: number): Promise<string> {
  const bytes = new TextEncoder();
  const body = encode(bytes.encode(JSON.stringify({ v: 1, c: "synthetic-A", p: "synthetic-course", k: key, e: expiresAt, n: "synthetic" })));
  const signingKey = await crypto.subtle.importKey("raw", bytes.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return body + "." + encode(new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, bytes.encode(body))));
}

describe("audit/attack: actual media bytes after entitlement cancellation", () => {
  it("replays previously issued valid token and reads the entire synthetic R2 media AFTER revoked state", async () => {
    const mediaKey = "synthetic-paid/course-1/video.mp4";
    const token = await mint(mediaKey, Math.floor(Date.now() / 1000) + 600);
    let currentEntitlement = "active";
    let reads = 0;
    let bytesReturned = 0;
    const syntheticData = new TextEncoder().encode("SYNTHETIC_PROTECTED_MEDIA_BYTES");
    const env = {
      MEDIA_TOKEN_SECRET: secret,
      MEDIA_BUCKET: {
        head: async (key: string) => {
          reads++;
          if (key !== mediaKey) return null;
          return { size: syntheticData.byteLength };
        },
        get: async (key: string) => {
          reads++;
          if (key !== mediaKey) return null;
          return { body: syntheticData, httpEtag: "synthetic-etag" };
        },
      },
    } as any;
    const request = () => new Request("https://synthetic.invalid/api/media/v1/" + mediaKey + "?t=" + encodeURIComponent(token));
    const before = await handleMediaDelivery(request(), env);
    expect(before.status).toBe(200);
    expect(await before.text()).toBe("SYNTHETIC_PROTECTED_MEDIA_BYTES");
    // Simulated Medusa order refund / entitlement revoke. No production resources.
    currentEntitlement = "revoked";
    reads = 0;
    const after = await handleMediaDelivery(request(), env);
    const leaked = await after.text();
    bytesReturned = new TextEncoder().encode(leaked).byteLength;
    expect(currentEntitlement).toBe("revoked");
    expect(after.status).toBe(200);
    expect(leaked).toBe("SYNTHETIC_PROTECTED_MEDIA_BYTES");
    expect(bytesReturned).toBe(syntheticData.byteLength);
    expect(reads).toBe(2);
    // CONFIRMS an offline bearer token survives simulated revocation while unexpired,
    // not exposure of any real customer's content or proof of unauthorized first issuance.
  });
});
