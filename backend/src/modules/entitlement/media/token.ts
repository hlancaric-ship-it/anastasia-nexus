import { createHmac, randomBytes, timingSafeEqual } from "crypto"

/** Krátkodobý podepsaný token pro doručení chráněného média (ověřuje ho doručovací Worker nad R2). */
export type MediaTokenPayload = {
  v: 1
  c: string // customer_id
  p: string // product_id
  k: string // klíč média v úložišti
  e: number // expirace, epoch sekundy
  n: string // nonce (jednorázový identifikátor pro audit a limit souběžných přehrávání)
}

export const MAX_TTL_SECONDS = 900
export const DEFAULT_TTL_SECONDS = 600

const b64 = (buf: Buffer) => buf.toString("base64url")

function sign(secret: string, body: string): string {
  return b64(createHmac("sha256", secret).update(body).digest())
}

export function clampTtl(ttlSeconds: number | undefined): number {
  const ttl = Number.isFinite(ttlSeconds) ? Math.trunc(ttlSeconds as number) : DEFAULT_TTL_SECONDS
  return Math.min(Math.max(ttl, 30), MAX_TTL_SECONDS)
}

export function signMediaToken(
  secret: string,
  input: { customerId: string; productId: string; mediaKey: string; ttlSeconds?: number },
  now: Date = new Date()
): { token: string; expiresAt: Date; nonce: string } {
  if (!secret || secret.length < 32) throw new Error("MEDIA_TOKEN_SECRET_TOO_SHORT")
  if (!input.customerId || !input.productId || !input.mediaKey) throw new Error("INVALID_MEDIA_TOKEN_INPUT")
  const exp = Math.floor(now.getTime() / 1000) + clampTtl(input.ttlSeconds)
  const nonce = b64(randomBytes(12))
  const payload: MediaTokenPayload = { v: 1, c: input.customerId, p: input.productId, k: input.mediaKey, e: exp, n: nonce }
  const body = b64(Buffer.from(JSON.stringify(payload)))
  return { token: `${body}.${sign(secret, body)}`, expiresAt: new Date(exp * 1000), nonce }
}

export type VerifyResult = { ok: true; payload: MediaTokenPayload } | { ok: false; reason: "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" | "KEY_MISMATCH" }

/** Stejný algoritmus se použije ve Workeru (WebCrypto HMAC-SHA256). */
export function verifyMediaToken(secret: string, token: string, expectedKey?: string, now: Date = new Date()): VerifyResult {
  const [body, signature, extra] = String(token ?? "").split(".")
  if (!body || !signature || extra !== undefined) return { ok: false, reason: "MALFORMED" }
  const expected = Buffer.from(sign(secret, body))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "BAD_SIGNATURE" }
  let payload: MediaTokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return { ok: false, reason: "MALFORMED" }
  }
  if (payload?.v !== 1 || typeof payload.e !== "number") return { ok: false, reason: "MALFORMED" }
  if (payload.e * 1000 <= now.getTime()) return { ok: false, reason: "EXPIRED" }
  if (expectedKey !== undefined && payload.k !== expectedKey) return { ok: false, reason: "KEY_MISMATCH" }
  return { ok: true, payload }
}
