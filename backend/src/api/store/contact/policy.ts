import { normalizeEmail } from "../../../modules/auth-magic-link/policy"

export const CONTACT_SUBJECTS = ["Produkt a objednávka", "RESET 40+", "Konzultácia", "Iná otázka"] as const
export const CONTACT_LIMIT = { attempts: 5, windowSeconds: 600 }

// `topic`, nie `subject`: data.subject by v šablónach prepísal predmet e-mailu.
export type ContactMessage = { name: string; email: string; topic: string; message: string }
export type ContactParse = { ok: true; value: ContactMessage } | { ok: false; errors: string[] } | { ok: "spam" }

// eslint-disable-next-line no-control-regex
const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() : "")

/** Validácia správy z webu; `website` je pasca na roboty (človek ho nevidí ani nevyplní). */
export function parseContact(raw: unknown): ContactParse {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  if (clean(b.website)) return { ok: "spam" }
  const errors: string[] = []
  const name = clean(b.name).replace(/\s+/g, " ")
  const email = normalizeEmail(b.email)
  const subject = clean(b.subject)
  const message = clean(b.message)
  if (!name || name.length > 100) errors.push("name")
  if (!email) errors.push("email")
  if (!(CONTACT_SUBJECTS as readonly string[]).includes(subject)) errors.push("subject")
  if (message.length < 10 || message.length > 2000) errors.push("message")
  if (b.consent !== true) errors.push("consent")
  return errors.length ? { ok: false, errors } : { ok: true, value: { name, email: email!, topic: subject, message } }
}
