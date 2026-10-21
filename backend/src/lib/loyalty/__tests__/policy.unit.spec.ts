import {
  MAX_LOYALTY_DISCOUNT_PERCENT,
  netSpendFromOrders,
  normalizePolicy,
  normalizeTier,
  tierForSpend,
  workerLoyaltyTiers,
  type LoyaltyTier,
} from '../policy'

const tier = (over: Partial<LoyaltyTier> = {}): LoyaltyTier => ({
  code: 'ZR1',
  name: 'Bronze',
  discount_percent: 0,
  spend_threshold_eur: null,
  enabled: false,
  rank: 1,
  ...over,
})

describe('Politika vernostných úrovní', () => {
  it('odmietne zľavu mimo 0–50 %', () => {
    expect(normalizeTier({ code: 'ZR1', name: 'Bronze', discount_percent: 0, spend_threshold_eur: null, enabled: true })).toMatchObject({ discount_percent: 0 })
    expect(normalizeTier({ code: 'ZR1', name: 'Bronze', discount_percent: 50, spend_threshold_eur: null, enabled: true })).toMatchObject({ discount_percent: 50 })
    const over = normalizeTier({ code: 'ZR1', name: 'Bronze', discount_percent: 51, spend_threshold_eur: null, enabled: true })
    expect('error' in over).toBe(true)
    const negative = normalizeTier({ code: 'ZR1', name: 'Bronze', discount_percent: -1, spend_threshold_eur: null, enabled: true })
    expect('error' in negative).toBe(true)
    expect(MAX_LOYALTY_DISCOUNT_PERCENT).toBe(50)
  })

  it('odmietne neplatný kód, prázdny názov a záporný prah', () => {
    expect('error' in normalizeTier({ code: 'gold', name: 'Gold', discount_percent: 5, spend_threshold_eur: null, enabled: true })).toBe(true)
    expect('error' in normalizeTier({ code: 'ZR1', name: '  ', discount_percent: 5, spend_threshold_eur: null, enabled: true })).toBe(true)
    expect('error' in normalizeTier({ code: 'ZR1', name: 'Bronze', discount_percent: 5, spend_threshold_eur: -10, enabled: true })).toBe(true)
  })

  it('normalizuje kód na veľké písmená a poradie úrovní', () => {
    const result = normalizePolicy({
      tiers: [
        { code: 'zr3', name: 'Gold', discount_percent: 5, spend_threshold_eur: 500, enabled: true, rank: 3 },
        { code: 'ZR1', name: 'Bronze', discount_percent: 2, spend_threshold_eur: 0, enabled: true, rank: 1 },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.policy.tiers.map((t) => t.code)).toEqual(['ZR1', 'ZR3'])
    expect(result.policy.tiers.map((t) => t.rank)).toEqual([1, 2])
  })

  it('odmietne duplicitné kódy a ne rastúce prahy', () => {
    expect(normalizePolicy({ tiers: [
      { code: 'ZR1', name: 'Bronze', discount_percent: 0, spend_threshold_eur: null, enabled: true },
      { code: 'ZR1', name: 'Bronze2', discount_percent: 0, spend_threshold_eur: null, enabled: true },
    ] }).ok).toBe(false)
    expect(normalizePolicy({ tiers: [
      { code: 'ZR1', name: 'Bronze', discount_percent: 0, spend_threshold_eur: 500, enabled: true, rank: 1 },
      { code: 'ZR2', name: 'Silver', discount_percent: 0, spend_threshold_eur: 100, enabled: true, rank: 2 },
    ] }).ok).toBe(false)
  })

  it('prázdna politika je platný stav (pred launchom)', () => {
    const result = normalizePolicy({ tiers: [] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.policy.tiers).toEqual([])
  })

  it('vyberie úroveň podľa útraty (najvyšší dosiahnutý prah)', () => {
    const tiers = [
      tier({ code: 'ZR1', rank: 1, enabled: true, spend_threshold_eur: 0 }),
      tier({ code: 'ZR2', rank: 2, enabled: true, spend_threshold_eur: 500 }),
      tier({ code: 'ZR3', rank: 3, enabled: true, spend_threshold_eur: 2000 }),
    ]
    expect(tierForSpend(tiers, 0)?.code).toBe('ZR1')
    expect(tierForSpend(tiers, 499)?.code).toBe('ZR1')
    expect(tierForSpend(tiers, 500)?.code).toBe('ZR2')
    expect(tierForSpend(tiers, 2500)?.code).toBe('ZR3')
  })

  it('ignoruje vypnuté úrovne a úrovne bez prahu', () => {
    const tiers = [
      tier({ code: 'ZR1', rank: 1, enabled: false, spend_threshold_eur: 0 }),
      tier({ code: 'ZR2', rank: 2, enabled: true, spend_threshold_eur: null }),
    ]
    expect(tierForSpend(tiers, 9999)).toBeNull()
  })

  it('prevedie percentá na podiel pre Worker a vynechá vypnuté úrovne', () => {
    const map = workerLoyaltyTiers([
      tier({ code: 'ZR1', enabled: true, discount_percent: 2.5 }),
      tier({ code: 'ZR2', enabled: true, discount_percent: 0 }),
      tier({ code: 'ZR3', enabled: false, discount_percent: 10 }),
    ])
    expect(map).toEqual({ ZR1: 0.025 })
    expect(workerLoyaltyTiers([])).toEqual({})
  })

  it('spočíta útratu zo zachytených platieb mínus refundy', () => {
    expect(netSpendFromOrders([
      { captured: 100, refunded: 0 },
      { captured: 50, refunded: 20 },
      { captured: 10, refunded: 0, status: 'canceled' },
      { captured: 0, refunded: 0 },
    ])).toBe(130)
    expect(netSpendFromOrders([])).toBe(0)
  })
})
