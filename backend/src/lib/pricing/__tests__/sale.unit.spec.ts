import { readSaleMetadata, resolveSalePrice, saleExpired } from '../sale'

describe('Akčná (výpredajová) cena z metadát', () => {
  it('prečíta aktívnu akčnú cenu s platnosťou', () => {
    expect(readSaleMetadata({ active: true, akcna_cena: 100, do: '2026-12-31' })).toEqual({
      active: true, amount: 100, until: '2026-12-31',
    })
    expect(readSaleMetadata(null)).toBeNull()
    expect(readSaleMetadata('nie-json')).toBeNull()
  })

  it('bez metadát rozhoduje cenový zoznam (doterajšie správanie)', () => {
    const result = resolveSalePrice({ originalAmount: 168, currentAmount: 120 })
    expect(result).toMatchObject({ basePrice: 168, salePrice: 120, source: 'price-list' })
  })

  it('aktívna akčná cena z metadát má prednosť', () => {
    const result = resolveSalePrice({ originalAmount: 168, currentAmount: 120, metadata: { active: true, akcna_cena: 100 } })
    expect(result).toMatchObject({ basePrice: 168, salePrice: 100, source: 'metadata' })
  })

  it('vypnutá akčná cena sa neuplatní (ani cenový zoznam)', () => {
    const result = resolveSalePrice({ originalAmount: 168, currentAmount: 120, metadata: { active: false, akcna_cena: 100 } })
    expect(result).toMatchObject({ basePrice: 168, salePrice: null, source: 'inactive' })
  })

  it('vypršaná akčná cena sa neuplatní', () => {
    const result = resolveSalePrice({
      originalAmount: 168,
      currentAmount: 120,
      metadata: { active: true, akcna_cena: 100, do: '2020-01-01' },
      now: new Date('2026-10-21T00:00:00.000Z'),
    })
    expect(result).toMatchObject({ basePrice: 168, salePrice: null, source: 'expired' })
  })

  it('platnosť končí na konci dňa', () => {
    expect(saleExpired({ active: true, amount: 10, until: '2026-10-21' }, new Date('2026-10-21T23:59:00.000Z'))).toBe(false)
    expect(saleExpired({ active: true, amount: 10, until: '2026-10-21' }, new Date('2026-10-22T00:00:01.000Z'))).toBe(true)
    expect(saleExpired({ active: true, amount: 10, until: null }, new Date('2026-10-22T00:00:01.000Z'))).toBe(false)
  })

  it('neplatná akčná cena (vyššia než základná) sa neuplatní, cenový zoznam ostáva', () => {
    const result = resolveSalePrice({ originalAmount: 168, currentAmount: 120, metadata: { active: true, akcna_cena: 500 } })
    expect(result).toMatchObject({ basePrice: 168, salePrice: 120, source: 'price-list' })
  })

  it('zákazník nikdy nezaplatí viac, než je cenový zoznam', () => {
    const result = resolveSalePrice({ originalAmount: 168, currentAmount: 90, metadata: { active: true, akcna_cena: 100 } })
    expect(result.salePrice).toBe(100)
    expect(result.salePrice!).toBeLessThan(result.basePrice)
  })
})
