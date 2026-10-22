import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { removeGiftVoucherCredit } from "../../../../modules/gift-voucher/cart"
import { assertCartOwnership, loadGiftVoucherCart, readCartId, sendGiftVoucherError } from "../shared"

/**
 * POST /store/gift-vouchers/remove { cart_id } – odoberie kredit poukazu z košíka.
 *
 * VLASTNÍCTVO KOŠÍKA: pred zápisom sa overí, či košík patrí volajúcemu
 * (pozri `assertCartOwnership`). Cudzí košík sa meniť nedá.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const cartId = readCartId(req.body)
  if (!cartId) return res.status(400).json({ ok: false, error: "INVALID_CART_ID", message: "Košík nie je platný." })
  try {
    const cart = await loadGiftVoucherCart(req.scope, cartId)
    assertCartOwnership(req, cart)
    const removed = await removeGiftVoucherCredit(req.scope, cart.id)
    return res.status(200).json({ ok: true, removed })
  } catch (error) {
    return sendGiftVoucherError(req, res, error, "odobratie poukazu")
  }
}
