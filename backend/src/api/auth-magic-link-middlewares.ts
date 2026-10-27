import type { MiddlewareRoute } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { normalizeEmail } from "../modules/auth-magic-link/policy"
import { claimAuthRate } from "../modules/auth-magic-link/state"
import { getSessionEpoch, type SessionActorType } from "../modules/auth-security/session-epoch"
import { prepareAdminPasswordEpoch } from "./auth-password-epoch"
import jwt from "jsonwebtoken"
export async function limitMagicLink(req: any, res: any, next: any) {
  // Native auth uses decoded dynamic parameters, including percent-encoded paths.
  let provider = req.params?.auth_provider, actor = req.params?.actor_type
  if (!provider) {
    try {
      const parts = (req.path || "").split("/")
      provider = decodeURIComponent(parts[3] || "")
      actor = decodeURIComponent(parts[2] || "")
    } catch { return res.status(400).json({ error: "INVALID_AUTH_PATH" }) }
  }
  if (provider === "emailpass" && (actor === "customer" || actor === "user")) return limitPasswordLogin(req, res, next)
  if (provider !== "magic-link") return next()
  if (actor !== "customer") return res.status(404).json({ error: "AUTH_PROVIDER_UNAVAILABLE" })
  try {
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    // req.ip follows the server's trusted-proxy configuration; never trust raw forwarded headers.
    const client = await claimAuthRate(db, `ip:${req.ip || "unknown"}`, 60, 900)
    let rate = client
    const email = normalizeEmail(req.body?.email)
    if (client.allowed && email && !req.body?.token) rate = await claimAuthRate(db, `email:${email}`, 3, 900)
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfter))
      return res.status(429).json({ error: "MAGIC_LINK_RATE_LIMITED", message: "Príliš veľa pokusov. Skúste to, prosím, neskôr." })
    }
    return next()
  } catch {
    return res.status(503).json({ error: "AUTH_SECURITY_UNAVAILABLE", message: "Prihlásenie je dočasne nedostupné." })
  }
}
/**
 * Heslo zákazníka aj administrátora: brzda proti hádaniu hesiel na IP aj e-mail, e-mail sa zjednotí ako pri odkaze.
 * Administrátor má prísnejší limit a vlastné počítadlá (útok na admina nezablokuje zákazníkov a naopak).
 */
async function limitPasswordLogin(req: any, res: any, next: any) {
  const email = normalizeEmail(req.body?.email)
  if (!email || typeof req.body?.password !== "string" || req.body.password.length > 200) return res.status(400).json({ error: "INVALID_CREDENTIALS", message: "Zadajte e-mail a heslo." })
  req.body.email = email
  const admin = req.params?.actor_type === "user" || String(req.path || "").startsWith("/auth/user/")
  try {
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    let rate = await claimAuthRate(db, `${admin ? "admin-pw-ip" : "pw-ip"}:${req.ip || "unknown"}`, admin ? 20 : 30, 900)
    if (rate.allowed) rate = await claimAuthRate(db, `${admin ? "admin-pw-email" : "pw-email"}:${email}`, admin ? 5 : 10, 900)
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfter))
      return res.status(429).json({ error: "PASSWORD_RATE_LIMITED", message: "Príliš veľa pokusov. Skúste to, prosím, neskôr alebo sa prihláste odkazom." })
    }
    return next()
  } catch {
    return res.status(503).json({ error: "AUTH_SECURITY_UNAVAILABLE", message: "Prihlásenie je dočasne nedostupné." })
  }
}
// Heslo si zákazník nastaví až v účte. Natívna registrácia a reset cez emailpass by obišli overenie e-mailu.
function blockCustomerPasswordSelfService(_req: any, res: any) {
  return res.status(404).json({ error: "AUTH_PROVIDER_UNAVAILABLE" })
}
export const ADMIN_PASSWORD_MIN = 12

/**
 * Samoobsluha hesla (`/auth/:actor/:provider/register|reset-password|update`) podľa DEKÓDOVANÝCH parametrov.
 * Doslovný matcher `/auth/customer/emailpass/register` by obišla cesta `/auth/customer/emailpas%73/register`,
 * ktorú Medusa po dekódovaní obslúži ako emailpass. Neznámy aktér alebo poskytovateľ sa odmietne (fail closed).
 */
function passwordSelfServiceGuard(action: "register" | "reset-password" | "update") {
  return async (req: any, res: any, next: any) => {
    const actor = req.params?.actor_type, provider = req.params?.auth_provider
    if (provider !== "emailpass") return res.status(404).json({ error: "AUTH_PROVIDER_UNAVAILABLE" })
    if (actor !== "user") return blockCustomerPasswordSelfService(req, res)
    if (action === "register") return requireAdminInvite(req, res, next)
    if (action === "reset-password") return limitAdminPasswordReset(req, res, next)
    const password = req.body?.password
    if (typeof password !== "string" || password.length < ADMIN_PASSWORD_MIN || password.length > 200) {
      return res.status(400).json({ error: "PASSWORD_TOO_WEAK", message: `Heslo musí mať ${ADMIN_PASSWORD_MIN} až 200 znakov.` })
    }
    return next()
  }
}
export const guardPasswordRegister = passwordSelfServiceGuard("register")
export const guardPasswordReset = passwordSelfServiceGuard("reset-password")
export const guardPasswordUpdate = passwordSelfServiceGuard("update")

/**
 * Registrácia administrátorského hesla len pre e-mail s platnou nevyužitou pozvánkou.
 * Bez toho by si ktokoľvek vopred založil prihlasovacie údaje na e-mail budúceho správcu.
 */
async function requireAdminInvite(req: any, res: any, next: any) {
  const email = normalizeEmail(req.body?.email), password = req.body?.password
  if (!email) return res.status(400).json({ error: "INVALID_CREDENTIALS", message: "Zadajte e-mail a heslo." })
  if (typeof password !== "string" || password.length < ADMIN_PASSWORD_MIN || password.length > 200) {
    return res.status(400).json({ error: "PASSWORD_TOO_WEAK", message: `Heslo musí mať ${ADMIN_PASSWORD_MIN} až 200 znakov.` })
  }
  req.body.email = email
  try {
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const rate = await claimAuthRate(db, `admin-register-ip:${req.ip || "unknown"}`, 10, 3600)
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfter))
      return res.status(429).json({ error: "REGISTER_RATE_LIMITED", message: "Príliš veľa pokusov. Skúste to, prosím, neskôr." })
    }
    const users = req.scope.resolve(Modules.USER) as any
    const invites = await users.listInvites({ email }, { select: ["id", "accepted", "expires_at"], take: 5 })
    const now = Date.now()
    const valid = (invites || []).some((invite: any) => !invite.accepted && invite.expires_at && new Date(invite.expires_at).getTime() > now)
    if (!valid) return res.status(403).json({ error: "ADMIN_INVITE_REQUIRED", message: "Účet správcu sa dá založiť len z platnej pozvánky." })
    return next()
  } catch {
    return res.status(503).json({ error: "AUTH_SECURITY_UNAVAILABLE", message: "Registrácia je dočasne nedostupná." })
  }
}

/** Reset hesla správcu: brzda na IP aj adresu, aby sa nedala zahltiť schránka ani zisťovať účty. */
async function limitAdminPasswordReset(req: any, res: any, next: any) {
  const identifier = normalizeEmail(req.body?.identifier)
  if (!identifier) return res.status(400).json({ error: "INVALID_IDENTIFIER", message: "Zadajte e-mail." })
  req.body.identifier = identifier
  try {
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    let rate = await claimAuthRate(db, `admin-reset-ip:${req.ip || "unknown"}`, 10, 3600)
    if (rate.allowed) rate = await claimAuthRate(db, `admin-reset-email:${identifier}`, 3, 3600)
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfter))
      return res.status(429).json({ error: "RESET_RATE_LIMITED", message: "Príliš veľa pokusov. Skúste to, prosím, neskôr." })
    }
    return next()
  } catch {
    return res.status(503).json({ error: "AUTH_SECURITY_UNAVAILABLE", message: "Obnova hesla je dočasne nedostupná." })
  }
}
/**
 * Zákazník ostane prihlásený aj po zatvorení prehliadača: jeho token platí 30 dní, admin si nechá kratšiu platnosť.
 * Prepíše sa len podpísaný zákaznícky token s actor_id, odhlásenie ho ďalej zneplatní cez revokáciu.
 */
export function extendCustomerToken(req: any, res: any, next: any) {
  const json = res.json.bind(res)
  res.json = (body: any) => {
    try {
      const token = body?.token
      if (res.statusCode < 300 && typeof token === "string") {
        const http = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http
        const payload: any = jwt.verify(token, http.jwtSecret)
        if (payload?.actor_type === "customer" && payload.actor_id) {
          const { iat: _iat, exp: _exp, ...claims } = payload
          body = { ...body, token: jwt.sign(claims, http.jwtSecret, { ...(http.jwtOptions ?? {}), expiresIn: process.env.CUSTOMER_JWT_EXPIRES_IN || "30d" }) }
        }
      }
    } catch { /* pôvodný token ostáva platný, len s kratšou dobou */ }
    return json(body)
  }
  return next()
}

/**
 * Bind every actor-bound JWT to the current account epoch before returning it.
 * This covers login, refresh, MFA verification, callback, and any future auth
 * response that contains a token. Actorless verification/MFA tokens stay
 * short-lived and cannot authorize store/admin API calls.
 */
export function bindSessionEpoch(req: any, res: any, next: any) {
  const originalJson = res.json.bind(res)
  let responseStarted = false
  res.json = (body: any) => {
    const success = Number(res.statusCode ?? 200) < 300
    const token = body?.token
    if (responseStarted || !success || typeof token !== "string") {
      return originalJson(body)
    }
    responseStarted = true

    void (async () => {
      try {
        const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

        const http = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http
        const payload = jwt.verify(token, http.jwtSecret, http.jwtVerifyOptions ?? http.jwtOptions) as any
        const actorType = payload?.actor_type
        const actorId = payload?.actor_id
        if ((actorType !== "customer" && actorType !== "user") || typeof actorId !== "string" || !actorId) {
          // Verification-required and MFA-challenge tokens have no bound actor.
          return originalJson(body)
        }

        const epoch = await getSessionEpoch(db, actorType as SessionActorType, actorId)
        const { iat: _iat, exp: originalExp, ...claims } = payload
        const expiresIn = actorType === "customer"
          ? process.env.CUSTOMER_JWT_EXPIRES_IN || "30d"
          : typeof originalExp === "number"
            ? Math.max(1, originalExp - Math.floor(Date.now() / 1000))
            : undefined
        const signed = jwt.sign(
          { ...claims, session_epoch: epoch },
          http.jwtSecret,
          { ...(http.jwtOptions ?? {}), ...(expiresIn ? { expiresIn } : {}) },
        )
        return originalJson({ ...body, token: signed })
      } catch {
        return res.status(503).json({ error: "AUTH_UNAVAILABLE", message: "Prihlásenie je dočasne nedostupné." })
      }
    })()
    return res
  }
  return next()
}
const SELF_SERVICE_METHODS: MiddlewareRoute["method"] = ["GET", "POST", "PUT", "PATCH", "DELETE"]

export const authMagicLinkMiddlewares: MiddlewareRoute[] = [
  { matcher: "/auth/:actor_type/:auth_provider", method: ["POST", "GET"], middlewares: [limitMagicLink], bodyParser: { sizeLimit: "4kb" } },
  { matcher: "/auth/customer/:auth_provider", method: ["POST"], middlewares: [extendCustomerToken] },
  { matcher: "/auth/token/refresh", method: ["POST"], middlewares: [extendCustomerToken] },
  { matcher: "/auth/:actor_type/:auth_provider/register", method: SELF_SERVICE_METHODS, middlewares: [guardPasswordRegister], bodyParser: { sizeLimit: "4kb" } },
  { matcher: "/auth/:actor_type/:auth_provider/reset-password", method: SELF_SERVICE_METHODS, middlewares: [guardPasswordReset], bodyParser: { sizeLimit: "4kb" } },
  { matcher: "/auth/:actor_type/:auth_provider/update", method: SELF_SERVICE_METHODS, middlewares: [guardPasswordUpdate, prepareAdminPasswordEpoch], bodyParser: { sizeLimit: "4kb" } },
  { matcher: "/auth/*", middlewares: [bindSessionEpoch] },
]
