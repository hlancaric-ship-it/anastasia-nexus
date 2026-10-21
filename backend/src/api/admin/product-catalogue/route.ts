import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor } from "../../../lib/observability/audit"
import { DIGITAL_PRODUCT_GROUPS, digitalGroupFor } from "../../../lib/digital-products/categories"

/**
 * GET /admin/product-catalogue?type=all|digital|physical&q=&status=&limit=&offset=
 *
 * Zoznam produktov pre administráciu s filtrom Fyzické / Digitálne.
 * Rozlišenie je serverové a autoritativne: digitálny produkt je ten, ktorý má
 * dopravný profil typu „digital“ (rovnaké pravidlo používa pokladňa).
 */

const TYPES = ["all", "digital", "physical"] as const
type CatalogueType = (typeof TYPES)[number]

const str = (value: unknown): string => {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === "string" ? raw.trim() : ""
}

const int = (value: unknown, fallback: number): number => {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  const requestedType = str(req.query?.type) || "all"
  if (!TYPES.includes(requestedType as CatalogueType)) {
    return res.status(400).json({ message: "Filter typu musí byť all, digital alebo physical." })
  }
  const type = requestedType as CatalogueType
  const search = str(req.query?.q)
  const status = str(req.query?.status)
  const limit = Math.min(Math.max(int(req.query?.limit, 50), 1), 200)
  const offset = Math.max(int(req.query?.offset, 0), 0)

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const filters: Record<string, unknown> = {}
    if (status === "published" || status === "draft") filters.status = status
    if (search) filters.q = search

    if (type === "digital") {
      filters.shipping_profile = { type: "digital" }
    } else if (type === "physical") {
      // Fyzický = všetko, čo nie je digitálne (vrátane produktov bez profilu).
      const digital = await query.graph({
        entity: "product",
        fields: ["id"],
        filters: { shipping_profile: { type: "digital" } },
      } as any)
      const digitalIds = ((digital?.data ?? []) as Array<{ id: string }>).map((p) => p.id)
      filters.id = { $nin: digitalIds }
    }

    const { data, metadata } = await query.graph({
      entity: "product",
      fields: [
        "id", "title", "status", "handle", "thumbnail", "metadata",
        "*variants.prices", "*categories", "shipping_profile.id", "shipping_profile.type",
      ],
      filters,
      pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
    } as any)

    const products = ((data ?? []) as any[]).map((product) => {
      const categories = (product.categories ?? []).map((category: any) => ({ id: category.id, name: category.name }))
      return {
        id: product.id,
        title: product.title,
        status: product.status,
        handle: product.handle,
        thumbnail: product.thumbnail ?? null,
        metadata: product.metadata ?? {},
        variants: product.variants ?? [],
        categories,
        shipping_profile: product.shipping_profile ?? null,
        digital: product.shipping_profile?.type === "digital",
        digital_group: digitalGroupFor(categories.map((category: any) => category.name))?.label ?? null,
      }
    })

    return res.status(200).json({
      products,
      count: Number(metadata?.count ?? products.length),
      offset: Number(metadata?.skip ?? offset),
      limit: Number(metadata?.take ?? limit),
      groups: DIGITAL_PRODUCT_GROUPS.map((group) => ({ handle: group.handle, label: group.label })),
    })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/product-catalogue zlyhal", error as Error)
    return res.status(503).json({ message: "Produkty sa nepodarilo načítať. Skúste to znova." })
  }
}
