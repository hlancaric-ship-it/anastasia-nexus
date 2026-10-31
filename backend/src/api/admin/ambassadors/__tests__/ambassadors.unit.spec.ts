import { GET as listAmbassadorsRoute, POST as createAmbassadorRoute } from '../route'
import { GET as getAmbassadorRoute, POST as updateAmbassadorRoute } from '../[id]/route'
import { GET as getSettingsRoute, POST as updateSettingsRoute } from '../settings/route'
import { findActiveAmbassadorByCode } from '../../../../lib/ambassador/service'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'

jest.mock('../../../../lib/observability/audit', () => ({
  adminActor: (r: any) => (r.auth_context?.actor_type === 'user' ? r.auth_context.actor_id : null),
  auditAdminChange: jest.fn(async () => null),
}))

function fixture(extra: any = {}) {
  const store = { id: 'store_1', metadata: { anastasia_ambassadors: { enabled: true, default_percent: 10, cookie_days: 30 } } }
  const storeModule = {
    listStores: jest.fn(async () => [store]),
    updateStores: jest.fn(async (_: string, data: any) => { Object.assign(store, data) }),
  }

  const customer1 = {
    id: 'cus_1',
    first_name: 'Mária',
    last_name: 'Kováčová',
    email: 'maria@example.com',
    metadata: {
      ambassador: {
        code: 'MARIA10',
        commission_percent: 10,
        status: 'active',
        joined_at: '2026-10-01T10:00:00Z',
        note: 'Instagram',
        payouts: [{ id: 'pay_1', amount: 50, created_at: '2026-10-15T10:00:00Z' }],
      },
    },
  }

  const customer2 = {
    id: 'cus_2',
    first_name: 'Jana',
    last_name: 'Nováková',
    email: 'jana@example.com',
    metadata: {
      ambassador: {
        code: 'JANA15',
        commission_percent: 15,
        status: 'paused',
        joined_at: '2026-10-05T10:00:00Z',
      },
    },
  }

  const order1 = {
    id: 'order_1',
    display_id: 101,
    total: 200,
    currency_code: 'eur',
    status: 'completed',
    payment_status: 'captured',
    created_at: '2026-10-10T12:00:00Z',
    customer: { first_name: 'Anna', last_name: 'Zákazníčka', email: 'anna@example.com' },
    metadata: {
      ambassador: {
        customer_id: 'cus_1',
        code: 'MARIA10',
        commission_percent: 10,
        commission_amount: 20,
      },
    },
  }

  const customers = [customer1, customer2]
  const orders = [order1]

  const customerModule = {
    createCustomers: jest.fn(async (input: any) => {
      const c = { id: `cus_${Date.now()}`, ...input, metadata: {} }
      customers.push(c)
      return c
    }),
    updateCustomers: jest.fn(async (id: string, input: any) => {
      const c = customers.find((x) => x.id === id)
      if (c) Object.assign(c, input)
      return c
    }),
  }

  const query = {
    graph: jest.fn(async ({ entity, filters }: any) => {
      if (entity === 'customer') {
        if (filters?.id) return { data: customers.filter((c) => c.id === filters.id) }
        if (filters?.email) return { data: customers.filter((c) => c.email === filters.email) }
        return { data: customers }
      }
      if (entity === 'order') {
        if (filters?.id) return { data: orders.filter((o) => o.id === filters.id) }
        return { data: orders }
      }
      return { data: [] }
    }),
  }

  const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() }

  const req: any = {
    auth_context: { actor_type: 'user', actor_id: 'admin_1' },
    params: {},
    body: {},
    query: {},
    scope: {
      resolve: (key: string) => {
        if (key === ContainerRegistrationKeys.QUERY) return query
        if (key === ContainerRegistrationKeys.LOGGER) return logger
        if (key === Modules.STORE) return storeModule
        if (key === Modules.CUSTOMER) return customerModule
        return null
      },
    },
    ...extra,
  }

  const res: any = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }

  return { req, res, customers, orders, store, customerModule, storeModule, query }
}

describe('Ambassadors Admin API', () => {
  it('requires an admin actor for GET and POST', async () => {
    const f = fixture({ auth_context: { actor_type: 'customer', actor_id: 'cus_1' } })
    await listAmbassadorsRoute(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)

    await createAmbassadorRoute(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
  })

  it('lists ambassadors with calculated revenue and commissions', async () => {
    const f = fixture()
    await listAmbassadorsRoute(f.req, f.res)

    expect(f.res.status).toHaveBeenCalledWith(200)
    const json = f.res.json.mock.calls[0][0]
    expect(json.count).toBe(2)
    expect(json.totals.total_ambassadors).toBe(2)
    expect(json.totals.active_ambassadors).toBe(1)
    expect(json.totals.total_revenue).toBe(200)
    expect(json.totals.total_commission).toBe(20)

    const maria = json.ambassadors.find((a: any) => a.code === 'MARIA10')
    expect(maria).toBeDefined()
    expect(maria.revenue).toBe(200)
    expect(maria.commission_total).toBe(20)
    expect(maria.commission_paid).toBe(50)
    expect(maria.commission_pending).toBe(0)
  })

  it('creates a new ambassador and enforces code uniqueness', async () => {
    const f = fixture({
      body: {
        name: 'Eva Zelená',
        email: 'eva@example.com',
        code: 'EVA20',
        commission_percent: 12,
        note: 'Influencerka',
      },
    })
    await createAmbassadorRoute(f.req, f.res)

    expect(f.res.status).toHaveBeenCalledWith(201)
    const json = f.res.json.mock.calls[0][0]
    expect(json.ambassador.code).toBe('EVA20')
    expect(json.ambassador.commission_percent).toBe(12)

    // Attempt duplicate code
    const f2 = fixture({
      body: {
        email: 'dalsia@example.com',
        code: 'EVA20',
      },
    })
    // Push the created one into mock customers
    f2.customers.push({
      id: json.ambassador.id,
      email: json.ambassador.email,
      metadata: { ambassador: { code: json.ambassador.code } },
    })
    await createAmbassadorRoute(f2.req, f2.res)
    expect(f2.res.status).toHaveBeenCalledWith(409)
  })

  it('fetches ambassador detail with attributed orders', async () => {
    const f = fixture({ params: { id: 'cus_1' } })
    await getAmbassadorRoute(f.req, f.res)

    expect(f.res.status).toHaveBeenCalledWith(200)
    const json = f.res.json.mock.calls[0][0]
    expect(json.ambassador.code).toBe('MARIA10')
    expect(json.orders).toHaveLength(1)
    expect(json.orders[0].display_id).toBe(101)
    expect(json.orders[0].commission_amount).toBe(20)
  })

  it('records a payout and updates ambassador payout history', async () => {
    const f = fixture({
      params: { id: 'cus_1' },
      body: { action: 'payout', amount: 30, period: '10/2026', note: 'Prevod VUB' },
    })
    await updateAmbassadorRoute(f.req, f.res)

    expect(f.res.status).toHaveBeenCalledWith(200)
    expect(f.customerModule.updateCustomers).toHaveBeenCalled()
  })

  it('reads and updates global ambassador settings', async () => {
    const f = fixture()
    await getSettingsRoute(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(200)
    expect(f.res.json.mock.calls[0][0].settings.default_percent).toBe(10)

    f.req.body = { default_percent: 15, cookie_days: 60 }
    await updateSettingsRoute(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(200)
    expect(f.storeModule.updateStores).toHaveBeenCalled()
  })

  it('findActiveAmbassadorByCode returns active ambassador and rejects paused', async () => {
    const f = fixture()
    const active = await findActiveAmbassadorByCode(f.req.scope, 'MARIA10')
    expect(active).not.toBeNull()
    expect(active?.customer_id).toBe('cus_1')

    const paused = await findActiveAmbassadorByCode(f.req.scope, 'JANA15')
    expect(paused).toBeNull()

    const nonexistent = await findActiveAmbassadorByCode(f.req.scope, 'NONEXISTENT')
    expect(nonexistent).toBeNull()
  })
})
