import { asValue } from "@medusajs/framework/awilix"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { normalizeEmail } from "../modules/auth-magic-link/policy"
import { incrementSessionEpoch } from "../modules/auth-security/session-epoch"

/**
 * Medusa validates and consumes the reset token after project middleware and
 * before calling updateProvider. Override only this request's service resolution
 * so the epoch is advanced at that exact boundary, before the password write.
 * The shared auth service and other request scopes are never mutated.
 */
export function prepareAdminPasswordEpoch(req: any, res: any, next: any) {
  if (req.params?.actor_type !== "user" || req.params?.auth_provider !== "emailpass") {
    return res.status(404).json({ error: "AUTH_PROVIDER_UNAVAILABLE" })
  }
  try {
    const auth = req.scope.resolve(Modules.AUTH)
    const scopedAuth = new Proxy(auth, {
      get(target, property) {
        if (property === "updateProvider") return async (provider: string, update: any, ...rest: any[]) => {
          // auth_context must be the context installed by native validateToken,
          // whose actor_id is the verified provider entity (e-mail), not a user ID.
          const context = req.auth_context
          const email = normalizeEmail(context?.actor_id)
          if (provider !== "emailpass" || context?.actor_type !== "user" || !context.auth_identity_id || !email || update?.entity_id !== context.actor_id) {
            throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "AUTH_RESET_ACTOR_INVALID")
          }
          const users = req.scope.resolve(Modules.USER)
          const matches = await users.listUsers({ email }, { select: ["id"], take: 2 })
          if (!Array.isArray(matches) || matches.length !== 1 || !matches[0]?.id) {
            throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "AUTH_RESET_USER_NOT_FOUND")
          }
          const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
          // No compensation: an extra logout after a failed reset is safe.
          // If this write fails, updateProvider is never called.
          await incrementSessionEpoch(db, "user", matches[0].id)
          return target.updateProvider.call(target, provider, update, ...rest)
        }
        const value = Reflect.get(target, property, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    req.scope.register({ [Modules.AUTH]: asValue(scopedAuth) })
    return next()
  } catch {
    return res.status(503).json({ error: "AUTH_UNAVAILABLE", message: "Zmena hesla je dočasne nedostupná." })
  }
}
