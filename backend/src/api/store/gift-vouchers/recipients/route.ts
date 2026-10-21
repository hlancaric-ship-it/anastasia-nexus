import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { setGiftVoucherRecipients } from "../../../../modules/gift-voucher/cart"
import { assertCartOwnership, loadGiftVoucherCart, readCartId, sendGiftVoucherError } from "../shared"

/**
 * POST /store/gift-vouchers/recipients { cart_id, recipients: { [variant_id]: [{ name, email, message?, delivery_date? }] } }
 * Uloží obdarovaných ku kusom poukazov v košíku. Overuje server; v checkoute sa overí znova.
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
    const recipients = await setGiftVoucherRecipients(req.scope, cart.id, (req.body as { recipients?: unknown }).recipients)
    return res.status(200).json({ ok: true, recipients })
  } catch (error) {
    return sendGiftVoucherError(req, res, error, "uloženie obdarovaných")
  }
}
