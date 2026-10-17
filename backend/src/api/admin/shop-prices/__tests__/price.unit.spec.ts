import { POST } from '../[id]/route'
jest.mock('../../../../lib/observability/audit', () => ({ adminActor: (r: any) => r.auth_context?.actor_type === 'user' ? r.auth_context.actor_id : null, auditAdminChange: jest.fn(async () => null) }))
function fixture(extra: any = {}) {
  const base = { id: 'price_1', amount: 50, currency_code: 'eur', price_rules: [], price_list: null }
  const pricing = { listPrices: jest.fn(async () => [base]), updatePriceSets: jest.fn(async (_: unknown, data: any) => { base.amount = data.prices[0].amount }) }
  const query = { graph: jest.fn(async () => ({ data: [{ id: 'variant_1', price_set: { id: 'pset_1' } }] })) }
  const lock = { execute: jest.fn(async (_: unknown, f: () => unknown) => f()) }
  const req: any = { auth_context: { actor_type: 'user', actor_id: 'user_1' }, params: { id: 'variant_1' }, body: { price_id: 'price_1', amount: 20, expected_amount: 50 }, scope: { resolve: (key: string) => ({ query, pricing, locking: lock } as Record<string, unknown>)[key] }, ...extra }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res, pricing, query, base, lock }
}
describe('Restricted shop price write', () => {
  it('requires an admin actor even when called directly', async () => {
    const f = fixture({ auth_context: { actor_type: 'customer', actor_id: 'customer_1' } }); await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401); expect(f.query.graph).not.toHaveBeenCalled()
  })
  it.each([-1, NaN, Infinity, 1.001, 1e12])('rejects unsafe server input %s before resolving services', async amount => {
    const f = fixture({ body: { price_id: 'price_1', amount, expected_amount: 50 } }); await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400); expect(f.query.graph).not.toHaveBeenCalled()
  })
  it('updates only a verified base price and reads it back under a lock', async () => {
    const f = fixture(); await POST(f.req, f.res)
    expect(f.lock.execute).toHaveBeenCalledWith('shop-price:pset_1', expect.any(Function))
    expect(f.pricing.updatePriceSets).toHaveBeenCalledWith('pset_1', { prices: [{ id: 'price_1', currency_code: 'eur', amount: 20 }] })
    expect(f.pricing.listPrices).toHaveBeenCalledTimes(2)
    expect(f.res.json).toHaveBeenCalledWith({ price: { id: 'price_1', variant_id: 'variant_1', amount: 20, currency_code: 'eur' } })
  })
  it.each(['stale', 'currency', 'rule', 'multiple', 'sale-only'])('fails closed for %s, never replacing the set', async kind => {
    const f = fixture()
    if (kind === 'stale') f.req.body.expected_amount = 49
    if (kind === 'currency') f.base.currency_code = 'usd'
    if (kind === 'rule') (f.base.price_rules as unknown[]) = [{ attribute: 'region_id', value: 'reg_1' }]
    if (kind === 'multiple') f.pricing.listPrices.mockImplementation(async () => [f.base, { ...f.base, id: 'price_2' }])
    if (kind === 'sale-only') f.pricing.listPrices.mockImplementation(async () => [{ ...f.base, price_list: { id: 'sale_1' } } as any])
    await POST(f.req, f.res); expect(f.res.status).toHaveBeenCalledWith(409); expect(f.pricing.updatePriceSets).not.toHaveBeenCalled()
  })
  it('does not include price-list rows in base replacement', async () => {
    const f = fixture(); f.pricing.listPrices.mockImplementation(async () => [f.base, { ...f.base, id: 'sale_1', price_list: { id: 'plist_1' } } as any])
    await POST(f.req, f.res)
    expect(f.pricing.updatePriceSets).toHaveBeenCalledWith('pset_1', { prices: [{ id: 'price_1', currency_code: 'eur', amount: 20 }] })
  })
  it('does not claim success if the price write/read-back is uncertain', async () => {
    const f = fixture(); f.pricing.updatePriceSets.mockImplementation(async () => { throw new Error('SECRET') })
    await POST(f.req, f.res); expect(f.res.status).toHaveBeenCalledWith(503); expect(JSON.stringify(f.res.json.mock.calls)).not.toContain('SECRET')
  })
})
