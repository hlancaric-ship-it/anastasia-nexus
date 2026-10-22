import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../lib/observability/audit"
import { disableTotpFactor, readMfaState, startTotpEnrollment } from "../../../../lib/admin/mfa"
import { resolveAdminRole } from "../../../../lib/admin/roles"

/**
 * Dvojfaktorové overenie administrátora (TOTP).
 *
 *   GET    /admin/nexus/admin-2fa          – stav (je 2FA zapnuté, koľko záložných kódov zostáva)
 *   POST   /admin/nexus/admin-2fa          – začne enroláciu (vráti tajomstvo + otpauth URI pre QR)
 *   DELETE /admin/nexus/admin-2fa          – vypne 2FA (vyžaduje platný kód)
 *
 * Prihlásenie potom prebieha takto (natívny flow Medusy, nič vlastné):
 *   1) POST /auth/user/emailpass  ->  { mfa_required: true, mfa_challenge: {...}, token }
 *   2) POST /auth/mfa/challenges/:id/verify { method: "totp", code } -> { token }
 * Bez zapnutého faktoru je prihlásenie rovnako ako doteraz.
 */
const identityOf = async (req: AuthenticatedMedusaRequest) => {
  const authIdentityId = (req.auth_context as { auth_identity_id?: string } | undefined)?.auth_identity_id ?? ""
  let email: string | null = null
  try {
    const user = await (req.scope.resolve(Modules.USER) as any).retrieveUser(adminActor(req) as string)
    email = user?.email ?? null
  } catch {
    email = null
  }
  return { auth_identity_id: authIdentityId, email }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  try {
    const identity = await identityOf(req)
    const state = await readMfaState(req.scope, identity)
    const role = await resolveAdminRole(req.scope, actor)
    return res.status(200).json({ ...state, role })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/nexus/admin-2fa zlyhal", error as Error)
    return res.status(503).json({ message: "Stav dvojfaktorového overenia sa nepodarilo načítať. Skúte to znova." })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  try {
    const identity = await identityOf(req)
    const enrollment = await startTotpEnrollment(req.scope, identity)
    await auditAdminChange(req, "admin.mfa.enroll", "auth_identity", identity.auth_identity_id, null, {
      provider: enrollment?.mfa?.provider ?? "totp",
    })
    return res.status(200).json({
      factor_id: enrollment?.mfa?.id ?? null,
      secret: enrollment?.secret ?? null,
      otpauth_url: enrollment?.otpauth_url ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/nexus/admin-2fa zlyhal", error as Error)
    // Bez `mfa.encryption_key` v konfigurácii Medusa provider odmietne enroláciu.
    return res.status(503).json({
      message: "Dvojfaktorové overenie zatiaľ nie je nakonfigurované na tomto serveri. Kontaktujte podporu.",
    })
  }
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  const body = (req.body ?? {}) as { factor_id?: unknown; code?: unknown }
  const factorId = typeof body.factor_id === "string" ? body.factor_id.trim() : ""
  const code = typeof body.code === "string" ? body.code.trim() : ""
  if (!factorId || !code) return res.status(400).json({ message: "Na vypnutie dvojfaktorového overenia treba platný kód." })
  try {
    const identity = await identityOf(req)
    const factor = await disableTotpFactor(req.scope, identity, { factor_id: factorId, code })
    await auditAdminChange(req, "admin.mfa.disable", "auth_identity", identity.auth_identity_id, { provider: factor?.provider ?? "totp" }, null)
    return res.status(200).json({ enabled: false })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("DELETE /admin/nexus/admin-2fa zlyhal", error as Error)
    return res.status(400).json({ message: "Kód sa nepodarilo overiť. Dvojfaktorové overenie zostáva zapnuté." })
  }
}
