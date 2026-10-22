import { RESET_JOURNAL_TIMEZONE } from "../../lib/reset-program/config"
import type { JournalMetric } from "../../lib/reset-program/config"

/** Koľko záznamov smie zákazník mať v jeden deň (ochrana proti spamu a chybnému kliku). */
export const MAX_JOURNAL_ENTRIES_PER_DAY = 10

/** Rozsah týždňa programu (1–16). */
export const JOURNAL_WEEK_MIN = 1
export const JOURNAL_WEEK_MAX = 16

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Chyba pravidla Zrkadielka. `code` sa vracia klientovi, `status` určuje HTTP odpoveď. */
export class JournalError extends Error {
  constructor(public readonly code: string, public readonly status = 400) {
    super(code)
    this.name = "JournalError"
  }
}

/**
 * Parsuje kalendárny deň (`YYYY-MM-DD`) alebo `Date` na dátum v UTC polnoci.
 * Vráti `null`, keď vstup nie je platný kalendárny deň.
 */
export function parseCalendarDate(value: unknown): { date: Date; iso: string } | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!DATE_ONLY.test(trimmed)) return null
    const date = new Date(`${trimmed}T00:00:00.000Z`)
    if (!Number.isFinite(date.getTime())) return null
    if (date.toISOString().slice(0, 10) !== trimmed) return null
    return { date, iso: trimmed }
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const iso = value.toISOString().slice(0, 10)
    return { date: new Date(`${iso}T00:00:00.000Z`), iso }
  }
  return null
}

/** Kalendárny dnes v časovom pásme zákazníka (`YYYY-MM-DD`). */
export function todayInZone(timeZone: string = RESET_JOURNAL_TIMEZONE, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/** Rozsah jedného kalendárneho dňa v UTC polnoci (na filtrovanie v databáze). */
export function dayRange(iso: string): { from: string; to: string } {
  const from = new Date(`${iso}T00:00:00.000Z`)
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
  return { from: from.toISOString(), to: to.toISOString() }
}

/**
 * Overí a normalizuje hodnoty metrik.
 * Neznámy kľúč, necelé číslo alebo hodnota mimo rozsahu metriky sa odmietne.
 */
export function normalizeMetrics(raw: unknown, config: readonly JournalMetric[]): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new JournalError("JOURNAL_METRICS_INVALID")
  }
  const known = new Map(config.map((metric) => [metric.key, metric]))
  const result: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const metric = known.get(key)
    if (!metric) throw new JournalError("JOURNAL_METRIC_UNKNOWN")
    if (typeof value !== "number" || !Number.isInteger(value)) throw new JournalError("JOURNAL_METRIC_INVALID")
    if (value < metric.min || value > metric.max) throw new JournalError("JOURNAL_METRIC_OUT_OF_RANGE")
    result[key] = value
  }
  if (!Object.keys(result).length) throw new JournalError("JOURNAL_METRICS_EMPTY")
  return result
}

/** Normalizuje týždeň programu (1–16 alebo neprítomný). */
export function normalizeWeek(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null
  const week = Number(value)
  if (!Number.isInteger(week) || week < JOURNAL_WEEK_MIN || week > JOURNAL_WEEK_MAX) {
    throw new JournalError("JOURNAL_WEEK_INVALID")
  }
  return week
}
