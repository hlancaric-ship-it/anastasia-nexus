import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../../lib/observability/audit"
import { verifyTotpFactor } from "../../../../../lib/admin/mfa"

/**
 * POST /admin/nexus/admin-2fa/verify – overí prvý kód z aplikácie, zapne dvojfaktorové
 * overenie a vráti nové záložné kódy (zobrazia sa raz, hneď si ich treba uložiť).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  const body = (req.body ?? {}) as { factor_id?: unknown; code?: unknown; recovery_code_count?: unknown }
  const factorId = typeof body.factor_id === "string" ? body.factor_id.trim() : ""
  const code = typeof body.code === "string" ? body.code.trim() : ""
  if (!factorId || !code) return res.status(400).json({ message: "Treba identifikátor faktora a kód z aplikácie." })
  try {
    const identity = { auth_identity_id: (req.auth_context as { auth_identity_id?: string })?.auth_identity_id ?? "" }
    const result = await verifyTotpFactor(req.scope, identity, {
      factor_id: factorId,
      code,
      recovery_code_count: Number.isInteger(body.recovery_code_count) ? Number(body.recovery_code_count) : undefined,
    })
    await auditAdminChange(req, "admin.mfa.enable", "auth_identity", identity.auth_identity_id, null, {
      provider: result?.factor?.provider ?? "totp",
      recovery_codes: result.recovery_codes.length,
    })
    return res.status(200).json({ enabled: true, recovery_codes: result.recovery_codes })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/nexus/admin-2fa/verify zlyhal", error as Error)
    return res.status(400).json({ message: "Kód sa nepodarilo overiť. Skúte to znova." })
  }
}
