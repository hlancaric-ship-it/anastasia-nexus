import { clampHoldMinutes, isHoldExpired } from "../policy"

describe("booking policy", () => {
  it("hold vyprší jen ve stavu held a po held_until", () => {
    const now = new Date("2026-10-09T12:00:00Z")
    expect(isHoldExpired({ status: "held", held_until: "2026-10-09T11:59:00Z" }, now)).toBe(true)
    expect(isHoldExpired({ status: "held", held_until: "2026-10-09T12:01:00Z" }, now)).toBe(false)
    expect(isHoldExpired({ status: "held", held_until: null }, now)).toBe(false)
    expect(isHoldExpired({ status: "confirmed", held_until: "2026-10-09T11:59:00Z" }, now)).toBe(false)
  })
  it("clampHoldMinutes omezuje rozsah", () => {
    expect(clampHoldMinutes(undefined)).toBe(15)
    expect(clampHoldMinutes(0)).toBe(1)
    expect(clampHoldMinutes(999)).toBe(60)
  })
})
