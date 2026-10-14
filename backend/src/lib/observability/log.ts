import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"

/**
 * Společná pozorovatelnost backendu: korelace požadavků (`x-request-id`) a strukturované JSON logy.
 *
 * Pravidla:
 * - log nikdy nenese osobní údaje ani tajemství (e-mail, telefon, jméno, adresa, IP, kódy poukazů/kupónů,
 *   tokeny, těla zpráv) – `redact` je nahradí ještě před zápisem;
 * - ID entit (customer_id, order_id, cart_id…) jsou pseudonymní a v logu zůstávají kvůli dohledatelnosti;
 * - jeden řádek = jeden JSON objekt `{ ts, level, domain, event, request_id, ... }` → strojově filtrovatelné.
 */

export type LogLevel = "info" | "warn" | "error"
export type LoggerLike = { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string, err?: Error) => void }

export const LOG_DOMAINS = [
  "http", "safeorder", "pricing", "checkout", "payment", "webhook", "coupon", "gift_voucher",
  "booking", "entitlement", "auth", "migration", "chat", "job", "notification", "admin_audit",
] as const
export type LogDomain = (typeof LOG_DOMAINS)[number]

type RequestContext = { requestId: string }
const storage = new AsyncLocalStorage<RequestContext>()

export const REQUEST_ID_HEADER = "x-request-id"
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,64}$/

/** Převezme bezpečné příchozí ID (např. z Workeru / Cloudflare), jinak vytvoří nové. Nic jiného z hlavičky nepustí do logu. */
export function normalizeRequestId(incoming: unknown): string {
  const value = Array.isArray(incoming) ? incoming[0] : incoming
  return typeof value === "string" && REQUEST_ID_RE.test(value) ? value : randomUUID()
}

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn)
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId
}

const SENSITIVE_KEY = /^(e-?mail|.*_email|email_.*|phone|telephone|.*_phone|first_name|last_name|full_name|name|recipient_name|sender_name|address|address_\d|.*_address|city|postal_code|zip|ip|ip_address|user_agent|token|.*_token|token_.*|secret|.*_secret|password|authorization|cookie|code|voucher_code|coupon_code|promo_code|body|message|message_body|note|reason)$/i
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const MAX_DEPTH = 6
const MAX_STRING = 500

/** Hodnota citlivého klíče se nahradí; kódy si ponechají poslední 4 znaky kvůli dohledání s podporou. */
function maskValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return String(value ?? "")
  if (/code$/i.test(key) && typeof value === "string" && value.length > 6) return `***${value.slice(-4)}`
  return "[redacted]"
}

/** Hluboká kopie s odstraněnými osobními údaji. Bezpečná i pro cykly a obří struktury. */
export function redact(input: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (input === null || input === undefined) return input
  if (typeof input === "string") {
    const clean = input.replace(EMAIL_IN_TEXT, "[email]")
    return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…` : clean
  }
  if (typeof input === "number" || typeof input === "boolean") return input
  if (typeof input === "bigint") return input.toString()
  if (input instanceof Date) return input.toISOString()
  if (input instanceof Error) return { name: input.name, message: redact(input.message, depth + 1, seen) }
  if (typeof input !== "object") return undefined
  if (seen.has(input)) return "[circular]"
  if (depth >= MAX_DEPTH) return "[truncated]"
  seen.add(input)
  if (Array.isArray(input)) return input.slice(0, 50).map((item) => redact(item, depth + 1, seen))
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? maskValue(key, value) : redact(value, depth + 1, seen)
  }
  return out
}

export type LogFields = Record<string, unknown> & { request_id?: string }

/** Sestaví řádek logu (exportováno kvůli testům). */
export function formatLogLine(level: LogLevel, domain: LogDomain, event: string, fields: LogFields = {}, now = new Date()): string {
  const { request_id, ...rest } = fields
  const safe = redact(rest) as Record<string, unknown>
  return JSON.stringify({
    ts: now.toISOString(),
    level,
    domain,
    event,
    request_id: request_id ?? currentRequestId() ?? null,
    ...safe,
  })
}

/** Strukturovaný log přes Medusa logger. Chyba logování nikdy neshodí obchodní operaci. */
export function logEvent(logger: LoggerLike, level: LogLevel, domain: LogDomain, event: string, fields: LogFields = {}): void {
  try {
    const line = formatLogLine(level, domain, event, fields)
    if (level === "error") logger.error(line)
    else logger[level](line)
  } catch {
    // záměrně tiché: logování je doplněk, ne podmínka
  }
}
