/**
 * Produktové feedy (Heureka XML, Google Merchant RSS) – čistá logika bez závislosti na databázi.
 *
 * Ceny: feed používá `calculated_price` s region kontextom (cena, ktorú zákazníčka platí).
 * Keďže eshop pracuje s cenami vrátane DPH, `PRICE_VAT` je táto cena a `PRICE` (bez DPH)
 * sa dopočíta podľa sadzby DPH (FEED_VAT_RATE, štandardne 20 % pre Slovensko).
 *
 * URL produktov stavajú na `ANASTASIA_SITE_URL` / `STOREFRONT_URL` ( fallback `COUPON_LINK_STOREFRONT_ORIGIN`).
 */

export const FEED_BRAND = 'ANASTASIA'
export const FEED_DESCRIPTION = 'ANASTASIA – príroda, ktorá pomáha. Prírodné produkty, programy a konzultácie.'
export const FEED_PRODUCT_PATH = '/eshop/produkt/'
export const FEED_DEFAULT_VAT_RATE = 20
export const FEED_DEFAULT_CURRENCY = 'eur'
export const FEED_CURRENCIES: Record<string, string> = { eur: 'EUR', usd: 'USD', czk: 'CZK' }

export type FeedAvailability = 'in stock' | 'out of stock'

export type FeedItem = {
  /** ID produktu v jadre (stabilné pre Heuriku). */
  id: string
  /** SKU varianty – ITEM_CODE / g:id. */
  sku: string
  title: string
  description: string
  /** Názov kategórie (prázdny, ak produkt nemá kategóriu). */
  category: string
  /** ID kategórie v jadre (prázdne, ak produkt nemá kategóriu). */
  categoryId: string
  url: string
  image: string
  images: string[]
  /** Cena s DPH – koľko zákazníčka zaplatí. */
  price: number
  /** Cena bez DPH (pre Heuriku). */
  netPrice: number
  currency: string
  availability: FeedAvailability
  /** Počet kusov na sklade, ak je známy; null = neriesené. */
  stock: number | null
  ean: string | null
  brand: string
}

export type FeedOptions = { origin: string; vatRate: number }

/** XML escapovanie: & < > " ' (Heureka aj Google parsujú XML, ne escapujú entity). */
export function xmlText(value: unknown): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
  return String(value ?? '').replace(/[&<>"']/g, (c) => entities[c] ?? c)
}

/** Najčastejšie HTML entity – popisy produktov prichádzajú z importu s entitami (napr. &iacute;). */
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', yacute: 'ý',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Yacute: 'Ý',
  scaron: 'š', Scaron: 'Š', zcaron: 'ž', Zcaron: 'Ž', ccaron: 'č', Ccaron: 'Č',
  rcaron: 'ř', Rcaron: 'Ř', dzcaron: 'ď', Dzcaron: 'Ď', tcaron: 'ť', Tcaron: 'Ť',
  ncaron: 'ň', Ncaron: 'Ň', lcaron: 'ľ', Lcaron: 'Ľ', ucaron: 'ů', Ucaron: 'Ů',
  euro: '€', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', middot: '·', bull: '•', deg: '°', trade: '™',
  copy: '©', reg: '®', laquo: '«', raquo: '»', times: '×', minus: '−',
}

/** Rozkóduje HTML entity (počítané aj menované). */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      try { return String.fromCodePoint(code) } catch { return match }
    }
    const key = entity.toLowerCase()
    return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : match
  })
}

/** Čistý text z popisu produktu (bez HTML tagov a zalomení). */
export function plainText(value: unknown): string {
  const text = String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
  return decodeEntities(text).replace(/\s+/g, ' ').trim()
}

/** Popis do feedu – skrátený na rozumnú dĺžku (porovnávače dlhé texty odmietajú). */
export function feedDescription(value: unknown, maxLength = 1000): string {
  const text = plainText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}…`
}

/** Názov varianty, ktorý nič nepridáva („Predvolené“, „Default“). */
const DEFAULT_VARIANT_TITLES = new Set(['predvolené', 'predvolene', 'default'])

export function variantSuffix(title: string | null | undefined, variantCount: number): string {
  const value = String(title ?? '').trim()
  if (!value) return ''
  if (variantCount <= 1 && DEFAULT_VARIANT_TITLES.has(value.toLowerCase())) return ''
  return ` – ${value}`
}

/** Origin webu (bez cesty a koncového lomítka). Prázdny string, ak origin nie je nastavený. */
export function resolveStorefrontOrigin(env: NodeJS.ProcessEnv = process.env): string {
  for (const key of ['ANASTASIA_SITE_URL', 'STOREFRONT_URL', 'STOREFRONT_ORIGIN', 'COUPON_LINK_STOREFRONT_ORIGIN']) {
    const raw = (env[key] || '').trim()
    if (!raw) continue
    try {
      const url = new URL(raw)
      const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (url.protocol === 'https:' || local) return url.origin
    } catch { /* nesprávna hodnota – ďalšiu skúsime */ }
  }
  return ''
}

/** Sadzba DPH v percentách (FEED_VAT_RATE), štandardne 20 % pre Slovensko. */
export function feedVatRate(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.FEED_VAT_RATE || '').trim()
  const value = Number(raw.replace(',', '.'))
  if (!raw || !Number.isFinite(value) || value < 0 || value > 100) return FEED_DEFAULT_VAT_RATE
  return value
}

export function currencyCode(code: string | undefined | null): string {
  const cc = String(code || FEED_DEFAULT_CURRENCY).toLowerCase()
  return FEED_CURRENCIES[cc] || cc.toUpperCase()
}

/** Cena bez DPH z ceny s DPH. */
export function netFromGross(gross: number, vatRate: number): number {
  const g = Number(gross)
  if (!Number.isFinite(g)) return 0
  return Math.round((g / (1 + vatRate / 100)) * 100) / 100
}

/** Cena s DPH z ceny bez DPH. */
export function grossFromNet(net: number, vatRate: number): number {
  const n = Number(net)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * (1 + vatRate / 100) * 100) / 100
}

export function productUrl(origin: string, handle: string): string {
  const base = String(origin || '').replace(/\/+$/, '')
  return `${base}${FEED_PRODUCT_PATH}${encodeURIComponent(String(handle || ''))}`
}

/** Dostupnosť: bez riadeného skladu je produkt dostupný; inak podľa skutočných zásob. */
export function feedAvailability(variant: {
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
  levels?: Array<{ stocked_quantity?: number | null }> | null
}): { availability: FeedAvailability; stock: number | null } {
  if (!variant?.manage_inventory) return { availability: 'in stock', stock: null }
  if (variant.allow_backorder) return { availability: 'in stock', stock: null }
  const levels = Array.isArray(variant.levels) ? variant.levels : []
  if (!levels.length) return { availability: 'in stock', stock: null }
  const stock = levels.reduce((sum, l) => sum + Number(l?.stocked_quantity || 0), 0)
  return { availability: stock > 0 ? 'in stock' : 'out of stock', stock }
}

const money = (value: number) => (Math.round(Number(value) * 100) / 100).toFixed(2)

/** Heureka XML – formát SHOP/ITEMS, ktorý používa Heureka porovnávač. */
export function buildHeurekaXml(items: FeedItem[], options: FeedOptions): string {
  const origin = String(options.origin || '').replace(/\/+$/, '')
  const categories = new Map<string, string>()
  for (const item of items) {
    if (item.categoryId && item.category) categories.set(item.categoryId, item.category)
  }
  const categoryXml = categories.size
    ? [...categories.entries()].map(([id, name]) => `      <CATEGORY id="${xmlText(id)}" name="${xmlText(name)}"/>`).join('\n')
    : ''
  const itemXml = items.map((item) => {
    const optional = [
      item.stock === null ? '' : `<STOCK>${Math.max(0, Math.trunc(item.stock))}</STOCK>`,
      item.ean ? `<EAN>${xmlText(item.ean)}</EAN>` : '',
    ].filter(Boolean)
    return `    <ITEM>
      <ITEM_ID>${xmlText(item.id)}</ITEM_ID>
      <TITLE>${xmlText(item.title)}</TITLE>
      <LINK>${xmlText(item.url)}</LINK>
      <IMG_URL>${xmlText(item.image)}</IMG_URL>
      <PRICE_VAT>${money(item.price)}</PRICE_VAT>
      <PRICE>${money(item.netPrice)}</PRICE>
      <CURRENCY>${xmlText(currencyCode(item.currency))}</CURRENCY>
${optional.map((line) => `      ${line}`).join('\n')}${optional.length ? '\n' : ''}      <ITEM_CODE>${xmlText(item.sku)}</ITEM_CODE>
      <CATEGORY_ID>${xmlText(item.categoryId || '1')}</CATEGORY_ID>
      <DESCRIPTION>${xmlText(item.description)}</DESCRIPTION>
    </ITEM>`
  }).join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<SHOP>
  <SHOPINFO>
    <NAME>${xmlText(FEED_BRAND)}</NAME>
    <DESCRIPTION>${xmlText(FEED_DESCRIPTION)}</DESCRIPTION>
    <URL>${xmlText(origin)}/</URL>
  </SHOPINFO>
  <CATEGORIES>
    <CATEGORY id="1" name="${xmlText(FEED_BRAND)}">
${categoryXml}
    </CATEGORY>
  </CATEGORIES>
  <ITEMS>
${itemXml}
  </ITEMS>
</SHOP>
`
}

/** Google Merchant Center – RSS 2.0 s menným priestorom g:. */
export function buildGoogleXml(items: FeedItem[], options: FeedOptions): string {
  const origin = String(options.origin || '').replace(/\/+$/, '')
  const itemXml = items.map((item) => {
    const extraImages = item.images.slice(1, 11).map((url) => `      <g:additional_image_link>${xmlText(url)}</g:additional_image_link>`).join('\n')
    const optional = [
      extraImages,
      item.ean ? `      <g:gtin>${xmlText(item.ean)}</g:gtin>` : '',
    ].filter(Boolean).join('\n')
    return `    <item>
      <g:id>${xmlText(item.sku || item.id)}</g:id>
      <g:title>${xmlText(item.title)}</g:title>
      <g:link>${xmlText(item.url)}</g:link>
      <g:description>${xmlText(item.description)}</g:description>
      <g:image_link>${xmlText(item.image)}</g:image_link>
${optional ? optional + '\n' : ''}      <g:availability>${xmlText(item.availability)}</g:availability>
      <g:price>${money(item.price)} ${xmlText(currencyCode(item.currency))}</g:price>
      <g:condition>new</g:condition>
      <g:brand>${xmlText(item.brand || FEED_BRAND)}</g:brand>
      <g:mpn>${xmlText(item.sku)}</g:mpn>
      <g:product_type>${xmlText(item.category || FEED_BRAND)}</g:product_type>
    </item>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlText(FEED_BRAND)}</title>
    <link>${xmlText(origin)}/</link>
    <description>${xmlText(FEED_DESCRIPTION)}</description>
${itemXml}
  </channel>
</rss>
`
}
