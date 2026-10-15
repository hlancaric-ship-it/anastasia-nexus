import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { acceptCheckoutConsent } from './legal-fixtures'

/** Invoked only by the existing private-cluster CI runner. Positive assertions prove weaknesses. */
export async function verifyAuditHttp({ api, container, options, evidence }: any) {
  const record = (scenario: string, extra: Record<string, unknown> = {}) => evidence.push({ scenario, status: 'CONFIRMED_BASELINE_BEHAVIOR', ...extra })
  const success = async (path: string, body: unknown) => {
    const response = await api.post(path, body, options)
    if (response.status >= 300) {
      const code = typeof response.data?.error === 'string' && /^[A-Z0-9_]{2,80}$/.test(response.data.error) ? response.data.error : 'UNCLASSIFIED'
      throw new Error(`AUDIT_HTTP_REJECTED path=${path} status=${response.status} code=${code}`)
    }
    return response.data
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const one = async (entity: string, filters: any, fields: string[]) => (await query.graph({ entity, filters, fields })).data[0]
  const region = await one('region', { name: 'Slovensko' }, ['id'])
  const variant = await one('product_variant', { sku: 'SYNTHETIC-P0-50' }, ['id', 'product_id'])
  const other = await one('product_variant', { sku: 'SYNTHETIC-P0-400' }, ['id', 'product_id'])
  const customer = await container.resolve(Modules.CUSTOMER).createCustomers({ email: 'audit-coupon-eligible@example.test' })
  const code = 'SYNTHETIC-AUDIT-RESTRICTED'
  const promotions = container.resolve(Modules.PROMOTION)
  const promotion = await promotions.createPromotions({
    code, type: 'standard', status: 'active', limit: 10,
    rules: [{ attribute: 'customer_id', operator: 'eq', values: [customer.id] }],
    application_method: { type: 'percentage', value: 10, target_type: 'items', allocation: 'across', target_rules: [{ attribute: 'product_id', operator: 'eq', values: [other.product_id] }] },
  })
  const stored = await promotions.retrievePromotion(promotion.id, { relations: ['rules.values', 'application_method.target_rules.values'] })
  expect(stored.rules.length).toBe(1)
  expect(stored.application_method.target_rules.length).toBe(1)
  const cart = (await success('/store/carts', { region_id: region.id, email: 'audit-coupon-ineligible@example.test', shipping_address: { first_name: 'Synthetic', last_name: 'Audit', address_1: 'Synthetic 1', city: 'Bratislava', postal_code: '81101', country_code: 'sk' } })).cart
  expect(cart.customer_id).not.toBe(customer.id)
  await acceptCheckoutConsent(api, cart.id, options)
  await success(`/store/carts/${cart.id}/line-items`, { variant_id: variant.id, quantity: 1 })
  const price = await success('/store/nexus-cart', { cart_id: cart.id, couponCode: code })
  expect(price.items[0].unit_price).toBe(45)
  const shipping = await api.get(`/store/shipping-options?cart_id=${cart.id}`, options)
  expect(shipping.status).toBe(200)
  await success(`/store/carts/${cart.id}/shipping-methods`, { option_id: shipping.data.shipping_options[0].id })
  const collection = await success('/store/payment-collections', { cart_id: cart.id })
  await success(`/store/payment-collections/${collection.payment_collection.id}/payment-sessions`, { provider_id: 'pp_system_default' })
  const completed = await success('/store/nexus-checkout', { cart_id: cart.id })
  const order = await one('order', { id: completed.order.id }, ['id', 'customer_id', 'items.product_id', 'items.unit_price'])
  expect(order.customer_id).not.toBe(customer.id)
  expect(order.items[0].product_id).not.toBe(other.product_id)
  expect(Number(order.items[0].unit_price)).toBe(45)
  expect((await promotions.retrievePromotion(promotion.id)).used).toBe(1)
  record('AUD-MONEY-01_RESTRICTED_COUPON_COMPLETES_INELIGIBLE_ORDER', { unitPrice: 45, catalogPrice: 50, wrongCustomer: true, wrongProduct: true, realPostgres: true })

  // Native HTTP authentication, native cache state and real provider; suppress delivery of synthetic mail only.
  const email = 'audit-magic-victim@example.test'
  await container.resolve(Modules.CUSTOMER).createCustomers({ email })
  const events = container.resolve(Modules.EVENT_BUS)
  const originalEmit = events.emit.bind(events)
  const links: string[] = []
  const spy = jest.spyOn(events, 'emit').mockImplementation(async (...args: any[]) => {
    const event = args[0]
    if (event?.name === 'auth-magic-link.requested' && event.data?.email === email) { links.push(event.data.url); return }
    return originalEmit(...args)
  })
  try {
    const path = '/auth/customer/magic-link'
    await api.post(path, { email }, options)
    expect(links).toHaveLength(1)
    const first = new URL(links[0]).searchParams.get('token')!
    expect((await api.post(path, { email, token: 'synthetic-wrong-token' }, options)).status).toBe(401)
    expect((await api.post(path, { email, token: first }, options)).status).toBe(401)
    await api.post(path, { email }, options)
    const second = new URL(links[1]).searchParams.get('token')!
    expect((await api.post(path, { email, token: second }, options)).status).toBe(200)
    record('AUD-AUTH-01_HTTP_INVALID_TOKEN_DESTROYS_PENDING_LINK', { invalid: 401, legitimateAfterAttack: 401, freshControl: 200 })
    const before = links.length
    for (let i = 0; i < 12; i++) expect((await api.post(path, { email }, options)).status).not.toBe(429)
    expect(links.length - before).toBe(12)
    record('AUD-AUTH-03_HTTP_12_MAIL_REQUESTS_ACCEPTED', { mailEvents: 12, externalMailSent: 0 })
  } finally { spy.mockRestore() }
}
