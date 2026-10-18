import { buildCatalog, completedCouponUses, parseInserts, type LegacyCoupon } from "../parse-legacy-db"
import { buildPromotionInput } from "../import-anastasia-catalog"

const schema = "CREATE TABLE [dbo].[ecQuote] (ignored int)\nCREATE TABLE [dbo].[ecProduct2Quote] (ignored int)\n"
const history = schema + [
  "INSERT [dbo].[ecQuote] ([pk], [dateFinished], [note]) VALUES ('o1', '2020-01-01', N'PRIVATE'), ('o2', NULL, N'PRIVATE'), ('o3', '2020-01-02', N'PRIVATE')",
  "INSERT [dbo].[ecProduct2Quote] ([pkQuote], [nonProductId], [itemName]) VALUES ('o1', 'SAVE', N'PRIVATE'), ('o2', 'SAVE', N'PRIVATE'), ('o3', 'SAVE', N'PRIVATE'), ('o1', NULL, N'PRIVATE')",
].join("\n")
const coupon: LegacyCoupon = {
  legacy_id: "c1", code: "SAVE", discount_percent: 10, discount_amount: 0,
  valid_from: null, valid_until: null, use_multiple: false,
  cart_min: 0, cart_max: 0, product_codes: ["SKU"], status_at_parse: "active", completed_uses: 2,
}
const plan = (patch: Partial<LegacyCoupon> = {}) => buildPromotionInput({ ...coupon, ...patch }, ["prod_1"], { identifier: "synthetic" })

describe("legacy coupon migration safety", () => {
  it("counts only discount rows in finished orders, retaining no order/customer data", () => {
    expect([...completedCouponUses(history)!]).toEqual([["SAVE", 2]])
    expect(JSON.stringify([...completedCouponUses(history)!])).not.toContain("PRIVATE")
    expect(parseInserts(history, ["ecQuote"], { ecQuote: ["pk", "dateFinished"] }).ecQuote[0]).toEqual({ pk: "o1", dateFinished: "2020-01-01" })
  })
  it("distinguishes missing history from a verified empty source table", () => {
    expect(completedCouponUses("")).toBeUndefined()
    expect(completedCouponUses(schema)).toEqual(new Map())
    expect(() => plan({ completed_uses: undefined })).toThrow("historie")
  })
  it("fails closed on duplicate, incomplete or orphaned history without exposing row contents", () => {
    expect(() => completedCouponUses(history + "\nINSERT [dbo].[ecQuote] ([pk], [dateFinished]) VALUES ('o1', NULL)")).toThrow("Duplicitní")
    expect(() => completedCouponUses(schema + "INSERT [dbo].[ecQuote] ([pk]) VALUES ('o1')")).toThrow("Neúplná")
    expect(() => completedCouponUses(schema + "INSERT [dbo].[ecProduct2Quote] ([pkQuote], [nonProductId]) VALUES ('missing', 'SAVE')")).toThrow("chybí objednávka")
    expect(() => completedCouponUses(schema + "INSERT [dbo].[ecQuote] ([pk], [dateFinished]) VALUES (PRIVATE, NULL)")).toThrow(/neplatný SQL řádek$/)
  })
  it("exports the counter beside coupon rules without order identifiers", () => {
    const sql = history + "\nINSERT [dbo].[ecCoupon] ([pk], [couponCode], [discountPerc]) VALUES ('c1', 'SAVE', 10)"
    const { catalog } = buildCatalog(sql, "synthetic.sql")
    expect(catalog.coupons[0].completed_uses).toBe(2)
    expect(catalog).not.toHaveProperty("orders")
    expect(JSON.stringify(catalog)).not.toContain("PRIVATE")
  })
  it("seeds consumed single-use coupons as drafts with native usage and the product restriction", () => {
    expect(plan()).toMatchObject({ status: "draft", used: 2, limit: 1,
      application_method: { type: "percentage", value: 10, target_rules: [{ attribute: "items.product.id", operator: "in", values: ["prod_1"] }] } })
    expect(plan({ use_multiple: true })).not.toHaveProperty("limit")
  })
  it("allocates a fixed discount once across the cart, never once per unit", () => {
    expect(plan({ discount_percent: 0, discount_amount: 10 })).toMatchObject({ application_method: { type: "fixed", allocation: "across", value: 10, currency_code: "eur" } })
  })
  it.each([{ discount_amount: 5 }, { cart_min: 50 }, { cart_max: 100 }])("refuses to silently discard unsupported legacy conditions: %j", patch => {
    expect(() => plan(patch)).toThrow("podmínky nelze zahodit")
  })
  it.each([NaN, Infinity, -1])("rejects invalid money and usage: %s", value => {
    expect(() => plan({ discount_amount: value })).toThrow("neplatné")
    expect(() => plan({ completed_uses: value })).toThrow("historie")
  })
  it("rejects fractional counters and percentages over 100", () => {
    expect(() => plan({ completed_uses: 0.5 })).toThrow("historie")
    expect(() => plan({ discount_percent: 101 })).toThrow("> 100")
  })
})
