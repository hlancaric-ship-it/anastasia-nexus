import { protectAdminRoleMetadata, protectAdminUserCreation } from '../role-guard'

describe('Zábrana zápisu metadát administrátora', () => {
  const userService = {
    retrieveUser: jest.fn(async () => ({ id: 'user_1', email: 'a@anastasia.test', metadata: { anastasia_role: 'assistant' } })),
  }
  const scope: any = { resolve: (key: string) => (key === 'user' ? userService : {}) }

  const fixture = (body: unknown, actorId: string | null = 'user_1') => {
    const req: any = { body, query: {}, params: {}, auth_context: actorId ? { actor_type: 'user', actor_id: actorId } : undefined, scope }
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
    const next = jest.fn()
    return { req, res, next }
  }

  beforeEach(() => jest.clearAllMocks())

  it('asistent nesmie zmeniť rolu v metadátach', async () => {
    const f = fixture({ metadata: { anastasia_role: 'owner' } })
    await protectAdminRoleMetadata(f.req, f.res, f.next)
    expect(f.res.status).toHaveBeenCalledWith(403)
    expect(f.next).not.toHaveBeenCalled()
  })

  it('asistent nesmie metadáta prepísať ani vtedy, keď kľúč roly v chýba (odstránenie roly)', async () => {
    const f = fixture({ metadata: { iné: 'niečo' } })
    await protectAdminRoleMetadata(f.req, f.res, f.next)
    expect(f.res.status).toHaveBeenCalledWith(403)
    expect(f.next).not.toHaveBeenCalled()
  })

  it('vlastník smie rolu zmeniť', async () => {
    userService.retrieveUser.mockResolvedValueOnce({ id: 'user_1', email: 'a@anastasia.test', metadata: { anastasia_role: 'owner' } })
    const f = fixture({ metadata: { anastasia_role: 'assistant' } })
    await protectAdminRoleMetadata(f.req, f.res, f.next)
    expect(f.next).toHaveBeenCalled()
    expect(f.res.status).not.toHaveBeenCalled()
  })

  it('bez zápisu metadát prejde (číselné údaje administrátora smie meniť aj asistent)', async () => {
    const f = fixture({ first_name: 'Lucia' })
    await protectAdminRoleMetadata(f.req, f.res, f.next)
    expect(f.next).toHaveBeenCalled()
  })

  it('neprihláseného nechá prejsť (auth middleware odpovie 401)', async () => {
    const f = fixture({ metadata: { anastasia_role: 'owner' } }, null)
    await protectAdminRoleMetadata(f.req, f.res, f.next)
    expect(f.next).toHaveBeenCalled()
  })

  it('asistent nesmie založiť nového administrátora (nový účet má predvolene rolu vlastníka)', async () => {
    const f = fixture({ email: 'novy@anastasia.test', password: 'x' })
    await protectAdminUserCreation(f.req, f.res, f.next)
    expect(f.res.status).toHaveBeenCalledWith(403)
    expect(f.next).not.toHaveBeenCalled()
  })

  it('vlastník môže založiť nového administrátora', async () => {
    userService.retrieveUser.mockResolvedValueOnce({ id: 'user_1', email: 'a@anastasia.test', metadata: { anastasia_role: 'owner' } })
    const f = fixture({ email: 'novy@anastasia.test', password: 'x' })
    await protectAdminUserCreation(f.req, f.res, f.next)
    expect(f.next).toHaveBeenCalled()
  })
})
