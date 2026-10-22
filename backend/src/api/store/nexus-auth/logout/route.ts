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
 * POST /store/nexus-auth/logout: zneplatní JWT zákazníka na serveri.
 * Medusa tokeny sú bezstavové (DELETE /auth/session vracia 401 a token ďalej platí),
 * preto odhlásenie zapíše revokáciu, ktorú globálny middleware odmietne pri ďalšom volaní.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const token = bearerToken(req)
  // Bez tokenu sa nedá nič zneplatniť; middleware už zákazníka nepripustil.
  if (!token) return res.status(401).json({ error: "AUTH_REQUIRED", message: "Prihlásenie je povinné." })
  if (req.auth_context?.actor_type !== "customer") {
    return res.status(401).json({ error: "AUTH_REQUIRED", message: "Prihlásenie je povinné." })
  }
  // Podpis tokenu už overila autentizácia v middlewaru; exp z payloadu potrebujeme
  // len na ohraničenie platnosti revokácie (bez podpisu, bez overovania).
  const payload = jwt.decode(token) as { exp?: number } | null
  const exp = typeof payload?.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null
  try {
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    await revokeToken(db, token, exp)
    return res.status(200).json({ ok: true })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /store/nexus-auth/logout selhalo", error as Error)
    return res.status(503).json({ error: "AUTH_UNAVAILABLE", message: "Odhlásenie je dočasne nedostupné." })
  }
}
