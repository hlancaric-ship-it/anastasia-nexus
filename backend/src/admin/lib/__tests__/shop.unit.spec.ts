import { resolve } from 'node:path'
import { amount, categoryInput, couponInput, customerInput, listUrl, orderInput, priceUpdate, productInput, request, supportedCoupon, type Row } from '../shop'
const native = (name: string) => require(resolve(__dirname, `../../../../node_modules/@medusajs/medusa/dist/api/admin/${name}/validators.js`))
const variant = { id: 'variant_test', title: 'Základná', prices: [{ id: 'price_test', amount: 50, currency_code: 'eur' }] }
const values = { title: 'Nový produkt', description: 'Čistý text', status: 'draft', amount: '19,90', categories: 'cat_a,cat_b' }
const coupon: Row = { id: 'promo_test', code: 'TEST', type: 'standard', is_automatic: false, rules: [], application_method: { type: 'percentage', value: 10, target_type: 'items', target_rules: [], buy_rules: [] } }
describe('Shop native contracts and dangerous input', () => {
  it.each(['', '-1', 'NaN', 'Infinity', '1e2', '1.001', '1,2,3', '1 000', '1000000000'])('rejects invalid money %s', s => expect(() => amount(s)).toThrow())
  it('accepts a decimal comma and zero', () => { expect(amount('19,90')).toBe(19.9); expect(amount('0')).toBe(0) })
  it('creates a native draft with inventory, explicit channel/profile and no booking metadata', () => {
    const p = productInput(values, undefined, { channel: 'sc_test', profile: 'sp_test' })
    expect(native('products').AdminCreateProduct().safeParse(p).success).toBe(true)
    expect(p).toMatchObject({ status: 'draft', variants: [{ manage_inventory: true, allow_backorder: false }] })
    expect(p).not.toHaveProperty('metadata')
  })
  it('preserves variants/prices/metadata when editing text and requires setup for creation', () => {
    const p = productInput(values, { id: 'prod_test' })
    expect(native('products').AdminUpdateProduct().safeParse(p).success).toBe(true)
    expect(p).not.toHaveProperty('variants'); expect(p).not.toHaveProperty('metadata')
    expect(() => productInput(values)).toThrow('kanál')
  })
  it('rejects replacing multiple currencies or conditional price rules', () => {
    expect(priceUpdate(variant, '20,50')).toEqual({ prices: [{ id: 'price_test', currency_code: 'eur', amount: 20.5 }] })
    for (const prices of [[...variant.prices, { id: 'usd', amount: 1, currency_code: 'usd' }], [{ ...variant.prices[0], min_quantity: 2 }], [{ ...variant.prices[0], rules: { region_id: 'reg_test' } }]]) expect(() => priceUpdate({ ...variant, prices }, '10')).toThrow('pravidlá')
  })
  it('creates a native unconditional percentage coupon and updates it without resetting rules', () => {
    const v = { code: 'JAR10', value: '10', limit: '5', status: 'draft' }
    expect(native('promotions').AdminCreatePromotion().safeParse(couponInput(v)).success).toBe(true)
    expect(supportedCoupon(coupon)).toBe(true)
    expect(native('promotions').AdminUpdatePromotion().safeParse(couponInput(v, coupon)).success).toBe(true)
    expect(couponInput(v, coupon)).not.toHaveProperty('rules')
    expect(() => couponInput(v, { ...coupon, rules: [{}] })).toThrow('pravidlá')
    expect(() => couponInput(v, { ...coupon, used: 6 })).toThrow('počet použití')
  })
  it.each(['0', '100.01', '-1', 'NaN'])('rejects unsafe discount %s', value => expect(() => couponInput({ code: 'X', value, status: 'active' })).toThrow())
  it('validates native categories and rejects self-parent', () => {
    expect(native('product-categories').AdminCreateProductCategory().safeParse(categoryInput({ name: 'Programy', is_active: 'true' })).success).toBe(true)
    expect(() => categoryInput({ name: 'X', parent_category_id: 'cat_a' }, { id: 'cat_a' })).toThrow('sama')
  })
  it('validates customer email and native payload', () => {
    expect(native('customers').AdminCreateCustomer().safeParse(customerInput({ first_name: 'Ukážka', last_name: 'Test', email: 'synthetic@example.test' })).success).toBe(true)
    expect(() => customerInput({ first_name: 'A', last_name: 'B', email: 'invalid' })).toThrow('e-mail')
  })
  it('preserves order metadata and never supplies a payment state or amount', () => {
    const p = orderInput({ email: 'synthetic@example.test', note: 'Poznámka' }, { id: 'order_a', metadata: { legal: 'keep' } })
    expect(native('orders').AdminUpdateOrder.safeParse(p).success).toBe(true)
    expect(p.metadata).toEqual({ legal: 'keep', shop_admin_note: 'Poznámka' })
    expect(p).not.toHaveProperty('payment_status'); expect(p).not.toHaveProperty('total')
  })
  it('encodes search as one parameter', () => {
    const u = new URL(listUrl('produkty', 'a+b&limit=500', 12), 'http://localhost')
    expect(u.searchParams.get('q')).toBe('a+b&limit=500'); expect(u.searchParams.get('limit')).toBe('12')
  })
})
describe('Shop transport', () => {
  const original = global.fetch
  afterEach(() => { global.fetch = original })
  it.each([401, 403, 404, 409, 429])('does not echo raw backend errors (%s)', async status => {
    global.fetch = jest.fn(async () => ({ ok: false, status })) as unknown as typeof fetch
    await expect(request('/admin/products', {})).rejects.not.toThrow('SECRET_INTERNAL_ERROR')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
  it('does not repeat an ambiguous write', async () => {
    global.fetch = jest.fn(async () => { throw new Error('network') }) as typeof fetch
    await expect(request('/admin/products', {})).rejects.toMatchObject({ uncertain: true })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
  it('does not treat malformed JSON or 5xx as a confirmed write', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => { throw new Error('bad') } })) as unknown as typeof fetch
    await expect(request('/admin/products', {})).rejects.toMatchObject({ uncertain: true })
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch
    await expect(request('/admin/products', {})).rejects.toMatchObject({ uncertain: true })
  })
})
