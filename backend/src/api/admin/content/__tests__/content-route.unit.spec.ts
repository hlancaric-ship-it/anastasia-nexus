import { GET, POST } from '../route'
import { POST as RESET } from '../reset/route'

jest.mock('../../../../lib/observability/audit', () => ({
  adminActor: (r: any) => (r.auth_context?.actor_type === 'user' ? r.auth_context.actor_id : null),
  auditAdminChange: jest.fn(async () => null),
}))

const FIELD_KEY = 'kontakt__kontakt-1__0-text'
const RICH_FIELD_KEY = 'kontakt__kontakt-1__2-rich'

const store: any = { id: 'store_1', metadata: {} }
const storeService = {
  listStores: jest.fn(async () => [store]),
  updateStores: jest.fn(async (_id: string, patch: any) => {
    Object.assign(store, patch)
    return store
  }),
}

function fixture(actorId: string | null = 'user_1', body: unknown = {}) {
  const req: any = {
    body,
    query: {},
    params: {},
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

describe('Obsah webu – zápis cez administráciu', () => {
  it('zamietne zákazníka', async () => {
    const f = fixture(null)
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(storeService.updateStores).not.toHaveBeenCalled()
  })

  it('vyčistí rich text pri zápise', async () => {
    const f = fixture('user_1', { page: 'kontakt', field: RICH_FIELD_KEY, value: '<p onclick="x()">ok</p><script>alert(1)</script><a href="javascript:alert(1)">odkaz</a>' })
    await POST(f.req, f.res)
    const saved = f.res.json.mock.calls[0][0]
    expect(saved.value).toBe('<p>ok</p><a>odkaz</a>')
    expect(storeService.updateStores).toHaveBeenCalled()
  })

  it('uloží hodnotu aj s revíziou', async () => {
    const f = fixture('user_1', { page: 'kontakt', field: FIELD_KEY, value: 'Nový text', revision: 'seed' })
    await POST(f.req, f.res)
    expect(f.res.status).not.toHaveBeenCalledWith(409)
    const saved = f.res.json.mock.calls[0][0]
    expect(saved.value).toBe('Nový text')
    expect(typeof saved.revision).toBe('string')
    expect(saved.revision.length).toBeGreaterThan(0)
  })

  it('pri nesúlade revízie odmietne uloženie', async () => {
    const f = fixture('user_1', { page: 'kontakt', field: FIELD_KEY, value: 'Nový text', revision: '2026-10-21T10:00:00.000Z' })
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(409)
    expect(f.res.json.mock.calls[0][0].message).toBe('Obsah medzitým zmenil niekto iný, obnovte stránku.')
    expect(storeService.updateStores).not.toHaveBeenCalled()
  })

  it('bez revízie uloží (staršia administrácia)', async () => {
    const f = fixture('user_1', { page: 'kontakt', field: FIELD_KEY, value: 'Nový text' })
    await POST(f.req, f.res)
    expect(f.res.status).not.toHaveBeenCalledWith(409)
    expect(storeService.updateStores).toHaveBeenCalled()
  })

  it('pošle revíziu aj pri čítaní', async () => {
    const f = fixture()
    await GET(f.req, f.res)
    const body = f.res.json.mock.calls[0][0]
    const field = body.pages[0].sections[0].fields[0]
    expect(field.revision).toBe('seed')
  })

  it('pri obnovení pôvodného znenia tiež hlási konflikt', async () => {
    const f = fixture('user_1', { page: 'kontakt', field: FIELD_KEY, revision: '2020-01-01T00:00:00.000Z' })
    await RESET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(409)
    expect(storeService.updateStores).not.toHaveBeenCalled()
  })
})
