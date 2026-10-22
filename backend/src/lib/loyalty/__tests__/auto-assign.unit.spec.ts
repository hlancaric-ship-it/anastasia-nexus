import { assignCustomerTierAutomatically, customerSpendTotal, orderCustomerId } from '../auto-assign'
import { readLoyaltySettingsFromStore } from '../settings'
import { applyLoyaltyAssignment, readLoyaltyAssignment } from '../assignment'
import type { LoyaltyTier } from '../policy'

jest.mock('../settings', () => ({ readLoyaltySettingsFromStore: jest.fn() }))
jest.mock('../assignment', () => ({ applyLoyaltyAssignment: jest.fn(), readLoyaltyAssignment: jest.fn() }))

const tier = (over: Partial<LoyaltyTier> = {}): LoyaltyTier => ({
  code: 'ZR1', name: 'Bronze', discount_percent: 0, spend_threshold_eur: null, enabled: false, rank: 1, ...over,
})

const graph = jest.fn(async (args: any) => {
  if (args.entity === 'order' && args.fields?.includes('customer_id')) {
    return { data: [{ id: 'order_1', customer_id: 'cus_1' }] }
  }
  if (args.entity === 'order') {
    return { data: [{ id: 'order_1', status: 'completed', total: 600, payment_collections: [{ captured_amount: 600, refunded_amount: 0 }] }] }
  }
  return { data: [{ id: 'cus_1', customer_id: 'cus_1' }] }
})
const scope: any = { resolve: () => ({ graph }) }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(readLoyaltySettingsFromStore).mockResolvedValue({
    tiers: [
      tier({ code: 'ZR1', rank: 1, enabled: true, spend_threshold_eur: 0 }),
      tier({ code: 'ZR2', rank: 2, enabled: true, spend_threshold_eur: 500 }),
    ],
    updated_at: null,
    updated_by: null,
  })
  jest.mocked(readLoyaltyAssignment).mockResolvedValue({ tier_code: null, tier_name: null, source: 'auto', locked: false })
  jest.mocked(applyLoyaltyAssignment).mockResolvedValue({ tier_code: 'ZR2', tier_name: 'Silver', source: 'auto', locked: false })
})

describe('Automatické zaradenie podľa útraty', () => {
  it('spočíta útratu zo zachytených platieb', async () => {
    expect(await customerSpendTotal(scope, 'cus_1')).toBe(600)
  })

  it('priradí úroveň podľa dosiahnutého prahu', async () => {
    const result = await assignCustomerTierAutomatically(scope, 'cus_1')
    expect(result).toMatchObject({ assigned: true, tier_code: 'ZR2', spend_total_eur: 600, reason: 'ASSIGNED' })
    expect(applyLoyaltyAssignment).toHaveBeenCalledWith(scope, { customerId: 'cus_1', tierCode: 'ZR2', locked: false })
  })

  it('ručný zámok sa nikdy neprepiše', async () => {
    jest.mocked(readLoyaltyAssignment).mockResolvedValue({ tier_code: 'ZR4', tier_name: 'VIP', source: 'manual', locked: true })
    const result = await assignCustomerTierAutomatically(scope, 'cus_1')
    expect(result).toMatchObject({ assigned: false, tier_code: 'ZR4', reason: 'MANUAL_LOCK' })
    expect(applyLoyaltyAssignment).not.toHaveBeenCalled()
  })

  it('bez nastavenej politiky sa nemení nič', async () => {
    jest.mocked(readLoyaltySettingsFromStore).mockResolvedValue({ tiers: [], updated_at: null, updated_by: null })
    const result = await assignCustomerTierAutomatically(scope, 'cus_1')
    expect(result).toMatchObject({ assigned: false, reason: 'POLICY_EMPTY' })
    expect(applyLoyaltyAssignment).not.toHaveBeenCalled()
  })

  it('pod prahom sa úroveň odoberie', async () => {
    jest.mocked(readLoyaltySettingsFromStore).mockResolvedValue({
      tiers: [
        tier({ code: 'ZR2', rank: 1, enabled: true, spend_threshold_eur: 500 }),
        tier({ code: 'ZR3', rank: 2, enabled: true, spend_threshold_eur: 2000 }),
      ],
      updated_at: null,
      updated_by: null,
    })
    jest.mocked(readLoyaltyAssignment).mockResolvedValue({ tier_code: 'ZR2', tier_name: 'Silver', source: 'auto', locked: false })
    graph.mockResolvedValueOnce({ data: [{ id: 'order_1', status: 'completed', total: 10, payment_collections: [{ captured_amount: 10, refunded_amount: 0 }] }] } as any)
    const result = await assignCustomerTierAutomatically(scope, 'cus_1')
    expect(result).toMatchObject({ assigned: false, reason: 'NO_THRESHOLD' })
    expect(applyLoyaltyAssignment).toHaveBeenCalledWith(scope, { customerId: 'cus_1', tierCode: null, locked: false })
  })

  it('zákazník bez úrovne sa pod prahom nemení', async () => {
    jest.mocked(readLoyaltySettingsFromStore).mockResolvedValue({
      tiers: [tier({ code: 'ZR2', rank: 1, enabled: true, spend_threshold_eur: 500 })],
      updated_at: null,
      updated_by: null,
    })
    graph.mockResolvedValueOnce({ data: [{ id: 'order_1', status: 'completed', total: 10, payment_collections: [{ captured_amount: 10, refunded_amount: 0 }] }] } as any)
    const result = await assignCustomerTierAutomatically(scope, 'cus_1')
    expect(result).toMatchObject({ assigned: false, reason: 'NO_THRESHOLD' })
    expect(applyLoyaltyAssignment).not.toHaveBeenCalled()
  })

  it('nezmenená úroveň sa nezapisuje', async () => {
    jest.mocked(readLoyaltyAssignment).mockResolvedValue({ tier_code: 'ZR2', tier_name: 'Silver', source: 'auto', locked: false })
    const result = await assignCustomerTierAutomatically(scope, 'cus_1')
    expect(result).toMatchObject({ assigned: false, tier_code: 'ZR2', reason: 'UNCHANGED' })
    expect(applyLoyaltyAssignment).not.toHaveBeenCalled()
  })

  it('zákazníka objednávky nájde podľa objednávky', async () => {
    expect(await orderCustomerId(scope, 'order_1')).toBe('cus_1')
  })
})
