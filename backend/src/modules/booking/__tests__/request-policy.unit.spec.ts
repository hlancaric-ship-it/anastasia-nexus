import { hashRequestToken, isRequestableStart, isRequestToken, newRequestToken, parseBookingRequest } from "../request-policy"

const TZ = "Europe/Bratislava"
const NOW = new Date("2026-10-25T10:00:00Z")
const base = { product_id: "prod_01M5DC46V2CTMZSH3XMMV5E93Q", starts_at: "2026-10-28T09:00:00.000Z", name: "Jana Nováková", email: "Jana@Example.com", consent: true, website: "" }

describe("žiadosť o termín", () => {
  it("prijme platnú žiadosť a normalizuje e-mail", () => {
    const out = parseBookingRequest(base, 60, TZ, NOW)
    expect(out.ok).toBe(true)
    if (out.ok === true) expect(out.value.email).toBe("jana@example.com")
  })
  it("robot dostane spam bez chýb", () => expect(parseBookingRequest({ ...base, website: "x" }, 60, TZ, NOW).ok).toBe("spam"))
  it("vyžaduje súhlas a meno", () => {
    const out = parseBookingRequest({ ...base, consent: false, name: "" }, 60, TZ, NOW)
    expect(out.ok === false && out.errors).toEqual(["name", "consent"])
  })
  it("termín aspoň 24 h vopred, v 15 min krokoch, 7:00–20:00 miestneho času", () => {
    expect(isRequestableStart(new Date("2026-10-26T08:00:00Z"), 60, TZ, NOW)).toBe(false)
    expect(isRequestableStart(new Date("2026-10-28T09:10:00Z"), 60, TZ, NOW)).toBe(false)
    expect(isRequestableStart(new Date("2026-10-28T05:00:00Z"), 60, TZ, NOW)).toBe(false)
    expect(isRequestableStart(new Date("2026-10-28T18:30:00Z"), 60, TZ, NOW)).toBe(false)
    expect(isRequestableStart(new Date("2026-10-28T18:00:00Z"), 60, TZ, NOW)).toBe(true)
    expect(isRequestableStart(new Date("2027-06-01T09:00:00Z"), 60, TZ, NOW)).toBe(false)
  })
  it("token je náhodný a ukladá sa len hash", () => {
    const t = newRequestToken()
    expect(isRequestToken(t)).toBe(true)
    expect(t).not.toBe(newRequestToken())
    expect(hashRequestToken(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(isRequestToken("short")).toBe(false)
  })
})
