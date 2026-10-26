import { GET, compareCatalogue } from '../route'
import { adminActor } from '../../../../lib/observability/audit'

jest.mock('../../../../lib/observability/audit', () => ({
  adminActor: (r: any) => (r.auth_context?.actor_type === 'user' ? r.auth_context.actor_id : null),
  auditAdminChange: jest.fn(async () => null),
}))

const products = [
  { id: 'prod_1', title: 'Tvoja pleťová voda', status: 'published', handle: 'pletova-voda', thumbnail: null, metadata: {}, variants: [{ prices: [{ currency_code: 'eur', amount: 11 }] }], categories: [{ id: 'pcat_1', name: 'BIOKOZMETIKA' }], shipping_profile: { id: 'sp_1', type: 'default' } },
  { id: 'prod_2', title: 'RESET 40+', status: 'published', handle: 'reset-40-plus', thumbnail: null, metadata: {}, variants: [{ prices: [{ currency_code: 'eur', amount: 168 }] }], categories: [{ id: 'pcat_2', name: 'AI ANASTASIA ACADEMY' }], shipping_profile: { id: 'sp_2', type: 'digital' } },
]

function fixture(queryResult?: any) {
  const graph = jest.fn(async (args: any) => {
    if (Array.isArray(args.filters?.id)) return { data: products.filter((p) => args.filters.id.includes(p.id)) }
    if (args.filters?.shipping_profile?.type === 'digital' && !args.filters?.id) {
      return { data: products.filter((p) => p.shipping_profile.type === 'digital'), metadata: { count: 1, skip: 0, take: 50 } }
    }
    if (args.filters?.id?.$nin) {
      const excluded = args.filters.id.$nin as string[]
      const data = products.filter((p) => !excluded.includes(p.id))
      return { data, metadata: { count: data.length, skip: 0, take: 50 } }
    }
    return queryResult ?? { data: products, metadata: { count: products.length, skip: 0, take: 50 } }
  })
  const req: any = {
    query: {},
    auth_context: { actor_type: 'user', actor_id: 'user_test' },
    scope: { resolve: () => ({ graph } as any) },
  }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res, graph }
}

beforeEach(() => jest.clearAllMocks())

describe('Zoznam produktov s filtrom Fyzické / Digitálne', () => {
  it('zamietne zákazníka', async () => {
    const f = fixture()
    f.req.auth_context = { actor_type: 'customer', actor_id: 'cus_test' }
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(f.graph).not.toHaveBeenCalled()
  })

  it('odmietne neznámy filter typu', async () => {
    const f = fixture()
    f.req.query = { type: 'nieco' }
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
  })

  it('bez filtru vráti všetky produkty s cenou a kategóriou', async () => {
    const f = fixture()
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(200)
    const body = f.res.json.mock.calls[0][0]
    expect(body.products).toHaveLength(2)
    expect(body.products[0].variants[0].prices[0].amount).toBe(11)
    expect(body.products[1].categories[0].name).toBe('AI ANASTASIA ACADEMY')
  })

  it('filtruje digitálne produkty podľa dopravného profilu', async () => {
    const f = fixture()
    f.req.query = { type: 'digital' }
    await GET(f.req, f.res)
    const body = f.res.json.mock.calls[0][0]
    expect(body.products.map((p: any) => p.handle)).toEqual(['reset-40-plus'])
    expect(body.products[0].digital).toBe(true)
    expect(body.products[0].digital_group).toBe('ACADEMY kurzy')
  })

  it('fyzické produkty sú všetko, čo nie je digitálne', async () => {
    const f = fixture()
    f.req.query = { type: 'physical' }
    await GET(f.req, f.res)
    const body = f.res.json.mock.calls[0][0]
    expect(body.products.map((p: any) => p.handle)).toEqual(['pletova-voda'])
    expect(body.products[0].digital).toBe(false)
  })

  it('prevedie stav a hľadanie na serverové filtre', async () => {
    const f = fixture()
    f.req.query = { type: 'all', status: 'published', q: 'reset', limit: '10', offset: '5' }
    await GET(f.req, f.res)
    const args = f.graph.mock.calls[0]?.[0]
    expect(args.filters.status).toBe('published')
    expect(args.filters.q).toBe('reset')
    const body = f.res.json.mock.calls[0][0]
    expect(body).toMatchObject({ limit: 10, offset: 5, count: 2 })
    expect(body.products).toHaveLength(0)
  })

  it('zoradí zverejnené pred konceptmi, fyzické, služby a potom digitálne', () => {
    const rows = [
      { id: 'd_draft', status: 'draft', shipping_profile: { type: 'default' } },
      { id: 'digital', status: 'published', shipping_profile: { type: 'digital' } },
      { id: 'service', status: 'published', metadata: { booking: true } },
      { id: 'old', status: 'published', created_at: '2026-01-01' },
      { id: 'new', status: 'published', created_at: '2026-10-01' },
    ]
    expect(rows.slice().sort(compareCatalogue).map((r) => r.id)).toEqual(['new', 'old', 'service', 'digital', 'd_draft'])
  })

  it('neuhádza stránku ani neprekročí limit', async () => {
    const f = fixture()
    f.req.query = { limit: '9999', offset: '-3' }
    await GET(f.req, f.res)
    const body = f.res.json.mock.calls[0][0]
    expect(body.limit).toBeLessThanOrEqual(200)
    expect(body.offset).toBeGreaterThanOrEqual(0)
  })
})
