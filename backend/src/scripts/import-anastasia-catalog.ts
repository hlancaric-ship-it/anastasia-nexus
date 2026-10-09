import type { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  batchInventoryItemLevelsWorkflow,
  createCollectionsWorkflow,
  createInventoryItemsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createPromotionsWorkflow,
  updateCollectionsWorkflow,
  updateProductCategoriesWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import * as fs from "fs"
import * as path from "path"
import { htmlToText } from "./parse-legacy-db"
import type { LegacyBrand, LegacyCatalog, LegacyCategory, LegacyCoupon, LegacyProduct } from "./parse-legacy-db"

/**
 * Idempotentní import katalogu ANASTASIA do Medusa v2 z JSON předzpracovaného
 * skriptem parse-legacy-db.ts (data-private/legacy/catalog.json).
 *
 * Spuštění:
 *   npx medusa exec ./src/scripts/import-anastasia-catalog.ts [volby]
 *
 * Volby (pozice za názvem skriptu; "--" se ignoruje, lze i "klíč=hodnota"; env ANASTASIA_IMPORT_<KLÍČ>):
 *   dry-run              jen vypíše plán, nic nezapíše
 *   file=<cesta>         vstupní JSON (výchozí data-private/legacy/catalog.json)
 *   update               u existujících entit obnoví popisná pole (název, popis, metadata, kategorie, kolekce, obrázky)
 *   update-prices        u existujících variant přepíše EUR cenu
 *   update-stock         u existujících skladových položek přepíše množství
 *   update-status        u existujících produktů přepíše status (published/draft)
 *   coupons              založí kupóny jako NEAKTIVNÍ (draft) promoce
 *   media-base-url=<url> základ pro obrázky (např. https://anastasiaoz.eu); bez něj se obrázky nenahrávají
 *   description=html|text  formát popisu produktu (výchozí html)
 *   sales-channel=<název>, stock-location=<název>, digital-profile=<název>
 *
 * Bez voleb skript jen DOPLNÍ chybějící entity. Existující produkty, ceny a sklad (které už mohou být
 * po spuštění e-shopu živé) nepřepisuje.
 *
 * Předpoklad: proběhl src/migration-scripts/anastasia-bootstrap.ts (sales channel, sklad, shipping profily).
 * Ceny: v JSON jsou koncové ceny s DPH v EUR (hlavní jednotky). Region/měna musí být "tax inclusive"
 * (řeší bootstrap). Cenu zákazníkovi počítá výhradně backend (NEXUS adapter), tento skript jen zakládá
 * základní ceník.
 */

// ---------------------------------------------------------------------------
// Konfigurace
// ---------------------------------------------------------------------------

export const CURRENCY_CODE = "eur"
export const DEFAULT_SALES_CHANNEL = "ANASTASIA e-shop"
export const DEFAULT_STOCK_LOCATION = "Sklad ANASTASIA"
export const DEFAULT_DIGITAL_PROFILE = "Digitálne produkty"
export const DEFAULT_OPTION_TITLE = "Predvolené"
export const DEFAULT_OPTION_VALUE = "Predvolené"
export const DEFAULT_CATALOG_FILE = path.join("data-private", "legacy", "catalog.json")

export interface ImportOptions {
  file: string
  dryRun: boolean
  update: boolean
  updatePrices: boolean
  updateStock: boolean
  updateStatus: boolean
  coupons: boolean
  mediaBaseUrl: string | null
  descriptionFormat: "html" | "text"
  salesChannelName: string
  stockLocationName: string
  digitalProfileName: string
}

export function parseOptions(args: string[] | undefined, env: Record<string, string | undefined> = process.env): ImportOptions {
  const kv = new Map<string, string>()
  for (const raw of args ?? []) {
    const cleaned = String(raw).replace(/^-+/, "").trim()
    if (!cleaned) continue
    const eq = cleaned.indexOf("=")
    if (eq < 0) kv.set(cleaned.toLowerCase(), "true")
    else kv.set(cleaned.slice(0, eq).toLowerCase(), cleaned.slice(eq + 1).trim())
  }
  const get = (key: string): string | undefined => {
    const fromArgs = kv.get(key)
    if (fromArgs !== undefined) return fromArgs
    const fromEnv = env[`ANASTASIA_IMPORT_${key.toUpperCase().replace(/-/g, "_")}`]
    return fromEnv === undefined || fromEnv === "" ? undefined : fromEnv
  }
  const flag = (key: string) => {
    const v = get(key)
    return v !== undefined && !/^(0|false|no|off)$/i.test(v)
  }

  const descriptionFormat = (get("description") ?? "html").toLowerCase()
  if (descriptionFormat !== "html" && descriptionFormat !== "text") {
    throw new Error(`Neplatná hodnota description='${descriptionFormat}' (povoleno html|text)`)
  }
  let mediaBaseUrl = get("media-base-url") ?? null
  if (mediaBaseUrl) {
    let parsed: URL
    try {
      parsed = new URL(mediaBaseUrl)
    } catch {
      throw new Error(`Neplatná media-base-url '${mediaBaseUrl}'`)
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("media-base-url musí být http(s)")
    }
    mediaBaseUrl = mediaBaseUrl.replace(/\/+$/, "")
  }

  return {
    file: path.resolve(process.cwd(), get("file") ?? DEFAULT_CATALOG_FILE),
    dryRun: flag("dry-run"),
    update: flag("update"),
    updatePrices: flag("update-prices"),
    updateStock: flag("update-stock"),
    updateStatus: flag("update-status"),
    coupons: flag("coupons"),
    mediaBaseUrl,
    descriptionFormat,
    salesChannelName: get("sales-channel") ?? DEFAULT_SALES_CHANNEL,
    stockLocationName: get("stock-location") ?? DEFAULT_STOCK_LOCATION,
    digitalProfileName: get("digital-profile") ?? DEFAULT_DIGITAL_PROFILE,
  }
}

// ---------------------------------------------------------------------------
// Načtení a validace vstupu
// ---------------------------------------------------------------------------

export function validateCatalog(raw: unknown): LegacyCatalog {
  const c = raw as Partial<LegacyCatalog> | null
  if (!c || typeof c !== "object") throw new Error("Katalog není objekt")
  if (c.currency !== "eur") throw new Error(`Nepodporovaná měna '${String(c.currency)}' (jen eur)`)
  for (const key of ["brands", "categories", "products", "coupons"] as const) {
    if (!Array.isArray(c[key])) throw new Error(`Katalog: chybí pole '${key}'`)
  }
  const skus = new Set<string>()
  const handles = new Set<string>()
  for (const p of c.products as LegacyProduct[]) {
    if (!p.sku || !p.title || !p.handle) throw new Error(`Produkt bez sku/title/handle: ${JSON.stringify(p.legacy_id)}`)
    if (skus.has(p.sku)) throw new Error(`Duplicitní SKU v katalogu: ${p.sku}`)
    if (handles.has(p.handle)) throw new Error(`Duplicitní handle v katalogu: ${p.handle}`)
    skus.add(p.sku)
    handles.add(p.handle)
    if (p.price) {
      const a = p.price.amount_with_vat
      if (typeof a !== "number" || !Number.isFinite(a) || a < 0) throw new Error(`Produkt ${p.sku}: neplatná cena ${String(a)}`)
    }
    if (!Number.isFinite(p.stock_quantity) || p.stock_quantity < 0) throw new Error(`Produkt ${p.sku}: neplatný sklad`)
  }
  return c as LegacyCatalog
}

export function loadCatalog(file: string): LegacyCatalog {
  if (!fs.existsSync(file)) {
    throw new Error(`Vstupní soubor ${file} neexistuje. Nejdřív spusť: npx ts-node src/scripts/parse-legacy-db.ts <DB.sql>`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (err) {
    throw new Error(`Soubor ${file} není platný JSON: ${(err as Error).message}`)
  }
  return validateCatalog(parsed)
}

// ---------------------------------------------------------------------------
// Čisté funkce (testované)
// ---------------------------------------------------------------------------

/** Rodiče před potomky, sourozenci dle staré pořadí => Medusa rank odpovídá starému pořadí. */
export function orderCategories(categories: LegacyCategory[]): LegacyCategory[] {
  const byParent = new Map<string | null, LegacyCategory[]>()
  const ids = new Set(categories.map((c) => c.legacy_id))
  for (const c of categories) {
    const parent = c.parent_legacy_id && ids.has(c.parent_legacy_id) ? c.parent_legacy_id : null
    const arr = byParent.get(parent) ?? []
    arr.push(c)
    byParent.set(parent, arr)
  }
  const out: LegacyCategory[] = []
  const visit = (parent: string | null, guard: Set<string>) => {
    const children = (byParent.get(parent) ?? []).slice().sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    for (const ch of children) {
      if (guard.has(ch.legacy_id)) continue
      guard.add(ch.legacy_id)
      out.push(ch)
      visit(ch.legacy_id, guard)
    }
  }
  visit(null, new Set())
  return out
}

export function buildImageUrl(base: string | null, imagePath: string | null): string | null {
  if (!base || !imagePath) return null
  const trimmed = imagePath.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return encodeURI(trimmed)
  const p = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  return `${base}${encodeURI(p)}`
}

export interface StockPlan {
  manage_inventory: boolean
  allow_backorder: boolean
  /** množství pro sklad (jen když manage_inventory) */
  quantity: number
}

export function planStock(p: LegacyProduct): StockPlan {
  if (p.kind !== "physical") return { manage_inventory: false, allow_backorder: false, quantity: 0 }
  if (p.availability === "unavailable") return { manage_inventory: true, allow_backorder: false, quantity: 0 }
  if (p.availability === "on_order") return { manage_inventory: true, allow_backorder: true, quantity: Math.floor(p.stock_quantity) }
  return { manage_inventory: true, allow_backorder: false, quantity: Math.floor(p.stock_quantity) }
}

export interface ProductContext {
  categoryIds: Map<string, string>
  categoriesByLegacyId: Map<string, LegacyCategory>
  brandCollectionIds: Map<string, string>
  productSkusByLegacyId: Map<string, string>
  salesChannelId: string
  physicalProfileId: string
  digitalProfileId: string
  options: Pick<ImportOptions, "mediaBaseUrl" | "descriptionFormat">
}

/** Metadata čtená NEXUS adapterem: manufacturer, category, max_discount (jen číslo). Zbytek je informační. */
export function buildProductMetadata(p: LegacyProduct, ctx: Pick<ProductContext, "categoriesByLegacyId" | "productSkusByLegacyId">) {
  const cats = p.category_legacy_ids
    .map((id) => ctx.categoriesByLegacyId.get(id))
    .filter((c): c is LegacyCategory => Boolean(c))
  const primary = cats[0]
  const metadata: Record<string, unknown> = {
    // --- NEXUS
    ...(p.brand_name ? { manufacturer: p.brand_name } : {}),
    ...(primary ? { category: primary.handle } : {}),
    // --- katalog
    product_kind: p.kind,
    legacy_id: p.legacy_id,
    legacy_code: p.sku,
    legacy_url: p.legacy_url,
    legacy_path: p.legacy_path,
    legacy_rank: p.rank,
    availability: p.availability,
    is_new: p.is_new,
    is_action: p.is_action,
    is_sale: p.is_sale,
    category_handles: cats.map((c) => c.handle),
    related_skus: p.related_legacy_ids
      .map((id) => ctx.productSkusByLegacyId.get(id))
      .filter((s): s is string => Boolean(s)),
    seo_title: p.meta_title,
    seo_description: p.meta_description,
    description_text: p.description_text,
  }
  if (p.kind !== "physical") metadata.legacy_stock_quantity = p.stock_quantity
  if (p.electronic_product_path) {
    metadata.digital_content_path = p.electronic_product_path
    metadata.digital_delivery = "pending_entitlement_design"
  }
  if (p.price) {
    metadata.legacy_vat_rate = p.price.vat_rate
    metadata.legacy_price_no_vat = p.price.amount_no_vat
  }
  return metadata
}

export function selectProfileId(p: LegacyProduct, ctx: Pick<ProductContext, "physicalProfileId" | "digitalProfileId">): string {
  return p.kind === "physical" ? ctx.physicalProfileId : ctx.digitalProfileId
}

export function buildProductCreateInput(p: LegacyProduct, ctx: ProductContext) {
  const stock = planStock(p)
  const image = buildImageUrl(ctx.options.mediaBaseUrl, p.image_path)
  const description = ctx.options.descriptionFormat === "html" ? p.description_html : p.description_text
  const prices = p.price ? [{ amount: p.price.amount_with_vat, currency_code: CURRENCY_CODE }] : []
  const collectionId = p.brand_legacy_id ? ctx.brandCollectionIds.get(p.brand_legacy_id) : undefined
  const categoryIds = p.category_legacy_ids.map((id) => ctx.categoryIds.get(id)).filter((x): x is string => Boolean(x))

  return {
    title: p.title,
    handle: p.handle,
    description: description ?? undefined,
    // bez ceny se produkt nikdy nepublikuje (nešlo by ho koupit / NEXUS by odmítl cenu)
    status: p.is_visible && p.price ? ("published" as const) : ("draft" as const),
    external_id: p.legacy_id,
    thumbnail: image ?? undefined,
    images: image ? [{ url: image }] : undefined,
    collection_id: collectionId,
    category_ids: categoryIds,
    shipping_profile_id: selectProfileId(p, ctx),
    sales_channels: [{ id: ctx.salesChannelId }],
    metadata: buildProductMetadata(p, ctx),
    options: [{ title: DEFAULT_OPTION_TITLE, values: [DEFAULT_OPTION_VALUE] }],
    variants: [
      {
        title: DEFAULT_OPTION_VALUE,
        sku: p.sku,
        manage_inventory: stock.manage_inventory,
        allow_backorder: stock.allow_backorder,
        options: { [DEFAULT_OPTION_TITLE]: DEFAULT_OPTION_VALUE },
        prices,
        metadata: { legacy_id: p.legacy_id },
      },
    ],
  }
}

/** Aktualizace existujícího produktu: jen pole povolená přepínači, metadata se slučují (cizí klíče zůstanou). */
export function buildProductUpdateInput(
  p: LegacyProduct,
  existing: { id: string; metadata?: Record<string, unknown> | null; variants?: Array<{ id: string; sku?: string | null }> },
  ctx: ProductContext,
  opts: Pick<ImportOptions, "update" | "updatePrices" | "updateStatus">
): Record<string, unknown> | null {
  const create = buildProductCreateInput(p, ctx)
  const update: Record<string, unknown> = { id: existing.id }
  let changed = false
  if (opts.update) {
    Object.assign(update, {
      title: create.title,
      description: create.description ?? null,
      external_id: create.external_id,
      collection_id: create.collection_id ?? null,
      category_ids: create.category_ids,
      shipping_profile_id: create.shipping_profile_id,
      metadata: { ...(existing.metadata ?? {}), ...create.metadata },
    })
    if (create.thumbnail) {
      update.thumbnail = create.thumbnail
      update.images = create.images
    }
    changed = true
  }
  if (opts.updateStatus) {
    update.status = create.status
    changed = true
  }
  if (opts.updatePrices && p.price) {
    const variant = existing.variants?.find((v) => v.sku === p.sku)
    if (variant) {
      update.variants = [{ id: variant.id, prices: create.variants[0].prices }]
      changed = true
    }
  }
  return changed ? update : null
}

export function buildPromotionInput(
  coupon: LegacyCoupon,
  productIds: string[],
  campaign: { id?: string; identifier: string }
) {
  const usePercent = coupon.discount_percent > 0
  const value = usePercent ? coupon.discount_percent : coupon.discount_amount
  if (!(value > 0)) throw new Error(`Kupón ${coupon.code}: nulová sleva, nelze importovat`)
  if (usePercent && value > 100) throw new Error(`Kupón ${coupon.code}: sleva ${value} % > 100`)

  const toDate = (s: string | null): Date | undefined => {
    if (!s) return undefined
    const d = new Date(s.endsWith("Z") ? s : `${s}Z`)
    return Number.isNaN(d.getTime()) ? undefined : d
  }

  return {
    code: coupon.code,
    type: "standard" as const,
    // NEXUS adapter promoce na řádcích vypíná; kupóny proto jen neaktivní, dokud není schválená politika
    status: "draft" as const,
    is_automatic: false,
    ...(coupon.use_multiple ? {} : { limit: 1 }),
    ...(campaign.id
      ? { campaign_id: campaign.id }
      : {
          campaign: {
            name: `Legacy kupón ${coupon.code}`,
            campaign_identifier: campaign.identifier,
            starts_at: toDate(coupon.valid_from),
            ends_at: toDate(coupon.valid_until),
          },
        }),
    application_method: {
      type: usePercent ? ("percentage" as const) : ("fixed" as const),
      target_type: "items" as const,
      allocation: "each" as const,
      value,
      ...(usePercent ? {} : { currency_code: CURRENCY_CODE }),
      ...(productIds.length
        ? { target_rules: [{ attribute: "items.product.id", operator: "in" as const, values: productIds }] }
        : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// Hlavní skript
// ---------------------------------------------------------------------------

type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void }

interface Stats {
  created: number
  updated: number
  skipped: number
  failed: number
}
const newStats = (): Stats => ({ created: 0, updated: 0, skipped: 0, failed: 0 })

export default async function importAnastasiaCatalog({ container, args }: { container: MedusaContainer; args?: string[] }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as unknown as Logger
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const opts = parseOptions(args)
  const tag = opts.dryRun ? "[catalog-import DRY-RUN]" : "[catalog-import]"
  const log = (m: string) => logger.info(`${tag} ${m}`)

  const catalog = loadCatalog(opts.file)
  log(
    `vstup ${opts.file}: ${catalog.products.length} produktů, ${catalog.categories.length} kategorií, ${catalog.brands.length} značek, ${catalog.coupons.length} kupónů`
  )

  const findAll = async (entity: string, fields: string[], filters: Record<string, unknown>) => {
    const { data } = await query.graph({ entity, fields, filters } as any)
    return (data ?? []) as any[]
  }
  const errors: string[] = []
  const guard = async <T>(stats: Stats, label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn()
    } catch (err) {
      stats.failed++
      const msg = `${label}: ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
      logger.error(`${tag} CHYBA ${msg}`)
      return undefined
    }
  }

  // --- 0) infrastruktura z bootstrapu
  const [salesChannel] = await findAll("sales_channel", ["id", "name"], { name: opts.salesChannelName })
  if (!salesChannel) throw new Error(`Sales channel '${opts.salesChannelName}' neexistuje – spusť anastasia-bootstrap.ts`)
  const [physicalProfile] = await findAll("shipping_profile", ["id", "name", "type"], { type: "default" })
  if (!physicalProfile) throw new Error("Výchozí shipping profil (type=default) neexistuje – spusť anastasia-bootstrap.ts")
  const [digitalProfile] = await findAll("shipping_profile", ["id", "name"], { name: opts.digitalProfileName })
  if (!digitalProfile) throw new Error(`Shipping profil '${opts.digitalProfileName}' neexistuje – spusť anastasia-bootstrap.ts`)
  const needsStock = catalog.products.some((p) => planStock(p).manage_inventory)
  let stockLocationId: string | null = null
  if (needsStock) {
    const [loc] = await findAll("stock_location", ["id", "name"], { name: opts.stockLocationName })
    if (!loc) throw new Error(`Sklad '${opts.stockLocationName}' neexistuje – spusť anastasia-bootstrap.ts`)
    stockLocationId = loc.id
  }

  // --- 1) značky -> kolekce
  const collStats = newStats()
  const brandCollectionIds = new Map<string, string>()
  for (const b of catalog.brands as LegacyBrand[]) {
    await guard(collStats, `kolekce ${b.handle}`, async () => {
      const [existing] = await findAll("product_collection", ["id", "title", "handle", "metadata"], { handle: b.handle })
      const metadata = { legacy_id: b.legacy_id, legacy_web: b.web, legacy_description_html: b.description_html }
      if (existing) {
        brandCollectionIds.set(b.legacy_id, existing.id)
        if (opts.update && !opts.dryRun) {
          await updateCollectionsWorkflow(container).run({
            input: { selector: { id: existing.id }, update: { title: b.name, metadata: { ...(existing.metadata ?? {}), ...metadata } } },
          } as any)
          collStats.updated++
        } else collStats.skipped++
        return
      }
      if (opts.dryRun) {
        log(`vytvořil bych kolekci '${b.name}' (${b.handle})`)
        collStats.created++
        return
      }
      const { result } = await createCollectionsWorkflow(container).run({
        input: { collections: [{ title: b.name, handle: b.handle, metadata }] },
      } as any)
      brandCollectionIds.set(b.legacy_id, result[0].id)
      collStats.created++
    })
  }

  // --- 2) kategorie (rodiče první)
  const catStats = newStats()
  const categoryIds = new Map<string, string>()
  const categoriesByLegacyId = new Map(catalog.categories.map((c) => [c.legacy_id, c]))
  for (const c of orderCategories(catalog.categories)) {
    await guard(catStats, `kategorie ${c.handle}`, async () => {
      const [existing] = await findAll("product_category", ["id", "handle", "metadata", "parent_category_id"], { handle: c.handle })
      const parentId = c.parent_legacy_id ? categoryIds.get(c.parent_legacy_id) : undefined
      const description = c.description_html ? htmlToText(c.description_html) ?? undefined : undefined
      const metadata = {
        legacy_id: c.legacy_id,
        legacy_code: c.code,
        legacy_url: c.legacy_url,
        legacy_path: c.legacy_path,
        legacy_rank: c.rank,
        description_html: c.description_html,
        seo_title: c.meta_title,
        seo_description: c.meta_description,
        image_path: c.image_path,
      }
      if (existing) {
        categoryIds.set(c.legacy_id, existing.id)
        if (opts.update && !opts.dryRun) {
          await updateProductCategoriesWorkflow(container).run({
            input: {
              selector: { id: existing.id },
              update: {
                name: c.name,
                description,
                is_active: c.is_active,
                metadata: { ...(existing.metadata ?? {}), ...metadata },
                ...(parentId ? { parent_category_id: parentId } : {}),
              },
            },
          } as any)
          catStats.updated++
        } else catStats.skipped++
        return
      }
      if (c.parent_legacy_id && !parentId && !opts.dryRun) {
        throw new Error(`rodič kategorie ${c.legacy_id} nebyl vytvořen`)
      }
      if (opts.dryRun) {
        log(`vytvořil bych kategorii '${c.name}' (${c.handle})${c.parent_legacy_id ? " pod rodičem" : ""}`)
        catStats.created++
        return
      }
      const { result } = await createProductCategoriesWorkflow(container).run({
        input: {
          product_categories: [
            {
              name: c.name,
              handle: c.handle,
              description,
              is_active: c.is_active,
              is_internal: false,
              parent_category_id: parentId ?? null,
              external_id: c.legacy_id,
              metadata,
            },
          ],
        },
      } as any)
      categoryIds.set(c.legacy_id, result[0].id)
      catStats.created++
    })
  }

  // --- 3) produkty
  const prodStats = newStats()
  const productSkusByLegacyId = new Map(catalog.products.map((p) => [p.legacy_id, p.sku]))
  const ctx: ProductContext = {
    categoryIds,
    categoriesByLegacyId,
    brandCollectionIds,
    productSkusByLegacyId,
    salesChannelId: salesChannel.id,
    physicalProfileId: physicalProfile.id,
    digitalProfileId: digitalProfile.id,
    options: { mediaBaseUrl: opts.mediaBaseUrl, descriptionFormat: opts.descriptionFormat },
  }
  const existingVariantsBySku = new Map<string, { id: string; product_id: string }>()
  for (const v of await findAll("product_variant", ["id", "sku", "product_id"], { sku: catalog.products.map((p) => p.sku) })) {
    if (v.sku) {
      if (existingVariantsBySku.has(v.sku)) {
        throw new Error(`SKU ${v.sku} už existuje u více variant v Meduse – import zastaven`)
      }
      existingVariantsBySku.set(v.sku, { id: v.id, product_id: v.product_id })
    }
  }

  const inventoryTargets: Array<{ sku: string; variantId: string; quantity: number; allowWrite: boolean }> = []
  for (const p of catalog.products) {
    await guard(prodStats, `produkt ${p.sku} (${p.handle})`, async () => {
      const [byHandle] = await findAll(
        "product",
        ["id", "handle", "metadata", "variants.id", "variants.sku"],
        { handle: p.handle }
      )
      const skuOwner = existingVariantsBySku.get(p.sku)
      if (byHandle && skuOwner && skuOwner.product_id !== byHandle.id) {
        throw new Error(`SKU ${p.sku} už existuje u jiného produktu (${skuOwner.product_id}) – řeš ručně`)
      }
      let existing = byHandle
      // SKU je druhý stabilní identifikátor importu. Pokud se v administraci
      // změnil handle, najdeme tentýž produkt podle SKU a jeho legacy ID; jinak
      // raději zastavíme než založit duplicitní produkt nebo upravit cizí záznam.
      if (!existing && skuOwner) {
        const [skuProduct] = await findAll(
          "product",
          ["id", "handle", "metadata", "variants.id", "variants.sku"],
          { id: skuOwner.product_id }
        )
        if (skuProduct?.metadata?.legacy_id === p.legacy_id) existing = skuProduct
        else throw new Error(`SKU ${p.sku} je obsazené produktem s jiným legacy ID (${skuOwner.product_id})`)
      }
      if (!p.price) logger.warn(`${tag} ${p.sku}: bez ceny, zakládá se jako draft`)

      if (existing) {
        const upd = buildProductUpdateInput(p, existing, ctx, opts)
        const variantId = existing.variants?.find((v: any) => v.sku === p.sku)?.id
        if (variantId) inventoryTargets.push({ sku: p.sku, variantId, quantity: planStock(p).quantity, allowWrite: opts.updateStock })
        if (!upd) {
          prodStats.skipped++
          return
        }
        if (opts.dryRun) {
          log(`aktualizoval bych produkt ${p.sku}: ${Object.keys(upd).filter((k) => k !== "id").join(", ")}`)
          prodStats.updated++
          return
        }
        await updateProductsWorkflow(container).run({ input: { products: [upd] } } as any)
        prodStats.updated++
        return
      }

      const input = buildProductCreateInput(p, ctx)
      if (opts.dryRun) {
        log(`vytvořil bych produkt ${p.sku} '${p.title}' (${input.status}, ${p.kind}, cena ${p.price?.amount_with_vat ?? "-"} EUR)`)
        prodStats.created++
        return
      }
      const { result } = await createProductsWorkflow(container).run({ input: { products: [input] } } as any)
      const variantId = (result[0] as any)?.variants?.[0]?.id
      if (variantId) {
        existingVariantsBySku.set(p.sku, { id: variantId, product_id: result[0].id })
        inventoryTargets.push({ sku: p.sku, variantId, quantity: planStock(p).quantity, allowWrite: true })
      }
      prodStats.created++
    })
  }

  // --- 4) sklad (jen produkty se správou skladu)
  const invStats = newStats()
  if (stockLocationId && !opts.dryRun) {
    for (const t of inventoryTargets) {
      const p = catalog.products.find((x) => x.sku === t.sku)!
      if (!planStock(p).manage_inventory) continue
      await guard(invStats, `sklad ${t.sku}`, async () => {
        const [variant] = await findAll(
          "product_variant",
          ["id", "inventory_items.inventory_item_id", "inventory_items.inventory.location_levels.id", "inventory_items.inventory.location_levels.location_id"],
          { id: t.variantId }
        )
        let inventoryItemId: string | undefined = variant?.inventory_items?.[0]?.inventory_item_id
        if (!inventoryItemId) {
          const { result } = await createInventoryItemsWorkflow(container).run({
            input: { items: [{ sku: t.sku, title: p.title }] },
          } as any)
          inventoryItemId = result[0].id
          await link.create({
            [Modules.PRODUCT]: { variant_id: t.variantId },
            [Modules.INVENTORY]: { inventory_item_id: inventoryItemId },
          })
        }
        const levels: any[] = variant?.inventory_items?.[0]?.inventory?.location_levels ?? []
        const level = levels.find((l) => l.location_id === stockLocationId)
        if (!level) {
          await batchInventoryItemLevelsWorkflow(container).run({
            input: { create: [{ inventory_item_id: inventoryItemId, location_id: stockLocationId, stocked_quantity: t.quantity }], update: [], delete: [] },
          } as any)
          invStats.created++
        } else if (t.allowWrite) {
          await batchInventoryItemLevelsWorkflow(container).run({
            input: { create: [], update: [{ inventory_item_id: inventoryItemId, location_id: stockLocationId, stocked_quantity: t.quantity }], delete: [] },
          } as any)
          invStats.updated++
        } else invStats.skipped++
      })
    }
  } else if (opts.dryRun) {
    log(`sklad: ${catalog.products.filter((p) => planStock(p).manage_inventory).length} produktů se správou skladu`)
  }

  // --- 5) kupóny (neaktivní)
  const couponStats = newStats()
  if (opts.coupons) {
    for (const coupon of catalog.coupons) {
      await guard(couponStats, `kupón ${coupon.code}`, async () => {
        const [existing] = await findAll("promotion", ["id", "code"], { code: coupon.code })
        if (existing) {
          couponStats.skipped++
          return
        }
        const productIds: string[] = []
        for (const code of coupon.product_codes) {
          const v = existingVariantsBySku.get(code)
          if (v) productIds.push(v.product_id)
          else if (!opts.dryRun) throw new Error(`produkt ${code} z kupónu nebyl nalezen`)
        }
        const identifier = `legacy-coupon-${coupon.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
        const [campaign] = await findAll("campaign", ["id", "campaign_identifier"], { campaign_identifier: identifier })
        const input = buildPromotionInput(coupon, productIds, { id: campaign?.id, identifier })
        if (opts.dryRun) {
          log(`vytvořil bych neaktivní kupón ${coupon.code} (${coupon.discount_percent ? coupon.discount_percent + " %" : coupon.discount_amount + " EUR"})`)
          couponStats.created++
          return
        }
        await createPromotionsWorkflow(container).run({ input: { promotionsData: [input] } } as any)
        couponStats.created++
      })
    }
  } else if (catalog.coupons.length) {
    log(`kupóny (${catalog.coupons.length}) přeskočeny – pro import neaktivních přidej volbu 'coupons'`)
  }

  const line = (name: string, s: Stats) => `${name}: +${s.created} ~${s.updated} =${s.skipped} !${s.failed}`
  log(
    `HOTOVO | ${line("kolekce", collStats)} | ${line("kategorie", catStats)} | ${line("produkty", prodStats)} | ${line("sklad", invStats)} | ${line("kupóny", couponStats)}`
  )
  if (errors.length) {
    throw new Error(`Import skončil s ${errors.length} chybami:\n- ${errors.join("\n- ")}`)
  }
}
