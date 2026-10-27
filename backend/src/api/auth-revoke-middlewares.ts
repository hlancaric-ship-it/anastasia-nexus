import type { MiddlewareRoute } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isTokenRevoked } from "../modules/auth-magic-link/state"
import { getSessionEpoch, type SessionActorType } from "../modules/auth-security/session-epoch"
import jwt from "jsonwebtoken"

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

/**
 * Administrácia: odhlásený alebo ukradnutý token správcu sa odmietne. Na rozdiel od katalógu
 * fail closed – pri výpadku databázy sa nedá overiť, že token nebol zneplatnený.
 */
export async function denyRevokedAdminToken(req: any, res: any, next: any) {
  const token = bearerToken(req)
  if (!token) return next()
  try {
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    if (await isTokenRevoked(db, token)) {
      return res.status(401).json({ error: "SESSION_REVOKED", message: "Relácia bola zrušená. Prihláste sa prosím znova." })
    }
    return next()
  } catch {
    return res.status(503).json({ error: "AUTH_UNAVAILABLE", message: "Overenie prihlásenia je dočasne nedostupné." })
  }
}

/** Account-wide session epoch. Valid JWTs without an epoch are legacy sessions and fail closed. */
export async function denyStaleSessionEpoch(req: any, res: any, next: any) {
  const token = bearerToken(req)
  if (!token) return next()
  let payload: any
  try {
    const http = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http
    payload = jwt.verify(token, http.jwtSecret, http.jwtVerifyOptions ?? http.jwtOptions)
  } catch {
    // Let Medusa's route authentication produce the normal invalid/expired-token response.
    return next()
  }
  const actorType = payload?.actor_type
  const actorId = payload?.actor_id
  const claim = payload?.session_epoch
  const path = String(req.path || "")
  const expected = path.startsWith("/store/") ? "customer"
    : path.startsWith("/admin/") ? "user"
      : path === "/auth/token/refresh" && (actorType === "customer" || actorType === "user") ? actorType
        : null
  if (!expected) return next()
  if (actorType !== expected || typeof actorId !== "string" || !actorId || !Number.isSafeInteger(claim) || claim < 0) {
    return res.status(401).json({ error: "SESSION_REVOKED", message: "Relácia bola zrušená. Prihláste sa prosím znova." })
  }
  try {
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    if (await getSessionEpoch(db, actorType as SessionActorType, actorId) !== claim) {
      return res.status(401).json({ error: "SESSION_REVOKED", message: "Relácia bola zrušená. Prihláste sa prosím znova." })
    }
    return next()
  } catch {
    return res.status(503).json({ error: "AUTH_UNAVAILABLE", message: "Overenie prihlásenia je dočasne nedostupné." })
  }
}

export const authRevokeMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/*", middlewares: [denyRevokedToken, denyStaleSessionEpoch] },
  { matcher: "/admin/*", middlewares: [denyRevokedAdminToken, denyStaleSessionEpoch] },
  { matcher: "/auth/token/refresh", method: ["POST"], middlewares: [denyRevokedToken, denyStaleSessionEpoch] },
]
