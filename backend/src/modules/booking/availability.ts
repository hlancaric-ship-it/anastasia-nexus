/** Čistá logika kalendáře Lucie: validace týdenních oken a konfigurace typu konzultace z metadat produktu. */
import { addDays, DEFAULT_BOOKING_CONFIG, isoWeekday, parseTime, type AvailabilityWindow, type BookingConfig } from "./slots"

/** Jedna osoba = jeden kalendář. Obsazenost i zámek platí nad celým kalendářem, ne nad produktem. */
export const CALENDAR_ID = "lucia"
export const BOOKING_TIMEZONE = "Europe/Bratislava"
export const MAX_RANGES_PER_DAY = 12
export const MIN_RANGE_MINUTES = 15

export type TimeRange = { start_time: string; end_time: string }
export type WeekInput = { week_start: string; days: Record<string, TimeRange[]> }
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Skutečné kalendářní datum ve tvaru YYYY-MM-DD (odmítne např. 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false
  const [y, m, d] = value.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && y >= 2000 && y <= 2100
}

/** Pondělí týdne, do kterého datum patří. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date))
}

/** Sedm dat týdne od pondělí. */
export function weekDates(weekStart: string): string[] {
  if (!isIsoDate(weekStart) || isoWeekday(weekStart) !== 1) throw new Error(`INVALID_WEEK_START:${weekStart}`)
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

function fmtDate(date: string): string {
  const [y, m, d] = date.split("-")
  return `${Number(d)}. ${Number(m)}. ${y}`
}

/** Seřadí úseky dne a odmítne chybný formát, od >= do, příliš krátký úsek a překryvy. */
export function validateDayRanges(date: string, raw: unknown): ValidationResult<TimeRange[]> {
  const label = fmtDate(date)
  if (!Array.isArray(raw)) return { ok: false, errors: [`${label}: úseky musí být seznam`] }
  if (raw.length > MAX_RANGES_PER_DAY) return { ok: false, errors: [`${label}: nejvýš ${MAX_RANGES_PER_DAY} úseků za den`] }
  const errors: string[] = []
  const ranges: TimeRange[] = []
  for (const item of raw) {
    const start = (item as any)?.start_time
    const end = (item as any)?.end_time
    if (typeof start !== "string" || typeof end !== "string" || !TIME_RE.test(start) || !TIME_RE.test(end)) {
      errors.push(`${label}: čas zadejte ve tvaru HH:MM`)
      continue
    }
    if (parseTime(end) - parseTime(start) < MIN_RANGE_MINUTES) {
      errors.push(`${label} ${start}–${end}: konec musí být aspoň ${MIN_RANGE_MINUTES} minut po začátku`)
      continue
    }
    ranges.push({ start_time: start, end_time: end })
  }
  ranges.sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time))
  for (let i = 1; i < ranges.length; i++) {
    if (parseTime(ranges[i].start_time) < parseTime(ranges[i - 1].end_time)) {
      errors.push(`${label}: úseky ${ranges[i - 1].start_time}–${ranges[i - 1].end_time} a ${ranges[i].start_time}–${ranges[i].end_time} se překrývají`)
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: ranges }
}

/**
 * Vstup uložení týdne: `{ week_start: pondělí, days: [{ date, ranges: [{ start_time, end_time }] }] }`.
 * Den, který v seznamu chybí nebo nemá úseky, je zavřený (fail-closed).
 */
export function validateWeekInput(body: unknown): ValidationResult<WeekInput> {
  const weekStart = (body as any)?.week_start
  if (!isIsoDate(weekStart) || isoWeekday(weekStart) !== 1) return { ok: false, errors: ["week_start musí být pondělí ve tvaru YYYY-MM-DD"] }
  const dates = weekDates(weekStart)
  const rawDays = (body as any)?.days
  if (!Array.isArray(rawDays) || rawDays.length > 7) return { ok: false, errors: ["days musí být seznam nejvýš 7 dnů"] }
  const errors: string[] = []
  const days: Record<string, TimeRange[]> = Object.fromEntries(dates.map((d) => [d, []]))
  const seen = new Set<string>()
  for (const day of rawDays) {
    const date = (day as any)?.date
    if (!isIsoDate(date) || !dates.includes(date)) { errors.push(`Datum ${String(date)} nepatří do zvoleného týdne`); continue }
    if (seen.has(date)) { errors.push(`${fmtDate(date)}: den je uveden dvakrát`); continue }
    seen.add(date)
    const result = validateDayRanges(date, (day as any)?.ranges ?? [])
    if (result.ok) days[date] = result.value
    else errors.push(...result.errors)
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: { week_start: weekStart, days } }
}

export function weekWindows(input: WeekInput): AvailabilityWindow[] {
  return Object.entries(input.days).flatMap(([date, ranges]) => ranges.map((r) => ({ date, ...r })))
}

export const CONSULTATION_FORMS = ["online", "in_person"] as const
export type ConsultationForm = (typeof CONSULTATION_FORMS)[number]

/** Co ukládáme do `product.metadata.booking` u typu konzultace. */
export type BookingProductMeta = {
  version: 1
  durationMinutes: number
  bufferMinutes: number
  form: ConsultationForm
  archived: boolean
}

const intIn = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null

/**
 * Konfigurace slotů z metadat produktu. Neplatná délka = produkt se nenabízí (null, fail-closed).
 * Časová zóna patří kalendáři, ne typu; staré klíče `rules`/`exceptions` se ignorují.
 */
export function bookingConfigFromMetadata(meta: unknown): BookingConfig | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null
  const m = meta as Record<string, unknown>
  const durationMinutes = intIn(m.durationMinutes, 5, 720)
  if (durationMinutes === null) return null
  return {
    timezone: BOOKING_TIMEZONE,
    durationMinutes,
    bufferMinutes: intIn(m.bufferMinutes, 0, 240) ?? DEFAULT_BOOKING_CONFIG.bufferMinutes,
    stepMinutes: intIn(m.stepMinutes, 5, 240) ?? DEFAULT_BOOKING_CONFIG.stepMinutes,
    minNoticeHours: intIn(m.minNoticeHours, 0, 720) ?? DEFAULT_BOOKING_CONFIG.minNoticeHours,
    maxAdvanceDays: intIn(m.maxAdvanceDays, 1, 365) ?? DEFAULT_BOOKING_CONFIG.maxAdvanceDays,
  }
}

export function isArchivedBookingMeta(meta: unknown): boolean {
  return Boolean(meta && typeof meta === "object" && (meta as Record<string, unknown>).archived === true)
}
