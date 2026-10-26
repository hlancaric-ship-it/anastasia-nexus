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
 *
 * Poradie (Lucky 26. 10.): zverejnené pred konceptmi, v rámci nich fyzické,
 * potom služby a nakoniec digitálne, najnovšie prvé. Triedi sa celý výber,
 * takže poradie platí aj cez stránkovanie.
 */

const TYPES = ["all", "digital", "physical"] as const
type CatalogueType = (typeof TYPES)[number]

const str = (value: unknown): string => {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === "string" ? raw.trim() : ""
}

type SortRow = { id: string; status?: string; created_at?: string | Date; metadata?: Record<string, unknown> | null; shipping_profile?: { type?: string } | null }

/** 0 fyzické, 1 služba (konzultácia), 2 digitálne. */
export const kindRank = (p: SortRow): number => {
  if (p.shipping_profile?.type === "digital" || p.metadata?.product_kind === "digital") return 2
  if (p.metadata?.booking || p.metadata?.product_kind === "service") return 1
  return 0
}

export const compareCatalogue = (a: SortRow, b: SortRow): number =>
  (a.status === "published" ? 0 : 1) - (b.status === "published" ? 0 : 1) ||
  kindRank(a) - kindRank(b) ||
  new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()

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

    // Najprv ľahký zoznam celého výberu na zoradenie, potom plné údaje len pre aktuálnu stranu.
    const { data: rows } = await query.graph({
      entity: "product",
      fields: ["id", "status", "created_at", "metadata", "shipping_profile.type"],
      filters,
    } as any)
    const ordered = ((rows ?? []) as SortRow[]).slice().sort(compareCatalogue)
    const pageIds = ordered.slice(offset, offset + limit).map((p) => p.id)

    const { data } = pageIds.length
      ? await query.graph({
          entity: "product",
          fields: [
            "id", "title", "status", "handle", "thumbnail", "metadata",
            "variants.*", "variants.prices.*", "categories.id", "categories.name", "shipping_profile.id", "shipping_profile.type",
          ],
          filters: { id: pageIds },
        } as any)
      : { data: [] }
    const position = new Map(pageIds.map((id, i) => [id, i]))
    const page = ((data ?? []) as any[]).slice().sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0))

    const products = page.map((product) => {
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
      count: ordered.length,
      offset,
      limit,
      groups: DIGITAL_PRODUCT_GROUPS.map((group) => ({ handle: group.handle, label: group.label })),
    })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/product-catalogue zlyhal", error as Error)
    return res.status(503).json({ message: "Produkty sa nepodarilo načítať. Skúste to znova." })
  }
}
