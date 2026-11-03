import { allocateFixedCoupon, couponAppliesToProduct, resolveCoupon } from '../coupon'

describe('Serverová politika kupónov', () => {
  const promotion = (over: any = {}) => ({
    id: 'promo_1',
    code: 'MONTELOPE',
    type: 'standard',
    is_automatic: false,
    is_tax_inclusive: true,
    rules: [],
    application_method: {
      type: 'fixed',
      target_type: 'items',
      allocation: 'across',
      value: 20,
      currency_code: 'eur',
      target_rules: [{ attribute: 'items.product.id', operator: 'in', values: ['prod_reset'] }],
      buy_rules: [],
      ...over,
    },
    ...(over.application_method ? {} : {}),
  })

  it('prevedie pevnú zľavu s obmedzením na produkty', () => {
    const resolved = resolveCoupon(promotion() as any, 'MONTELOPE')
    expect(resolved).toMatchObject({
      code: 'MONTELOPE',
      promotion_id: 'promo_1',
      type: 'fixed',
      value: 20,
      target: 'items',
      product_ids: ['prod_reset'],
      currency: 'eur',
      tax_inclusive: true,
    })
  })

  it('prevedie percentuálnu zľavu na celý košík (target_type order)', () => {
    const resolved = resolveCoupon(promotion({
      type: 'percentage',
      value: 10,
      target_type: 'order',
      target_rules: [],
    }) as any, 'MONTELOPE')
    expect(resolved).toMatchObject({ type: 'percentage', value: 10, target: 'order', product_ids: null })
  })

  it('prečíta hodnoty pravidla v tvare Medusa ({ value }) aj ako reťazce', () => {
    const fromObjects = resolveCoupon(promotion({
      target_rules: [{ attribute: 'items.product.id', operator: 'in', values: [{ value: 'prod_a' }, { value: 'prod_b' }] }],
    }) as any, 'MONTELOPE')
    expect(fromObjects?.product_ids).toEqual(['prod_a', 'prod_b'])
    const fromStrings = resolveCoupon(promotion({
      target_rules: [{ attribute: 'items.product.id', operator: 'in', values: ['prod_a'] }],
    }) as any, 'MONTELOPE')
    expect(fromStrings?.product_ids).toEqual(['prod_a'])
  })

  it('odmietne nepodporované pravidlá (kupón sa neuplatní vôbec)', () => {
    // pravidlo pre zákazníka
    expect(resolveCoupon({ ...promotion(), rules: [{ attribute: 'customer.id', operator: 'in', values: ['cus_1'] }] } as any, 'MONTELOPE')).toBeNull()
    // „kúpi X a dostane Y“
    expect(resolveCoupon(promotion({ buy_rules: [{ attribute: 'items.product.id', operator: 'in', values: ['prod_x'] }] }) as any, 'MONTELOPE')).toBeNull()
    // nepodporovaný typ kupónu
    expect(resolveCoupon(promotion({ type: 'buyget' }) as any, 'MONTELOPE')).toBeNull()
    // nepodporovaný rozsah
    expect(resolveCoupon(promotion({ target_type: 'shipping_methods' }) as any, 'MONTELOPE')).toBeNull()
    // nepodporované pravidlo na produkty (nie items.product.id)
    expect(resolveCoupon(promotion({ target_rules: [{ attribute: 'items.variant_id', operator: 'in', values: ['var_1'] }] }) as any, 'MONTELOPE')).toBeNull()
    // nepodporovaný operátor
    expect(resolveCoupon(promotion({ target_rules: [{ attribute: 'items.product.id', operator: 'eq', values: ['prod_reset'] }] }) as any, 'MONTELOPE')).toBeNull()
  })

  it('odmietne neplatné hodnoty (0 %, záporné, nad 100 %, iná mena)', () => {
    expect(resolveCoupon(promotion({ type: 'percentage', value: 0 }) as any, 'MONTELOPE')).toBeNull()
    expect(resolveCoupon(promotion({ type: 'percentage', value: -5 }) as any, 'MONTELOPE')).toBeNull()
    expect(resolveCoupon(promotion({ type: 'percentage', value: 101 }) as any, 'MONTELOPE')).toBeNull()
    expect(resolveCoupon(promotion({ currency_code: 'czk' }) as any, 'MONTELOPE')).toBeNull()
  })

  it('nerozpozná kupón s iným kódom', () => {
    expect(resolveCoupon(promotion() as any, 'INY')).toBeNull()
    expect(resolveCoupon(undefined, 'MONTELOPE')).toBeNull()
  })

  it('rozhodne, na ktorý produkt kupón platí', () => {
    const coupon = resolveCoupon(promotion() as any, 'MONTELOPE')
    expect(couponAppliesToProduct(coupon, 'prod_reset')).toBe(true)
    expect(couponAppliesToProduct(coupon, 'prod_other')).toBe(false)
    const all = resolveCoupon(promotion({ target_rules: [] }) as any, 'MONTELOPE')
    expect(couponAppliesToProduct(all, 'prod_other')).toBe(true)
    expect(couponAppliesToProduct(null, 'prod_reset')).toBe(false)
  })

  const line = (id: string, basePrice: number, quantity = 1) => ({ id, productId: 'prod_x', basePrice, quantity })
  const total = (allocation: Map<string, number>, items: Array<{ id: string; quantity: number }>) =>
    Math.round(items.reduce((sum, item) => sum + (allocation.get(item.id) ?? 0) * 100 * item.quantity, 0))

  it('rozdelí pevnú sumu medzi riadky úmerne (zľava za kus)', () => {
    const items = [line('line_1', 168), line('line_2', 50)]
    const allocation = allocateFixedCoupon(20, items)
    expect(allocation.get('line_1')).toBe(15.42)
    expect(allocation.get('line_2')).toBe(4.58)
    expect(total(allocation, items)).toBe(2000)
  })

  it('2 kusy: pevná suma platí raz za košík, nie za každý kus', () => {
    const items = [line('line_1', 168, 2)]
    const allocation = allocateFixedCoupon(20, items)
    expect(allocation.get('line_1')).toBe(10)
    expect(total(allocation, items)).toBe(2000)
  })

  it('zvyšok centov dostanú najprv riadky s menej kusmi, nikdy viac než suma kupónu', () => {
    const exact = [line('line_1', 10, 3), line('line_2', 10, 1)]
    expect(total(allocateFixedCoupon(20, exact), exact)).toBe(2000)
    const odd = [line('line_1', 10, 3)]
    const allocation = allocateFixedCoupon(20, odd)
    expect(allocation.get('line_1')).toBe(6.66)
    expect(total(allocation, odd)).toBe(1998)
  })

  it('pevná suma nikdy nezníži cenu pod 0 a nadbytok sa nerozdáva', () => {
    expect(allocateFixedCoupon(50, [line('line_1', 10)]).get('line_1')).toBe(10)
    const items = [line('line_1', 7.5, 2)]
    expect(total(allocateFixedCoupon(100, items), items)).toBe(1500)
  })

  it('bez položiek sa nič nerozdelí', () => {
    expect(allocateFixedCoupon(20, []).size).toBe(0)
    expect(allocateFixedCoupon(0, [line('line_1', 10)]).size).toBe(0)
  })
})
