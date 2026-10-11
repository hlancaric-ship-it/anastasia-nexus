import { createHash, randomBytes, timingSafeEqual } from "crypto"

/** Čistá logika magic-link přihlášení (bez infrastruktury, testovatelná). */

export const MAGIC_LINK_TTL_SECONDS = 900 // 15 min

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null
  const trimmed = email.trim().toLowerCase()
  return EMAIL_RE.test(trimmed) && trimmed.length <= 254 ? trimmed : null
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

/** Náhodný opakovaně nehádatelný token poslaný e-mailem; v state se ukládá jen jeho hash. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url")
}

export function stateKey(email: string): string {
  return `magic-link:${sha256Hex(email)}`
}

/** Konstantní čas porovnání dvou hex hashů (brání timing útoku na uhodnutí tokenu). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
}

export type MagicLinkState = { email: string; tokenHash: string }

/** Ověří stav proti předloženému tokenu a e-mailu. Nerozlišuje chyby (expired/neplatný/cizí e-mail). */
export function isValidMagicLinkAttempt(state: MagicLinkState | null, email: string, token: string): boolean {
  if (!state || state.email !== email) return false
  if (!token || token.length > 2048) return false
  return timingSafeEqualHex(sha256Hex(token), state.tokenHash)
}
