/**
 * Čistá business logika dárkových poukazů (bez infrastruktury, plně testovatelná).
 * Všechny částky jsou celé centy (minor units), aby nevznikaly chyby plovoucí čárky.
 */

export const GIFT_VOUCHER_CREDIT_REFERENCE = "gift_voucher"
export const GIFT_VOUCHER_ISSUED_EVENT = "voucher.issued"
export const GIFT_VOUCHER_PRODUCT_HANDLE = "darkovy-poukaz"
export const GIFT_VOUCHER_OPTION_TITLE = "Hodnota"
export const GIFT_VOUCHER_CURRENCY = "eur"
export const GIFT_VOUCHER_TIMEZONE = "Europe/Bratislava"
export const MESSAGE_MAX_LENGTH = 300

export const DELIVERY_METHODS = ["recipient_email", "buyer_pdf", "both"] as const
export const SCOPE_TYPES = ["all", "categories"] as const
export const VOUCHER_STATUSES = ["active", "depleted", "expired", "void"] as const
export const DELIVERY_STATUSES = ["pending", "scheduled", "sent", "failed"] as const
export const TRANSACTION_TYPES = ["issued", "redeemed", "forfeited", "reversed", "refunded", "voided", "expired"] as const

export type DeliveryMethod = (typeof DELIVERY_METHODS)[number]
export type ScopeType = (typeof SCOPE_TYPES)[number]
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number]
export type VoucherScope = { type: ScopeType; category_ids: string[] }

export type GiftVoucherSettings = {
  enabled: boolean
  values_minor: number[]
  validity_months: number
  scope_type: ScopeType
  category_ids: string[]
  partial_redemption: boolean
  delivery_method: DeliveryMethod
}

/** Výchozí hodnoty podle rozhodnutí z 14. 10. 2026 – klientka je mění v adminu. */
export const DEFAULT_SETTINGS: GiftVoucherSettings = Object.freeze({
  enabled: true,
  values_minor: [5000, 10000, 20000],
  validity_months: 12,
  scope_type: "all",
  category_ids: [],
  partial_redemption: true,
  delivery_method: "both",
}) as GiftVoucherSettings

export const LIMITS = { maxValues: 10, minValueMinor: 100, maxValueMinor: 1_000_000, minMonths: 1, maxMonths: 60, maxCategories: 100 }

export class GiftVoucherError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

export function toMinor(amount: unknown): number {
  const numeric = typeof amount === "object" && amount !== null ? (amount as any).numeric ?? (amount as any).value : amount
  const value = typeof numeric === "string" && numeric.trim() ? Number(numeric) : numeric
  if (typeof value !== "number" || !Number.isFinite(value)) return NaN
  return Math.round(value * 100)
}

/** Částka s více než dvěma desetinnými místy (daň) se zaokrouhlí dolů, aby kredit nikdy nepřesáhl cenu. */
export function toMinorFloor(amount: unknown): number {
  const numeric = typeof amount === "object" && amount !== null ? (amount as any).numeric ?? (amount as any).value : amount
  const value = typeof numeric === "string" && numeric.trim() ? Number(numeric) : numeric
  if (typeof value !== "number" || !Number.isFinite(value)) return NaN
  return Math.floor(value * 100 + 1e-6)
}

export function fromMinor(minor: number): number {
  return Math.round(minor) / 100
}

export function formatEur(minor: number): string {
  const value = fromMinor(minor)
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(".", ",")} €`
}

type SettingsResult = { ok: true; value: GiftVoucherSettings } | { ok: false; errors: string[] }

/**
 * Validace nastavení z adminu. `values` jsou eura (číslo, max. 2 desetinná místa),
 * uloží se jako seřazené unikátní centy.
 */
export function parseSettingsInput(raw: unknown): SettingsResult {
  const errors: string[] = []
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const rawValues = Array.isArray(input.values) ? input.values : null
  const values: number[] = []
  if (!rawValues || !rawValues.length || rawValues.length > LIMITS.maxValues) errors.push("values")
  else {
    for (const value of rawValues) {
      const minor = typeof value === "number" || (typeof value === "string" && /^\d+([.,]\d{1,2})?$/.test(value.trim()))
        ? toMinor(typeof value === "string" ? value.trim().replace(",", ".") : value) : NaN
      if (!Number.isInteger(minor) || minor < LIMITS.minValueMinor || minor > LIMITS.maxValueMinor || Math.abs(minor / 100 - Number(String(value).replace(",", "."))) > 1e-9) {
        errors.push("values")
        break
      }
      values.push(minor)
    }
  }
  const uniqueValues = [...new Set(values)].sort((a, b) => a - b)
  if (uniqueValues.length !== values.length && !errors.includes("values")) errors.push("values")
  const months = Number(input.validity_months)
  if (!Number.isInteger(months) || months < LIMITS.minMonths || months > LIMITS.maxMonths) errors.push("validity_months")
  const scopeType = input.scope_type
  if (!SCOPE_TYPES.includes(scopeType as ScopeType)) errors.push("scope_type")
  const categoryIds = Array.isArray(input.category_ids) ? input.category_ids : []
  if (!Array.isArray(input.category_ids ?? []) || categoryIds.length > LIMITS.maxCategories || categoryIds.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id))) errors.push("category_ids")
  if (scopeType === "categories" && !categoryIds.length) errors.push("category_ids")
  if (typeof input.partial_redemption !== "boolean") errors.push("partial_redemption")
  if (!DELIVERY_METHODS.includes(input.delivery_method as DeliveryMethod)) errors.push("delivery_method")
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") errors.push("enabled")
  if (errors.length) return { ok: false, errors: [...new Set(errors)] }
  return {
    ok: true,
    value: {
      enabled: input.enabled === undefined ? true : (input.enabled as boolean),
      values_minor: uniqueValues,
      validity_months: months,
      scope_type: scopeType as ScopeType,
      category_ids: scopeType === "categories" ? [...new Set(categoryIds as string[])] : [],
      partial_redemption: input.partial_redemption as boolean,
      delivery_method: input.delivery_method as DeliveryMethod,
    },
  }
}

/** Uložený řádek -> nastavení; poškozená data spadnou zpět na bezpečné výchozí hodnoty. */
export function settingsFromRow(row: Record<string, any> | null | undefined): GiftVoucherSettings {
  if (!row) return { ...DEFAULT_SETTINGS, values_minor: [...DEFAULT_SETTINGS.values_minor], category_ids: [] }
  const parsed = parseSettingsInput({
    values: Array.isArray(row.values_minor) ? row.values_minor.map((minor: unknown) => Number(minor) / 100) : [],
    validity_months: row.validity_months,
    scope_type: row.scope_type,
    category_ids: row.category_ids ?? [],
    partial_redemption: row.partial_redemption,
    delivery_method: row.delivery_method,
    enabled: row.enabled,
  })
  if (!parsed.ok) return { ...DEFAULT_SETTINGS, values_minor: [...DEFAULT_SETTINGS.values_minor], category_ids: [], enabled: false }
  return parsed.value
}

// --- Kódy -----------------------------------------------------------------

/** 32 znaků bez zaměnitelných 0/O/1/I: bajt & 31 je rovnoměrný (256 je násobek 32). */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const CODE_BODY_LENGTH = 16 // 80 bitů entropie
const CODE_PATTERN = new RegExp(`^GV[${CODE_ALPHABET}]{${CODE_BODY_LENGTH}}$`)

export function generateVoucherCode(randomBytes: (size: number) => Uint8Array): string {
  const bytes = randomBytes(CODE_BODY_LENGTH)
  if (!bytes || bytes.length < CODE_BODY_LENGTH) throw new Error("GIFT_VOUCHER_RANDOM_FAILED")
  let body = ""
  for (let i = 0; i < CODE_BODY_LENGTH; i++) body += CODE_ALPHABET[bytes[i] & 31]
  return formatCode(body)
}

function formatCode(body: string): string {
  return `GV-${body.match(/.{4}/g)!.join("-")}`
}

/** Normalizuje vstup zákaznice (mezery, pomlčky, malá písmena). Neplatný tvar -> null. */
export function normalizeVoucherCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 64) return null
  const compact = input.toUpperCase().replace(/[\s-]/g, "")
  if (!CODE_PATTERN.test(compact)) return null
  return formatCode(compact.slice(2))
}

export function maskVoucherCode(code: string): string {
  const last4 = typeof code === "string" ? code.replace(/[^A-Z0-9]/gi, "").slice(-4) : ""
  return `GV-****-****-****-${last4 || "****"}`
}

// --- Platnost -------------------------------------------------------------

/** Kalendářní měsíce; 31. 1. + 1 měsíc = poslední den února. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

export function isExpired(voucher: { expires_at: Date | string }, at: Date = new Date()): boolean {
  return new Date(voucher.expires_at).getTime() <= at.getTime()
}

export function isoDateInZone(at: Date = new Date(), timeZone = GIFT_VOUCHER_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
}

function isoDatePlusMonths(isoDate: string, months: number): string {
  return addMonths(new Date(`${isoDate}T00:00:00Z`), months).toISOString().slice(0, 10)
}

// --- Obdarovaní -----------------------------------------------------------

export type Recipient = { name: string; email: string; message: string | null; delivery_date: string | null }
export type RecipientsByVariant = Record<string, Recipient[]>

const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[^\s@<>"']{2,63}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

export function requiresRecipient(method: DeliveryMethod): boolean {
  return method === "recipient_email" || method === "both"
}

/**
 * Ověří jednoho obdarovaného. Datum doručení je v rozsahu dnes (Bratislava) až
 * konec platnosti, kterou by poukaz měl při vystavení dnes.
 */
export function parseRecipient(raw: unknown, opts: { today: string; validityMonths: number }): { ok: true; value: Recipient } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "GIFT_VOUCHER_RECIPIENT_INVALID" }
  const r = raw as Record<string, unknown>
  const name = typeof r.name === "string" ? r.name.trim() : ""
  if (!name || name.length > 120 || CONTROL.test(name)) return { ok: false, error: "GIFT_VOUCHER_RECIPIENT_NAME_INVALID" }
  const email = typeof r.email === "string" ? r.email.trim().toLowerCase() : ""
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: "GIFT_VOUCHER_RECIPIENT_EMAIL_INVALID" }
  if (r.message !== undefined && r.message !== null && typeof r.message !== "string") return { ok: false, error: "GIFT_VOUCHER_MESSAGE_INVALID" }
  const message = typeof r.message === "string" ? r.message.trim() : ""
  if ([...message].length > MESSAGE_MAX_LENGTH || CONTROL.test(message)) return { ok: false, error: "GIFT_VOUCHER_MESSAGE_INVALID" }
  const deliveryDate = r.delivery_date === undefined || r.delivery_date === null || r.delivery_date === "" ? opts.today : r.delivery_date
  if (typeof deliveryDate !== "string" || !DATE.test(deliveryDate) || Number.isNaN(Date.parse(`${deliveryDate}T00:00:00Z`)) || new Date(`${deliveryDate}T00:00:00Z`).toISOString().slice(0, 10) !== deliveryDate) {
    return { ok: false, error: "GIFT_VOUCHER_DELIVERY_DATE_INVALID" }
  }
  if (deliveryDate < opts.today || deliveryDate >= isoDatePlusMonths(opts.today, opts.validityMonths)) return { ok: false, error: "GIFT_VOUCHER_DELIVERY_DATE_INVALID" }
  return { ok: true, value: { name, email, message: message || null, delivery_date: deliveryDate } }
}

/**
 * Ověří metadata obdarovaných vůči poukazovým řádkům košíku. Když způsob doručení
 * zahrnuje e-mail obdarovanému, musí mít každý kus poukazu svého obdarovaného.
 */
export function validateRecipients(input: {
  lines: Array<{ variant_id: string; quantity: number }>
  recipients: unknown
  method: DeliveryMethod
  today: string
  validityMonths: number
}): { ok: true; value: RecipientsByVariant } | { ok: false; error: string } {
  const quantities = new Map<string, number>()
  for (const line of input.lines) quantities.set(line.variant_id, (quantities.get(line.variant_id) ?? 0) + line.quantity)
  const raw = input.recipients ?? {}
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "GIFT_VOUCHER_RECIPIENT_INVALID" }
  const result: RecipientsByVariant = {}
  for (const [variantId, list] of Object.entries(raw as Record<string, unknown>)) {
    const quantity = quantities.get(variantId)
    if (!quantity || !Array.isArray(list) || list.length > quantity) return { ok: false, error: "GIFT_VOUCHER_RECIPIENT_COUNT_MISMATCH" }
    const parsed: Recipient[] = []
    for (const entry of list) {
      const recipient = parseRecipient(entry, { today: input.today, validityMonths: input.validityMonths })
      if (!recipient.ok) return recipient
      parsed.push(recipient.value)
    }
    result[variantId] = parsed
  }
  if (requiresRecipient(input.method)) {
    for (const [variantId, quantity] of quantities) {
      if ((result[variantId]?.length ?? 0) !== quantity) return { ok: false, error: "GIFT_VOUCHER_RECIPIENT_REQUIRED" }
    }
  }
  return { ok: true, value: result }
}

// --- Čerpání --------------------------------------------------------------

export type EligibleItem = { is_gift_voucher: boolean; category_ids: string[]; total_minor: number }

/**
 * Částka, kterou smí poukaz uhradit: položky mimo poukazy (poukaz nikdy neplatí jiný
 * poukaz), u rozsahu „kategorie“ jen položky z vybraných kategorií; doprava jen při rozsahu „vše“.
 */
export function computeEligibleMinor(input: { items: EligibleItem[]; shipping_minor: number; scope: VoucherScope }): number {
  const allowed = new Set(input.scope.category_ids)
  let eligible = 0
  for (const item of input.items) {
    if (item.is_gift_voucher) continue
    if (!Number.isInteger(item.total_minor) || item.total_minor < 0) throw new GiftVoucherError("GIFT_VOUCHER_CART_INVALID")
    if (input.scope.type === "categories" && !item.category_ids.some((id) => allowed.has(id))) continue
    eligible += item.total_minor
  }
  if (input.scope.type === "all") {
    if (!Number.isInteger(input.shipping_minor) || input.shipping_minor < 0) throw new GiftVoucherError("GIFT_VOUCHER_CART_INVALID")
    eligible += input.shipping_minor
  }
  return eligible
}

export function plannedCreditMinor(balance: number, eligible: number): number {
  return Math.max(0, Math.min(balance, eligible))
}

/**
 * Výpočet čerpání pod zámkem řádku. Při jednorázovém čerpání (partial=false) musí
 * kredit pokrýt maximum možného a zbytek zůstatku propadá (zapíše se jako forfeited).
 */
export function computeRedemption(input: { balance: number; requested: number; eligible: number; partial: boolean }): { amount: number; forfeited: number; balance_after: number } {
  const { balance, requested, eligible, partial } = input
  if (![balance, requested, eligible].every(Number.isInteger)) throw new GiftVoucherError("GIFT_VOUCHER_AMOUNT_INVALID")
  if (requested <= 0) throw new GiftVoucherError("GIFT_VOUCHER_AMOUNT_INVALID")
  if (requested > eligible) throw new GiftVoucherError("GIFT_VOUCHER_AMOUNT_CHANGED")
  if (requested > balance) throw new GiftVoucherError("GIFT_VOUCHER_BALANCE_INSUFFICIENT")
  if (!partial) {
    if (requested !== plannedCreditMinor(balance, eligible)) throw new GiftVoucherError("GIFT_VOUCHER_AMOUNT_CHANGED")
    return { amount: requested, forfeited: balance - requested, balance_after: 0 }
  }
  return { amount: requested, forfeited: 0, balance_after: balance - requested }
}

export function assertUsable(voucher: { status: string; expires_at: Date | string; currency_code: string; balance: number }, at: Date = new Date()): void {
  if (voucher.status === "void") throw new GiftVoucherError("GIFT_VOUCHER_VOID")
  if (voucher.status === "expired" || isExpired(voucher, at)) throw new GiftVoucherError("GIFT_VOUCHER_EXPIRED")
  if (voucher.status !== "active" || voucher.balance <= 0) throw new GiftVoucherError("GIFT_VOUCHER_DEPLETED")
  if (voucher.currency_code !== GIFT_VOUCHER_CURRENCY) throw new GiftVoucherError("GIFT_VOUCHER_CURRENCY_MISMATCH")
}

/** Stav po vrácení peněz na poukaz. Zneplatněný zůstává zneplatněný. */
export function statusAfterCredit(voucher: { status: string; expires_at: Date | string }, balanceAfter: number, at: Date = new Date()): VoucherStatus {
  if (voucher.status === "void") return "void"
  if (isExpired(voucher, at)) return "expired"
  return balanceAfter > 0 ? "active" : "depleted"
}

export function issueKey(orderId: string, variantId: string, index: number): string {
  return `order:${orderId}:${variantId}:${index}`
}

export function isGiftVoucherProduct(product: { metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  const flag = product?.metadata?.gift_voucher
  return flag === true || flag === "true"
}

export function variantAmountMinor(variant: { metadata?: Record<string, unknown> | null } | null | undefined): number {
  const value = Number(variant?.metadata?.gift_voucher_amount_minor)
  return Number.isInteger(value) && value > 0 ? value : NaN
}

export const PUBLIC_ERROR_CODES = new Set([
  "GIFT_VOUCHER_INVALID", "GIFT_VOUCHER_EXPIRED", "GIFT_VOUCHER_DEPLETED", "GIFT_VOUCHER_VOID", "GIFT_VOUCHER_NOT_APPLICABLE",
  "GIFT_VOUCHER_AMOUNT_CHANGED", "GIFT_VOUCHER_BALANCE_INSUFFICIENT", "GIFT_VOUCHER_ALREADY_REDEEMED", "GIFT_VOUCHER_MULTIPLE",
  "GIFT_VOUCHER_RECIPIENT_REQUIRED", "GIFT_VOUCHER_RECIPIENT_INVALID", "GIFT_VOUCHER_RECIPIENT_NAME_INVALID",
  "GIFT_VOUCHER_RECIPIENT_EMAIL_INVALID", "GIFT_VOUCHER_MESSAGE_INVALID", "GIFT_VOUCHER_DELIVERY_DATE_INVALID",
  "GIFT_VOUCHER_RECIPIENT_COUNT_MISMATCH", "GIFT_VOUCHER_DISABLED", "GIFT_VOUCHER_PRODUCT_INVALID", "GIFT_VOUCHER_CART_INVALID",
  "GIFT_VOUCHER_CURRENCY_MISMATCH", "GIFT_VOUCHER_CART_COMPLETED",
])

/** Jednotná odpověď pro neplatný/cizí kód – nerozlišuje „neexistuje“ a „zneplatněn“ (proti zkoušení kódů). */
export function publicCodeError(code: string): string {
  return ["GIFT_VOUCHER_VOID", "GIFT_VOUCHER_INVALID", "GIFT_VOUCHER_CURRENCY_MISMATCH"].includes(code) ? "GIFT_VOUCHER_INVALID" : code
}
