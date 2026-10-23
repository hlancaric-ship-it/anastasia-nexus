import { GET, POST } from "../route"

jest.mock("../../../../../lib/observability/audit", () => ({
  adminActor: (req: any) => req.auth_context?.actor_type === "user" ? req.auth_context.actor_id : null,
  auditAdminChange: jest.fn(async () => null),
}))

const user: any = { id: "user_1", metadata: { unrelated: "kept" } }
const users = {
  retrieveUser: jest.fn(async () => user),
  updateUsers: jest.fn(async (_id: string, patch: any) => Object.assign(user, patch)),
}
function fixture(actor = "user_1", body: unknown = {}) {
  const req: any = { body, auth_context: actor ? { actor_type: "user", actor_id: actor } : undefined,
    scope: { resolve: (key: string) => key === "user" ? users : { error: jest.fn() } } }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res }
}

beforeEach(() => { jest.clearAllMocks(); user.metadata = { unrelated: "kept" } })

describe("stav sprievodcu administráciou", () => {
  it("vyžaduje prihlásenie", async () => {
    const f = fixture("")
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
  })

  it("číta dokončenie z metadata používateľa", async () => {
    user.metadata.anastasia_admin_tour = { completed: true }
    const f = fixture()
    await GET(f.req, f.res)
    expect(f.res.json).toHaveBeenCalledWith({ completed: true })
  })

  it("uloží dokončenie a zachová ostatné metadata", async () => {
    const f = fixture("user_1", { completed: true })
    await POST(f.req, f.res)
    expect(users.updateUsers).toHaveBeenCalledWith("user_1", expect.objectContaining({
      metadata: expect.objectContaining({ unrelated: "kept", anastasia_admin_tour: expect.objectContaining({ completed: true }) }),
    }))
    expect(f.res.json).toHaveBeenCalledWith({ completed: true })
  })
})
