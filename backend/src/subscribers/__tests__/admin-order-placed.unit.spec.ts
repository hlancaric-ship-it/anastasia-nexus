/** @jest-environment node */
import handler from "../admin-order-placed"

const sendEmail = jest.fn(async () => ({ status: "sent" }))
jest.mock("../../lib/email/send", () => ({ sendEmail: (...args: any[]) => (sendEmail as any)(...args) }))
const recordEvent = jest.fn(async () => null)
jest.mock("../../lib/observability/events", () => ({ recordEvent: (...args: any[]) => (recordEvent as any)(...args) }))

const order = {
  id: "order_1",
  display_id: "1042",
  currency_code: "eur",
  total: 89,
  email: "zákaznik@anastasia.test",
  customer: { first_name: "Jozef", last_name: "Kováč" },
  items: [{ id: "item_1", title: "Tvoj pleťový krém", quantity: 1, total: 89 }],
  shipping_methods: [{ name: "Kuriér" }],
  payment_collections: [{ payment_sessions: [{ provider_id: "pp_stripe_stripe" }] }],
}
const retrieveOrder = jest.fn(async () => order)

const container: any = {
  resolve: (key: string) => {
    if (key === "order") return { retrieveOrder }
    return { info: jest.fn(), error: jest.fn() }
  },
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ORDER_NOTIFY_EMAIL = "lucia@anastasia.sk"
  process.env.CHAT_ADMIN_NOTIFY_EMAIL = ""
})

describe("Upozornenie správcovi na novú objednávku", () => {
  it("pošle e-mail s číslom objednávky, zákazníkom a sumou", async () => {
    await handler({ event: { data: { id: "order_1" } }, container } as any)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const call = sendEmail.mock.calls[0][1] as any
    expect(call.to).toBe("lucia@anastasia.sk")
    expect(call.template).toBe("order-placed-admin")
    expect(call.resource_type).toBe("order")
    expect(call.resource_id).toBe("order_1")
    expect(call.data.order_display_id).toBe("1042")
    expect(call.data.first_name).toBe("Jozef Kováč")
    expect(call.data.total).toContain("89")
    expect(call.data.admin_url).toBeTruthy()
  })

  it("bez adresy sa nič nepošle, len záznam", async () => {
    process.env.ORDER_NOTIFY_EMAIL = ""
    process.env.CHAT_ADMIN_NOTIFY_EMAIL = ""
    await handler({ event: { data: { id: "order_1" } }, container } as any)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(recordEvent).toHaveBeenCalledWith(container, "info", "notification", "order_admin_notify_no_email", expect.anything())
  })

  it("použije CHAT_ADMIN_NOTIFY_EMAIL, keď ORDER_NOTIFY_EMAIL chýba", async () => {
    process.env.ORDER_NOTIFY_EMAIL = ""
    process.env.CHAT_ADMIN_NOTIFY_EMAIL = "t TEAM@anastasia.sk"
    await handler({ event: { data: { id: "order_1" } }, container } as any)
    expect((sendEmail.mock.calls[0][1] as any).to).toBe("t TEAM@anastasia.sk")
  })

  it("chyba odeslania nesmie zablokovať objednávku", async () => {
    sendEmail.mockRejectedValueOnce(new Error("SMTP nedostupné"))
    await handler({ event: { data: { id: "order_1" } }, container } as any)
    expect(recordEvent).toHaveBeenCalledWith(container, "error", "notification", "order_admin_notify_failed", expect.objectContaining({ order_id: "order_1" }))
  })
})
