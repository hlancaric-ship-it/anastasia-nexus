import type { MiddlewareRoute } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { normalizeEmail } from "../modules/auth-magic-link/policy"
import { claimAuthRate } from "../modules/auth-magic-link/state"
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
  if (provider === "emailpass" && actor === "customer") return limitPasswordLogin(req, res, next)
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
/** Heslo zákazníka: brzda proti hádaniu hesiel na IP aj e-mail, e-mail sa zjednotí ako pri odkaze. */
async function limitPasswordLogin(req: any, res: any, next: any) {
  const email = normalizeEmail(req.body?.email)
  if (!email || typeof req.body?.password !== "string") return res.status(400).json({ error: "INVALID_CREDENTIALS", message: "Zadajte e-mail a heslo." })
  req.body.email = email
  try {
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    let rate = await claimAuthRate(db, `pw-ip:${req.ip || "unknown"}`, 30, 900)
    if (rate.allowed) rate = await claimAuthRate(db, `pw-email:${email}`, 10, 900)
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
 * Přihlášení e-mailem a heslem je v Medusa sdílené pro zákazníky i administrátory podle e-mailu.
 * Když přihlašovací údaje daného e-mailu vede identita bez vazby na administrátora (třeba po nastavení
 * zákaznického hesla), přihlášení by vrátilo token bez administrátora a administrace by odpověděla 401.
 * Před přihlášením proto identitu, která drží heslo tohoto e-mailu, propojíme s administrátorem se stejným e-mailem.
 * Samotné heslo se tím nemění ani neobchází: bez správného hesla se přihlášení stejně nepodaří.
 */
export async function healSharedAdminLogin(req: any, _res: any, next: any) {
  try {
    const email = normalizeEmail(req?.body?.email)
    if (email) {
      const users = req.scope.resolve(Modules.USER) as any
      const [admin] = await users.listUsers({ email }, { select: ["id"], take: 1 })
      if (admin) {
        const auth = req.scope.resolve(Modules.AUTH) as any
        const rows = await auth.listProviderIdentities({ entity_id: email, provider: "emailpass" }, { select: ["auth_identity_id"] })
        for (const row of rows) {
          const [identity] = await auth.listAuthIdentities({ id: row.auth_identity_id }, { select: ["id", "app_metadata"] })
          const meta = identity?.app_metadata || {}
          if (identity && !meta.user_id) await auth.updateAuthIdentities([{ id: identity.id, app_metadata: { ...meta, user_id: admin.id } }])
        }
      }
    }
  } catch {
    // Oprava je pomocná. Přihlášení proběhne dál běžným způsobem.
  }
  return next()
}

export const authMagicLinkMiddlewares: MiddlewareRoute[] = [
  { matcher: "/auth/user/emailpass", method: ["POST"], middlewares: [healSharedAdminLogin] },
  { matcher: "/auth/:actor_type/:auth_provider", method: ["POST", "GET"], middlewares: [limitMagicLink], bodyParser: { sizeLimit: "4kb" } },
  { matcher: "/auth/customer/:auth_provider", method: ["POST"], middlewares: [extendCustomerToken] },
  { matcher: "/auth/token/refresh", method: ["POST"], middlewares: [extendCustomerToken] },
  { matcher: "/auth/customer/emailpass/register", middlewares: [blockCustomerPasswordSelfService] },
  { matcher: "/auth/customer/emailpass/reset-password", middlewares: [blockCustomerPasswordSelfService] },
  { matcher: "/auth/customer/emailpass/update", middlewares: [blockCustomerPasswordSelfService] },
]
