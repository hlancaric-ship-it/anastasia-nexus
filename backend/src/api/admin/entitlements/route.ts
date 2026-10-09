import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ENTITLEMENT_MODULE } from "../../../modules/entitlement"
import type EntitlementModuleService from "../../../modules/entitlement/service"

const str = (v: unknown): string | undefined => {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === "string" && s.trim() ? s.trim() : undefined
}
const int = (v: unknown, fallback: number): number => {
  const n = Number(Array.isArray(v) ? v[0] : v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

/** GET /admin/entitlements?customer_id&product_id&order_id&status&limit&offset */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const service = req.scope.resolve(ENTITLEMENT_MODULE) as EntitlementModuleService
    const status = str(req.query?.status)
    if (status && status !== "active" && status !== "revoked") {
      return res.status(400).json({ type: "invalid_data", message: "status musí být active nebo revoked" })
    }
    const filters: Record<string, unknown> = {}
    for (const key of ["customer_id", "product_id", "order_id"] as const) {
      const v = str(req.query?.[key])
      if (v) filters[key] = v
    }
    if (status) filters.status = status
    const limit = Math.min(Math.max(int(req.query?.limit, 50), 1), 200)
    const offset = Math.max(int(req.query?.offset, 0), 0)
    const [entitlements, count] = await service.listAndCountEntitlements(filters, {
      take: limit,
      skip: offset,
      order: { granted_at: "DESC" },
    })
    return res.status(200).json({ entitlements, count, limit, offset })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/entitlements selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Načtení přístupů selhalo" })
  }
}

type GrantBody = {
  customer_id?: unknown
  product_id?: unknown
  variant_id?: unknown
  expires_at?: unknown
  reason?: unknown
}

/** POST /admin/entitlements: ruční udělení přístupu (vždy nový záznam, source=admin). */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as GrantBody
  const customerId = typeof body.customer_id === "string" ? body.customer_id.trim() : ""
  const productId = typeof body.product_id === "string" ? body.product_id.trim() : ""
  const variantId = typeof body.variant_id === "string" && body.variant_id.trim() ? body.variant_id.trim() : null
  if (!customerId || !productId) {
    return res.status(400).json({ type: "invalid_data", message: "customer_id a product_id jsou povinné" })
  }
  let expiresAt: Date | null = null
  if (body.expires_at !== undefined && body.expires_at !== null && body.expires_at !== "") {
    expiresAt = new Date(String(body.expires_at))
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ type: "invalid_data", message: "expires_at musí být platné datum v budoucnu" })
    }
  }

  try {
    const query: any = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: customers } = await query.graph({ entity: "customer", fields: ["id"], filters: { id: customerId } })
    if (!customers?.length) return res.status(404).json({ type: "not_found", message: "Zákaznice neexistuje" })
    const { data: products } = await query.graph({ entity: "product", fields: ["id"], filters: { id: productId } })
    if (!products?.length) return res.status(404).json({ type: "not_found", message: "Produkt neexistuje" })

    const service = req.scope.resolve(ENTITLEMENT_MODULE) as EntitlementModuleService
    const { entitlement } = await service.grant({
      customer_id: customerId,
      product_id: productId,
      variant_id: variantId,
      source: "admin",
      dedupe_key: `admin:${customerId}:${productId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
      expires_at: expiresAt,
      granted_by: req.auth_context?.actor_id ?? null,
      metadata: typeof body.reason === "string" && body.reason.trim() ? { reason: body.reason.trim().slice(0, 500) } : null,
    })
    return res.status(201).json({ entitlement })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/entitlements selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Udělení přístupu selhalo" })
  }
}
