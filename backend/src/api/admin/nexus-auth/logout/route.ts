import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"
import { revokeToken } from "../../../../modules/auth-magic-link/state"

/** Bearer token z hlavičky Authorization (rovnaké čítanie ako Medusa autentizácia). */
function bearerToken(req: any): string {
  const header = req?.headers?.authorization
  if (typeof header !== "string") return ""
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? match[1] : ""
}

/**
 * POST /admin/nexus-auth/logout: zneplatní JWT správcu na serveri.
 * Bez toho by token ukradnutý z prehliadača (XSS, zdieľaný počítač) platil až do vypršania aj po odhlásení.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const token = bearerToken(req)
  if (!token || req.auth_context?.actor_type !== "user") {
    return res.status(401).json({ error: "AUTH_REQUIRED", message: "Prihlásenie je povinné." })
  }
  const payload = jwt.decode(token) as { exp?: number } | null
  const exp = typeof payload?.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null
  try {
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    await revokeToken(db, token, exp)
    return res.status(200).json({ ok: true })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/nexus-auth/logout selhalo", error as Error)
    return res.status(503).json({ error: "AUTH_UNAVAILABLE", message: "Odhlásenie je dočasne nedostupné." })
  }
}
