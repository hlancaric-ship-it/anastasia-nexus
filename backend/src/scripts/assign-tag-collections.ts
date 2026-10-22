import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createCollectionsWorkflow } from "@medusajs/medusa/core-flows"
import { slugify } from "./parse-legacy-db"

/**
 * Priradí produkty ku značkovým kolekciám.
 *
 * „Značka“ v starom e-shope je výrobce (ecProducer). Import katalógu kolekcie už
 * vytváří, ale produkty k nim v niektorých prostrediach ostali nepriradené
 * (0 z 14 produktov podľa auditu Fáze 1). Tento skript to doopraví a je
 * idempotentný – opakované spustenie nič nemení.
 *
 * Zdroj názvu značky je `metadata.manufacturer` produktu (značku zapisuje import
 * zo starého e-shopu), fallback je názov kolekcie v metadátach. Kolekcia, ktorá
 * chýba, sa založí s rovnakým handle ako pri importe.
 *
 *   npx medusa exec ./src/scripts/assign-tag-collections.ts [dry-run]
 */

export type TagCollectionProduct = {
  id: string
  handle: string
  title: string
  manufacturer?: string | null
  collection_id?: string | null
}

export type TagCollectionRow = {
  id: string
  title: string
  handle: string
}

export type TagCollectionPlan = {
  /** Kolekcie, ktoré treba založiť (názov značky + handle). */
  createCollections: Array<{ title: string; handle: string }>
  /** Priradenia produktu ku kolekcii (handle kolekcie, nie id – id vznikne až pri založení). */
  assignments: Array<{ product_id: string; product_handle: string; collection_handle: string }>
  /** Produkty, ktoré už správne priradené sú – nemenia sa. */
  unchanged: number
  /** Produkty bez značky (výrobcu) – bez priradenia, nahlásené. */
  withoutTag: Array<{ product_id: string; product_handle: string }>
}

const titleKey = (title: string) => title.trim().toLowerCase()

/**
 * Naplánuje založenie kolekcií a priradenie produktov. Čistá funkcia – bez DB,
 * aby sa dala otestovať a opakovane spustiť bez zmeny výsledku.
 */
export function buildTagCollectionPlan(input: {
  products: TagCollectionProduct[]
  collections: TagCollectionRow[]
}): TagCollectionPlan {
  const byTitle = new Map(input.collections.map((row) => [titleKey(row.title), row]))
  const byHandle = new Map(input.collections.map((row) => [row.handle, row]))
  const createCollections: TagCollectionPlan["createCollections"] = []
  const assignments: TagCollectionPlan["assignments"] = []
  const withoutTag: TagCollectionPlan["withoutTag"] = []
  let unchanged = 0

  for (const product of input.products) {
    const title = String(product.manufacturer ?? "").trim()
    if (!title) {
      withoutTag.push({ product_id: product.id, product_handle: product.handle })
      continue
    }
    const existing = byTitle.get(titleKey(title)) ?? byHandle.get(slugify(title))
    const handle = existing?.handle ?? slugify(title) ?? `znacka-${product.id.slice(-6).toLowerCase()}`
    if (!existing && !createCollections.some((row) => row.handle === handle)) {
      createCollections.push({ title, handle })
    }
    if (existing && product.collection_id === existing.id) {
      unchanged++
      continue
    }
    assignments.push({ product_id: product.id, product_handle: product.handle, collection_handle: handle })
  }

  return { createCollections, assignments, unchanged, withoutTag }
}

export default async function assignTagCollections({ container, args = [] }: { container: MedusaContainer; args?: string[] }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  // Kolekcie sú súčasťou produktového modulu (rovnaký modul ich vytvára pri importe).
  const products = container.resolve(Modules.PRODUCT) as any
  const dryRun = args.includes("dry-run")

  const { data: productRows } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title", "metadata", "collection_id"],
    filters: {},
    pagination: { take: 1000, order: { id: "ASC" } },
  })
  const collectionRows = await products.listProductCollections({}, { take: 1000, order: { id: "ASC" } })

  const plan = buildTagCollectionPlan({
    products: (productRows ?? []).map((row: any) => ({
      id: row.id,
      handle: row.handle,
      title: row.title,
      manufacturer: row.metadata?.manufacturer ?? null,
      collection_id: row.collection_id ?? null,
    })),
    collections: (collectionRows ?? []).map((row: any) => ({ id: row.id, title: row.title, handle: row.handle })),  })

  logger.info(
    `[tag-collections] ${dryRun ? "DRY-RUN" : "apply"}: kolekcie na založenie ${plan.createCollections.length}, ` +
    `priradenia ${plan.assignments.length}, bez zmeny ${plan.unchanged}, bez značky ${plan.withoutTag.length}`,
  )
  if (dryRun) {
    for (const row of plan.createCollections) logger.info(`[tag-collections] založiť kolekciu "${row.title}" (${row.handle})`)
    for (const row of plan.assignments) logger.info(`[tag-collections] ${row.product_handle} → ${row.collection_handle}`)
    return
  }

  const collectionIds = new Map<string, string>()
  for (const row of collectionRows ?? []) {
    collectionIds.set(row.handle, row.id)
    collectionIds.set(titleKey(row.title), row.id)
  }
  for (const row of plan.createCollections) {
    // Rovnaký workflow ako pri importe katalógu – zhodný handle aj metadata.
    const { result } = await createCollectionsWorkflow(container).run({
      input: { collections: [{ title: row.title, handle: row.handle }] },
    } as any)
    const created = (result as any[])?.[0]
    if (created?.id) {
      collectionIds.set(row.handle, created.id)
      collectionIds.set(titleKey(row.title), created.id)
    }
  }
  let updated = 0
  for (const row of plan.assignments) {
    const collectionId = collectionIds.get(row.collection_handle)
    if (!collectionId) continue
    await products.updateProducts(row.product_id, { collection_id: collectionId })
    updated++
  }
  logger.info(`[tag-collections] hotovo: založené kolekcie ${plan.createCollections.length}, priradené produkty ${updated}`)
}
