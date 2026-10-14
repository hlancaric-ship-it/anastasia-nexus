import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { removeGiftVoucherCredit } from "../../../../modules/gift-voucher/cart"
import { readCartId, sendGiftVoucherError } from "../shared"

/** POST /store/gift-vouchers/remove { cart_id } – odoberie kredit poukazu z košíka. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const cartId = readCartId(req.body)
  if (!cartId) return res.status(400).json({ ok: false, error: "INVALID_CART_ID", message: "Košík nie je platný." })
  try {
    const removed = await removeGiftVoucherCredit(req.scope, cartId)
    return res.status(200).json({ ok: true, removed })
  } catch (error) {
    return sendGiftVoucherError(req, res, error, "odobratie poukazu")
  }
}
