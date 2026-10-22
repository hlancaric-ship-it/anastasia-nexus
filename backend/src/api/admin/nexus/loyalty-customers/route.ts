import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor } from "../../../../lib/observability/audit"
import { loyaltyTierGroups } from "../../../../lib/loyalty/assignment"
import { resolveCustomerTier } from "../../../../lib/loyalty/tier"
import { LOYALTY_LOCK_METADATA_KEY } from "../../../../lib/loyalty/assignment"

/**
 * GET /admin/nexus/loyalty-customers – zákazníci s vernostnou úrovňou.
 *
 * Filtre: `tier` (kód úrovne alebo `none` = bez úrovne), `q` (meno/e-mail),
 * `limit`, `offset`. Výsledok je vždy serverovo filtrovaný a stránkovaný.
 */
const str = (value: unknown): string => {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === "string" ? raw.trim() : ""
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  const tier = str(req.query?.tier).toUpperCase()
  const search = str(req.query?.q)
  const limit = Math.min(Math.max(Number.parseInt(String(req.query?.limit ?? 50), 10) || 50, 1), 200)
  const offset = Math.max(Number.parseInt(String(req.query?.offset ?? 0), 10) || 0, 0)

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const tiers = await loyaltyTierGroups(req.scope)
    const filters: Record<string, unknown> = {}
    if (search) filters.q = search

    if (tier && tier !== "NONE") {
      const group = tiers.find((item) => item.code === tier)
      if (!group) return res.status(400).json({ message: `Neplatná úroveň ${tier}.` })
      filters.groups = { id: group.id }
    } else if (tier === "NONE") {
      const groupIds = tiers.map((item) => item.id)
      if (groupIds.length) {
        const assigned = await query.graph({
          entity: "customer",
          fields: ["id"],
          filters: { groups: { id: groupIds } },
        } as any)
        const ids = ((assigned?.data ?? []) as Array<{ id: string }>).map((customer) => customer.id)
        filters.id = { $nin: ids }
      }
    }

    const { data, metadata } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name", "created_at", "groups.id", "groups.name", "groups.metadata"],
      filters,
      pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
    } as any)

    const tierNames = new Map(tiers.map((item) => [item.code, item.name]))
    const customers = ((data ?? []) as Array<{ id: string; email?: string | null; first_name?: string | null; last_name?: string | null; created_at?: string | null; groups?: Array<{ id: string; name?: string; metadata?: Record<string, unknown> | null }> }>).map((customer) => {
      const groups = customer.groups ?? []
      const tierCode = resolveCustomerTier(groups) ?? null
      const locked = groups.some((group) => group.metadata?.[LOYALTY_LOCK_METADATA_KEY] === true)
      return {
        id: customer.id,
        email: customer.email ?? null,
        first_name: customer.first_name ?? null,
        last_name: customer.last_name ?? null,
        created_at: customer.created_at ?? null,
        tier_code: tierCode,
        tier_name: tierCode ? tierNames.get(tierCode) ?? tierCode : null,
        source: locked ? "manual" : "auto",
        locked,
      }
    })

    return res.status(200).json({
      customers,
      count: Number(metadata?.count ?? customers.length),
      offset: Number(metadata?.skip ?? offset),
      limit: Number(metadata?.take ?? limit),
      tiers: tiers.map((item) => ({ code: item.code, name: item.name })),
    })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/nexus/loyalty-customers zlyhal", error as Error)
    return res.status(503).json({ message: "Zákazníci sa nepodarilo načítať. Skúste to znova." })
  }
}
