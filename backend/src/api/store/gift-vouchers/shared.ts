import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { giftVoucherHttpError } from "./errors"

export function readCartId(body: unknown): string | null {
  const cartId = (body as { cart_id?: unknown } | undefined)?.cart_id
  return typeof cartId === "string" && /^cart_[A-Za-z0-9]{1,64}$/.test(cartId) ? cartId : null
}

/** Spoločné spracovanie chýb: známe kódy poukazu → 400/409, chýbajúci košík → 404, inak 500 bez detailov. */
export function sendGiftVoucherError(req: MedusaRequest, res: MedusaResponse, error: unknown, context: string) {
  const code = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as any).message) : ""
  const mapped = giftVoucherHttpError(code)
  if (mapped) return res.status(mapped.status).json(mapped.body)
  if (code === "CART_NOT_FOUND") return res.status(404).json({ ok: false, error: "CART_NOT_FOUND", message: "Košík neexistuje." })
  req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(`[gift-voucher] ${context} selhalo`, error instanceof Error ? new Error(error.message) : new Error("unknown"))
  return res.status(500).json({ ok: false, error: "GIFT_VOUCHER_UNAVAILABLE", message: "Poukaz sa teraz nedá spracovať. Skúste to neskôr." })
}
