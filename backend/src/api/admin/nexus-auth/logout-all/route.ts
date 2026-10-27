import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { incrementSessionEpoch } from "../../../../modules/auth-security/session-epoch"

/** POST /admin/nexus-auth/logout-all invalidates every admin JWT atomically. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const actor = req.auth_context
  if (actor?.actor_type !== "user" || !actor.actor_id) return res.status(401).json({ error: "AUTH_REQUIRED" })
  try {
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    await incrementSessionEpoch(db, "user", actor.actor_id)
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(503).json({ error: "AUTH_UNAVAILABLE", message: "Odhlásenie je dočasne nedostupné." })
  }
}
