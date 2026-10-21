import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { versions } from '../../modules/legal/policy'

/** Store readiness computed ONLY from real data. A check that cannot be read is 'unknown', never 'ok'. */
export type ReadinessStatus = 'ok' | 'problem' | 'unknown'
export type ReadinessCheck = { id: string; title: string; severity: 'blocker' | 'warning'; status: ReadinessStatus; count: number | null; href: string; hint: string }
type Definition = Omit<ReadinessCheck, 'status' | 'count'>

export const READINESS_CHECKS: Definition[] = [
  { id: 'region_eur', title: 'Predajný región v EUR', severity: 'blocker', href: '#/nastavenia', hint: 'Bez regiónu v eurách nemožno vytvoriť košík ani objednávku.' },
  { id: 'payment_provider', title: 'Platobná metóda v regióne', severity: 'blocker', href: '#/nastavenia', hint: 'Región v eurách potrebuje aspoň jednu zapnutú platobnú metódu.' },
  { id: 'shipping_option', title: 'Spôsob dopravy', severity: 'warning', href: '#/nastavenia', hint: 'Fyzické produkty nemožno odoslať bez aspoň jedného spôsobu dopravy.' },
  { id: 'stock_location', title: 'Sklad', severity: 'warning', href: '#/nastavenia', hint: 'Produkty so sledovaním skladu potrebujú aspoň jeden sklad.' },
  { id: 'legal_versions', title: 'Obchodné podmienky a ochrana súkromia', severity: 'blocker', href: '#/obsah', hint: 'Bez platných verzií podmienok jadro nepovolí dokončiť objednávku.' },
  { id: 'products_published', title: 'Zverejnené produkty', severity: 'blocker', href: '#/produkty', hint: 'Obchod nemá čo predávať, kým nezverejníte aspoň jeden produkt.' },
  { id: 'products_without_price', title: 'Produkty bez ceny v EUR', severity: 'blocker', href: '#/produkty', hint: 'Zverejnený produkt bez základnej ceny v eurách nemožno kúpiť.' },
  { id: 'products_without_channel', title: 'Produkty mimo predajného kanála', severity: 'blocker', href: '#/produkty', hint: 'Zverejnený produkt bez predajného kanála sa v obchode nezobrazí.' },
  { id: 'products_without_image', title: 'Produkty bez obrázka', severity: 'warning', href: '#/produkty', hint: 'Produkt bez obrázka pôsobí v obchode nedokončene.' },
  { id: 'products_without_category', title: 'Produkty bez kategórie', severity: 'warning', href: '#/produkty', hint: 'Produkt bez kategórie zákazníka v ponuke ťažko nájde.' },
]
/** Hard cap on scanned products; above it product checks are reported as unknown (partial data is not proof). */
export const READINESS_PRODUCT_CAP = 2000
const PAGE = 200

export const hasBaseEurPrice = (variant: any) => Array.isArray(variant?.prices) && variant.prices.some((p: any) =>
  p?.currency_code === 'eur' && !p.price_list_id && !(Number(p.rules_count) > 0) && Number.isFinite(Number(p.amount)) && Number(p.amount) > 0)

/** Pure product evaluation; exported for unit tests. Every published product must be complete. */
export function evaluateProducts(products: any[]) {
  const published = products.filter(p => p?.status === 'published')
  const variants = (p: any) => Array.isArray(p.variants) ? p.variants : []
  return {
    products_published: published.length ? 0 : 1,
    products_without_price: published.filter(p => !variants(p).length || variants(p).some((v: any) => !hasBaseEurPrice(v))).length,
    products_without_channel: published.filter(p => !Array.isArray(p.sales_channels) || !p.sales_channels.length).length,
    products_without_image: published.filter(p => !p.thumbnail && (!Array.isArray(p.images) || !p.images.length)).length,
    products_without_category: published.filter(p => !Array.isArray(p.categories) || !p.categories.length).length,
  }
}

async function graphAll(query: any, entity: string, fields: string[], filters: Record<string, unknown> = {}, cap = READINESS_PRODUCT_CAP) {
  const rows: any[] = []
  for (let skip = 0; ; skip += PAGE) {
    const { data, metadata } = await query.graph({ entity, fields, filters, pagination: { skip, take: PAGE, order: { id: 'ASC' } } })
    if (!Array.isArray(data)) throw new Error('READINESS_INVALID_DATA')
    rows.push(...data)
    const total = Number(metadata?.count ?? rows.length)
    if (rows.length > cap || total > cap) throw new Error('READINESS_TOO_MANY')
    if (data.length < PAGE || rows.length >= total) return rows
  }
}

export async function loadReadiness(scope: any, env: NodeJS.ProcessEnv = process.env) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const counts: Record<string, number | null> = {}
  const settle = async (ids: string[], fn: () => Promise<Record<string, number>>) => {
    try { const r = await fn(); for (const id of ids) counts[id] = Number.isSafeInteger(r[id]) && r[id] >= 0 ? r[id] : null }
    catch { for (const id of ids) counts[id] = null }
  }
  await Promise.all([
    settle(['region_eur', 'payment_provider'], async () => {
      const regions = await graphAll(query, 'region', ['id', 'currency_code', 'payment_providers.id', 'payment_providers.is_enabled'], {}, 200)
      const eur = regions.filter(r => r.currency_code === 'eur')
      return { region_eur: eur.length ? 0 : 1, payment_provider: eur.length && eur.some(r => (r.payment_providers || []).some((p: any) => p?.is_enabled !== false)) ? 0 : 1 }
    }),
    settle(['shipping_option'], async () => ({ shipping_option: (await graphAll(query, 'shipping_option', ['id'], {}, 500)).length ? 0 : 1 })),
    settle(['stock_location'], async () => ({ stock_location: (await graphAll(query, 'stock_location', ['id'], {}, 500)).length ? 0 : 1 })),
    settle(['legal_versions'], async () => { try { versions(env); return { legal_versions: 0 } } catch { return { legal_versions: 1 } } }),
    settle(['products_published', 'products_without_price', 'products_without_channel', 'products_without_image', 'products_without_category'], async () =>
      evaluateProducts(await graphAll(query, 'product', ['id', 'status', 'thumbnail', 'images.id', 'categories.id', 'sales_channels.id', 'variants.id', 'variants.prices.amount', 'variants.prices.currency_code', 'variants.prices.price_list_id', 'variants.prices.rules_count'], { status: 'published' }))),
  ])
  const checks: ReadinessCheck[] = READINESS_CHECKS.map(d => {
    const count = counts[d.id] ?? null
    return { ...d, count, status: count === null ? 'unknown' : count > 0 ? 'problem' : 'ok' }
  })
  return {
    generated_at: new Date().toISOString(),
    checks,
    summary: {
      blockers: checks.filter(c => c.severity === 'blocker' && c.status === 'problem').length,
      warnings: checks.filter(c => c.severity === 'warning' && c.status === 'problem').length,
      unknown: checks.filter(c => c.status === 'unknown').length,
    },
  }
}
