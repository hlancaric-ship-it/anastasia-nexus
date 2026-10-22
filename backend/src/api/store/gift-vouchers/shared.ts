import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { giftVoucherHttpError } from "./errors"

export function readCartId(body: unknown): string | null {
  const cartId = (body as { cart_id?: unknown } | undefined)?.cart_id
  return typeof cartId === "string" && /^cart_[A-Za-z0-9]{1,64}$/.test(cartId) ? cartId : null
}

/** Košík s poľami potrebnými na kontrolu vlastníctva. */
export type GiftVoucherCart = {
  id: string
  customer_id?: string | null
  completed_at?: unknown
}

/**
 * Načíta košík pre kontrolu vlastníctva.
 *
 * Načítava SA len `customer_id` a `completed_at` -- žiadne osobné údaje,
 * žiadne položky. Košík, ktorý neexistuje, je chyba `CART_NOT_FOUND`.
 */
export async function loadGiftVoucherCart(scope: MedusaRequest["scope"], cartId: string): Promise<GiftVoucherCart> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "customer_id", "completed_at"],
    filters: { id: cartId },
  })
  const cart = data?.[0]
  if (!cart) throw new Error("CART_NOT_FOUND")
  return cart as GiftVoucherCart
}

/**
 * KONTROLA VLASTNÍCTVA KOŠÍKA.
 *
 * Bez tejto kontroly vedela cudzia osoba s ID cudzieho košíka prepísať
 * obdarovaného darčekového poukazu -- poukaz by sa poslal na cudziu
 * adresu. ID košíka je v Medusa nositeľom práva, ale nesmie byť
 * jedinou ochranou pri zápise do košíka, ktorý už má vlastníka.
 *
 * PRAVIDLO:
 *   1) Košík s vlastníkom (`customer_id`) smie meniť IBA ten istý zákazník
 *      a musí byť prihlásený (`auth_context.actor_type === "customer"`).
 *      Cudzí zákazník aj neprihlásený hosť dostanú `CART_ACCESS_DENIED`.
 *   2) Košík BEZ vlastníka (hosťovský košík pred pokladnicou) sa smie
 *      meniť, kto jeho ID má -- to je model Medusa pre hosťovský košík
 *      a presne takto funguje aj nákup poukazu v obchode (obdarovaný sa
 *      zadáva hneď po pridaní do košíka, ešte pred pokladnicou).
 *
 * Chyba je 404 (nie 403): cudzí košík sa nesmie existencou prezradit.
 */
export function assertCartOwnership(req: MedusaRequest, cart: GiftVoucherCart): void {
  // `auth_context` je na `AuthenticatedMedusaRequest`; store routa je prihlásenie
  // voliteľné, takže sa číta z neho (rovnaký vzor ako v `carts/[id]/consents`).
  const auth = (req as { auth_context?: { actor_type?: string; actor_id?: string } }).auth_context
  const actor = auth?.actor_type === "customer" ? auth.actor_id ?? null : null
  const owner = cart.customer_id ?? null
  if (owner && owner !== actor) throw new Error("CART_ACCESS_DENIED")
}

/** Spoločné spracovanie chýb: známe kódy poukazu → 400/409, chýbajúci košík → 404, inak 500 bez detailov. */
export function sendGiftVoucherError(req: MedusaRequest, res: MedusaResponse, error: unknown, context: string) {
  const code = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as any).message) : ""
  const mapped = giftVoucherHttpError(code)
  if (mapped) return res.status(mapped.status).json(mapped.body)
  if (code === "CART_NOT_FOUND") return res.status(404).json({ ok: false, error: "CART_NOT_FOUND", message: "Košík neexistuje." })
  // Cudzí košík -- 404 ako pri neexistujúcom, ne 403 (neexistencia sa neprezradí).
  if (code === "CART_ACCESS_DENIED") return res.status(404).json({ ok: false, error: "CART_NOT_FOUND", message: "Košík neexistuje." })
  req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(`[gift-voucher] ${context} selhalo`, error instanceof Error ? new Error(error.message) : new Error("unknown"))
  return res.status(500).json({ ok: false, error: "GIFT_VOUCHER_UNAVAILABLE", message: "Poukaz sa teraz nedá spracovať. Skúste to neskôr." })
}
