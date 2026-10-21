/** Čistá pravidla chatu zákazník ↔ Lucia (bez infrastruktury, testovatelná). Vše vynucuje server. */
import { addDays, utcToLocalDate, zonedToUtc } from "../booking/slots"

export const CHAT_TIMEZONE = "Europe/Bratislava"
/** Max zpráv zákazník po sobě bez Luciiny odpovědi (napříč jejími konverzacemi). */
export const MAX_CONSECUTIVE_CUSTOMER_MESSAGES = 3
/** Max zpráv zákazník za kalendářní den (Europe/Bratislava). */
export const DAILY_CUSTOMER_MESSAGE_LIMIT = 5
export const MAX_CUSTOMER_MESSAGE_LENGTH = 2000
export const MAX_ADMIN_MESSAGE_LENGTH = 5000
export const MAX_SUBJECT_LENGTH = 120
/** Souhrnný e-mail Lucii nejvýš jednou za tuto dobu. */
export const ADMIN_DIGEST_INTERVAL_MS = 60 * 60 * 1000

export type ChatErrorCode =
  | "invalid_message"
  | "message_empty"
  | "message_too_long"
  | "invalid_subject"
  | "chat_not_eligible"
  | "chat_blocked"
  | "conversation_closed"
  | "chat_consecutive_limit"
  | "chat_daily_limit"

const STATUS: Record<ChatErrorCode, number> = {
  invalid_message: 400,
  message_empty: 400,
  message_too_long: 400,
  invalid_subject: 400,
  chat_not_eligible: 403,
  chat_blocked: 403,
  conversation_closed: 409,
  chat_consecutive_limit: 429,
  chat_daily_limit: 429,
}

const MESSAGES: Record<ChatErrorCode, string> = {
  invalid_message: "Zpráva musí být text.",
  message_empty: "Zpráva je prázdná.",
  message_too_long: `Zpráva je příliš dlouhá (nejvýš ${MAX_CUSTOMER_MESSAGE_LENGTH} znaků).`,
  invalid_subject: `Předmět může mít nejvýš ${MAX_SUBJECT_LENGTH} znaků.`,
  chat_not_eligible: "Psát Lucii mohou zákazník, které už mají objednávku, rezervaci nebo předplatné.",
  chat_blocked: "Chat je pro váš účet momentálně vypnutý.",
  conversation_closed: "Tato konverzace je uzavřená. Pokud potřebujete, začněte prosím novou.",
  chat_consecutive_limit: `Napsala jste ${MAX_CONSECUTIVE_CUSTOMER_MESSAGES} zprávy po sobě. Počkejte prosím na odpověď Lucie.`,
  chat_daily_limit: `Dnes jste odeslala ${DAILY_CUSTOMER_MESSAGE_LIMIT} zpráv, což je denní maximum. Zítra můžete psát znovu.`,
}

/** Porušení pravidel chatu; `type` je stabilní kód pro storefront, `message` srozumitelný text. */
export class ChatPolicyError extends Error {
  readonly status: number
  constructor(readonly type: ChatErrorCode, message?: string) {
    super(message ?? MESSAGES[type])
    this.status = STATUS[type]
  }
}

// Řídicí znaky kromě \n a \t, a znaky přepínající směr textu (vizuální podvržení obsahu).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
const BIDI = /[‎‏‪-‮⁦-⁩]/g

export type NormalizeResult = { ok: true; value: string } | { ok: false; error: ChatPolicyError }

/**
 * Normalizace těla zprávy: jen text, NFC, \r\n → \n, bez řídicích a bidi znaků, max 2 prázdné řádky po sobě.
 * Žádné HTML se neodstraňuje ani nepřevádí – tělo se ukládá jako text a všude se vykresluje escapované.
 * Délka se počítá ve znacích (code points), ne v UTF-16 jednotkách.
 */
export function normalizeMessageBody(raw: unknown, maxLength: number = MAX_CUSTOMER_MESSAGE_LENGTH): NormalizeResult {
  if (typeof raw !== "string") return { ok: false, error: new ChatPolicyError("invalid_message") }
  const value = raw.normalize("NFC").replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(BIDI, "")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (!value) return { ok: false, error: new ChatPolicyError("message_empty") }
  if ([...value].length > maxLength) {
    return { ok: false, error: new ChatPolicyError("message_too_long", `Zpráva je příliš dlouhá (nejvýš ${maxLength} znaků).`) }
  }
  return { ok: true, value }
}

/** Volitelný předmět: jeden řádek textu, prázdný = null. */
export function normalizeSubject(raw: unknown): { ok: true; value: string | null } | { ok: false; error: ChatPolicyError } {
  if (raw === undefined || raw === null) return { ok: true, value: null }
  if (typeof raw !== "string") return { ok: false, error: new ChatPolicyError("invalid_subject") }
  const value = raw.normalize("NFC").replace(CONTROL, " ").replace(BIDI, "").replace(/\s+/g, " ").trim()
  if (!value) return { ok: true, value: null }
  if ([...value].length > MAX_SUBJECT_LENGTH) return { ok: false, error: new ChatPolicyError("invalid_subject") }
  return { ok: true, value }
}

export type EligibilitySignals = { hasOrder: boolean; hasBooking: boolean; hasEntitlement: boolean }

/** Psát smí jen zákazník s aspoň jednou objednávkou, rezervací nebo aktivním přístupem/předplatným. */
export function isChatEligible(signals: EligibilitySignals): boolean {
  return signals.hasOrder || signals.hasBooking || signals.hasEntitlement
}

export type SendCounters = {
  /** Zprávy zákazník dnes (lokální den). */
  sentToday: number
  /** Zprávy zákazník od poslední Luciiny odpovědi (v kterékoli její konverzaci). */
  consecutive: number
}

export type SendPolicyInput = SendCounters & {
  blocked: boolean
  conversation?: { status: string } | null
}

/** Rozhodne, zda smí zákazník odeslat další zprávu. Pořadí: blokace, uzavřená konverzace, limity. */
export function evaluateCustomerSend(input: SendPolicyInput): ChatPolicyError | null {
  if (input.blocked) return new ChatPolicyError("chat_blocked")
  if (input.conversation && input.conversation.status !== "open") return new ChatPolicyError("conversation_closed")
  if (input.consecutive >= MAX_CONSECUTIVE_CUSTOMER_MESSAGES) return new ChatPolicyError("chat_consecutive_limit")
  if (input.sentToday >= DAILY_CUSTOMER_MESSAGE_LIMIT) return new ChatPolicyError("chat_daily_limit")
  return null
}

/** Kolik zpráv ještě smí zákazník odeslat (pro storefront: „můžete napsat ještě 2 zprávy“). */
export function remainingAllowance(counters: SendCounters): { today: number; in_row: number; now: number } {
  const today = Math.max(DAILY_CUSTOMER_MESSAGE_LIMIT - counters.sentToday, 0)
  const inRow = Math.max(MAX_CONSECUTIVE_CUSTOMER_MESSAGES - counters.consecutive, 0)
  return { today, in_row: inRow, now: Math.min(today, inRow) }
}

/** Začátek lokálního dne (Europe/Bratislava) jako UTC okamžik – hranice denního limitu. */
export function localDayStart(at: Date, timeZone: string = CHAT_TIMEZONE): Date {
  const date = utcToLocalDate(at, timeZone)
  return zonedToUtc(date, 0, timeZone) ?? new Date(`${date}T00:00:00Z`)
}

/** Začátek následujícího lokálního dne (kdy se denní limit obnoví). */
export function nextLocalDayStart(at: Date, timeZone: string = CHAT_TIMEZONE): Date {
  const next = addDays(utcToLocalDate(at, timeZone), 1)
  return zonedToUtc(next, 0, timeZone) ?? new Date(`${next}T00:00:00Z`)
}

/** Souhrn Lucii smí odejít, pokud poslední odešel před víc než hodinou (nebo nikdy). */
export function isDigestDue(lastSentAt: Date | string | null | undefined, now: Date): boolean {
  if (!lastSentAt) return true
  return now.getTime() - new Date(lastSentAt).getTime() >= ADMIN_DIGEST_INTERVAL_MS
}

/**
 * E-mail zákazníci o odpovědi: neposílat znovu, dokud si předchozí upozornění nepřečetla
 * (jinak by každá další Luciina zpráva znamenala další e-mail).
 */
export function shouldNotifyCustomer(conv: { customer_notified_at?: Date | string | null; customer_last_read_at?: Date | string | null }): boolean {
  if (!conv.customer_notified_at) return true
  if (!conv.customer_last_read_at) return false
  return new Date(conv.customer_last_read_at).getTime() >= new Date(conv.customer_notified_at).getTime()
}

/** Nepřečtená pro Luciu = poslední zpráva zákazník je novější než její poslední přečtení. */
export function isUnreadByAdmin(conv: { last_customer_message_at?: Date | string | null; admin_last_read_at?: Date | string | null }): boolean {
  if (!conv.last_customer_message_at) return false
  if (!conv.admin_last_read_at) return true
  return new Date(conv.last_customer_message_at).getTime() > new Date(conv.admin_last_read_at).getTime()
}

export function isUnreadByCustomer(conv: { last_admin_message_at?: Date | string | null; customer_last_read_at?: Date | string | null }): boolean {
  if (!conv.last_admin_message_at) return false
  if (!conv.customer_last_read_at) return true
  return new Date(conv.last_admin_message_at).getTime() > new Date(conv.customer_last_read_at).getTime()
}

/** Řazení pro Luciu: nepřečtené (a neztlumené) nahoře, pak podle poslední zprávy od nejnovější. */
export function sortForAdmin<T extends { muted?: boolean | null; last_message_at?: Date | string | null; last_customer_message_at?: Date | string | null; admin_last_read_at?: Date | string | null }>(rows: T[]): T[] {
  const ts = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : 0)
  const pinned = (r: T) => (isUnreadByAdmin(r) && !r.muted ? 1 : 0)
  return [...rows].sort((a, b) => pinned(b) - pinned(a) || ts(b.last_message_at) - ts(a.last_message_at))
}
