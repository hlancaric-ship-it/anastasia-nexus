import { evaluateProducts, hasBaseEurPrice, loadReadiness, READINESS_CHECKS } from '../readiness'

const legalEnv = { LEGAL_TERMS_VERSION: 't1', LEGAL_PRIVACY_VERSION: 'p1' } as any
const complete = { id: 'prod_a', status: 'published', thumbnail: 'https://cdn.example/a.jpg', images: [], categories: [{ id: 'pcat_a' }], sales_channels: [{ id: 'sc_a' }], variants: [{ id: 'var_a', prices: [{ amount: 50, currency_code: 'eur', price_list_id: null, rules_count: 0 }] }] }
function scope(data: Record<string, any[] | Error>) {
  const graph = jest.fn(async ({ entity, pagination }: any) => {
    const rows = data[entity]
    if (rows instanceof Error) throw rows
    const all = rows ?? []
    return { data: all.slice(pagination.skip, pagination.skip + pagination.take), metadata: { count: all.length } }
  })
  return { graph, scope: { resolve: () => ({ graph }) } }
}
const ready = { region: [{ id: 'reg_a', currency_code: 'eur', payment_providers: [{ id: 'pp_stripe_stripe', is_enabled: true }] }], shipping_option: [{ id: 'so_a' }], stock_location: [{ id: 'sloc_a' }], product: [complete] }
const byId = (r: any) => Object.fromEntries(r.checks.map((c: any) => [c.id, c]))

describe('admin store readiness', () => {
  it('reports every check ok only from complete real data', async () => {
    const r = await loadReadiness(scope(ready).scope, legalEnv)
    expect(r.checks.map((c: any) => c.id)).toEqual(READINESS_CHECKS.map(c => c.id))
    expect(r.checks.every((c: any) => c.status === 'ok' && c.count === 0)).toBe(true)
    expect(r.summary).toEqual({ blockers: 0, warnings: 0, unknown: 0 })
  })
  it('counts incomplete published products with severity and link', async () => {
    const bare = { id: 'prod_b', status: 'published', thumbnail: null, images: [], categories: [], sales_channels: [], variants: [{ id: 'var_b', prices: [] }] }
    const r = byId(await loadReadiness(scope({ ...ready, product: [complete, bare] }).scope, legalEnv))
    for (const id of ['products_without_price', 'products_without_channel', 'products_without_image', 'products_without_category']) expect(r[id]).toMatchObject({ status: 'problem', count: 1, href: '#/produkty' })
    expect(r.products_without_price.severity).toBe('blocker')
    expect(r.products_without_image.severity).toBe('warning')
  })
  it('flags missing region, payment, shipping, stock and legal versions', async () => {
    const r = await loadReadiness(scope({ region: [{ id: 'reg_c', currency_code: 'czk', payment_providers: [] }], shipping_option: [], stock_location: [], product: [] }).scope, {} as any)
    const c = byId(r)
    for (const id of ['region_eur', 'payment_provider', 'shipping_option', 'stock_location', 'legal_versions', 'products_published']) expect(c[id]).toMatchObject({ status: 'problem', count: 1 })
    expect(r.summary.blockers).toBe(4)
  })
  it('a disabled provider is not a payment method', async () => {
    const r = byId(await loadReadiness(scope({ ...ready, region: [{ id: 'reg_a', currency_code: 'eur', payment_providers: [{ id: 'pp_x', is_enabled: false }] }] }).scope, legalEnv))
    expect(r.payment_provider.status).toBe('problem')
  })
  it('unreadable data is unknown, never ok, and does not hide other checks', async () => {
    const r = await loadReadiness(scope({ ...ready, product: new Error('db down') }).scope, legalEnv)
    const c = byId(r)
    expect(c.products_without_price).toMatchObject({ status: 'unknown', count: null })
    expect(c.region_eur.status).toBe('ok')
    expect(r.summary.unknown).toBe(5)
  })
  it('too many products is unknown instead of a partial claim', async () => {
    const many = Array.from({ length: 2001 }, (_, i) => ({ ...complete, id: `prod_${i}` }))
    const c = byId(await loadReadiness(scope({ ...ready, product: many }).scope, legalEnv))
    expect(c.products_without_price.status).toBe('unknown')
  })
  it('price list and rule prices are not a base price', () => {
    expect(hasBaseEurPrice({ prices: [{ amount: 40, currency_code: 'eur', price_list_id: 'plist_sale' }] })).toBe(false)
    expect(hasBaseEurPrice({ prices: [{ amount: 40, currency_code: 'eur', rules_count: 1 }] })).toBe(false)
    expect(hasBaseEurPrice({ prices: [{ amount: 0, currency_code: 'eur' }] })).toBe(false)
    expect(evaluateProducts([{ ...complete, status: 'draft', variants: [] }]).products_without_price).toBe(0)
  })
})
