import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../../lib/observability/audit"
import { confirmTotpCode, regenerateRecoveryCodes } from "../../../../../lib/admin/mfa"

/**
 * POST /admin/nexus/admin-2fa/recovery-codes – nové záložné kódy (staré zneplatnia).
 * Kódy sa zobrazia raz; treba si ich uložiť. Vyžaduje platný kód z aplikácie (`code`),
 * inak by ukradnutý token relácie vyrobil nové záložné kódy a obišiel 2FA.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  const body = (req.body ?? {}) as { count?: unknown; code?: unknown }
  const code = typeof body.code === "string" ? body.code.trim() : ""
  if (!code) return res.status(400).json({ message: "Na nové záložné kódy treba platný kód z aplikácie." })
  const count = Number.isInteger(body.count) ? Math.min(Math.max(Number(body.count), 1), 50) : 10
  try {
    const identity = { auth_identity_id: (req.auth_context as { auth_identity_id?: string })?.auth_identity_id ?? "" }
    if (!(await confirmTotpCode(req.scope, identity, code))) {
      return res.status(403).json({ message: "Kód z aplikácie sa nepodarilo overiť." })
    }
    const codes = await regenerateRecoveryCodes(req.scope, identity, count)
    await auditAdminChange(req, "admin.mfa.recovery_codes", "auth_identity", identity.auth_identity_id, null, { count: codes.length })
    return res.status(200).json({ recovery_codes: codes })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/nexus/admin-2fa/recovery-codes zlyhal", error as Error)
    return res.status(503).json({ message: "Záložné kódy sa nepodarilo vygenerovať. Skúte to znova." })
  }
}
