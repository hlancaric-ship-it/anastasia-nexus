import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ENTITLEMENT_MODULE } from "../../../modules/entitlement"
import type EntitlementModuleService from "../../../modules/entitlement/service"
import { issueMediaAccess, MediaAccessDenied } from "../../../modules/entitlement/media/access"

/** POST /store/media-access { product_id, media_key }: krátkodobý odkaz na chráněné médium pro přihlášenou zákaznici. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const auth = req.auth_context
  const customerId = auth?.actor_type === "customer" ? auth.actor_id : undefined
  if (!customerId) return res.status(401).json({ type: "unauthorized", message: "Přihlášení je povinné" })

  const body = (req.body ?? {}) as { product_id?: unknown; media_key?: unknown }
  const productId = typeof body.product_id === "string" ? body.product_id.trim() : ""
  const mediaKey = typeof body.media_key === "string" ? body.media_key.trim() : ""
  if (!productId || !mediaKey || mediaKey.length > 300) {
    return res.status(400).json({ type: "invalid_data", message: "product_id a media_key jsou povinné" })
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const query: any = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const result = await issueMediaAccess(
      {
        guard: req.scope.resolve(ENTITLEMENT_MODULE) as EntitlementModuleService,
        getProductMetadata: async (id) => (await query.graph({ entity: "product", fields: ["metadata"], filters: { id } })).data?.[0]?.metadata ?? null,
        getCustomerEmail: async (id) => (await query.graph({ entity: "customer", fields: ["email"], filters: { id } })).data?.[0]?.email ?? null,
        audit: (e) => logger.info(`[media-access] customer=${e.customerId} product=${e.productId} key=${e.mediaKey} nonce=${e.nonce} exp=${e.expiresAt.toISOString()}`),
        secret: process.env.MEDIA_TOKEN_SECRET ?? "",
        deliveryBaseUrl: process.env.MEDIA_DELIVERY_BASE_URL ?? "",
      },
      { customerId, productId, mediaKey }
    )
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof MediaAccessDenied) {
      if (error.code === "MEDIA_NOT_CONFIGURED") return res.status(503).json({ type: "not_configured", message: "Doručení médií není nakonfigurováno" })
      return res.status(403).json({ type: "forbidden", message: "Přístup k médiu nemáte" })
    }
    logger.error("POST /store/media-access selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Vydání odkazu selhalo" })
  }
}
