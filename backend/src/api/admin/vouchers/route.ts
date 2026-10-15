import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VOUCHER_STATUSES } from "../../../modules/gift-voucher/policy"
import { requireAdmin, sendAdminError, vouchersService } from "./shared"

/** GET /admin/vouchers?status=&order_id=&limit=&offset= – prehľad vydaných poukazov (kód vždy maskovaný). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!requireAdmin(req, res)) return
  const query = (req.query ?? {}) as Record<string, unknown>
  const status = typeof query.status === "string" && (VOUCHER_STATUSES as readonly string[]).includes(query.status) ? query.status : undefined
  const orderId = typeof query.order_id === "string" && /^order_[A-Za-z0-9]{1,64}$/.test(query.order_id) ? query.order_id : undefined
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit ?? "50"), 10) || 50))
  const offset = Math.max(0, Number.parseInt(String(query.offset ?? "0"), 10) || 0)
  try {
    const { vouchers, count } = await vouchersService(req).listForAdmin({ status, order_id: orderId, limit, offset })
    return res.json({ vouchers, count, limit, offset })
  } catch (error) {
    return sendAdminError(req, res, error, "prehľad poukazov")
  }
}
