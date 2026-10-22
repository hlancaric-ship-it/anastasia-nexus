import { couponLimitState, recordCouponUsage } from '../coupon-usage'

describe('Započítanie použitia kupónu', () => {
  const scopeWith = (options: {
    promotionId?: string | null
    rows?: unknown[]
    throwOnRaw?: boolean
    promotion?: { limit?: number | null; used?: number }
  } = {}) => {
    const raw = jest.fn(async () => {
      if (options.throwOnRaw) throw new Error('db down')
      return { rows: options.rows ?? [] }
    })
    const query = {
      graph: jest.fn(async (args: any) => {
        if (args?.entity === 'promotion') {
          return { data: [{ id: 'promo_1', limit: options.promotion?.limit ?? null, used: options.promotion?.used ?? 0 }] }
        }
        return {
          data: [{ id: 'cart_1', metadata: options.promotionId ? { nexus_coupon: { promotion_id: options.promotionId } } : {} }],
        }
      }),
    }
    return {
      scope: { resolve: (key: string) => (key === 'query' ? query : { raw }) } as any,
      raw,
      query,
    }
  }

  it('bez kupónu sa nič nezapočíta', async () => {
    const { scope, raw } = scopeWith({ promotionId: null })
    const result = await recordCouponUsage(scope, { cartId: 'cart_1', orderId: 'order_1' })
    expect(result).toEqual({ promotion_id: null, counted: false, exhausted: false, duplicate: false })
    expect(raw).not.toHaveBeenCalled()
  })

  it('započíta použitie jedným atomickým UPDATE', async () => {
    const { scope, raw } = scopeWith({ promotionId: 'promo_1', rows: [{ claimed: 1, counted: 1 }] })
    const result = await recordCouponUsage(scope, { cartId: 'cart_1', orderId: 'order_1' })
    expect(result).toEqual({ promotion_id: 'promo_1', counted: true, exhausted: false, duplicate: false })
    expect(raw).toHaveBeenCalledTimes(1)
    const [sql, params] = raw.mock.calls[0] as any[]
    expect(String(sql)).toContain('used = COALESCE(used, 0) + 1')
    // Podmienka na limit je v tom istom UPDATE (atomicky, bez pretečenia).
    // `limit` je v PostgreSQL rezervované slovo – musí byť v uvozovkách.
    expect(String(sql)).toContain('COALESCE(used, 0) < "limit"')
    expect(params).toEqual(['promo_1', 'order_1', 'promo_1'])
  })

  it('jedna objednávka sa započíta iba raz (idempotentne podľa order id)', async () => {
    // Druhý pokus: značka na objednávke už existuje (claimed = 0) → počítadlo sa nemení.
    const { scope, raw } = scopeWith({ promotionId: 'promo_1', rows: [{ claimed: 0, counted: 0 }] })
    const result = await recordCouponUsage(scope, { cartId: 'cart_1', orderId: 'order_1' })
    expect(result).toEqual({ promotion_id: 'promo_1', counted: false, exhausted: false, duplicate: true })
    expect(raw).toHaveBeenCalledTimes(1)
    const [sql] = raw.mock.calls[0] as any[]
    // Zvýšenie počítadla prebehne iba vtedy, keď značku získala práve táto objednávka.
    expect(String(sql)).toContain('EXISTS (SELECT 1 FROM claim)')
    expect(String(sql)).toContain('nexus_coupon_usage')
  })

  it('vyčerpaný limit sa nahlási (objednávka ostáva)', async () => {
    const { scope } = scopeWith({ promotionId: 'promo_1', rows: [{ claimed: 1, counted: 0 }] })
    const result = await recordCouponUsage(scope, { cartId: 'cart_1', orderId: 'order_1' })
    expect(result).toEqual({ promotion_id: 'promo_1', counted: false, exhausted: true, duplicate: false })
  })

  it('chyba databázy nespadne a nevyhodí objednávku', async () => {
    const { scope } = scopeWith({ promotionId: 'promo_1', throwOnRaw: true })
    const result = await recordCouponUsage(scope, { cartId: 'cart_1', orderId: 'order_1' })
    expect(result).toEqual({ promotion_id: null, counted: false, exhausted: false, duplicate: false })
  })

  it('stav limitu kupónu sa prečíta read-only', async () => {
    const { scope } = scopeWith({ promotion: { limit: 1, used: 1 } })
    expect(await couponLimitState(scope, 'promo_1')).toEqual({ limit: 1, used: 1, exhausted: true })
    const { scope: freeScope } = scopeWith({ promotion: { limit: null, used: 7 } })
    expect(await couponLimitState(freeScope, 'promo_1')).toEqual({ limit: null, used: 7, exhausted: false })
  })
})
