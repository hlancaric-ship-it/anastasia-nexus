import { getAuthContextFromJwtToken, type MiddlewareRoute } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isTokenRevoked } from "../modules/auth-magic-link/state"
import { getSessionEpoch, type SessionActorType } from "../modules/auth-security/session-epoch"

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

/**
 * Policy is fixed when registering the middleware. Express app.use removes the
 * matched namespace from req.path, so the security decision cannot use req.path.
 * Follow Medusa's credential precedence: eligible server session, then Bearer.
 */
function sessionEpochMiddleware(expected?: SessionActorType, includeSession = true) {
  return async (req: any, res: any, next: any) => {
    const session = req.session?.auth_context
    let payload: any
    if (includeSession && session && (expected ? session.actor_type === expected : ["customer", "user"].includes(session.actor_type))) payload = session
    if (!payload) {
      if (!bearerToken(req)) return next()
      try {
        const http = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http
        payload = getAuthContextFromJwtToken(req.headers.authorization, http.jwtSecret, ["bearer"], ["*"], http.jwtPublicKey, http.jwtVerifyOptions ?? http.jwtOptions)
      } catch {
        return res.status(503).json({ error: "AUTH_UNAVAILABLE", message: "Overenie prihlásenia je dočasne nedostupné." })
      }
      // Invalid/expired JWTs are rejected by native route authentication.
      if (!payload) return next()
    }
    const actorType = payload.actor_type
    const actorId = payload.actor_id
    const claim = payload.session_epoch
    // Unregistered identity (magic-link before the customer exists, admin invite accept):
    // no actor yet, so no account epoch to enforce. Routes only accept it with allowUnregistered.
    if (actorId === "" && typeof payload.auth_identity_id === "string" && payload.auth_identity_id
      && ["customer", "user"].includes(actorType) && (!expected || actorType === expected)) return next()
    if (!["customer", "user"].includes(actorType) || (expected && actorType !== expected) || typeof actorId !== "string" || !actorId || !Number.isSafeInteger(claim) || claim < 0) {
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
}

/** Standalone entry point; registered routes below use explicit actor policies. */
export function denyStaleSessionEpoch(req: any, res: any, next: any) {
  const path = String(req.originalUrl || `${req.baseUrl || ""}${req.path || ""}`).split("?")[0]
  const actor = path.startsWith("/admin/") ? "user" : path.startsWith("/store/") ? "customer" : undefined
  return sessionEpochMiddleware(actor, path !== "/auth/session")(req, res, next)
}

export const authRevokeMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/*", middlewares: [denyRevokedToken, sessionEpochMiddleware("customer")] },
  { matcher: "/admin/*", middlewares: [denyRevokedAdminToken, sessionEpochMiddleware("user")] },
  { matcher: "/auth/token/refresh", method: ["POST"], middlewares: [denyRevokedToken, sessionEpochMiddleware()] },
  // Creating a cookie session must not launder a stale JWT into a new session.
  // Native POST /auth/session accepts Bearer only, even if an older cookie exists.
  { matcher: "/auth/session", method: ["POST"], middlewares: [denyRevokedToken, sessionEpochMiddleware(undefined, false)] },
]
