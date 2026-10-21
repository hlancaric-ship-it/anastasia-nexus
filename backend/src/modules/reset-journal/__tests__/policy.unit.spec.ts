import {
  JournalError,
  JOURNAL_WEEK_MAX,
  MAX_JOURNAL_ENTRIES_PER_DAY,
  dayRange,
  normalizeMetrics,
  normalizeWeek,
  parseCalendarDate,
  todayInZone,
} from "../policy"
import { RESET_JOURNAL_METRICS } from "../../../lib/reset-program/config"

const config = RESET_JOURNAL_METRICS.map((metric) => ({ ...metric }))

describe("Zrkadielko – pravidlá", () => {
  it("parsuje kalendárny deň a odmietne neplatný dátum", () => {
    expect(parseCalendarDate("2026-08-14")?.iso).toBe("2026-08-14")
    expect(parseCalendarDate("2026-08-14")?.date.toISOString()).toBe("2026-08-14T00:00:00.000Z")
    expect(parseCalendarDate("2026-02-30")).toBeNull()
    expect(parseCalendarDate("14.08.2026")).toBeNull()
    expect(parseCalendarDate("")).toBeNull()
    expect(parseCalendarDate(null)).toBeNull()
    expect(parseCalendarDate(undefined)).toBeNull()
  })

  it("dnešný deň počíta v časovom pásme zákazníka", () => {
    const utcMidnight = new Date("2026-08-14T22:30:00.000Z")
    // 22:30 UTC je v Bratislave (UTC+2) už 15. augusta.
    expect(todayInZone("Europe/Bratislava", utcMidnight)).toBe("2026-08-15")
    expect(todayInZone("Europe/Bratislava", new Date("2026-08-14T20:00:00.000Z"))).toBe("2026-08-14")
  })

  it("rozsah dňa je polnoc do polnoci UTC", () => {
    expect(dayRange("2026-08-14")).toEqual({ from: "2026-08-14T00:00:00.000Z", to: "2026-08-15T00:00:00.000Z" })
  })

  it("hodnoty metrik musia byť celé čísla v rozsahu 1–10", () => {
    expect(normalizeMetrics({ energia: 7, spanok: 5, stres: 4 }, config)).toEqual({ energia: 7, spanok: 5, stres: 4 })
    expect(() => normalizeMetrics({ energia: 0 }, config)).toThrow(JournalError)
    expect(() => normalizeMetrics({ energia: 11 }, config)).toThrow(JournalError)
    expect(() => normalizeMetrics({ energia: 7.5 }, config)).toThrow(JournalError)
    expect(() => normalizeMetrics({ energia: "7" }, config)).toThrow(JournalError)
    expect(() => normalizeMetrics({ nespravny: 5 }, config)).toThrow(JournalError)
    expect(() => normalizeMetrics({}, config)).toThrow(JournalError)
    expect(() => normalizeMetrics(null, config)).toThrow(JournalError)
    expect(() => normalizeMetrics([{ energia: 5 }], config)).toThrow(JournalError)
  })

  it("týždeň je 1–16 alebo neprítomný", () => {
    expect(normalizeWeek(1)).toBe(1)
    expect(normalizeWeek(16)).toBe(16)
    expect(normalizeWeek(null)).toBeNull()
    expect(normalizeWeek(undefined)).toBeNull()
    expect(normalizeWeek("")).toBeNull()
    expect(() => normalizeWeek(0)).toThrow(JournalError)
    expect(() => normalizeWeek(17)).toThrow(JournalError)
    expect(() => normalizeWeek("abc")).toThrow(JournalError)
    expect(JOURNAL_WEEK_MAX).toBe(16)
  })

  it("denný limit je rozumný a konkrétny", () => {
    expect(MAX_JOURNAL_ENTRIES_PER_DAY).toBeGreaterThan(0)
    expect(MAX_JOURNAL_ENTRIES_PER_DAY).toBeLessThanOrEqual(20)
  })
})
