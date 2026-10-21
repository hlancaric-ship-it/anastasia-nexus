import { GET, PUT } from '../loyalty-policy/route'
import { readLoyaltySettingsFromStore, saveLoyaltySettingsToStore } from '../../../../lib/loyalty/settings'
import { syncLoyaltyPolicyToWorker } from '../../../../lib/nexus/loyalty-policy-sync'
import { auditAdminChange } from '../../../../lib/observability/audit'

jest.mock('../../../../lib/observability/audit', () => ({
  adminActor: (r: any) => (r.auth_context?.actor_type === 'user' ? r.auth_context.actor_id : null),
  auditAdminChange: jest.fn(async () => null),
}))
jest.mock('../../../../lib/loyalty/settings', () => ({
  readLoyaltySettingsFromStore: jest.fn(),
  saveLoyaltySettingsToStore: jest.fn(),
}))
jest.mock('../../../../lib/nexus/loyalty-policy-sync', () => ({ syncLoyaltyPolicyToWorker: jest.fn(async () => ({ synced: true, status: 200 })) }))

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
// Administrátor je vlastník – cenovú politiku mení iba on.
const userService = { retrieveUser: jest.fn(async () => ({ id: 'user_1', email: 'admin@anastasia.test', metadata: { anastasia_role: 'owner' } })) }
const scope = {
  resolve: (key: string) => {
    if (key === 'user') return userService
    return logger
  },
}

function fixture(body: unknown = {}) {
  const req: any = { body, query: {}, params: {}, auth_context: { actor_type: 'user', actor_id: 'user_1' }, scope }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(readLoyaltySettingsFromStore).mockResolvedValue({ tiers: [], updated_at: null, updated_by: null })
  jest.mocked(saveLoyaltySettingsToStore).mockResolvedValue({
    tiers: [{ code: 'ZR1', name: 'Bronze', discount_percent: 2, spend_threshold_eur: 0, enabled: true, rank: 1 }],
    updated_at: '2026-10-21T10:00:00.000Z',
    updated_by: 'user_1',
  })
})

describe('Politika vernostných úrovní (admin API)', () => {
  it('zamietne zákazníka', async () => {
    const f = fixture()
    f.req.auth_context = { actor_type: 'customer', actor_id: 'cus_1' }
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(readLoyaltySettingsFromStore).not.toHaveBeenCalled()
  })

  it('vráti politiku zo servera', async () => {
    const f = fixture()
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(200)
    expect(f.res.json).toHaveBeenCalledWith({ tiers: [], updated_at: null, updated_by: null })
  })

  it('odmietne zľavu mimo povoleného rozsahu pred zápisom', async () => {
    const f = fixture({ tiers: [{ code: 'ZR1', name: 'Bronze', discount_percent: 80, spend_threshold_eur: null, enabled: true }] })
    await PUT(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(saveLoyaltySettingsToStore).not.toHaveBeenCalled()
  })

  it('uloží politiku, zapíše audit a odošle ju do Workera', async () => {
    const f = fixture({ tiers: [{ code: 'ZR1', name: 'Bronze', discount_percent: 2, spend_threshold_eur: 0, enabled: true }] })
    await PUT(f.req, f.res)
    expect(saveLoyaltySettingsToStore).toHaveBeenCalledWith(scope, expect.any(Array), 'user_1')
    expect(auditAdminChange).toHaveBeenCalledWith(f.req, 'admin.loyalty.policy.update', 'store', 'loyalty_policy',
      expect.anything(), expect.anything())
    expect(syncLoyaltyPolicyToWorker).toHaveBeenCalled()
    const body = f.res.json.mock.calls[0][0]
    expect(body.tiers[0]).toMatchObject({ code: 'ZR1', discount_percent: 2 })
    expect(body.worker_sync).toEqual({ synced: true, status: 200 })
  })

  it('nevyhlási uloženie, keď sa zápis do DB nepodarí', async () => {
    jest.mocked(saveLoyaltySettingsToStore).mockRejectedValueOnce(new Error('DB down'))
    const f = fixture({ tiers: [{ code: 'ZR1', name: 'Bronze', discount_percent: 2, spend_threshold_eur: null, enabled: true }] })
    await PUT(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(503)
    expect(auditAdminChange).not.toHaveBeenCalled()
  })
})
