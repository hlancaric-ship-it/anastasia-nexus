/** @jest-environment node */
import handler, { config } from "../auth-password-reset"

const sendEmail = jest.fn(async (..._args: any[]) => ({ status: "sent" }))
jest.mock("../../lib/email/send", () => ({ sendEmail: (...args: any[]) => (sendEmail as any)(...args) }))

const container: any = { resolve: () => ({ info: jest.fn(), error: jest.fn() }) }

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ADMIN_URL = "https://admin.anastasia.test/"
  delete process.env.CHAT_ADMIN_URL
})

describe("Obnova hesla správcu", () => {
  it("počúva na udalosť jadra auth.password_reset", () => {
    expect(config.event).toBe("auth.password_reset")
  })

  it("pošle správcovi odkaz do vlastného adminu", async () => {
    await handler({ event: { data: { entity_id: "spravca@anastasia.test", actor_type: "user", token: "a.b/c" } }, container } as any)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const call = sendEmail.mock.calls[0][1] as any
    expect(call.to).toBe("spravca@anastasia.test")
    expect(call.template).toBe("admin-password-reset")
    expect(call.data.url).toBe("https://admin.anastasia.test/#/obnova-hesla/a.b%2Fc")
  })

  it("zákazníkom nič neposiela, tí majú magic link", async () => {
    await handler({ event: { data: { entity_id: "zakaznik@anastasia.test", actor_type: "customer", token: "t" } }, container } as any)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("bez ADMIN_URL použije adresu adminu z CHAT_ADMIN_URL", async () => {
    process.env.ADMIN_URL = ""
    process.env.CHAT_ADMIN_URL = "https://admin.anastasia.test/"
    await handler({ event: { data: { entity_id: "spravca@anastasia.test", actor_type: "user", token: "t" } }, container } as any)
    expect((sendEmail.mock.calls[0][1] as any).data.url).toBe("https://admin.anastasia.test/#/obnova-hesla/t")
  })

  it("bez ADMIN_URL alebo tokenu nič neposiela", async () => {
    process.env.ADMIN_URL = ""
    await handler({ event: { data: { entity_id: "spravca@anastasia.test", actor_type: "user", token: "t" } }, container } as any)
    process.env.ADMIN_URL = "https://admin.anastasia.test"
    await handler({ event: { data: { entity_id: "spravca@anastasia.test", actor_type: "user" } }, container } as any)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
