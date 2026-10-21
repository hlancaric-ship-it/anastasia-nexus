import { GET } from '../loyalty-customers/route'
import { loyaltyTierGroups } from '../../../../lib/loyalty/assignment'

jest.mock('../../../../lib/observability/audit', () => ({
  adminActor: (r: any) => (r.auth_context?.actor_type === 'user' ? r.auth_context.actor_id : null),
  auditAdminChange: jest.fn(async () => null),
}))
jest.mock('../../../../lib/loyalty/assignment', () => ({ loyaltyTierGroups: jest.fn() }))

const tiers = [
  { id: 'grp_zr1', name: 'Bronze', code: 'ZR1', rank: 1 },
  { id: 'grp_zr3', name: 'Gold', code: 'ZR3', rank: 3 },
]
const graph = jest.fn(async (args: any) => {
  // Dotaz na zákazníkov v skupinách úrovní (pre filter „bez úrovne“) žiada len ID.
  if (args.filters?.groups?.id && args.fields?.length === 1) {
    return { data: [{ id: 'cus_in_group' }], metadata: { count: 1, skip: 0, take: 50 } }
  }
  const groups = args.filters?.groups?.id ? [{ id: 'grp_zr3', name: 'Gold', metadata: { nexus_tier: 'ZR3' } }] : []
  return { data: [{ id: 'cus_2', email: 'c@d.sk', first_name: 'Cena', last_name: 'D', groups }], metadata: { count: 1, skip: 0, take: 50 } }
})

function fixture(query: Record<string, unknown> = {}) {
  const req: any = { query, body: {}, params: {}, auth_context: { actor_type: 'user', actor_id: 'user_1' }, scope: { resolve: () => ({ graph }) } }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(loyaltyTierGroups).mockResolvedValue(tiers)
})

describe('Zoznam zákazníčiek s vernostnou úrovňou (admin API)', () => {
  it('zamietne zákazníka', async () => {
    const f = fixture()
    f.req.auth_context = { actor_type: 'customer', actor_id: 'cus_1' }
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(graph).not.toHaveBeenCalled()
  })

  it('vráti zákazníkov s úrovňou a stránkovaním', async () => {
    const f = fixture()
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(200)
    const body = f.res.json.mock.calls[0][0]
    expect(body.customers[0]).toMatchObject({ id: 'cus_2', tier_code: null, source: 'auto', locked: false })
    expect(body.tiers).toEqual([{ code: 'ZR1', name: 'Bronze' }, { code: 'ZR3', name: 'Gold' }])
  })

  it('filtruje serverovo podľa úrovne', async () => {
    const f = fixture({ tier: 'ZR3' })
    await GET(f.req, f.res)
    const args = graph.mock.calls.at(-1)?.[0]
    expect(args.filters.groups).toEqual({ id: 'grp_zr3' })
    const body = f.res.json.mock.calls[0][0]
    expect(body.customers[0]).toMatchObject({ tier_code: 'ZR3', tier_name: 'Gold', source: 'auto', locked: false })
  })

  it('filtruje „bez úrovne“ a vynechá zákazníkov v skupinách úrovní', async () => {
    const f = fixture({ tier: 'none' })
    await GET(f.req, f.res)
    const args = graph.mock.calls.at(-1)?.[0]
    expect(args.filters.id.$nin).toEqual(['cus_in_group'])
  })

  it('odmietne neznámu úroveň', async () => {
    const f = fixture({ tier: 'ZR9' })
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
  })

  it('prejde hľadaný text na server a obmedí stránku', async () => {
    const f = fixture({ q: 'anna', limit: '10', offset: '20' })
    await GET(f.req, f.res)
    const args = graph.mock.calls.at(-1)?.[0]
    expect(args.filters.q).toBe('anna')
    expect(args.pagination).toMatchObject({ take: 10, skip: 20 })
  })
})
