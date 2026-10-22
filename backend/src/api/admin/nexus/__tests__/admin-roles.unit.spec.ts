import { GET, POST } from '../admin-roles/route'

jest.mock('../../../../lib/observability/audit', () => ({
  adminActor: (r: any) => (r.auth_context?.actor_type === 'user' ? r.auth_context.actor_id : null),
  auditAdminChange: jest.fn(async () => null),
}))

const users: any[] = [
  { id: 'user_owner', email: 'owner@anastasia.test', metadata: { anastasia_role: 'owner' } },
  { id: 'user_assistant', email: 'assistant@anastasia.test', metadata: { anastasia_role: 'assistant' } },
  { id: 'user_plain', email: 'plain@anastasia.test', metadata: {} },
]

const userService = {
  listUsers: jest.fn(async () => users),
  retrieveUser: jest.fn(async (id: string) => {
    const found = users.find((user) => user.id === id)
    if (!found) throw new Error('USER_NOT_FOUND')
    return found
  }),
  updateUsers: jest.fn(async (id: string, patch: any) => {
    const found = users.find((user) => user.id === id)
    Object.assign(found, patch)
    return found
  }),
}

function fixture(actorId: string | null = 'user_owner', body: unknown = {}) {
  const req: any = {
    body,
    query: {},
    params: {},
    auth_context: actorId ? { actor_type: 'user', actor_id: actorId } : undefined,
    scope: { resolve: (key: string) => (key === 'user' ? userService : { error: jest.fn(), info: jest.fn() }) },
  }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res }
}

beforeEach(() => {
  jest.clearAllMocks()
  users[1].metadata = { anastasia_role: 'assistant' }
  users[2].metadata = {}
})

describe('Role administrátorov', () => {
  it('zamietne zákazníka', async () => {
    const f = fixture(null)
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(userService.listUsers).not.toHaveBeenCalled()
  })

  it('vypíše administrátorov s ich rolou', async () => {
    const f = fixture()
    await GET(f.req, f.res)
    const body = f.res.json.mock.calls[0][0]
    expect(body.admins.map((row: any) => [row.id, row.role])).toEqual([
      ['user_owner', 'owner'],
      ['user_assistant', 'assistant'],
      ['user_plain', 'owner'],
    ])
  })

  it('vlastník zmení rolu a zapíše audit', async () => {
    const f = fixture('user_owner', { user_id: 'user_plain', role: 'assistant' })
    await POST(f.req, f.res)
    expect(userService.updateUsers).toHaveBeenCalledWith('user_plain', { metadata: { anastasia_role: 'assistant' } })
    expect(f.res.json.mock.calls[0][0]).toMatchObject({ user_id: 'user_plain', role: 'assistant' })
  })

  it('asistent nemení role', async () => {
    const f = fixture('user_assistant', { user_id: 'user_plain', role: 'owner' })
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(403)
    expect(userService.updateUsers).not.toHaveBeenCalled()
  })

  it('posledného vlastníka nemožno znížiť na asistenta', async () => {
    // Zostane jeden vlastník (user_owner) – jeho zníženie by administráciu zamklo.
    users[2].metadata = { anastasia_role: 'assistant' }
    const f = fixture('user_owner', { user_id: 'user_owner', role: 'assistant' })
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(userService.updateUsers).not.toHaveBeenCalled()
  })

  it('odmietne neznámu rolu a chýbajúceho administrátora', async () => {
    const badRole = fixture('user_owner', { user_id: 'user_plain', role: 'superuser' })
    await POST(badRole.req, badRole.res)
    expect(badRole.res.status).toHaveBeenCalledWith(400)

    const missing = fixture('user_owner', { role: 'assistant' })
    await POST(missing.req, missing.res)
    expect(missing.res.status).toHaveBeenCalledWith(400)
  })
})
