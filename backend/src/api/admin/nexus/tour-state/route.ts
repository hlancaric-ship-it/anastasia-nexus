import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../lib/observability/audit"

const KEY = "anastasia_admin_tour"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  try {
    const user = await (req.scope.resolve(Modules.USER) as any).retrieveUser(actor)
    return res.status(200).json({ completed: user.metadata?.[KEY]?.completed === true })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/nexus/tour-state zlyhal", error as Error)
    return res.status(503).json({ message: "Stav prehliadky sa nepodarilo načítať." })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  const completed = (req.body as { completed?: unknown } | undefined)?.completed
  if (typeof completed !== "boolean") return res.status(400).json({ message: "Stav prehliadky nie je platný." })
  try {
    const users = req.scope.resolve(Modules.USER) as any
    const user = await users.retrieveUser(actor)
    const previous = user.metadata?.[KEY] ?? null
    const next = completed ? { completed: true, completed_at: new Date().toISOString() } : null
    const metadata = { ...(user.metadata ?? {}) }
    if (next) metadata[KEY] = next
    else delete metadata[KEY]
    await users.updateUsers(actor, { metadata })
    await auditAdminChange(req, "admin.tour.update", "user", actor,
      previous ? { completed: true } : null, next ? { completed: true } : null)
    return res.status(200).json({ completed: Boolean(next) })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/nexus/tour-state zlyhal", error as Error)
    return res.status(503).json({ message: "Stav prehliadky sa nepodarilo uložiť." })
  }
}
