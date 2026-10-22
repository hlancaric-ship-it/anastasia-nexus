import type { MiddlewareRoute } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isTokenRevoked } from "../modules/auth-magic-link/state"

const BEARER_RE = /^Bearer\s+(\S+)$/i

/** Bearer token z hlavičky Authorization (rovnaké čítanie ako Medusa autentizácia). */
function bearerToken(req: any): string {
  const header = req?.headers?.authorization
  if (typeof header !== "string") return ""
  const match = BEARER_RE.exec(header.trim())
  return match ? match[1] : ""
}

/**
 * Odhlásený zákazník nesmie používať svoj doterajší JWT.
 * Medusa tokeny sú bezstavové, preto ich musíme odmietnúť sami (revokačná tabuľka).
 * Výpadok databázy nesmie blokovať čítanie katalógu (fail-open) a token sa nikdy neloguje.
 */
export async function denyRevokedToken(req: any, res: any, next: any) {
  const token = bearerToken(req)
  // Bez Bearer hlavičky sa nespustí žádný dotaz do databázy.
  if (!token) return next()
  try {
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    if (await isTokenRevoked(db, token)) {
      return res.status(401).json({ error: "SESSION_REVOKED", message: "Relácia bola zrušená. Prihláste sa prosím znova." })
    }
  } catch (error) {
    try {
      req.scope.resolve(ContainerRegistrationKeys.LOGGER)?.warn?.("[auth-revoke] kontrola revokácie zlyhala", error as Error)
    } catch {
      // Logger nie je dostupný – request pokračuje bez revokačnej kontroly.
    }
  }
  return next()
}

export const authRevokeMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/*", middlewares: [denyRevokedToken] },
  { matcher: "/auth/token/refresh", method: ["POST"], middlewares: [denyRevokedToken] },
]
