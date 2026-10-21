import { POST } from "../conversations/route"
import { ChatPolicyError } from "../../../../modules/chat/policy"

jest.mock("../../../../lib/observability/audit", () => ({
  auditAdminChange: jest.fn(async () => "audit_1"),
}))

const sendAdminMessage = jest.fn()
const emit = jest.fn(async () => null)
const graph = jest.fn(async () => ({ data: [] }))
const auditAdminChange = jest.fn(async () => "audit_1")

function fixture(actorId: string | null = "user_1", body: unknown = {}, customers: any[] = []) {
  graph.mockImplementation(async () => ({ data: customers }))
  const req: any = {
    body,
    query: {},
    params: {},
    auth_context: actorId ? { actor_type: "user", actor_id: actorId } : undefined,
    scope: {
      resolve: (key: string) => {
        if (key === "chat") return { sendAdminMessage }
        if (key === "query") return { graph }
        if (key === "event_bus") return { emit }
        return { error: jest.fn(), info: jest.fn() }
      },
    },
  }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res }
}

const customer = { id: "cus_1", email: "zákaznik@anastasia.test", first_name: "Jozef", last_name: "Kováč" }

beforeEach(() => {
  jest.clearAllMocks()
  sendAdminMessage.mockImplementation(async (input: any) => ({
    conversation: { id: "chconv_1", customer_id: input.customer_id, subject: input.subject ?? "Správa z administrácie" },
    message: { id: "msg_1", author_type: "admin", body: input.body, created_at: new Date() },
  }))
})

describe("Nová zpráva pre zákazníka – POST /admin/chat/conversations", () => {
  it("bez prihlásenia sa nič nestane", async () => {
    const f = fixture(null, { customer_id: "cus_1", body: "ahoj" })
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(sendAdminMessage).not.toHaveBeenCalled()
  })

  it("neznámy zákazník dostane 404", async () => {
    const f = fixture("user_1", { customer_id: "cus_1", body: "ahoj" }, [])
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(404)
    expect(f.res.json.mock.calls[0][0].message).toBe("Zákazník sa nenašiel.")
    expect(sendAdminMessage).not.toHaveBeenCalled()
  })

  it("prázdna správa sa odmietne", async () => {
    sendAdminMessage.mockRejectedValue(new ChatPolicyError("message_empty", "Správa nemôže byť prázdna."))
    const f = fixture("user_1", { customer_id: "cus_1", body: "   " }, [customer])
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(f.res.json.mock.calls[0][0].message).toBe("Správa nemôže byť prázdna.")
  })

  it("zablokovanému zákazníkovi sa správa nepošle (409)", async () => {
    sendAdminMessage.mockRejectedValue(new ChatPolicyError("admin_message_blocked"))
    const f = fixture("user_1", { customer_id: "cus_1", body: "ahoj" }, [customer])
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(409)
    expect(f.res.json.mock.calls[0][0].message).toBe("Zákazník má zablokovaný chat – novú správu mu nemožno poslať.")
  })

  it("správa sa odošle, konverzácia sa vráti, e-mail sa vyšle a audit sa zapíše", async () => {
    const f = fixture("user_1", { customer_id: "cus_1", body: "Dobrý deň", subject: "Objednávka #12" }, [customer])
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(201)
    const body = f.res.json.mock.calls[0][0]
    expect(body.conversation_id).toBe("chconv_1")
    expect(body.message.body).toBe("Dobrý deň")
    expect(sendAdminMessage).toHaveBeenCalledWith(expect.objectContaining({ customer_id: "cus_1", admin_id: "user_1", body: "Dobrý deň", subject: "Objednávka #12" }))
    // e-mail zákazníkovi (rovnaký event ako pri odpovedi)
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ name: "chat.admin_reply" }))
    const { auditAdminChange } = require("../../../../lib/observability/audit")
    expect(auditAdminChange).toHaveBeenCalledWith(expect.anything(), "chat.conversation.start", "customer", "cus_1", null, expect.objectContaining({ conversation_id: "chconv_1" }))
  })
})
