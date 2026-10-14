import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { ENTITLEMENT_MODULE } from "../../../../../modules/entitlement"
import type EntitlementModuleService from "../../../../../modules/entitlement/service"
import { auditAdminChange } from "../../../../../lib/observability/audit"

/** POST /admin/entitlements/:id/revoke  { reason? } */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const id = req.params?.id
  if (!id) return res.status(400).json({ type: "invalid_data", message: "Chybí id" })
  const reasonRaw = (req.body as { reason?: unknown } | undefined)?.reason
  const reason = typeof reasonRaw === "string" && reasonRaw.trim() ? reasonRaw.trim().slice(0, 500) : "admin_revoked"
  try {
    const service = req.scope.resolve(ENTITLEMENT_MODULE) as EntitlementModuleService
    const entitlement = await service.revoke(id, reason)
    await auditAdminChange(req, "entitlement.revoke", "entitlement", id, null, { status: (entitlement as { status?: string })?.status ?? "revoked", reason })
    return res.status(200).json({ entitlement })
  } catch (error) {
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND) {
      return res.status(404).json({ type: "not_found", message: "Přístup neexistuje" })
    }
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/entitlements/:id/revoke selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Zrušení přístupu selhalo" })
  }
}
