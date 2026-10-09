/** Čistá logika rezervací (bez infrastruktury): generování volných termínů v časové zóně provozovny. */

export type BookingConfig = {
  timezone: string // IANA, např. "Europe/Bratislava"
  durationMinutes: number
  bufferMinutes: number // pauza po konzultaci
  stepMinutes: number // rastr začátků
  minNoticeHours: number
  maxAdvanceDays: number
}

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  timezone: "Europe/Bratislava",
  durationMinutes: 60,
  bufferMinutes: 15,
  stepMinutes: 30,
  minNoticeHours: 24,
  maxAdvanceDays: 90,
}

/** weekday: 1 = pondělí ... 7 = neděle (ISO). start/end "HH:MM" v čase provozovny. */
export type WeeklyRule = { weekday: number; start_time: string; end_time: string }
/** closed=true zavře celý den; jinak `ranges` nahradí týdenní pravidla pro ten den. */
export type DayException = { date: string; closed: boolean; ranges?: Array<{ start_time: string; end_time: string }> }
export type Interval = { start: Date; end: Date }
export type Slot = { start: string; end: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function parseTime(value: string): number {
  const m = TIME_RE.exec(value)
  if (!m) throw new Error(`INVALID_TIME:${value}`)
  return Number(m[1]) * 60 + Number(m[2])
}

function offsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** Lokální čas provozovny -> UTC. Nevalidní (přeskočená hodina při letním čase) vrací null. */
export function zonedToUtc(date: string, minutesOfDay: number, timeZone: string): Date | null {
  if (!DATE_RE.test(date)) throw new Error(`INVALID_DATE:${date}`)
  const [y, mo, d] = date.split("-").map(Number)
  const naive = Date.UTC(y, mo - 1, d, 0, minutesOfDay)
  let utc = naive - offsetMs(naive, timeZone)
  utc = naive - offsetMs(utc, timeZone)
  // ověření, že čas existuje (jarní posun)
  return offsetMs(utc, timeZone) + utc === naive ? new Date(utc) : null
}

export function utcToLocalDate(at: Date, timeZone: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
  return p
}

function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return wd === 0 ? 7 : wd
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime()
}

/**
 * Volné termíny v intervalu lokálních dnů [fromDate, toDate] (včetně).
 * `busy` = existující aktivní rezervace (held/confirmed); pauza po konzultaci se připočítá zde.
 */
export function generateSlots(input: {
  config: BookingConfig
  rules: WeeklyRule[]
  exceptions?: DayException[]
  busy?: Interval[]
  fromDate: string
  toDate: string
  now?: Date
}): Slot[] {
  const { config, rules, fromDate, toDate } = input
  const now = input.now ?? new Date()
  const exceptions = new Map((input.exceptions ?? []).map((e) => [e.date, e]))
  const earliest = now.getTime() + config.minNoticeHours * 3_600_000
  const latest = now.getTime() + config.maxAdvanceDays * 86_400_000
  const busy = (input.busy ?? []).map((b) => ({ start: b.start, end: new Date(b.end.getTime() + config.bufferMinutes * 60_000) }))
  const slots: Slot[] = []

  if (config.durationMinutes <= 0 || config.stepMinutes <= 0) throw new Error("INVALID_CONFIG")
  for (let date = fromDate, guard = 0; date <= toDate && guard < 400; date = addDays(date, 1), guard++) {
    const exception = exceptions.get(date)
    if (exception?.closed) continue
    const ranges = exception?.ranges ?? rules.filter((r) => r.weekday === isoWeekday(date))
    for (const range of ranges) {
      const open = parseTime(range.start_time)
      const close = parseTime(range.end_time)
      for (let t = open; t + config.durationMinutes <= close; t += config.stepMinutes) {
        const start = zonedToUtc(date, t, config.timezone)
        const end = zonedToUtc(date, t + config.durationMinutes, config.timezone)
        if (!start || !end) continue
        if (start.getTime() < earliest || start.getTime() > latest) continue
        if (busy.some((b) => overlaps({ start, end }, b))) continue
        slots.push({ start: start.toISOString(), end: end.toISOString() })
      }
    }
  }
  return slots
}

/** Server ověří, že požadovaný začátek je skutečně nabízený slot (klientovi se nevěří). */
export function isOfferedSlot(slots: Slot[], startIso: string): Slot | null {
  const t = new Date(startIso).getTime()
  if (!Number.isFinite(t)) return null
  return slots.find((s) => new Date(s.start).getTime() === t) ?? null
}
