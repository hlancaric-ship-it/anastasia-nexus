import { authenticate, type MedusaNextFunction, type MedusaRequest, type MedusaResponse, type MiddlewareRoute } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { normalizeEmail } from "../../../modules/auth-magic-link/policy"

/**
 * Natívne `POST /store/customers` berie e-mail z tela požiadavky bez väzby na overenú identitu.
 * Zákazník by si tak s identitou overenou na `utocnik@…` založil účet na e-mail správcu a cez
 * `/store/customers/me/password` mu nastavil heslo. Zákazníka preto smie založiť len identita,
 * ktorá e-mail z tela overila (odkaz e-mailom); e-mail sa zjednotí a metadáta od klienta sa zahodia.
 */
export async function requireVerifiedCustomerEmail(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const ctx = (req as any).auth_context
  if (!ctx?.auth_identity_id) return res.status(401).json({ error: "UNAUTHORIZED" })
  const body = (req.body ?? {}) as Record<string, unknown>
  const email = normalizeEmail(body.email)
  if (!email) return res.status(400).json({ error: "INVALID_EMAIL", message: "Zadajte platný e-mail." })
  try {
    const auth = req.scope.resolve(Modules.AUTH) as any
    const owned = await auth.listProviderIdentities({ auth_identity_id: ctx.auth_identity_id }, { select: ["entity_id", "provider"] })
    const verified = (owned || []).some((row: any) => row?.provider === "magic-link" && normalizeEmail(row.entity_id) === email)
    if (!verified) return res.status(403).json({ error: "EMAIL_NOT_VERIFIED", message: "E-mail účtu sa musí zhodovať s overeným e-mailom." })
    body.email = email
    delete body.metadata
    return next()
  } catch {
    return res.status(503).json({ error: "AUTH_SECURITY_UNAVAILABLE", message: "Registrácia je dočasne nedostupná." })
  }
}

export const customerCreateMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/customers",
    method: ["POST"],
    middlewares: [authenticate("customer", ["session", "bearer"], { allowUnregistered: true }), requireVerifiedCustomerEmail],
    bodyParser: { sizeLimit: "4kb" },
  },
]
