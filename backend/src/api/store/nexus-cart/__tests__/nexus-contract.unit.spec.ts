import { POST as repriceCart } from "../route"
import { POST as checkout } from "../../nexus-checkout/route"

describe("NEXUS cart and checkout request contracts", () => {
  // Ověřený zákazník -- auth gate (401) propustí, aby se otestovala až
  // validace cart_id. Bez cart_id musí endpoint vrátit 400, ne vymyslet
  // objednávku ani placený stav.
  const auth_context = { actor_type: "customer", actor_id: "cust_synthetic" }
  const makeResponse = () => {
    const response: any = { statusCode: 200, body: undefined }
    response.status = (status: number) => { response.statusCode = status; return response }
    response.json = (body: unknown) => { response.body = body; return response }
    return response
  }

  it("rejects pricing requests without a Medusa cart ID", async () => {
    const response = makeResponse()
    await repriceCart({ body: { items: [{ unit_price: 0.01 }], tenantId: "okfish" }, auth_context } as any, response as any)
    expect(response.statusCode).toBe(400)
    expect(response.body).toEqual({ ok: false, error: "INVALID_CART_ID" })
  })

  it("rejects checkout without a Medusa cart ID instead of inventing an order or paid state", async () => {
    const response = makeResponse()
    await checkout({ body: { items: [{ unit_price: 0.01 }], paymentMethod: "anything" }, auth_context } as any, response as any)
    expect(response.statusCode).toBe(400)
    expect(response.body).toEqual({ ok: false, error: "INVALID_CART_ID" })
  })
})
