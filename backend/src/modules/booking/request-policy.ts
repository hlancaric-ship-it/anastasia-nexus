/** Validácia žiadosti o vlastný termín (čistá logika, testovateľná). */
import { createHash, randomBytes } from "node:crypto"
import { normalizeEmail } from "../auth-magic-link/policy"
import { utcToLocalMinutes } from "./slots"

export const REQUEST_LIMIT = { attempts: 4, windowSeconds: 3600 }
export const REQUEST_RULES = { minLeadHours: 24, maxAheadDays: 180, firstMinute: 7 * 60, lastEndMinute: 20 * 60, stepMinutes: 15 }
export const APPROVED_HOLD_HOURS = 72

export type BookingRequestInput = { product_id: string; starts_at: Date; name: string; email: string; phone: string | null; note: string | null }
export type BookingRequestParse = { ok: true; value: BookingRequestInput } | { ok: false; errors: string[] } | { ok: "spam" }

// eslint-disable-next-line no-control-regex
const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() : "")

/** `website` je pasca na roboty. Čas sa kontroluje v lokálnom čase kalendára (dĺžku dopĺňa route podľa typu). */
export function parseBookingRequest(raw: unknown, durationMinutes: number, timeZone: string, now = new Date()): BookingRequestParse {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  if (clean(b.website)) return { ok: "spam" }
  const errors: string[] = []
  const productId = clean(b.product_id)
  const name = clean(b.name).replace(/\s+/g, " ")
  const email = normalizeEmail(b.email)
  const phone = clean(b.phone).replace(/\s+/g, " ")
  const note = clean(b.note)
  const startsAt = new Date(clean(b.starts_at))
  if (!/^prod_[A-Za-z0-9]{10,40}$/.test(productId)) errors.push("product_id")
  if (!name || name.length > 100) errors.push("name")
  if (!email) errors.push("email")
  if (phone && !/^\+?[0-9 ()/-]{6,24}$/.test(phone)) errors.push("phone")
  if (note.length > 1500) errors.push("note")
  if (b.consent !== true) errors.push("consent")
  if (!Number.isFinite(startsAt.getTime()) || !isRequestableStart(startsAt, durationMinutes, timeZone, now)) errors.push("starts_at")
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { product_id: productId, starts_at: startsAt, name, email: email!, phone: phone || null, note: note || null } }
}

export function isRequestableStart(startsAt: Date, durationMinutes: number, timeZone: string, now = new Date()): boolean {
  const lead = startsAt.getTime() - now.getTime()
  if (lead < REQUEST_RULES.minLeadHours * 3_600_000 || lead > REQUEST_RULES.maxAheadDays * 86_400_000) return false
  if (startsAt.getUTCSeconds() || startsAt.getUTCMilliseconds()) return false
  const { minutes } = utcToLocalMinutes(startsAt, timeZone)
  return minutes % REQUEST_RULES.stepMinutes === 0 && minutes >= REQUEST_RULES.firstMinute && minutes + durationMinutes <= REQUEST_RULES.lastEndMinute
}

export const hashRequestToken = (token: string) => createHash("sha256").update(`booking-request:${token}`).digest("hex")
export const newRequestToken = () => randomBytes(24).toString("base64url")
export const isRequestToken = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{30,40}$/.test(v)
