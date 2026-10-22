/**
 * Načítanie produktov do feedu: len zverejnené produkty v predajnom kanáli, cena cez
 * `calculated_price` s region kontextom (rovnaký vzor ako v `store/nexus-cart/route.ts`).
 *
 * Server počíta cenu aj dostupnosť – klient nikdy nič nedopočítava.
 */
import { ContainerRegistrationKeys, QueryContext } from '@medusajs/framework/utils'
import type { MedusaRequest } from '@medusajs/framework/http'
import {
  FEED_BRAND,
  FEED_DEFAULT_CURRENCY,
  type FeedItem,
  currencyCode,
  feedAvailability,
  feedDescription,
  netFromGross,
  productUrl,
  resolveStorefrontOrigin,
  variantSuffix,
} from './policy'

const PAGE = 100
/** Horná hranica produktov vo feede – nad ňou feed vráti chybu, ne tichú čiastočný výstup. */
export const FEED_PRODUCT_CAP = 5000

type AnyRecord = Record<string, any>

/** Predajný región, v ktorom sa počíta cena (prvý región v danej meny). */
export async function resolveFeedRegion(query: AnyRecord, currency: string): Promise<{ id: string; currency_code: string } | null> {
  const { data } = await query.graph({
    entity: 'region',
    fields: ['id', 'currency_code'],
    filters: { currency_code: currency },
    pagination: { take: 5, order: { id: 'ASC' } },
  })
  const region = (data || []).find((r: AnyRecord) => String(r?.currency_code || '').toLowerCase() === currency)
  return region ? { id: region.id, currency_code: String(region.currency_code) } : null
}

/** Predajné kanály, do ktorých je produkt zaradený. */
export async function resolveSalesChannelIds(query: AnyRecord): Promise<Set<string>> {
  const { data } = await query.graph({ entity: 'sales_channel', fields: ['id', 'is_disabled'] })
  const enabled = new Set<string>()
  for (const channel of data || []) {
    if (channel?.is_disabled === false || channel?.is_disabled === undefined) enabled.add(String(channel.id))
  }
  return enabled
}

async function graphAll(query: AnyRecord, entity: string, fields: string[], filters: AnyRecord, context?: AnyRecord) {
  const rows: AnyRecord[] = []
  for (let skip = 0; ; skip += PAGE) {
    const result = await query.graph({
      entity,
      fields,
      filters,
      ...(context ? { context } : {}),
      pagination: { skip, take: PAGE, order: { id: 'ASC' } },
    })
    const data = result?.data
    if (!Array.isArray(data)) throw new Error('FEED_INVALID_DATA')
    rows.push(...data)
    if (data.length < PAGE) return rows
    if (rows.length > FEED_PRODUCT_CAP) throw new Error('FEED_TOO_MANY_PRODUCTS')
  }
}

/**
 * Vráti produkty vo forme pre feed. Chyby (chýbajúci región, príliš veľa produktov)
 * nepreveruje – vyhodí sa výnimka, ktorú route zobrazí ako 503.
 */
export async function loadFeedItems(scope: MedusaRequest['scope'], env: NodeJS.ProcessEnv = process.env): Promise<FeedItem[]> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const currency = (env.FEED_CURRENCY || FEED_DEFAULT_CURRENCY).trim().toLowerCase()
  const origin = resolveStorefrontOrigin(env)
  const region = await resolveFeedRegion(query, currency)
  if (!region) throw new Error('FEED_NO_REGION')
  const channels = await resolveSalesChannelIds(query)

  const products = await graphAll(query, 'product', [
    'id',
    'title',
    'handle',
    'subtitle',
    'description',
    'status',
    'thumbnail',
    'images.id',
    'images.url',
    'images.rank',
    'categories.id',
    'categories.name',
    'categories.handle',
    'sales_channels.id',
    'variants.id',
    'variants.title',
    'variants.sku',
    'variants.manage_inventory',
    'variants.allow_backorder',
    'variants.inventory_items.inventory_item_id',
  ], { status: 'published' })

  const variantIds = products.flatMap((p) => (p.variants || []).map((v: AnyRecord) => v.id)).filter(Boolean)
  const variants = variantIds.length
    ? await graphAll(query, 'product_variant', [
        'id',
        'sku',
        'title',
        'manage_inventory',
        'allow_backorder',
        'product.id',
        'inventory_items.inventory_item_id',
        'calculated_price.calculated_amount',
        'calculated_price.original_amount',
        'calculated_price.currency_code',
      ], { id: variantIds }, { calculated_price: QueryContext({ region_id: region.id, currency_code: region.currency_code }) })
    : []

  const inventoryItemIds = [...new Set(variants.flatMap((v: AnyRecord) => (v.inventory_items || []).map((i: AnyRecord) => i.inventory_item_id)).filter(Boolean))]
  const inventoryItems = inventoryItemIds.length
    ? await graphAll(query, 'inventory_item', ['id', 'inventory_levels.stocked_quantity'], { id: inventoryItemIds })
    : []
  const levelsByItem = new Map<string, AnyRecord[]>(inventoryItems.map((item: AnyRecord) => [String(item.id), item.inventory_levels || []]))
  const levelsByVariant = new Map<string, AnyRecord[]>()
  for (const variant of variants) {
    const levels = (variant.inventory_items || []).flatMap((i: AnyRecord) => levelsByItem.get(String(i.inventory_item_id)) || [])
    levelsByVariant.set(String(variant.id), levels)
  }

  const vatRate = Number((env.FEED_VAT_RATE || '').trim().replace(',', '.')) || 20
  // Náhradná fotka pre produkty bez obrázka (FEED_FALLBACK_IMAGE). Bez nej sa produkt bez fotky do feedu nedostane.
  const fallbackImage = (env.FEED_FALLBACK_IMAGE || '').trim()
  const variantsByProduct = new Map<string, AnyRecord[]>()
  for (const variant of variants) {
    const productId = String(variant.product?.id || '')
    if (!productId) continue
    const list = variantsByProduct.get(productId) || []
    list.push(variant)
    variantsByProduct.set(productId, list)
  }

  const items: FeedItem[] = []
  for (const product of products) {
    if (product.status !== 'published') continue // do feedu patria len zverejnené produkty
    const productChannels = (product.sales_channels || []).map((c: AnyRecord) => String(c.id)).filter((id: string) => channels.has(id))
    if (!productChannels.length) continue // zverejnený, ale nie je v predajnom kanáli
    const productVariants = variantsByProduct.get(String(product.id)) || []
    if (!productVariants.length) continue
    const images = [...new Set([product.thumbnail, ...(product.images || []).map((i: AnyRecord) => i.url)].filter(Boolean))] as string[]
    const image = images[0] || fallbackImage
    if (!image) continue // bez fotky sa produkt do porovnávača nedá
    const category = (product.categories || [])[0] || null
    const handle = String(product.handle || product.id)

    for (const variant of productVariants) {
      const amount = Number(variant.calculated_price?.calculated_amount)
      if (!Number.isFinite(amount) || amount <= 0) continue
      const { availability, stock } = feedAvailability({
        manage_inventory: variant.manage_inventory,
        allow_backorder: variant.allow_backorder,
        levels: levelsByVariant.get(String(variant.id)) || [],
      })
      items.push({
        id: String(product.id),
        sku: String(variant.sku || product.id),
        title: `${product.title}${variantSuffix(variant.title, productVariants.length)}`,
        description: feedDescription(product.subtitle || product.description || product.title),
        category: category?.name || '',
        categoryId: category?.id ? String(category.id) : '',
        url: productUrl(origin, handle),
        image,
        images: images.length ? images : [image],
        price: amount,
        netPrice: netFromGross(amount, vatRate),
        currency: currencyCode(variant.calculated_price?.currency_code || region.currency_code),
        availability,
        stock,
        ean: null,
        brand: FEED_BRAND,
      })
    }
  }
  return items
}

/** Počet produktov vo feede (pre prehľad v administrácii) – bez generovania XML. */
export async function countFeedItems(scope: MedusaRequest['scope'], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  return (await loadFeedItems(scope, env)).length
}
