import { abuseGuardMiddlewares, capCartCreateItems, capCartQuantity, capListQuery } from "../abuse-guard-middlewares"
import { sha256Hex } from "../../modules/auth-magic-link/policy"

function fixture(overrides: Record<string, unknown> = {}, counts = new Map<string, number>()) {
  const db = {
    raw: jest.fn(async (_sql: string, bindings: unknown[]) => {
      const subject = String(bindings[0])
      const attempts = (counts.get(subject) ?? 0) + 1
      counts.set(subject, attempts)
      return { rows: [{ attempts: Math.min(attempts, Number(bindings[2])), retry_after: 60 }] }
    }),
  }
  const req: any = { ip: "203.0.113.7", query: {}, body: {}, scope: { resolve: () => db }, ...overrides }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res, next: jest.fn(), db, counts }
}

const route = (matcher: string) => {
  const found = abuseGuardMiddlewares.find((r) => r.matcher === matcher)
  if (!found?.middlewares?.[0]) throw new Error(`missing ${matcher}`)
  return found.middlewares[0] as any
}

describe("Brzdy Store API", () => {
  it("platobné relácie: 11. pokus z jednej IP za 10 min dostane 429 (card testing)", async () => {
    const counts = new Map<string, number>()
    const guard = route("/store/payment-collections/:id/payment-sessions")
    for (let i = 0; i < 10; i++) {
      const f = fixture({}, counts)
      await guard(f.req, f.res, f.next)
      expect(f.next).toHaveBeenCalled()
    }
    const blocked = fixture({}, counts)
    await guard(blocked.req, blocked.res, blocked.next)
    expect(blocked.res.status).toHaveBeenCalledWith(429)
    expect(blocked.next).not.toHaveBeenCalled()
    expect(counts.has(sha256Hex("payment-session-ip:203.0.113.7"))).toBe(true)
  })

  it("prihlásený zákazník má limit aj na účet (striedanie IP nepomôže)", async () => {
    const counts = new Map<string, number>()
    const guard = route("/store/payment-collections/:id/payment-sessions")
    for (let i = 0; i < 11; i++) {
      const f = fixture({ ip: `198.51.100.${i}`, auth_context: { actor_type: "customer", actor_id: "cus_1" } }, counts)
      await guard(f.req, f.res, f.next)
      if (i === 10) expect(f.res.status).toHaveBeenCalledWith(429)
    }
  })

  it("odstúpenie od zmluvy: najviac 3 e-maily na jednu adresu za hodinu bez ohľadu na IP", async () => {
    const counts = new Map<string, number>()
    const guard = route("/store/contract-withdrawal")
    const results: number[] = []
    for (let i = 0; i < 4; i++) {
      const f = fixture({ ip: `198.51.100.${i}`, body: { email: i % 2 ? "Obet@Example.test" : "obet@example.test" } }, counts)
      await guard(f.req, f.res, f.next)
      results.push(f.next.mock.calls.length ? 200 : f.res.status.mock.calls[0][0])
    }
    expect(results).toEqual([200, 200, 200, 429])
  })

  it("bez DB sa neprepúšťa (fail closed)", async () => {
    const f = fixture({ scope: { resolve: () => ({ raw: async () => { throw new Error("down") } }) } })
    await route("/store/booking-guest")(f.req, f.res, f.next)
    expect(f.res.status).toHaveBeenCalledWith(503)
    expect(f.next).not.toHaveBeenCalled()
  })

  it.each([
    [{ limit: "100" }, true], [{ limit: "101" }, false], [{ offset: "10000" }, true], [{ offset: "10001" }, false],
    [{ limit: "-1" }, false], [{ limit: ["1", "2"] }, false], [{ limit: "1e9" }, false], [{}, true],
  ])("stránkovanie %j → povolené %s", (query, ok) => {
    const f = fixture({ query })
    capListQuery(f.req, f.res, f.next)
    expect(f.next.mock.calls.length > 0).toBe(ok)
    if (!ok) expect(f.res.status).toHaveBeenCalledWith(400)
  })

  it.each([[1, true], [99, true], [100, false], [0, false], [1.5, false], ["2", false]])("množstvo pri pridaní %p → %s", (quantity, ok) => {
    const f = fixture({ body: { quantity } })
    capCartQuantity(false)(f.req, f.res, f.next)
    expect(f.next.mock.calls.length > 0).toBe(ok)
  })

  it("úprava položky povolí 0 (odstránenie), nie 100; založenie košíka kontroluje items[]", () => {
    const zero = fixture({ body: { quantity: 0 } })
    capCartQuantity(true)(zero.req, zero.res, zero.next)
    expect(zero.next).toHaveBeenCalled()
    const big = fixture({ body: { quantity: 100 } })
    capCartQuantity(true)(big.req, big.res, big.next)
    expect(big.res.status).toHaveBeenCalledWith(400)
    const items = fixture({ body: { items: [{ variant_id: "v", quantity: 1000 }] } })
    capCartCreateItems(items.req, items.res, items.next)
    expect(items.res.status).toHaveBeenCalledWith(400)
    const none = fixture({ body: { region_id: "reg" } })
    capCartCreateItems(none.req, none.res, none.next)
    expect(none.next).toHaveBeenCalled()
  })
})
