import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminActor } from "../observability/audit"
import { adminCan, resolveAdminRole, type AdminCapability } from "./roles"

/**
 * Kontrola právomoci administrátora. Neprihlásený používateľ dostane 401,
 * asistent bez právomoci 403. Rola sa číta z databázy (nikdy z klienta).
 */
export async function requireAdminCapability(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  capability: AdminCapability,
): Promise<boolean> {
  const actor = adminActor(req)
  if (!actor) {
    res.status(401).json({ message: "Prihláste sa do administrácie." })
    return false
  }
  const role = await resolveAdminRole(req.scope, actor)
  if (!adminCan(role, capability)) {
    res.status(403).json({ message: "Túto časť administrácie môže spravovať iba vlastník." })
    return false
  }
  return true
}
