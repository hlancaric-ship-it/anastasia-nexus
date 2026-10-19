jest.mock("../registry", () => ({
  ...jest.requireActual("../registry"),
  saveRecord: jest.fn(async (_scope, input, url) => ({ record: { id: "qrl_" + "a".repeat(64), url, sku: input.produkt }, created: false })),
}))
import { adminInput, buildCouponUrl, legacyQuantity, localQrRenderer } from "../links"
import { codeAvailable, validateLink } from "../validation"
import { POST as adminPost } from "../route"
import { POST as storePost } from "../../../store/coupon-links/route"

const input = { produkt: "KO.001", kupon: "TEST", ks: 1 }
const promotion = { id: "promo_test", code: "TEST", status: "active" as const }
function scope(options: { status?: string; channels?: string[]; promotions?: unknown[]; duplicate?: boolean } = {}) {
  const variant = { id: "variant_test", sku: "KO.001", product: { id: "product_test", status: options.status || "published", sales_channels: (options.channels || ["sc_test"]).map(id => ({ id })) } }
  const graph = jest.fn().mockResolvedValue({ data: options.duplicate ? [variant, variant] : [variant] })
  const listPromotions = jest.fn().mockResolvedValue(options.promotions || [promotion])
  return { resolve: jest.fn(key => key === "query" ? { graph } : { listPromotions }) } as any
}
function response() {
  return { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as any
}

describe("coupon links", () => {
  it("retains the exact legacy path and parameter names", () => {
    expect(buildCouponUrl("https://shop.example", input)).toBe("https://shop.example/eshop/kosik?produkt=KO.001&kupon=TEST&ks=1")
  })
  it("round trips punctuation and Unicode without injecting parameters", () => {
    const value = "Ž +&=?/#"
    const url = new URL(buildCouponUrl("https://shop.example", { ...input, kupon: value }))
    expect(url.searchParams.get("kupon")).toBe(value)
    expect([...url.searchParams.keys()]).toEqual(["produkt", "kupon", "ks"])
  })
  it.each(["http://shop.example", "https://evil@shop.example", "https://shop.example/path", "https://shop.example/?x=1", "https://shop.example/#x", "javascript:alert(1)"])("rejects unsafe origin %s", origin => {
    expect(() => buildCouponUrl(origin, input)).toThrow()
  })
  it.each([0, -1, 1000, 1.5, NaN])("rejects generated quantity %s", ks => {
    expect(adminInput.safeParse({ ...input, ks }).success).toBe(false)
  })
  it.each(["", " ", "x\ny", "a".repeat(129)])("rejects invalid code", kupon => {
    expect(adminInput.safeParse({ ...input, kupon }).success).toBe(false)
  })
  it("rejects client price, tenant and extra fields", () => {
    expect(adminInput.safeParse({ ...input, price: 0, tenantId: "other" }).success).toBe(false)
  })
  it.each([[undefined, 1], ["foo", 1], ["-1", 1], ["1.5", 1], ["+2", 2], [" 3 ", 3], ["1000", 999], ["2147483648", 1]])("legacy quantity %s", (value, expected) => {
    expect(legacyQuantity(value as string | undefined)).toBe(expected)
  })
  it("renders real SVG and PNG locally", async () => {
    const url = buildCouponUrl("https://shop.example", input)
    const svg = await localQrRenderer.render(url, "svg")
    expect(svg.mime_type).toBe("image/svg+xml")
    expect(Buffer.from(svg.base64, "base64").toString()).toContain("<svg")
    const png = await localQrRenderer.render(url, "png")
    expect(png.mime_type).toBe("image/png")
    expect(Buffer.from(png.base64, "base64").subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
  }, 30000)
  it("checks status, exact code, limits and campaign interval", () => {
    expect(codeAvailable(promotion, "TEST")).toBe(true)
    expect(codeAvailable(promotion, "test")).toBe(false)
    expect(codeAvailable(undefined, "TEST")).toBe(false)
    for (const override of [{ status: "inactive" }, { status: "draft" }, { is_automatic: true }, { limit: 0 }, { limit: 1, used: 1 }, { campaign_id: "missing" }]) {
      expect(codeAvailable({ ...promotion, ...override } as any, "TEST")).toBe(false)
    }
    const campaign = { id: "campaign", starts_at: new Date(1000), ends_at: new Date(2000) }
    expect(codeAvailable({ ...promotion, campaign }, "TEST", 999)).toBe(false)
    expect(codeAvailable({ ...promotion, campaign }, "TEST", 1000)).toBe(true)
    expect(codeAvailable({ ...promotion, campaign }, "TEST", 2000)).toBe(false)
    expect(codeAvailable({ ...promotion, campaign: { ...campaign, ends_at: new Date(NaN) } }, "TEST")).toBe(false)
  })
  it("resolves only a unique published SKU in the caller's channel", async () => {
    expect(await validateLink(scope(), input, ["sc_test"])).toEqual({ variant_id: "variant_test", product_id: "product_test" })
    for (const options of [{ status: "draft" }, { channels: ["other"] }, { duplicate: true }, { promotions: [] }]) {
      expect(await validateLink(scope(options), input, ["sc_test"])).toBeNull()
    }
  })
  it("requires an admin even without middleware registration", async () => {
    const res = response()
    await adminPost({ body: input } as any, res)
    expect(res.status).toHaveBeenCalledWith(401)
  })
  it("requires store channel context", async () => {
    const res = response()
    await storePost({ body: input } as any, res)
    expect(res.status).toHaveBeenCalledWith(401)
  })
  it("never advertises a discount or cart mutation from preflight", async () => {
    const res = response()
    await storePost({ body: input, scope: scope(), publishable_key_context: { sales_channel_ids: ["sc_test"] } } as any, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code_valid: true, discount_applied: false, activation_status: "PENDING_PRICING_INTEGRATION", destination: "/kosik" }))
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
  })
  it("fails closed on backend outage", async () => {
    const res = response()
    await storePost({ body: input, scope: { resolve: () => { throw new Error("private detail") } }, publishable_key_context: { sales_channel_ids: ["sc_test"] } } as any, res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("private detail")
  })
})

describe("admin generation", () => {
  const previous = process.env.COUPON_LINK_STOREFRONT_ORIGIN
  afterEach(() => {
    if (previous === undefined) delete process.env.COUPON_LINK_STOREFRONT_ORIGIN
    else process.env.COUPON_LINK_STOREFRONT_ORIGIN = previous
  })
  it("returns a locally generated QR for an authenticated admin", async () => {
    process.env.COUPON_LINK_STOREFRONT_ORIGIN = "https://shop.example"
    const res = response()
    await adminPost({ body: { ...input, format: "png" }, scope: scope(), auth_context: { actor_id: "user_test", actor_type: "user" } } as any, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ url: "https://shop.example/eshop/kosik?produkt=KO.001&kupon=TEST&ks=1", qr: expect.objectContaining({ mime_type: "image/png" }) }))
  }, 30000)
  it("fails closed without a configured origin", async () => {
    delete process.env.COUPON_LINK_STOREFRONT_ORIGIN
    const res = response()
    await adminPost({ body: input, scope: scope(), auth_context: { actor_id: "user_test", actor_type: "user" } } as any, res)
    expect(res.status).toHaveBeenCalledWith(503)
  })
  it("does not accept customer auth on the admin route", async () => {
    const res = response()
    await adminPost({ body: input, auth_context: { actor_id: "customer_test", actor_type: "customer" } } as any, res)
    expect(res.status).toHaveBeenCalledWith(401)
  })
})

describe('legacy QR product resolution',()=>{
 it('returns the channel-visible variant even when the old coupon is unavailable',async()=>{
  const res=response()
  await storePost({body:{...input,ks:'10000'},scope:scope({promotions:[{...promotion,status:'inactive'}]}),publishable_key_context:{sales_channel_ids:['sc_test']}} as any,res)
  expect(res.status).toHaveBeenCalledWith(422)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({variant_id:'variant_test',quantity:999,code_valid:false,discount_applied:false}))
 })
 it('resolves old product-only links without granting a discount',async()=>{
  const res=response()
  await storePost({body:{produkt:input.produkt,ks:'bad'},scope:scope(),publishable_key_context:{sales_channel_ids:['sc_test']}} as any,res)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({variant_id:'variant_test',quantity:1,code_valid:false,discount_applied:false}))
 })
 it('never accepts a client-supplied price during resolution',async()=>{
  const res=response()
  await storePost({body:{...input,price:0},scope:scope(),publishable_key_context:{sales_channel_ids:['sc_test']}} as any,res)
  expect(res.status).toHaveBeenCalledWith(400)
 })
})
