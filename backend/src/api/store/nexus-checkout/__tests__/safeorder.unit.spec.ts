import { assertSafeOrderAllows, resolveSafeOrderUrl, SafeOrderError } from "../safeorder"

const env = { NEXUS_PRICING_URL: "https://n.example/api/nexus/pricing", NEXUS_PRICING_API_KEY: "k", NEXUS_TENANT_ID: "anastasia" }
const input = { orderSum: 38, paymentMethod: "pp_stripe_stripe", customerEmail: "a@b.sk" }
const reply = (body: unknown, ok = true) => (async () => ({ ok, json: async () => ({ tenantId: "anastasia", currency: "eur", orderSum: input.orderSum, factors: [], ...(body as any) }) })) as any

const code = async (p: Promise<unknown>) => { try { await p; return "OK" } catch (e) { return (e as SafeOrderError).code } }

describe("assertSafeOrderAllows (fail-closed)", () => {
  it("odvodí URL z pricing URL", () => {
    expect(resolveSafeOrderUrl(env)).toBe("https://n.example/api/nexus/safeorder")
  })
  it("ALLOW projde", async () => {
    await expect(assertSafeOrderAllows(input, env, reply({ ok: true, score: 0, decision: "ALLOW", factors: [] }))).resolves.toMatchObject({ score: 0 })
  })
  it("BLOCK a REVIEW zastaví", async () => {
    expect(await code(assertSafeOrderAllows(input, env, reply({ ok: true, score: 90, decision: "BLOCK" })))).toBe("SAFEORDER_BLOCKED")
    expect(await code(assertSafeOrderAllows(input, env, reply({ ok: true, score: 50, decision: "REVIEW" })))).toBe("SAFEORDER_REVIEW_REQUIRED")
  })
  it("chyba sítě, HTTP chyba, neplatná odpověď a neznámé rozhodnutí zastaví", async () => {
    expect(await code(assertSafeOrderAllows(input, env, (async () => { throw new Error("net") }) as any))).toBe("SAFEORDER_UNAVAILABLE")
    expect(await code(assertSafeOrderAllows(input, env, reply({}, false)))).toBe("SAFEORDER_UNAVAILABLE")
    expect(await code(assertSafeOrderAllows(input, env, reply({ ok: true, score: 1, decision: "MAYBE" })))).toBe("SAFEORDER_UNAVAILABLE")
    expect(await code(assertSafeOrderAllows(input, env, reply({ ok: true, decision: "ALLOW" })))).toBe("SAFEORDER_UNAVAILABLE")
  })
  it("bez konfigurace zastaví", async () => {
    expect(await code(assertSafeOrderAllows(input, {}, reply({})))).toBe("SAFEORDER_NOT_CONFIGURED")
  })
  it("rejects malformed ALLOW and mismatched tenant/amount/currency", async () => {
    for (const overrides of [{ score: null }, { score: "0" }, { score: -1 }, { score: 101 }, { score: 70 }, { tenantId: "other" }, { orderSum: 1 }, { currency: "czk" }, { factors: [123] }]) {
      expect(await code(assertSafeOrderAllows(input, env, reply({ ok: true, decision: "ALLOW", score: 0, ...overrides })))).toBe("SAFEORDER_UNAVAILABLE")
    }
  })
  it("sends only trusted input with service identity and refuses credential redirects", async () => {
    const fetcher = jest.fn(reply({ ok: true, decision: "ALLOW", score: 0 }))
    await assertSafeOrderAllows(input, env, fetcher as typeof fetch)
    const [url, options] = fetcher.mock.calls[0] as any
    expect(url).toBe("https://n.example/api/nexus/safeorder")
    expect(options.headers.authorization).toBe("Bearer k")
    expect(options.redirect).toBe("error")
    expect(JSON.parse(options.body)).toEqual({ ...input, tenantId: "anastasia", currency: "eur" })
  })

  it("rejects unsafe endpoints before sending the credential", async () => {
    const fetcher = jest.fn()
    for (const url of ["http://remote.example/api/nexus/safeorder", "https://user:pass@n.example/api/nexus/safeorder", "not-a-url", "file:///tmp/service"]) {
      expect(await code(assertSafeOrderAllows(input, { ...env, NEXUS_SAFEORDER_URL: url }, fetcher))).toBe("SAFEORDER_NOT_CONFIGURED")
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

})
