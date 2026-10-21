import { POST as SET_TIER } from '../customers/[id]/tier/route'
import { POST as SET_TIERS } from '../customers/tiers/route'
import { applyLoyaltyAssignment, readLoyaltyAssignment } from '../../../../lib/loyalty/assignment'
import { auditAdminChange } from '../../../../lib/observability/audit'

jest.mock('../../../../lib/observability/audit', () => ({
  adminActor: (r: any) => (r.auth_context?.actor_type === 'user' ? r.auth_context.actor_id : null),
  auditAdminChange: jest.fn(async () => null),
}))
jest.mock('../../../../lib/loyalty/assignment', () => ({
  applyLoyaltyAssignment: jest.fn(),
  readLoyaltyAssignment: jest.fn(),
  loyaltyTierGroups: jest.fn(async () => [
    { id: 'grp_zr1', name: 'Bronze', code: 'ZR1', rank: 1 },
    { id: 'grp_zr3', name: 'Gold', code: 'ZR3', rank: 3 },
  ]),
  ensureLoyaltyLockGroup: jest.fn(async () => ({ id: 'grp_lock', name: 'Věrnost – ruční zámok' })),
}))

const graph = jest.fn(async () => ({ data: [{ id: 'cus_1' }] }))
const scope = { resolve: (key: string) => (key === 'query' ? { graph } : { error: jest.fn(), info: jest.fn() }) }

function fixture(body: unknown, params: Record<string, string> = { id: 'cus_1' }) {
  const req: any = { body, query: {}, params, auth_context: { actor_type: 'user', actor_id: 'user_1' }, scope }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(readLoyaltyAssignment).mockResolvedValue({ tier_code: null, tier_name: null, source: 'auto', locked: false })
  jest.mocked(applyLoyaltyAssignment).mockImplementation(async (_scope: any, input: any) => ({
    tier_code: input.tierCode,
    tier_name: input.tierCode ? 'Gold' : null,
    source: input.locked ? 'manual' : 'auto',
    locked: input.locked,
  }))
})

describe('Ručné zaradenie zákazníčky do vernostnej úrovne (admin API)', () => {
  it('zamietne zákazníčku', async () => {
    const f = fixture({ tier_code: 'ZR3' })
    f.req.auth_context = { actor_type: 'customer', actor_id: 'cus_1' }
    await SET_TIER(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(applyLoyaltyAssignment).not.toHaveBeenCalled()
  })

  it('odmietne neplatnú úroveň pred zápisom', async () => {
    const f = fixture({ tier_code: 'gold' })
    await SET_TIER(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(applyLoyaltyAssignment).not.toHaveBeenCalled()
  })

  it('ručné zaradenie nastaví úroveň so zámkom a zapíše audit', async () => {
    const f = fixture({ tier_code: 'ZR3' })
    await SET_TIER(f.req, f.res)
    expect(applyLoyaltyAssignment).toHaveBeenCalledWith(scope, { customerId: 'cus_1', tierCode: 'ZR3', locked: true })
    expect(auditAdminChange).toHaveBeenCalledWith(f.req, 'admin.loyalty.customer.tier.update', 'customer', 'cus_1',
      expect.anything(), expect.anything())
    const body = f.res.json.mock.calls[0][0]
    expect(body).toMatchObject({ customer_id: 'cus_1', tier_code: 'ZR3', source: 'manual', locked: true })
  })

  it('„automaticky“ zruší ručný zámok', async () => {
    const f = fixture({ tier_code: 'automatic' })
    await SET_TIER(f.req, f.res)
    expect(applyLoyaltyAssignment).toHaveBeenCalledWith(scope, { customerId: 'cus_1', tierCode: null, locked: false })
    const body = f.res.json.mock.calls[0][0]
    expect(body).toMatchObject({ tier_code: null, locked: false })
  })

  it('neexistujúca zákazníka je 404', async () => {
    graph.mockResolvedValueOnce({ data: [] } as any)
    const f = fixture({ tier_code: 'ZR3' })
    await SET_TIER(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(404)
  })
})

describe('Hromadné zaradenie (admin API)', () => {
  it('zamietne zákazníčku', async () => {
    const f = fixture({ tier_code: 'ZR3', customer_ids: ['cus_1'] })
    f.req.auth_context = { actor_type: 'customer', actor_id: 'cus_1' }
    await SET_TIERS(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
  })

  it('zaradí viac zákazníčiek naraz na jednu úroveň', async () => {
    const f = fixture({ tier_code: 'ZR3', customer_ids: ['cus_1', 'cus_2'] })
    await SET_TIERS(f.req, f.res)
    expect(applyLoyaltyAssignment).toHaveBeenCalledTimes(2)
    expect(f.res.json.mock.calls[0][0].updated).toBe(2)
    expect(auditAdminChange).toHaveBeenCalledTimes(2)
  })

  it('zaradí zákazníčky s rôznymi úrovňami', async () => {
    const f = fixture({ assignments: [{ customer_id: 'cus_1', tier_code: 'ZR3' }, { customer_id: 'cus_2', tier_code: 'automatic' }] })
    await SET_TIERS(f.req, f.res)
    expect(applyLoyaltyAssignment).toHaveBeenNthCalledWith(1, scope, { customerId: 'cus_1', tierCode: 'ZR3', locked: true })
    expect(applyLoyaltyAssignment).toHaveBeenNthCalledWith(2, scope, { customerId: 'cus_2', tierCode: null, locked: false })
  })

  it('odmietne prázdny zoznam a neplatnú úroveň', async () => {
    const empty = fixture({})
    await SET_TIERS(empty.req, empty.res)
    expect(empty.res.status).toHaveBeenCalledWith(400)

    const bad = fixture({ tier_code: 'ZR9', customer_ids: ['cus_1'] })
    await SET_TIERS(bad.req, bad.res)
    expect(bad.res.status).toHaveBeenCalledWith(400)
    expect(applyLoyaltyAssignment).not.toHaveBeenCalled()
  })
})
