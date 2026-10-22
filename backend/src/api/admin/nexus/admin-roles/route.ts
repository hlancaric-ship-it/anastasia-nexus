import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../lib/observability/audit"
import {
  ADMIN_ROLE_METADATA_KEY,
  ADMIN_ROLES,
  adminRoleOf,
  normalizeAdminRole,
  resolveAdminRole,
} from "../../../../lib/admin/roles"

/**
 * GET  /admin/nexus/admin-roles – administrátori a ich roly.
 * POST /admin/nexus/admin-roles { user_id, role } – zmena roly (iba vlastník).
 *
 * Rola je v metadátach administrátora (`metadata.anastasia_role`). Predvolené je
 * `owner`, takže existujúce prihlásenia fungujú bez zmeny; asistenta vypne
 * vlastník ručne. Posledného vlastníka nemožno znížiť (inak by administráciu
 * nikto nevedol spravovať).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  try {
    const users = await (req.scope.resolve(Modules.USER) as any).listUsers({}, { take: 200, order: { created_at: "ASC" } })
    const admins = (users ?? []).map((user: any) => ({
      id: user.id,
      email: user.email ?? null,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      role: adminRoleOf(user),
    }))
    return res.status(200).json({ admins, roles: ADMIN_ROLES, current_user_id: actor })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/nexus/admin-roles zlyhal", error as Error)
    return res.status(503).json({ message: "Administrácii sa nepodarilo načítať. Skúte to znova." })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  const body = (req.body ?? {}) as { user_id?: unknown; role?: unknown }
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : ""
  const role = normalizeAdminRole(body.role)
  if (!userId || !role) return res.status(400).json({ message: "Vyberte administrátora a jeho rolu." })

  try {
    // Zmenu rolí smie iba vlastník.
    const actorRole = await resolveAdminRole(req.scope, actor)
    if (actorRole !== "owner") {
      return res.status(403).json({ message: "Role môže meniť iba vlastník administrácie." })
    }
    const users = (req.scope.resolve(Modules.USER) as any)
    const target = await users.retrieveUser(userId)
    const before = adminRoleOf(target)
    if (before === "owner" && role !== "owner") {
      const owners = (await users.listUsers({}, { take: 200 })) ?? []
      const ownerCount = owners.filter((user: any) => adminRoleOf(user) === "owner").length
      if (ownerCount <= 1) {
        return res.status(400).json({ message: "Posledného vlastníka administrácie nemožno znížiť na asistenta." })
      }
    }
    const metadata = { ...(target.metadata ?? {}), [ADMIN_ROLE_METADATA_KEY]: role }
    await users.updateUsers(userId, { metadata })
    await auditAdminChange(req, "admin.role.update", "user", userId, { role: before }, { role })
    return res.status(200).json({ user_id: userId, role })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/nexus/admin-roles zlyhal", error as Error)
    return res.status(503).json({ message: "Rolu sa nepodarilo uložiť. Skúte to znova." })
  }
}
