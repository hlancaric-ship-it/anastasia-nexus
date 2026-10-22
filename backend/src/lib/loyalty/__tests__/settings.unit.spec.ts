import { readLoyaltySettings, writeLoyaltySettings } from '../settings'

describe('Uložisko politiky v nastaveniach obchodu', () => {
  it('prázdne nastavenie znamená „politika ešte nie je nastavená“', () => {
    expect(readLoyaltySettings(undefined)).toEqual({ tiers: [], updated_at: null, updated_by: null })
    expect(readLoyaltySettings({})).toEqual({ tiers: [], updated_at: null, updated_by: null })
    expect(readLoyaltySettings({ loyalty_policy: "nie-json" })).toEqual({ tiers: [], updated_at: null, updated_by: null })
  })

  it('prečíta uložené úrovne', () => {
    const settings = readLoyaltySettings({
      loyalty_policy: {
        tiers: [
          { code: 'ZR2', name: 'Silver', discount_percent: 5, spend_threshold_eur: 500, enabled: true, rank: 2 },
          { code: 'ZR1', name: 'Bronze', discount_percent: 0, spend_threshold_eur: null, enabled: false, rank: 1 },
        ],
        updated_at: '2026-10-21T10:00:00.000Z',
        updated_by: 'user_1',
      },
    })
    expect(settings.tiers.map((tier) => tier.code)).toEqual(['ZR1', 'ZR2'])
    expect(settings.tiers[1]).toMatchObject({ name: 'Silver', discount_percent: 5, spend_threshold_eur: 500, enabled: true })
    expect(settings.updated_by).toBe('user_1')
  })

  it('zahodí poškodenú úroveň namiesto pádu', () => {
    const settings = readLoyaltySettings({ loyalty_policy: { tiers: [{ name: 'bez kódu' }, { code: 'ZR1', name: 'Bronze' }] } })
    expect(settings.tiers).toHaveLength(1)
    expect(settings.tiers[0].code).toBe('ZR1')
  })

  it('zapíše politiku bez toho, aby rozbil ostatné nastavenia', () => {
    const metadata = { carriers: { provider: 'packeta' }, other: 1 }
    const written = writeLoyaltySettings(metadata, { tiers: [], updated_at: '2026-10-21T10:00:00.000Z', updated_by: null })
    expect(written.carriers).toEqual({ provider: 'packeta' })
    expect(written.other).toBe(1)
    expect((written as Record<string, any>).loyalty_policy.updated_at).toBe('2026-10-21T10:00:00.000Z')
    expect(readLoyaltySettings(written).tiers).toEqual([])
  })
})
