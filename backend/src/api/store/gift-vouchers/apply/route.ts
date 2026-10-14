import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { syncGiftVoucherCredit } from "../../../../modules/gift-voucher/cart"
import { normalizeVoucherCode } from "../../../../modules/gift-voucher/policy"
import { readCartId, sendGiftVoucherError } from "../shared"

/** POST /store/gift-vouchers/apply { cart_id, code } – uplatní poukaz ako kredit košíka (výšku určí server). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const cartId = readCartId(req.body)
  const code = normalizeVoucherCode((req.body as { code?: unknown } | undefined)?.code)
  if (!cartId) return res.status(400).json({ ok: false, error: "INVALID_CART_ID", message: "Košík nie je platný." })
  if (!code) return res.status(400).json({ ok: false, error: "GIFT_VOUCHER_INVALID", message: "Kód poukazu nie je platný." })
  try {
    const { credit } = await syncGiftVoucherCredit(req.scope, cartId, { code })
    return res.status(200).json({ ok: true, gift_voucher: credit })
  } catch (error) {
    return sendGiftVoucherError(req, res, error, "uplatnenie poukazu")
  }
}
