import { createHash } from "node:crypto"
import { normalizeEmail } from "../../../modules/auth-magic-link/policy"

/** Formulár online odstúpenia od zmluvy (časť C právnych textov klientky). */

export const CONTRACT_WITHDRAWAL_LIMIT = { attempts: 5, windowSeconds: 600 }
export const CONTRACT_WITHDRAWAL_STATUSES = ["received", "processed", "closed"] as const
export type ContractWithdrawalStatus = (typeof CONTRACT_WITHDRAWAL_STATUSES)[number]

export type ContractWithdrawalInput = {
  order_number: string
  email: string
  items: string[]
  order_date: string | null
  customer_id: string | null
  name: string | null
  reason: string | null
  fingerprint: string
}

export type ContractWithdrawalParse =
  | { ok: true; value: ContractWithdrawalInput }
  | { ok: false; errors: string[] }
  | { ok: "spam" }

// eslint-disable-next-line no-control-regex
const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() : "")

/** Položky odstúpenia: riadky textu (max. 20 položiek, každá najviac 200 znakov). */
function parseItems(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.map(entry => clean(entry)) : clean(value).split("\n").map(line => clean(line))
  return raw.map(line => line.replace(/\s+/g, " ")).filter(Boolean).slice(0, 20).map(line => line.slice(0, 200))
}

/** Dátum objednávky: len ISO dátum (YYYY-MM-DD), inak prázdno. */
function parseDate(value: unknown): string | null {
  const raw = clean(value)
  if (!raw) return null
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

/** Odcítenie a kontrola formulára. `website` je pasca na roboty (človek ho nevidí ani nevyplní). */
export function parseContractWithdrawal(raw: unknown, customerId: string | null = null): ContractWithdrawalParse {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  if (clean(b.website)) return { ok: "spam" }
  const errors: string[] = []
  const orderNumber = clean(b.order_number)
  const email = normalizeEmail(b.email)
  const items = parseItems(b.items)
  const orderDate = parseDate(b.order_date)
  const name = clean(b.name).replace(/\s+/g, " ")
  const reason = clean(b.reason).replace(/\s+/g, " ")
  if (!orderNumber || orderNumber.length > 100) errors.push("order_number")
  if (!email) errors.push("email")
  if (!items.length) errors.push("items")
  if (clean(b.order_date) && !orderDate) errors.push("order_date")
  if (name.length > 100) errors.push("name")
  if (reason.length > 1000) errors.push("reason")
  if (b.consent !== true) errors.push("consent")
  if (errors.length) return { ok: false, errors }
  // Odkaz na rovnaké oznámenie: rovnaké údaje = rovnaké oznámenie (opakované odoslanie nevytvorí druhý záznam).
  const fingerprint = createHash("sha256")
    .update([orderNumber, email, items.join("|"), orderDate ?? ""].join("\n"))
    .digest("hex")
  return {
    ok: true,
    value: {
      order_number: orderNumber,
      email: email!,
      items,
      order_date: orderDate,
      customer_id: customerId,
      name: name || null,
      reason: reason || null,
      fingerprint,
    },
  }
}
