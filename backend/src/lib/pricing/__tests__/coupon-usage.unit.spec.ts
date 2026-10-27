import { couponLimitState, promotionIdForCode, recordCouponUsage } from '../coupon-usage'

describe('Započítanie použitia kupónu', () => {
  const scopeWith = (options: {
    promotionId?: string | null
    rows?: unknown[]
    throwOnRaw?: boolean
    unknownCode?: boolean
    promotion?: { limit?: number | null; used?: number }
  } = {}) => {
    const raw = jest.fn(async () => {
      if (options.throwOnRaw) throw new Error('db down')
      return { rows: options.rows ?? [] }
    })
    const query = {
      graph: jest.fn(async (args: any) => {
        if (args?.entity === 'promotion' && args?.filters?.code !== undefined) {
          // Akcia sa hľadá podľa kódu – ID v metadátach košíka sa ignoruje.
          return { data: options.unknownCode ? [] : [{ id: 'promo_1', code: args.filters.code }] }
        }
        if (args?.entity === 'promotion') {
          return { data: [{ id: 'promo_1', limit: options.promotion?.limit ?? null, used: options.promotion?.used ?? 0 }] }
        }
        return {
          data: [{ id: 'cart_1', metadata: options.promotionId ? { nexus_coupon: { code: 'SYNTHETIC-ONCE', promotion_id: options.promotionId } } : {} }],
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

  it('podvrhnuté promotion_id v metadátach sa ignoruje – započíta sa akcia podľa kódu', async () => {
    const { scope, raw } = scopeWith({ promotionId: 'promo_spoofed', rows: [{ claimed: 1, counted: 1 }] })
    const result = await recordCouponUsage(scope, { cartId: 'cart_1', orderId: 'order_1' })
    expect(result.promotion_id).toBe('promo_1')
    const [, params] = raw.mock.calls[0] as any[]
    expect(params).toEqual(['promo_1', 'order_1', 'promo_1'])
  })

  it('kód bez akcie sa nezapočíta', async () => {
    const { scope, raw } = scopeWith({ promotionId: 'promo_1', unknownCode: true })
    expect(await recordCouponUsage(scope, { cartId: 'cart_1', orderId: 'order_1' })).toEqual({ promotion_id: null, counted: false, exhausted: false, duplicate: false })
    expect(raw).not.toHaveBeenCalled()
  })

  it('promotionIdForCode odmietne prázdny alebo nejednoznačný kód', async () => {
    const graph = jest.fn(async () => ({ data: [{ id: 'promo_1' }, { id: 'promo_2' }] }))
    const scope = { resolve: () => ({ graph }) } as any
    expect(await promotionIdForCode(scope, '  ')).toBeNull()
    expect(graph).not.toHaveBeenCalled()
    expect(await promotionIdForCode(scope, 'DUP')).toBeNull()
  })

  it('stav limitu kupónu sa prečíta read-only', async () => {
    const { scope } = scopeWith({ promotion: { limit: 1, used: 1 } })
    expect(await couponLimitState(scope, 'promo_1')).toEqual({ limit: 1, used: 1, exhausted: true })
    const { scope: freeScope } = scopeWith({ promotion: { limit: null, used: 7 } })
    expect(await couponLimitState(freeScope, 'promo_1')).toEqual({ limit: null, used: 7, exhausted: false })
  })
})

describe('Predbežná kontrola vyčerpaného kupónu (C8)', () => {
  const { assertCouponNotExhausted, isCartLockError } = require('../coupon-usage')
  const scopeFor = (o: { coupon?: boolean; used?: number; limit?: number | null; own?: boolean; completed?: boolean; graphFails?: boolean } = {}) => {
    const first = jest.fn(async () => (o.own ? { id: 'cur_1' } : undefined))
    const builder: any = { where: jest.fn(() => builder), whereIn: jest.fn(() => builder), first }
    const db = jest.fn(() => builder)
    const query = {
      graph: jest.fn(async (args: any) => {
        if (o.graphFails) throw new Error('db down')
        if (args.entity === 'cart') return { data: [{ id: 'cart_1', completed_at: o.completed ? new Date() : null, metadata: o.coupon === false ? {} : { nexus_coupon: { code: 'SYNTHETIC-ONCE', promotion_id: 'promo_1' } } }] }
        if (args.filters?.code) return { data: [{ id: 'promo_1', code: args.filters.code }] }
        return { data: [{ id: 'promo_1', limit: o.limit === undefined ? 1 : o.limit, used: o.used ?? 0 }] }
      }),
    }
    return { scope: { resolve: (key: string) => (key === 'query' ? query : db) } as any, db, first }
  }

  it('odmietne košík s vyčerpaným kupónom bez vlastnej rezervácie', async () => {
    await expect(assertCouponNotExhausted(scopeFor({ used: 1 }).scope, 'cart_1')).rejects.toThrow('COUPON_LIMIT_EXHAUSTED')
  })

  it.each([
    ['voľný limit', { used: 0 }],
    ['bez limitu', { used: 5, limit: null }],
    ['bez kupónu', { coupon: false, used: 1 }],
    ['vlastná rezervácia (opakovaný checkout)', { used: 1, own: true }],
    ['dokončený košík', { used: 1, completed: true }],
    ['výpadok vyhľadávania – rozhodne hook', { graphFails: true }],
  ])('pustí ďalej: %s', async (_label, options) => {
    await expect(assertCouponNotExhausted(scopeFor(options).scope, 'cart_1')).resolves.toBeUndefined()
  })

  it('vlastnú rezerváciu hľadá podľa košíka, akcie a živého stavu', async () => {
    const { scope, db } = scopeFor({ used: 1, own: true })
    await assertCouponNotExhausted(scope, 'cart_1')
    expect(db).toHaveBeenCalledWith('coupon_usage_reservation')
  })

  it('rozpozná chyby zámku košíka', () => {
    expect(isCartLockError('Failed to acquire lock for key "cart_01X"')).toBe(true)
    expect(isCartLockError('Timed-out acquiring lock.')).toBe(true)
    expect(isCartLockError('COUPON_LIMIT_EXHAUSTED')).toBe(false)
  })
})
