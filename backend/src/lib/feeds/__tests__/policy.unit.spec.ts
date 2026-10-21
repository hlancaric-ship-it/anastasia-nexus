import {
  FEED_DEFAULT_VAT_RATE,
  buildGoogleXml,
  buildHeurekaXml,
  feedAvailability,
  feedVatRate,
  grossFromNet,
  netFromGross,
  plainText,
  productUrl,
  resolveStorefrontOrigin,
  xmlText,
  type FeedItem,
} from '../policy'

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  id: 'prod_1',
  sku: 'KO.002',
  title: 'Tvoja pleťová voda',
  description: 'Jemná denná starostlivosť',
  category: 'BIOKOZMETIKA',
  categoryId: 'pcat_1',
  url: 'https://obchod.test/eshop/produkt/pletova-voda',
  image: 'https://media.test/a.jpg',
  images: ['https://media.test/a.jpg', 'https://media.test/b.jpg'],
  price: 11,
  netPrice: 9.17,
  currency: 'eur',
  availability: 'in stock',
  stock: null,
  ean: null,
  brand: 'ANASTASIA',
  ...over,
})

describe('Produktové feedy – XML', () => {
  it('escapuje XML znaky', () => {
    expect(xmlText('a & b < c > d " e')).toBe('a &amp; b &lt; c &gt; d &quot; e')
    expect(xmlText("it's")).toBe('it&apos;s')
    expect(xmlText(null)).toBe('')
  })

  it('prečistí popis z HTML', () => {
    expect(plainText('<p>Prvý riadok</p><p>Druhý &amp; posledný</p>')).toBe('Prvý riadok Druhý & posledný')
    expect(plainText('<script>x</script>')).toBe('x')
  })

  it('nájde adresu webu a poskladá URL produktu', () => {
    expect(resolveStorefrontOrigin({ ANASTASIA_SITE_URL: 'https://anastasiaoz.eu/' })).toBe('https://anastasiaoz.eu')
    expect(resolveStorefrontOrigin({ STOREFRONT_URL: 'https://shop.test/base' })).toBe('https://shop.test')
    expect(resolveStorefrontOrigin({ ANASTASIA_SITE_URL: 'https://a.test', STOREFRONT_URL: 'https://b.test' })).toBe('https://a.test')
    expect(resolveStorefrontOrigin({})).toBe('')
    expect(resolveStorefrontOrigin({ STOREFRONT_URL: 'not-a-url' })).toBe('')
    expect(productUrl('https://shop.test/', 'pletova-voda')).toBe('https://shop.test/eshop/produkt/pletova-voda')
  })

  it('počíta cenu bez DPH zo sadzby', () => {
    expect(feedVatRate({})).toBe(FEED_DEFAULT_VAT_RATE)
    expect(feedVatRate({ FEED_VAT_RATE: '23,5' })).toBe(23.5)
    expect(feedVatRate({ FEED_VAT_RATE: 'x' })).toBe(FEED_DEFAULT_VAT_RATE)
    expect(netFromGross(120, 20)).toBe(100)
    expect(grossFromNet(100, 20)).toBe(120)
  })

  it('rozhodne dostupnosť zo skladu', () => {
    expect(feedAvailability({ manage_inventory: false })).toEqual({ availability: 'in stock', stock: null })
    expect(feedAvailability({ manage_inventory: true, allow_backorder: true })).toEqual({ availability: 'in stock', stock: null })
    expect(feedAvailability({ manage_inventory: true, levels: [{ stocked_quantity: 3 }] })).toEqual({ availability: 'in stock', stock: 3 })
    expect(feedAvailability({ manage_inventory: true, levels: [{ stocked_quantity: 0 }] })).toEqual({ availability: 'out of stock', stock: 0 })
    // sklad sa neriesuje -> nemožno tvrdiť, že je vypredaný
    expect(feedAvailability({ manage_inventory: true, levels: [] })).toEqual({ availability: 'in stock', stock: null })
  })

  it('vyrobí Heureka XML s cenou s DPH aj bez DPH', () => {
    const xml = buildHeurekaXml([item()], { origin: 'https://shop.test', vatRate: 20 })
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true)
    expect(xml).toContain('<SHOP>')
    expect(xml).toContain('<ITEM_ID>prod_1</ITEM_ID>')
    expect(xml).toContain('<PRICE_VAT>11.00</PRICE_VAT>')
    expect(xml).toContain('<PRICE>9.17</PRICE>')
    expect(xml).toContain('<CURRENCY>EUR</CURRENCY>')
    expect(xml).toContain('<ITEM_CODE>KO.002</ITEM_CODE>')
    expect(xml).toContain('<CATEGORY_ID>pcat_1</CATEGORY_ID>')
    expect(xml).toContain('<LINK>https://obchod.test/eshop/produkt/pletova-voda</LINK>')
    expect(xml).toContain('<CATEGORY id="pcat_1" name="BIOKOZMETIKA"/>')
  })

  it('escapuje názov produktu v Heurike', () => {
    const xml = buildHeurekaXml([item({ title: 'Krém <100%> & "voňa"' })], { origin: 'https://shop.test', vatRate: 20 })
    expect(xml).toContain('<TITLE>Krém &lt;100%&gt; &amp; &quot;voňa&quot;</TITLE>')
    expect(xml).not.toContain('<100%>')
  })

  it('vyrobí Google Merchant RSS', () => {
    const xml = buildGoogleXml([item({ ean: '5901234123457' })], { origin: 'https://shop.test', vatRate: 20 })
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"')
    expect(xml).toContain('<g:id>KO.002</g:id>')
    expect(xml).toContain('<g:price>11.00 EUR</g:price>')
    expect(xml).toContain('<g:availability>in stock</g:availability>')
    expect(xml).toContain('<g:gtin>5901234123457</g:gtin>')
    expect(xml).toContain('<g:additional_image_link>https://media.test/b.jpg</g:additional_image_link>')
    expect(xml).toContain('<g:condition>new</g:condition>')
  })

  it('prázdny feed je stále platné XML', () => {
    expect(buildHeurekaXml([], { origin: 'https://shop.test', vatRate: 20 })).toContain('<ITEMS>')
    expect(buildGoogleXml([], { origin: 'https://shop.test', vatRate: 20 })).toContain('<channel>')
  })
})
