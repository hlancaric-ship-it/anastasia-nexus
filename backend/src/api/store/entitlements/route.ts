import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ENTITLEMENT_MODULE } from "../../../modules/entitlement"
import { libraryMedia, type LibraryMedia } from "../../../lib/protected-library/catalog"
import type EntitlementModuleService from "../../../modules/entitlement/service"

function intParam(value: unknown, fallback: number): number {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

/** GET /store/entitlements: aktivní přístupy přihlášeného zákazníka. Bez autentizace 401. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const auth = req.auth_context
  const customerId = auth?.actor_type === "customer" ? auth.actor_id : undefined
  if (!customerId) {
    return res.status(401).json({ type: "unauthorized", message: "Přihlášení je povinné" })
  }

  try {
    const service = req.scope.resolve(ENTITLEMENT_MODULE) as EntitlementModuleService
    const limit = Math.min(Math.max(intParam(req.query?.limit, 50), 1), 100)
    const offset = Math.max(intParam(req.query?.offset, 0), 0)
    const { data, count } = await service.listActiveForCustomer(customerId, { limit, offset })

    const productIds = [...new Set(data.map((e) => e.product_id))]
    const titles = new Map<string, { id: string; title: string; handle: string | null; media: LibraryMedia[] }>()
    if (productIds.length) {
      const query: any = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: products } = await query.graph({
        entity: "product",
        fields: ["id", "title", "handle", "metadata"],
        filters: { id: productIds },
      })
      for (const p of products ?? []) titles.set(p.id, { id: p.id, title: p.title, handle: p.handle ?? null, media: libraryMedia(p.metadata) })
    }

    res.setHeader("Cache-Control", "private, no-store")
    return res.status(200).json({
      entitlements: data.map((e) => ({
        id: e.id,
        product_id: e.product_id,
        variant_id: e.variant_id,
        order_id: e.order_id,
        status: e.status,
        granted_at: e.granted_at,
        expires_at: e.expires_at,
        product: titles.get(e.product_id) ?? null,
      })),
      count,
      limit,
      offset,
    })
  } catch (error) {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    logger.error("GET /store/entitlements selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Načtení přístupů selhalo" })
  }
}
