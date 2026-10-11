import { generateToken, isValidMagicLinkAttempt, normalizeEmail, sha256Hex, stateKey, timingSafeEqualHex } from "../policy"

describe("auth-magic-link policy", () => {
  it("normalizeEmail ořízne, zmenší a odmítne neplatné", () => {
    expect(normalizeEmail(" A@B.sk ")).toBe("a@b.sk")
    expect(normalizeEmail("spatne")).toBeNull()
    expect(normalizeEmail(123)).toBeNull()
    expect(normalizeEmail("a@" + "b".repeat(260) + ".sk")).toBeNull()
  })
  it("token je náhodný a dost dlouhý", () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThan(30)
  })
  it("timingSafeEqualHex porovná jen platné hex stejné délky", () => {
    const h = sha256Hex("x")
    expect(timingSafeEqualHex(h, h)).toBe(true)
    expect(timingSafeEqualHex(h, sha256Hex("y"))).toBe(false)
    expect(timingSafeEqualHex("zz", "zz")).toBe(false)
    expect(timingSafeEqualHex(h, h.slice(0, -2))).toBe(false)
  })
  it("stateKey je stabilní pro stejný e-mail", () => {
    expect(stateKey("a@b.sk")).toBe(stateKey("a@b.sk"))
    expect(stateKey("a@b.sk")).not.toBe(stateKey("c@b.sk"))
  })
  it("isValidMagicLinkAttempt: správný token projde, špatný/cizí e-mail/chybějící stav neprojde", () => {
    const token = generateToken()
    const state = { email: "a@b.sk", tokenHash: sha256Hex(token) }
    expect(isValidMagicLinkAttempt(state, "a@b.sk", token)).toBe(true)
    expect(isValidMagicLinkAttempt(state, "a@b.sk", "jiny-token")).toBe(false)
    expect(isValidMagicLinkAttempt(state, "jiny@b.sk", token)).toBe(false)
    expect(isValidMagicLinkAttempt(null, "a@b.sk", token)).toBe(false)
    expect(isValidMagicLinkAttempt(state, "a@b.sk", "")).toBe(false)
  })
})
