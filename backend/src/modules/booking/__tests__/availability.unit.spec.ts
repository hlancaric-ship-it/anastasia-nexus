import { bookingConfigFromMetadata, isArchivedBookingMeta, mondayOf, validateWeekInput, weekDates } from "../availability"
import { DEFAULT_BOOKING_CONFIG, generateSlotsFromWindows, isWithinWindows } from "../slots"

const NOW = new Date("2026-10-01T08:00:00Z")
const config = { ...DEFAULT_BOOKING_CONFIG, minNoticeHours: 0, durationMinutes: 60, bufferMinutes: 15, stepMinutes: 30 }
const day = (date: string, ranges: Array<[string, string]>) => ({ date, ranges: ranges.map(([start_time, end_time]) => ({ start_time, end_time })) })

describe("validateWeekInput", () => {
  it("přijme pondělí, seřadí úseky a nevyplněné dny nechá prázdné", () => {
    const r = validateWeekInput({ week_start: "2026-10-12", days: [day("2026-10-13", [["14:00", "16:00"], ["09:00", "12:00"]])] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(r.value.days)).toEqual(weekDates("2026-10-12"))
    expect(r.value.days["2026-10-13"]).toEqual([{ start_time: "09:00", end_time: "12:00" }, { start_time: "14:00", end_time: "16:00" }])
    expect(r.value.days["2026-10-12"]).toEqual([])
  })

  it.each([
    ["úterý jako začátek týdne", { week_start: "2026-10-13", days: [] }],
    ["neexistující datum", { week_start: "2026-02-30", days: [] }],
    ["datum mimo týden", { week_start: "2026-10-12", days: [day("2026-10-19", [["09:00", "10:00"]])] }],
    ["den dvakrát", { week_start: "2026-10-12", days: [day("2026-10-12", []), day("2026-10-12", [])] }],
    ["špatný čas", { week_start: "2026-10-12", days: [day("2026-10-12", [["9:00", "10:00"]])] }],
    ["24:00", { week_start: "2026-10-12", days: [day("2026-10-12", [["20:00", "24:00"]])] }],
    ["od po do", { week_start: "2026-10-12", days: [day("2026-10-12", [["12:00", "10:00"]])] }],
    ["příliš krátký úsek", { week_start: "2026-10-12", days: [day("2026-10-12", [["10:00", "10:10"]])] }],
    ["překryv úseků", { week_start: "2026-10-12", days: [day("2026-10-12", [["09:00", "12:00"], ["11:30", "13:00"]])] }],
    ["příliš mnoho úseků", { week_start: "2026-10-12", days: [day("2026-10-12", Array.from({ length: 13 }, (_, i) => [`${String(i + 8).padStart(2, "0")}:00`, `${String(i + 8).padStart(2, "0")}:30`] as [string, string]))] }],
    ["chybí days", { week_start: "2026-10-12" }],
  ])("odmítne: %s", (_label, body) => {
    expect(validateWeekInput(body).ok).toBe(false)
  })

  it("navazující úseky (12:00–12:00) se nepřekrývají", () => {
    expect(validateWeekInput({ week_start: "2026-10-12", days: [day("2026-10-12", [["09:00", "12:00"], ["12:00", "13:00"]])] }).ok).toBe(true)
  })

  it("mondayOf vrací pondělí i přes přelom roku", () => {
    expect(mondayOf("2026-10-18")).toBe("2026-10-12")
    expect(mondayOf("2026-10-12")).toBe("2026-10-12")
    expect(mondayOf("2027-01-01")).toBe("2026-12-28")
  })
})

describe("bookingConfigFromMetadata", () => {
  it("bere jen známé klíče, zónu kalendáře a ignoruje týdenní pravidla", () => {
    const c = bookingConfigFromMetadata({ durationMinutes: 45, bufferMinutes: 10, timezone: "America/New_York", rules: [{ weekday: 1 }] })
    expect(c).toEqual({ ...DEFAULT_BOOKING_CONFIG, durationMinutes: 45, bufferMinutes: 10, timezone: "Europe/Bratislava" })
  })
  it("neplatná délka = nerezervovatelné (null)", () => {
    for (const meta of [null, [], {}, { durationMinutes: 0 }, { durationMinutes: "60" }, { durationMinutes: 1.5 }]) expect(bookingConfigFromMetadata(meta)).toBeNull()
  })
  it("archivace", () => {
    expect(isArchivedBookingMeta({ archived: true })).toBe(true)
    expect(isArchivedBookingMeta({ archived: "true" })).toBe(false)
  })
})

describe("generateSlotsFromWindows", () => {
  const windows = [{ date: "2026-10-12", start_time: "09:00", end_time: "11:00" }]
  it("nevyplněný den nenabízí nic, vyplněný podle délky typu", () => {
    expect(generateSlotsFromWindows({ config, windows, fromDate: "2026-10-13", toDate: "2026-10-13", now: NOW })).toEqual([])
    const hour = generateSlotsFromWindows({ config, windows, fromDate: "2026-10-12", toDate: "2026-10-13", now: NOW })
    expect(hour.map((s) => s.start)).toEqual(["2026-10-12T07:00:00.000Z", "2026-10-12T07:30:00.000Z", "2026-10-12T08:00:00.000Z"])
    const half = generateSlotsFromWindows({ config: { ...config, durationMinutes: 30 }, windows, fromDate: "2026-10-12", toDate: "2026-10-12", now: NOW })
    expect(half).toHaveLength(4)
  })

  it("rezervace jiného typu blokuje včetně své vlastní pauzy i pauzy nového slotu", () => {
    const wide = [{ date: "2026-10-12", start_time: "09:00", end_time: "13:00" }]
    // jiný typ 10:00–10:30 s pauzou 30 min => obsazeno do 11:00
    const busy = [{ start: new Date("2026-10-12T08:00:00Z"), end: new Date("2026-10-12T08:30:00Z"), bufferMinutes: 30 }]
    const starts = generateSlotsFromWindows({ config: { ...config, durationMinutes: 30, bufferMinutes: 0 }, windows: wide, busy, fromDate: "2026-10-12", toDate: "2026-10-12", now: NOW }).map((s) => s.start.slice(11, 16))
    expect(starts).toEqual(["07:00", "07:30", "09:00", "09:30", "10:00", "10:30"])
    // 60min typ s pauzou 15: slot 09:00–10:00 + 15 min zasahuje do 10:00 => vyřazen
    const long = generateSlotsFromWindows({ config, windows: wide, busy, fromDate: "2026-10-12", toDate: "2026-10-12", now: NOW }).map((s) => s.start.slice(11, 16))
    expect(long).not.toContain("07:00")
    expect(long).toContain("09:00")
  })
})

describe("isWithinWindows", () => {
  const windows = [{ date: "2026-10-12", start_time: "09:00", end_time: "12:00" }]
  const tz = "Europe/Bratislava"
  it("celá konzultace musí ležet v jednom úseku téhož dne", () => {
    expect(isWithinWindows(new Date("2026-10-12T07:00:00Z"), new Date("2026-10-12T08:00:00Z"), windows, tz)).toBe(true)
    expect(isWithinWindows(new Date("2026-10-12T09:30:00Z"), new Date("2026-10-12T10:30:00Z"), windows, tz)).toBe(false)
    expect(isWithinWindows(new Date("2026-10-13T07:00:00Z"), new Date("2026-10-13T08:00:00Z"), windows, tz)).toBe(false)
    expect(isWithinWindows(new Date("2026-10-12T08:00:00Z"), new Date("2026-10-12T07:00:00Z"), windows, tz)).toBe(false)
  })
  it("zimní čas", () => {
    const winter = [{ date: "2026-12-07", start_time: "09:00", end_time: "10:00" }]
    expect(isWithinWindows(new Date("2026-12-07T08:00:00Z"), new Date("2026-12-07T09:00:00Z"), winter, tz)).toBe(true)
    expect(isWithinWindows(new Date("2026-12-07T07:00:00Z"), new Date("2026-12-07T08:00:00Z"), winter, tz)).toBe(false)
  })
})
