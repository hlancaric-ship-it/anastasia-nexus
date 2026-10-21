import { randomBytes } from "node:crypto"
import {
  addMonths, assertUsable, CODE_ALPHABET, computeEligibleMinor, computeRedemption, DEFAULT_SETTINGS, formatEur, generateVoucherCode,
  isExpired, isGiftVoucherProduct, maskVoucherCode, normalizeVoucherCode, parseRecipient, parseSettingsInput, plannedCreditMinor,
  publicCodeError, settingsFromRow, statusAfterCredit, toMinor, toMinorFloor, validateRecipients, variantAmountMinor,
} from "../policy"

const valid = { values: [50, 100, 200], validity_months: 12, scope_type: "all", category_ids: [], partial_redemption: true, delivery_method: "both" }

describe("nastavení poukazu", () => {
  it("výchozí hodnoty odpovídají zadání (50/100/200 €, 12 měsíců, vše, částečné čerpání)", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ enabled: true, values_minor: [5000, 10000, 20000], validity_months: 12, scope_type: "all", partial_redemption: true })
    expect(settingsFromRow(null).values_minor).toEqual([5000, 10000, 20000])
  })
  it("převede eura na centy a seřadí", () => {
    const result = parseSettingsInput({ ...valid, values: ["25,50", 100, 10] })
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ values_minor: [1000, 2550, 10000], enabled: true }) })
  })
  it.each([
    [{ values: [] }, "values"], [{ values: [0.5] }, "values"], [{ values: [10.123] }, "values"], [{ values: [50, 50] }, "values"],
    [{ values: ["abc"] }, "values"], [{ values: Array.from({ length: 11 }, (_, i) => i + 10) }, "values"], [{ values: [10_001] }, "values"],
    [{ validity_months: 0 }, "validity_months"], [{ validity_months: 61 }, "validity_months"], [{ validity_months: 1.5 }, "validity_months"],
    [{ scope_type: "products" }, "scope_type"], [{ scope_type: "categories", category_ids: [] }, "category_ids"],
    [{ category_ids: ["bad id!"] }, "category_ids"], [{ partial_redemption: "yes" }, "partial_redemption"],
    [{ delivery_method: "sms" }, "delivery_method"], [{ enabled: 1 }, "enabled"],
  ])("odmítne neplatný vstup %j", (patch, field) => {
    const result = parseSettingsInput({ ...valid, ...patch })
    expect(result.ok).toBe(false)
    expect((result as any).errors).toContain(field)
  })
  it("kategorie se uloží jen pro rozsah kategorie", () => {
    expect((parseSettingsInput({ ...valid, category_ids: ["pcat_a"] }) as any).value.category_ids).toEqual([])
    expect((parseSettingsInput({ ...valid, scope_type: "categories", category_ids: ["pcat_a", "pcat_a"] }) as any).value.category_ids).toEqual(["pcat_a"])
  })
  it("poškozený řádek v DB vypne prodej místo pádu", () => {
    expect(settingsFromRow({ values_minor: "x", validity_months: 0 })).toMatchObject({ enabled: false })
    expect(settingsFromRow({ values_minor: [3000], validity_months: 6, scope_type: "all", category_ids: [], partial_redemption: false, delivery_method: "buyer_pdf", enabled: true }))
      .toMatchObject({ values_minor: [3000], validity_months: 6, partial_redemption: false, delivery_method: "buyer_pdf" })
  })
})

describe("kódy poukazů", () => {
  it("kryptografický kód má formát GV-XXXX-XXXX-XXXX-XXXX z bezpečné abecedy", () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateVoucherCode((n) => randomBytes(n))))
    expect(codes.size).toBe(2000)
    for (const code of codes) {
      expect(code).toMatch(/^GV-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
      expect(code).not.toMatch(/[01OI]/)
    }
    expect(CODE_ALPHABET).toHaveLength(32)
  })
  it("odmítne krátký zdroj náhody", () => {
    expect(() => generateVoucherCode(() => new Uint8Array(4))).toThrow("GIFT_VOUCHER_RANDOM_FAILED")
  })
  it("normalizuje vstup zákazníka a odmítne neplatný tvar", () => {
    expect(normalizeVoucherCode(" gv-abcd efgh-jkmn-pqrs ")).toBe("GV-ABCD-EFGH-JKMN-PQRS")
    expect(normalizeVoucherCode("GVABCDEFGHJKMNPQRS")).toBe("GV-ABCD-EFGH-JKMN-PQRS")
    for (const bad of ["", "GV-ABCD", "GV-ABCD-EFGH-JKMN-PQR0", "XX-ABCD-EFGH-JKMN-PQRS", 42, null, "G".repeat(65)]) expect(normalizeVoucherCode(bad)).toBeNull()
  })
  it("maskuje vše kromě posledních 4 znaků", () => {
    expect(maskVoucherCode("GV-ABCD-EFGH-JKMN-PQRS")).toBe("GV-****-****-****-PQRS")
  })
  it("neodlišuje neexistující a zneplatněný kód", () => {
    expect(publicCodeError("GIFT_VOUCHER_VOID")).toBe("GIFT_VOUCHER_INVALID")
    expect(publicCodeError("GIFT_VOUCHER_EXPIRED")).toBe("GIFT_VOUCHER_EXPIRED")
  })
})

describe("peníze a platnost", () => {
  it("převody částek", () => {
    expect(toMinor(50)).toBe(5000)
    expect(toMinor("12.345")).toBe(1235)
    expect(toMinor({ numeric: 0.1 + 0.2 })).toBe(30)
    expect(toMinor("x")).toBeNaN()
    expect(toMinorFloor(12.349)).toBe(1234)
    expect(toMinorFloor(0.3)).toBe(30)
    expect(formatEur(5000)).toBe("50 €")
    expect(formatEur(2550)).toBe("25,50 €")
  })
  it("platnost v kalendářních měsících (31. 1. + 1 = konec února)", () => {
    expect(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z")
    expect(addMonths(new Date("2026-10-14T00:00:00Z"), 12).toISOString()).toBe("2027-10-14T00:00:00.000Z")
  })
  it("expirace: okamžik konce platnosti už neplatí", () => {
    const voucher = { status: "active", currency_code: "eur", balance: 1000, expires_at: new Date("2027-10-14T00:00:00Z") }
    expect(isExpired(voucher, new Date("2027-10-13T23:59:59Z"))).toBe(false)
    expect(isExpired(voucher, new Date("2027-10-14T00:00:00Z"))).toBe(true)
    expect(() => assertUsable(voucher, new Date("2027-10-13T00:00:00Z"))).not.toThrow()
    expect(() => assertUsable(voucher, new Date("2027-10-14T00:00:00Z"))).toThrow("GIFT_VOUCHER_EXPIRED")
  })
  it.each([
    [{ status: "void" }, "GIFT_VOUCHER_VOID"], [{ status: "expired" }, "GIFT_VOUCHER_EXPIRED"], [{ status: "depleted", balance: 0 }, "GIFT_VOUCHER_DEPLETED"],
    [{ balance: 0 }, "GIFT_VOUCHER_DEPLETED"], [{ currency_code: "czk" }, "GIFT_VOUCHER_CURRENCY_MISMATCH"],
  ])("nepoužitelný poukaz %j", (patch, code) => {
    const voucher = { status: "active", currency_code: "eur", balance: 1000, expires_at: "2099-01-01T00:00:00Z", ...patch }
    expect(() => assertUsable(voucher)).toThrow(code)
  })
  it("stav po vrácení: zneplatněný zůstává, prošlý zůstává prošlý", () => {
    expect(statusAfterCredit({ status: "void", expires_at: "2099-01-01" }, 500)).toBe("void")
    expect(statusAfterCredit({ status: "depleted", expires_at: "2000-01-01" }, 500)).toBe("expired")
    expect(statusAfterCredit({ status: "depleted", expires_at: "2099-01-01" }, 500)).toBe("active")
  })
})

describe("obdarovaní", () => {
  const opts = { today: "2026-10-14", validityMonths: 12 }
  const ok = { name: " Jana ", email: "Jana@Example.TEST", message: "Všetko najlepšie", delivery_date: "2026-12-24" }
  it("ověří a normalizuje obdarovaného", () => {
    expect(parseRecipient(ok, opts)).toEqual({ ok: true, value: { name: "Jana", email: "jana@example.test", message: "Všetko najlepšie", delivery_date: "2026-12-24" } })
    expect(parseRecipient({ ...ok, delivery_date: "" }, opts)).toMatchObject({ value: { delivery_date: "2026-10-14" } })
  })
  it.each([
    [{ name: "" }, "GIFT_VOUCHER_RECIPIENT_NAME_INVALID"], [{ name: "x".repeat(121) }, "GIFT_VOUCHER_RECIPIENT_NAME_INVALID"],
    [{ email: "nope" }, "GIFT_VOUCHER_RECIPIENT_EMAIL_INVALID"], [{ email: "a@b.c<script>" }, "GIFT_VOUCHER_RECIPIENT_EMAIL_INVALID"],
    [{ message: "x".repeat(301) }, "GIFT_VOUCHER_MESSAGE_INVALID"], [{ message: 5 }, "GIFT_VOUCHER_MESSAGE_INVALID"],
    [{ message: "a\u0000b" }, "GIFT_VOUCHER_MESSAGE_INVALID"],
    [{ delivery_date: "2026-10-13" }, "GIFT_VOUCHER_DELIVERY_DATE_INVALID"], [{ delivery_date: "2027-10-14" }, "GIFT_VOUCHER_DELIVERY_DATE_INVALID"],
    [{ delivery_date: "2026-02-30" }, "GIFT_VOUCHER_DELIVERY_DATE_INVALID"], [{ delivery_date: "zajtra" }, "GIFT_VOUCHER_DELIVERY_DATE_INVALID"],
  ])("odmítne %j", (patch, error) => {
    expect(parseRecipient({ ...ok, ...patch }, opts)).toEqual({ ok: false, error })
  })
  it("venování přesně 300 znaků (včetně diakritiky) projde", () => {
    expect(parseRecipient({ ...ok, message: "č".repeat(300) }, opts).ok).toBe(true)
  })
  it("počet obdarovaných odpovídá kusům poukazů, když se posílá obdarovanému", () => {
    const lines = [{ variant_id: "v50", quantity: 2 }]
    const base = { lines, today: opts.today, validityMonths: 12 }
    expect(validateRecipients({ ...base, method: "recipient_email", recipients: { v50: [ok] } })).toEqual({ ok: false, error: "GIFT_VOUCHER_RECIPIENT_REQUIRED" })
    expect(validateRecipients({ ...base, method: "both", recipients: { v50: [ok, ok] } }).ok).toBe(true)
    expect(validateRecipients({ ...base, method: "both", recipients: { v50: [ok, ok, ok] } })).toEqual({ ok: false, error: "GIFT_VOUCHER_RECIPIENT_COUNT_MISMATCH" })
    expect(validateRecipients({ ...base, method: "both", recipients: { cizi: [ok] } })).toEqual({ ok: false, error: "GIFT_VOUCHER_RECIPIENT_COUNT_MISMATCH" })
    expect(validateRecipients({ ...base, method: "both", recipients: [] })).toEqual({ ok: false, error: "GIFT_VOUCHER_RECIPIENT_INVALID" })
    expect(validateRecipients({ ...base, method: "buyer_pdf", recipients: undefined })).toEqual({ ok: true, value: {} })
  })
})

describe("rozsah a čerpání", () => {
  const items = [
    { is_gift_voucher: false, category_ids: ["pcat_a"], total_minor: 3000 },
    { is_gift_voucher: false, category_ids: ["pcat_b"], total_minor: 2000 },
    { is_gift_voucher: true, category_ids: ["pcat_a"], total_minor: 10000 },
  ]
  it("poukaz nikdy neplatí jiný poukaz; rozsah vše zahrnuje dopravu", () => {
    expect(computeEligibleMinor({ items, shipping_minor: 500, scope: { type: "all", category_ids: [] } })).toBe(5500)
  })
  it("rozsah kategorie: jen vybrané kategorie, bez dopravy", () => {
    expect(computeEligibleMinor({ items, shipping_minor: 500, scope: { type: "categories", category_ids: ["pcat_a"] } })).toBe(3000)
    expect(computeEligibleMinor({ items, shipping_minor: 500, scope: { type: "categories", category_ids: ["pcat_x"] } })).toBe(0)
  })
  it("košík jen s poukazy nemá co uhradit", () => {
    expect(computeEligibleMinor({ items: [items[2]], shipping_minor: 0, scope: { type: "all", category_ids: [] } })).toBe(0)
  })
  it("neplatné částky v košíku selžou", () => {
    expect(() => computeEligibleMinor({ items: [{ ...items[0], total_minor: -1 }], shipping_minor: 0, scope: { type: "all", category_ids: [] } })).toThrow("GIFT_VOUCHER_CART_INVALID")
    expect(() => computeEligibleMinor({ items: [], shipping_minor: NaN, scope: { type: "all", category_ids: [] } })).toThrow("GIFT_VOUCHER_CART_INVALID")
  })
  it("částečné čerpání: zůstatek klesne, nikdy pod nulu", () => {
    expect(plannedCreditMinor(5000, 3000)).toBe(3000)
    expect(plannedCreditMinor(5000, 8000)).toBe(5000)
    expect(computeRedemption({ balance: 5000, requested: 3000, eligible: 3000, partial: true })).toEqual({ amount: 3000, forfeited: 0, balance_after: 2000 })
    expect(() => computeRedemption({ balance: 5000, requested: 5001, eligible: 9000, partial: true })).toThrow("GIFT_VOUCHER_BALANCE_INSUFFICIENT")
    expect(() => computeRedemption({ balance: 5000, requested: 3001, eligible: 3000, partial: true })).toThrow("GIFT_VOUCHER_AMOUNT_CHANGED")
    expect(() => computeRedemption({ balance: 5000, requested: 0, eligible: 3000, partial: true })).toThrow("GIFT_VOUCHER_AMOUNT_INVALID")
    expect(() => computeRedemption({ balance: 5000, requested: 10.5, eligible: 3000, partial: true })).toThrow("GIFT_VOUCHER_AMOUNT_INVALID")
  })
  it("jednorázové čerpání: zbytek propadne a musí se čerpat maximum", () => {
    expect(computeRedemption({ balance: 5000, requested: 3000, eligible: 3000, partial: false })).toEqual({ amount: 3000, forfeited: 2000, balance_after: 0 })
    expect(() => computeRedemption({ balance: 5000, requested: 2000, eligible: 3000, partial: false })).toThrow("GIFT_VOUCHER_AMOUNT_CHANGED")
  })
  it("souběh: dvě čerpání nad stejným zůstatkem – po serializaci zámkem druhé neprojde", () => {
    // Služba počítá pod FOR UPDATE zámkem; druhá transakce vidí už snížený zůstatek.
    let balance = 5000
    const first = computeRedemption({ balance, requested: 4000, eligible: 4000, partial: true })
    balance = first.balance_after
    expect(() => computeRedemption({ balance, requested: 4000, eligible: 4000, partial: true })).toThrow("GIFT_VOUCHER_BALANCE_INSUFFICIENT")
    expect(balance).toBe(1000)
  })
  it("rozpozná poukazový produkt a hodnotu varianty", () => {
    expect(isGiftVoucherProduct({ metadata: { gift_voucher: true } })).toBe(true)
    expect(isGiftVoucherProduct({ metadata: { gift_voucher: "1" } })).toBe(false)
    expect(variantAmountMinor({ metadata: { gift_voucher_amount_minor: 5000 } })).toBe(5000)
    expect(variantAmountMinor({ metadata: { gift_voucher_amount_minor: -1 } })).toBeNaN()
  })
})
