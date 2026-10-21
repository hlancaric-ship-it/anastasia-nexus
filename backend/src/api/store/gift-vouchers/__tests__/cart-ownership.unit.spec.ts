import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { assertCartOwnership, loadGiftVoucherCart } from "../shared"
import { POST as recipientsRoute } from "../recipients/route"

// Vlastníctvo košíka pri zápise obdarovaného darčekového poukazu.
//
// Bez kontroly vedela cudzia osoba s ID cudzieho košíka prepísať obdarovaného
// (poukaz by sa poslal na cudziu adresu). Overuje sa:
//   1) košík s vlastníkom -> meniť ho smie iba ten istý prihlásený zákazník,
//   2) cudzí košík -> 404 (nie 403; neexistencia sa neprezradí),
//   3) hosťovský košík bez vlastníka -> funguje (nákup poukazu v obchode).

function scopeWithCart(cart: Record<string, unknown> | null) {
  const graph = jest.fn(async () => ({ data: cart ? [cart] : [] }))
  const logger = { error: jest.fn() }
  const scope = {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.QUERY) return { graph }
      if (key === ContainerRegistrationKeys.LOGGER) return logger
      return {}
    },
  }
  return { scope: scope as never, graph, logger }
}

function request(options: { actorId?: string | null; body?: unknown } = {}) {
  const auth_context =
    options.actorId === undefined || options.actorId === null
      ? undefined
      : { actor_type: "customer", actor_id: options.actorId }
  return {
    auth_context,
    body: options.body ?? { cart_id: "cart_abc123", recipients: { var_1: [{ name: "Janko", email: "janko@example.test" }] } },
  }
}

function response() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: jest.fn(),
    status: jest.fn(function (this: any, code: number) { res.statusCode = code; return res }),
    json: jest.fn(function (this: any, payload: unknown) { res.body = payload; return res }),
  }
  return res as any
}

describe("vlastníctvo košíka pri darčekovom poukaze", () => {
  it("prihlásený zákazník smie meniť svoj košík", () => {
    const cart = { id: "cart_abc123", customer_id: "cus_owner" }
    expect(() => assertCartOwnership(request({ actorId: "cus_owner" }) as never, cart)).not.toThrow()
  })

  it("iný prihlásený zákazník nesmie meniť cudzí košík", () => {
    const cart = { id: "cart_abc123", customer_id: "cus_owner" }
    expect(() => assertCartOwnership(request({ actorId: "cus_other" }) as never, cart)).toThrow("CART_ACCESS_DENIED")
  })

  it("neprihlásený hosť nesmie meniť košík, ktorý má vlastníka", () => {
    const cart = { id: "cart_abc123", customer_id: "cus_owner" }
    expect(() => assertCartOwnership(request({}) as never, cart)).toThrow("CART_ACCESS_DENIED")
  })

  it("hosťovský košík bez vlastníka sa meniť smie (nákup poukazu v obchode)", () => {
    const cart = { id: "cart_abc123", customer_id: null }
    expect(() => assertCartOwnership(request({}) as never, cart)).not.toThrow()
    expect(() => assertCartOwnership(request({ actorId: "cus_owner" }) as never, cart)).not.toThrow()
  })

  it("neexistujúci košík je CART_NOT_FOUND", async () => {
    const { scope } = scopeWithCart(null)
    await expect(loadGiftVoucherCart(scope, "cart_abc123")).rejects.toThrow("CART_NOT_FOUND")
  })

  it("načíta iba polia potrebné na kontrolu vlastníctva", async () => {
    const { scope, graph } = scopeWithCart({ id: "cart_abc123", customer_id: "cus_owner" })
    const cart = await loadGiftVoucherCart(scope, "cart_abc123")
    expect(cart.customer_id).toBe("cus_owner")
    const [options] = graph.mock.calls[0] as unknown as [{ fields: string[] }]
    expect(options.fields).toEqual(["id", "customer_id", "completed_at"])
  })
})

describe("POST /store/gift-vouchers/recipients – vlastníctvo", () => {
  it("cudzí košík sa neprezradí a vráti 404", async () => {
    const { scope } = scopeWithCart({ id: "cart_abc123", customer_id: "cus_owner" })
    const req = { ...request({}), scope } as never
    const res = response()
    await recipientsRoute(req, res)
    expect(res.statusCode).toBe(404)
    expect(res.body).toMatchObject({ ok: false, error: "CART_NOT_FOUND" })
  })

  it("neexistujúci košík vráti 404", async () => {
    const { scope } = scopeWithCart(null)
    const req = { ...request({}), scope } as never
    const res = response()
    await recipientsRoute(req, res)
    expect(res.statusCode).toBe(404)
  })

  it("neplatné ID košíka je 400 a košík sa vôbec nenačíta", async () => {
    const { scope, graph } = scopeWithCart({ id: "cart_abc123", customer_id: null })
    const req = { ...request({ body: { cart_id: "nie-co" } }), scope } as never
    const res = response()
    await recipientsRoute(req, res)
    expect(res.statusCode).toBe(400)
    expect(graph).not.toHaveBeenCalled()
  })
})
