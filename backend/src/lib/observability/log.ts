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

const SENSITIVE_KEY = /^(e-?mail|.*_email|email_.*|phone|telephone|.*_phone|first_name|last_name|full_name|name|recipient_name|sender_name|address|address_\d|.*_address|city|postal_code|zip|ip|ip_address|user_agent|token|.*_token|token_.*|secret|.*_secret|password|.*_password|authorization|cookie|set_cookie|code|.*_code|api_key|.*_api_key|apikey|private_key|access_key|secret_key|signing_key|idempotency_key|body|message|message_body|note|reason|signature|.*_signature)$/i

/** `voucherCode`, `api-key`, `X-Api-Key` → `voucher_code`, `api_key`, `x_api_key` (jednotné posouzení citlivosti). */
export function normalizeKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[-\s]+/g, "_").toLowerCase()
}
/** Technické kódy bez osobních údajů a tajemství (kódy chyb, měn, zemí, HTTP stavů). */
const SAFE_CODE_KEYS = new Set(["error_code", "currency_code", "country_code", "status_code", "http_code", "region_code", "locale_code", "provider_code"])
const isSensitiveKey = (key: string) => {
  const normalized = normalizeKey(key)
  return !SAFE_CODE_KEYS.has(normalized) && SENSITIVE_KEY.test(normalized)
}
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
/** Kódy poukazů/kupónů ve tvaru ABCD-EFGH… a dlouhé tokeny (JWT, hex, base64) v textu chyb. */
const CODE_IN_TEXT = /\b[A-Z0-9]{3,}(?:-[A-Z0-9]{3,}){1,}\b/g
const TOKEN_IN_TEXT = /[A-Za-z0-9+/_=.-]{24,}/g
const MAX_ERROR_MESSAGE = 200
const MAX_DEPTH = 6
const MAX_STRING = 500

/** Hodnota citlivého klíče se nahradí; kódy si ponechají poslední 4 znaky kvůli dohledání s podporou. */
function maskValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return String(value ?? "")
  if (/(^|_)code$/.test(normalizeKey(key)) && typeof value === "string" && value.length > 6) return `***${value.slice(-4)}`
  return "[redacted]"
}

/**
 * Chyba do logu: jen název, případný `code` a zkrácená zpráva bez e-mailů, kódů a tokenů.
 * Libovolný payload chyby (response body, config, stack s daty) se záměrně nevypisuje.
 */
export function redactError(error: Error): { name: string; code?: string; message: string } {
  const message = String(error.message ?? "")
    .replace(EMAIL_IN_TEXT, "[email]")
    .replace(TOKEN_IN_TEXT, "[token]")
    .replace(CODE_IN_TEXT, "[code]")
    .slice(0, MAX_ERROR_MESSAGE)
  const rawCode = (error as Error & { code?: unknown }).code
  const code = typeof rawCode === "string" && /^[A-Za-z0-9_.:-]{1,60}$/.test(rawCode) ? rawCode : undefined
  return code ? { name: error.name, code, message } : { name: error.name, message }
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
  if (input instanceof Error) return redactError(input)
  if (typeof input !== "object") return undefined
  if (seen.has(input)) return "[circular]"
  if (depth >= MAX_DEPTH) return "[truncated]"
  seen.add(input)
  if (Array.isArray(input)) return input.slice(0, 50).map((item) => redact(item, depth + 1, seen))
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? maskValue(key, value) : redact(value, depth + 1, seen)
  }
  return out
}

export type LogFields = Record<string, unknown> & { request_id?: string }

const RESERVED_FIELDS = new Set(["ts", "level", "domain", "event", "request_id"])

/** Sestaví řádek logu (exportováno kvůli testům). */
export function formatLogLine(level: LogLevel, domain: LogDomain, event: string, fields: LogFields = {}, now = new Date()): string {
  const { request_id, ...rest } = fields
  const safe = redact(rest) as Record<string, unknown>
  for (const key of RESERVED_FIELDS) delete safe[key]
  // povinná pole až po polích volajícího – ta je nesmí přepsat
  return JSON.stringify({
    ...safe,
    ts: now.toISOString(),
    level,
    domain,
    event,
    request_id: typeof request_id === "string" && request_id ? normalizeRequestId(request_id) : currentRequestId() ?? null,
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
