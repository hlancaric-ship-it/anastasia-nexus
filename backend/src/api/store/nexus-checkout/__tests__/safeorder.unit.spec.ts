import { assertSafeOrderAllows, resolveSafeOrderUrl, SafeOrderError } from "../safeorder"

const env = { NEXUS_PRICING_URL: "https://n.example/api/nexus/pricing", NEXUS_PRICING_API_KEY: "k" }
const input = { orderSum: 38, paymentMethod: "pp_stripe_stripe", customerEmail: "a@b.sk" }
const reply = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as any

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
})
