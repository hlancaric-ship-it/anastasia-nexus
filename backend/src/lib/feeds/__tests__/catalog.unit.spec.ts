import { loadFeedItems } from '../catalog'

type AnyRecord = Record<string, any>

const published = (id: string, over: AnyRecord = {}): AnyRecord => ({
  id: `prod_${id}`, title: 'Tvoja pleťová voda', handle: `handle-${id}`, subtitle: 'Denná starostlivosť', description: '<p>Denná starostlivosť</p>',
  status: 'published', thumbnail: `https://media.test/${id}.jpg`,
  images: [{ id: `img_${id}`, url: `https://media.test/${id}.jpg`, rank: 0 }],
  categories: [{ id: 'pcat_1', name: 'BIOKOZMETIKA', handle: 'bio' }],
  sales_channels: [{ id: 'sc_1' }],
  variants: [{ id: `variant_${id}` }],
  ...over,
})

const variant = (id: string, over: AnyRecord = {}): AnyRecord => ({
  id, sku: `SKU-${id}`, title: 'Predvolené', manage_inventory: false, allow_backorder: false,
  product: { id: `prod_${id}` },
  inventory_items: [],
  calculated_price: { calculated_amount: 11, original_amount: 11, currency_code: 'eur' },
  ...over,
})

/** Minimálna figura dotazu: odpovedá podľa entity a vyvolaní kontext ceny. */
function fixture(overrides: Record<string, AnyRecord[]> = {}) {
  const calls: AnyRecord[] = []
  const query = {
    graph: async (args: AnyRecord) => {
      calls.push(args)
      const entity = String(args.entity)
      const data = overrides[entity] ?? defaultData[entity] ?? []
      return { data, metadata: { count: data.length } }
    },
  }
  return { query, calls }
}

const defaultData: Record<string, AnyRecord[]> = {
  region: [{ id: 'reg_1', currency_code: 'eur' }],
  sales_channel: [{ id: 'sc_1', is_disabled: false }],
  product: [
    published('a'),
    published('b', { sales_channels: [] }),
    published('c', { status: 'draft' }),
  ],
  product_variant: [variant('a'), variant('b'), variant('c')],
  inventory_item: [],
}

describe('Feed – načítanie produktov', () => {
  it('vezme iba zverejnené produkty v predajnom kanáli', async () => {
    const { query } = fixture()
    const items = await loadFeedItems({ resolve: () => query } as any, { FEED_VAT_RATE: '20' })
    expect(items.map((i) => i.id)).toEqual(['prod_a'])
    expect(items[0].sku).toBe('SKU-a')
    expect(items[0].url).toContain('/eshop/produkt/handle-a')
    expect(items[0].price).toBe(11)
    expect(items[0].netPrice).toBe(9.17)
    expect(items[0].currency).toBe('EUR')
    expect(items[0].image).toBe('https://media.test/a.jpg')
    expect(items[0].category).toBe('BIOKOZMETIKA')
  })

  it('počíta cenu cez calculated_price s region kontextom', async () => {
    const { query, calls } = fixture()
    await loadFeedItems({ resolve: () => query } as any, {})
    const variantCall = calls.find((c) => c.entity === 'product_variant')!
    expect(variantCall.fields).toContain('calculated_price.calculated_amount')
    const context = variantCall.context?.calculated_price
    expect(context?.variables?.region_id ?? context?.region_id).toBeDefined()
    const regionCall = calls.find((c) => c.entity === 'region')!
    expect(regionCall.filters).toMatchObject({ currency_code: 'eur' })
  })

  it('preskočí produkt bez fotky', async () => {
    const { query } = fixture({ product: [published('a', { thumbnail: null, images: [] })] })
    const items = await loadFeedItems({ resolve: () => query } as any, {})
    expect(items).toHaveLength(0)
  })

  it('preskočí variant bez ceny', async () => {
    const { query } = fixture({ product_variant: [variant('a', { calculated_price: { calculated_amount: 0, currency_code: 'eur' } })] })
    const items = await loadFeedItems({ resolve: () => query } as any, {})
    expect(items).toHaveLength(0)
  })

  it('bez regióna vyhodí chybu (feed sa nevydá prázdny)', async () => {
    const { query } = fixture({ region: [] })
    await expect(loadFeedItems({ resolve: () => query } as any, {})).rejects.toThrow('FEED_NO_REGION')
  })

  it('zablokovaný predajný kanál vyradí produkt', async () => {
    const { query } = fixture({ sales_channel: [{ id: 'sc_1', is_disabled: true }] })
    const items = await loadFeedItems({ resolve: () => query } as any, {})
    expect(items).toHaveLength(0)
  })
})
