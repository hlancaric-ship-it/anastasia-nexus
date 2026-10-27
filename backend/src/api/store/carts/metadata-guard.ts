import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * Kľúče `cart.metadata`, ktoré zapisuje výhradne server (`/store/nexus-cart`).
 *
 * Natívne Store API (`POST /store/carts`, `POST /store/carts/:id`) prijíma `metadata` od klienta.
 * Bez tejto poistky by si zákazník podvrhol `nexus_coupon` (napr. iné `promotion_id`) a obišiel
 * limit použití kupónu. Server síce kupón pri každom prepočte znovu overí podľa kódu, ale
 * podvrhnutý zápis sa odmietne už tu (fail closed, 400 RESERVED_METADATA).
 */
export const SERVER_OWNED_CART_METADATA_KEYS = ["nexus_coupon"] as const

export function reservedCartMetadataKeys(body: unknown): string[] {
  if (!body || typeof body !== "object") return []
  const metadata = (body as Record<string, unknown>).metadata
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return []
  return SERVER_OWNED_CART_METADATA_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(metadata, key))
}

export function rejectServerOwnedCartMetadata(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const keys = reservedCartMetadataKeys(req.body)
  if (!keys.length) return next()
  return res.status(400).json({
    ok: false,
    code: "RESERVED_METADATA",
    error: "RESERVED_METADATA",
    message: "Kupón sa uplatňuje len cez /store/nexus-cart.",
  })
}
