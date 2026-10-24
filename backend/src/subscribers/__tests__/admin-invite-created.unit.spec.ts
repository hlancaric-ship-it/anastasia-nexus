/** @jest-environment node */
import handler, { config } from "../admin-invite-created"

const sendEmail = jest.fn(async (..._args: any[]) => ({ status: "sent" }))
jest.mock("../../lib/email/send", () => ({ sendEmail: (...args: any[]) => (sendEmail as any)(...args) }))

const rows: Record<string, any> = {
  inv_1: { id: "inv_1", email: "majitel@anastasia.test", token: "a.b/c", accepted: false },
  inv_2: { id: "inv_2", email: "prijata@anastasia.test", token: "x", accepted: true },
}
const graph = jest.fn(async ({ filters }: any) => ({ data: rows[filters.id] ? [rows[filters.id]] : [] }))
const container: any = { resolve: () => ({ graph }) }

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ADMIN_URL = ""
  process.env.CHAT_ADMIN_URL = "https://admin.anastasia.test/"
})

describe("Pozvánka do adminu", () => {
  it("počúva na vytvorenie aj opätovné odoslanie", () => {
    expect(config.event).toEqual(["invite.created", "invite.resent"])
  })

  it("z udalosti s id dočíta e-mail a token a pošle odkaz do vlastného adminu", async () => {
    await handler({ event: { data: [{ id: "inv_1" }] }, container } as any)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const call = sendEmail.mock.calls[0][1] as any
    expect(call.to).toBe("majitel@anastasia.test")
    expect(call.template).toBe("admin-invite")
    expect(call.data.invite_url).toBe("https://admin.anastasia.test/#/pozvanka/a.b%2Fc")
  })

  it("prijatú alebo neexistujúcu pozvánku neposiela", async () => {
    await handler({ event: { data: [{ id: "inv_2" }, { id: "inv_x" }] }, container } as any)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("bez adresy adminu nič neposiela", async () => {
    process.env.CHAT_ADMIN_URL = ""
    await handler({ event: { data: { id: "inv_1" } }, container } as any)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
