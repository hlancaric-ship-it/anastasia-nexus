import { GET, POST } from '../route'
import { DELETE } from '../[slug]/route'

jest.mock('../../../../lib/observability/audit', () => ({
  adminActor: (r: any) => (r.auth_context?.actor_type === 'user' ? r.auth_context.actor_id : null),
  auditAdminChange: jest.fn(async () => null),
}))

const store: any = { id: 'store_1', metadata: {} }
const storeService = {
  listStores: jest.fn(async () => [store]),
  updateStores: jest.fn(async (_id: string, patch: any) => {
    Object.assign(store, patch)
    return store
  }),
}

function fixture(actorId: string | null = 'user_1', body: unknown = {}, params: Record<string, string> = {}) {
  const req: any = {
    body,
    query: {},
    params,
    auth_context: actorId ? { actor_type: 'user', actor_id: actorId } : undefined,
    scope: { resolve: (key: string) => (key === 'store' ? storeService : { error: jest.fn(), info: jest.fn() }) },
  }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res }
}

beforeEach(() => {
  jest.clearAllMocks()
  store.metadata = {}
})

describe('Texty stránok – zápis cez administráciu', () => {
  it('zamietne zákazníka', async () => {
    const f = fixture(null)
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(storeService.updateStores).not.toHaveBeenCalled()
  })

  it('vyčistí znenie pri zápise', async () => {
    const f = fixture('user_1', { slug: 'vop', html: '<p onclick="x()">ok</p><script>alert(1)</script><a href="javascript:alert(1)">odkaz</a>' })
    await POST(f.req, f.res)
    expect(f.res.json.mock.calls[0][0].html).toBe('<p>ok</p><a>odkaz</a>')
  })

  it('uloží znenie aj s revíziou', async () => {
    const f = fixture('user_1', { slug: 'vop', html: '<p>Nové znenie</p>', revision: 'default' })
    await POST(f.req, f.res)
    expect(f.res.status).not.toHaveBeenCalledWith(409)
    expect(f.res.json.mock.calls[0][0].html).toBe('<p>Nové znenie</p>')
  })

  it('pri nesúlade revízie odmietne uloženie', async () => {
    const f = fixture('user_1', { slug: 'vop', html: '<p>Nové znenie</p>', revision: '2026-10-21T10:00:00.000Z' })
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(409)
    expect(f.res.json.mock.calls[0][0].message).toBe('Obsah medzitým zmenil niekto iný, obnovte stránku.')
    expect(storeService.updateStores).not.toHaveBeenCalled()
  })

  it('pošle revíziu aj pri čítaní', async () => {
    const f = fixture()
    await GET(f.req, f.res)
    const page = f.res.json.mock.calls[0][0].pages[0]
    expect(page.revision).toBe('default')
  })

  it('pri obnovení pôvodného znenia tiež hlási konflikt', async () => {
    store.metadata = { anastasia_pages: { vop: { html: '<p>ok</p>', updated_at: '2026-10-21T10:00:00.000Z', updated_by: 'user_1' } } }
    const f = fixture('user_1', { revision: '2020-01-01T00:00:00.000Z' }, { slug: 'vop' })
    await DELETE(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(409)
    expect(storeService.updateStores).not.toHaveBeenCalled()
  })

  it('obnoví pôvodné znenie, ak revízia sedí', async () => {
    store.metadata = { anastasia_pages: { vop: { html: '<p>ok</p>', updated_at: '2026-10-21T10:00:00.000Z', updated_by: 'user_1' } } }
    const f = fixture('user_1', { revision: '2026-10-21T10:00:00.000Z' }, { slug: 'vop' })
    await DELETE(f.req, f.res)
    expect(f.res.status).not.toHaveBeenCalledWith(409)
    expect(f.res.json.mock.calls[0][0].is_default).toBe(true)
  })
})
