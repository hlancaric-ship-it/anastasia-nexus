import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { legalRate } from "../legal/rate-limit"

type CartOwner = { customer_id?: string | null; customer?: { has_account?: boolean | null } | null }

/** Prihlásený zákazník z auth_context, inak undefined (nákup bez registrácie). */
export function customerActor(req: Pick<AuthenticatedMedusaRequest, "auth_context">): string | undefined {
  return req.auth_context?.actor_type === "customer" ? req.auth_context.actor_id : undefined
}

/**
 * Kto smie s košíkom pracovať.
 * - Prihlásený zákazník: len vlastný košík (cart.customer_id === actor).
 * - Host (bez prihlásenia): len košík bez účtu – bez zákazníka alebo s hosťovským zákazníkom,
 *   ktorého Medusa vytvorí z e-mailu (has_account=false). Košík registrovaného účtu host neotvorí.
 */
export function canAccessCart(cart: CartOwner, actorId?: string): boolean {
  if (actorId) return cart.customer_id === actorId
  if (!cart.customer_id) return true
  return cart.customer?.has_account === false
}

export function assertCartAccess(cart: CartOwner, actorId?: string): void {
  if (!canAccessCart(cart, actorId)) throw new Error("CART_ACCESS_DENIED")
}

/** Hostia sú obmedzení podľa IP (ochrana kupónov pred skúšaním), prihlásení nie. */
export function guestRate(bucket: string, limit = 40, seconds = 60) {
  const limiter = legalRate(bucket, limit, seconds)
  return (req: any, res: any, next: any) => (customerActor(req) ? next() : limiter(req, res, next))
}
