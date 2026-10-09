import { DEFAULT_BOOKING_CONFIG, generateSlots, isOfferedSlot, zonedToUtc } from "../slots"

const NOW = new Date("2026-10-01T08:00:00Z")
const monday = [{ weekday: 1, start_time: "09:00", end_time: "12:00" }]
const base = { config: { ...DEFAULT_BOOKING_CONFIG, minNoticeHours: 0 }, rules: monday, now: NOW }

describe("booking slots", () => {
  it("zonedToUtc respektuje letní/zimní čas", () => {
    expect(zonedToUtc("2026-07-01", 9 * 60, "Europe/Bratislava")?.toISOString()).toBe("2026-07-01T07:00:00.000Z")
    expect(zonedToUtc("2026-12-01", 9 * 60, "Europe/Bratislava")?.toISOString()).toBe("2026-12-01T08:00:00.000Z")
    // 2026-03-29 02:30 neexistuje (jarní posun)
    expect(zonedToUtc("2026-03-29", 2 * 60 + 30, "Europe/Bratislava")).toBeNull()
  })

  it("generuje sloty z týdenních pravidel (pondělí 9-12, 60 min, krok 30)", () => {
    const slots = generateSlots({ ...base, fromDate: "2026-10-05", toDate: "2026-10-05" }) // pondělí
    expect(slots.map((s) => s.start)).toEqual([
      "2026-10-05T07:00:00.000Z", "2026-10-05T07:30:00.000Z", "2026-10-05T08:00:00.000Z",
      "2026-10-05T08:30:00.000Z", "2026-10-05T09:00:00.000Z",
    ])
  })

  it("jiné dny bez pravidla nemají sloty, výjimka zavře den nebo nahradí hodiny", () => {
    expect(generateSlots({ ...base, fromDate: "2026-10-06", toDate: "2026-10-06" })).toHaveLength(0)
    expect(generateSlots({ ...base, fromDate: "2026-10-05", toDate: "2026-10-05", exceptions: [{ date: "2026-10-05", closed: true }] })).toHaveLength(0)
    const custom = generateSlots({
      ...base, fromDate: "2026-10-06", toDate: "2026-10-06",
      exceptions: [{ date: "2026-10-06", closed: false, ranges: [{ start_time: "14:00", end_time: "15:00" }] }],
    })
    expect(custom).toHaveLength(1)
  })

  it("existující rezervace blokuje překryv včetně pauzy", () => {
    const busy = [{ start: new Date("2026-10-05T07:00:00Z"), end: new Date("2026-10-05T08:00:00Z") }]
    const starts = generateSlots({ ...base, fromDate: "2026-10-05", toDate: "2026-10-05", busy }).map((s) => s.start)
    // 08:00 spadá do pauzy 15 min, 08:30 už je volné
    expect(starts).not.toContain("2026-10-05T07:00:00.000Z")
    expect(starts).not.toContain("2026-10-05T07:30:00.000Z")
    expect(starts).not.toContain("2026-10-05T08:00:00.000Z")
    expect(starts).toContain("2026-10-05T08:30:00.000Z")
  })

  it("minimální předstih a maximální horizont", () => {
    const withNotice = generateSlots({ ...base, config: { ...base.config, minNoticeHours: 24 }, now: new Date("2026-10-05T06:00:00Z"), fromDate: "2026-10-05", toDate: "2026-10-05" })
    expect(withNotice).toHaveLength(0)
    const far = generateSlots({ ...base, config: { ...base.config, maxAdvanceDays: 7 }, fromDate: "2026-12-07", toDate: "2026-12-07" })
    expect(far).toHaveLength(0)
  })

  it("isOfferedSlot nepustí cizí čas", () => {
    const slots = generateSlots({ ...base, fromDate: "2026-10-05", toDate: "2026-10-05" })
    expect(isOfferedSlot(slots, "2026-10-05T07:00:00Z")).not.toBeNull()
    expect(isOfferedSlot(slots, "2026-10-05T07:10:00Z")).toBeNull()
    expect(isOfferedSlot(slots, "nesmysl")).toBeNull()
  })
})
