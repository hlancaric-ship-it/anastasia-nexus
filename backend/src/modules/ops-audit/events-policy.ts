import { LOG_DOMAINS, normalizeRequestId, redact, type LogDomain, type LogLevel } from "../../lib/observability/log"

export const OPS_EVENT_LEVELS: LogLevel[] = ["info", "warn", "error"]
const EVENT_RE = /^[a-z][a-z0-9_.:-]{1,79}$/
const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/
const MAX_FIELDS_JSON = 4000

const pickId = (value: unknown): string | null => (typeof value === "string" && ID_RE.test(value) ? value : null)

/** Normalizace provozního eventu před uložením: validní doména/event, korelační ID vytažená do sloupců, pole zredigovaná a omezená. */
export function buildOpsEvent(level: LogLevel, domain: LogDomain, event: string, fields: Record<string, unknown>, requestId: string | null) {
  if (!OPS_EVENT_LEVELS.includes(level)) throw new Error("OPS_EVENT_INVALID_LEVEL")
  if (!(LOG_DOMAINS as readonly string[]).includes(domain)) throw new Error("OPS_EVENT_INVALID_DOMAIN")
  if (!EVENT_RE.test(event)) throw new Error("OPS_EVENT_INVALID_EVENT")
  const { request_id: _r, order_id, cart_id, customer_id, entity_id, ...rest } = fields
  let safe = redact(rest) as Record<string, unknown>
  if (JSON.stringify(safe).length > MAX_FIELDS_JSON) safe = { truncated: true, keys: Object.keys(safe).slice(0, 40) }
  return {
    level, domain, event,
    request_id: requestId ? normalizeRequestId(requestId) : null,
    order_id: pickId(order_id), cart_id: pickId(cart_id), customer_id: pickId(customer_id), entity_id: pickId(entity_id),
    fields: Object.keys(safe).length ? safe : null,
  }
}

export type OpsEventFilters = Record<string, unknown>

/** Filtry čtecího API: přesné shody ID, doména/level ze seznamu, časové okno (ISO, max. 93 dní). */
export function parseOpsEventQuery(query: Record<string, unknown> | undefined): { filters: OpsEventFilters } | { error: string } {
  const q = query ?? {}
  const filters: OpsEventFilters = {}
  for (const key of ["request_id", "order_id", "cart_id", "customer_id", "entity_id"]) {
    const value = q[key]
    if (value === undefined || value === "") continue
    if (typeof value !== "string" || !ID_RE.test(value)) return { error: `Neplatný filtr ${key}.` }
    filters[key] = value
  }
  if (q.domain !== undefined && q.domain !== "") {
    if (typeof q.domain !== "string" || !(LOG_DOMAINS as readonly string[]).includes(q.domain)) return { error: "Neplatná doména." }
    filters.domain = q.domain
  }
  if (q.level !== undefined && q.level !== "") {
    if (typeof q.level !== "string" || !OPS_EVENT_LEVELS.includes(q.level as LogLevel)) return { error: "Neplatná úroveň." }
    filters.level = q.level
  }
  if (q.event !== undefined && q.event !== "") {
    if (typeof q.event !== "string" || !EVENT_RE.test(q.event)) return { error: "Neplatný event." }
    filters.event = q.event
  }
  const range: Record<string, Date> = {}
  for (const [key, op] of [["from", "$gte"], ["to", "$lt"]] as const) {
    const value = q[key]
    if (value === undefined || value === "") continue
    const date = typeof value === "string" ? new Date(value) : new Date(NaN)
    if (Number.isNaN(date.getTime())) return { error: `Neplatné datum ${key}.` }
    range[op] = date
  }
  if (range.$gte && range.$lt) {
    if (range.$gte >= range.$lt) return { error: "Datum from musí být před to." }
    if (range.$lt.getTime() - range.$gte.getTime() > 93 * 86_400_000) return { error: "Časové okno je nejvýše 93 dní." }
  }
  if (Object.keys(range).length) filters.created_at = range
  return { filters }
}

/** Retence v dnech z env (celé číslo v rozsahu), jinak výchozí. */
export function retentionCutoff(raw: string | undefined, fallbackDays: number, min: number, max: number, now = new Date()): Date {
  const parsed = Number.parseInt(String(raw ?? ""), 10)
  const days = Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallbackDays
  return new Date(now.getTime() - days * 86_400_000)
}
