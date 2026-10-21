import { recordCouponUsage } from '../coupon-usage'

describe('Započítanie použitia kupónu', () => {
  const scopeWith = (options: { promotionId?: string | null; rows?: unknown[]; throwOnRaw?: boolean } = {}) => {
    const raw = jest.fn(async () => {
      if (options.throwOnRaw) throw new Error('db down')
      return { rows: options.rows ?? [] }
    })
    const query = {
      graph: jest.fn(async () => ({
        data: [{ id: 'cart_1', metadata: options.promotionId ? { nexus_coupon: { promotion_id: options.promotionId } } : {} }],
      })),
    }
    return {
      scope: { resolve: (key: string) => (key === 'query' ? query : { raw }) } as any,
      raw,
    }
  }

  it('bez kupónu sa nič nezapočíta', async () => {
    const { scope, raw } = scopeWith({ promotionId: null })
    const result = await recordCouponUsage(scope, 'cart_1')
    expect(result).toEqual({ promotion_id: null, counted: false, exhausted: false })
    expect(raw).not.toHaveBeenCalled()
  })

  it('započíta použitie jedným atomickým UPDATE', async () => {
    const { scope, raw } = scopeWith({ promotionId: 'promo_1', rows: [{ id: 'promo_1' }] })
    const result = await recordCouponUsage(scope, 'cart_1')
    expect(result).toEqual({ promotion_id: 'promo_1', counted: true, exhausted: false })
    expect(raw).toHaveBeenCalledTimes(1)
    const [sql, params] = raw.mock.calls[0] as any[]
    expect(String(sql)).toContain('used = COALESCE(used, 0) + 1')
    // Podmienka na limit je v tom istom UPDATE (atomicky, bez pretečenia).
    expect(String(sql)).toContain('COALESCE(used, 0) < limit')
    expect(params).toEqual(['promo_1'])
  })

  it('vyčerpaný limit sa nahlási (objednávka ostáva)', async () => {
    const { scope } = scopeWith({ promotionId: 'promo_1', rows: [] })
    const result = await recordCouponUsage(scope, 'cart_1')
    expect(result).toEqual({ promotion_id: 'promo_1', counted: false, exhausted: true })
  })

  it('chyba databázy nespadne a nevyhodí objednávku', async () => {
    const { scope } = scopeWith({ promotionId: 'promo_1', throwOnRaw: true })
    const result = await recordCouponUsage(scope, 'cart_1')
    expect(result).toEqual({ promotion_id: null, counted: false, exhausted: false })
  })
})
