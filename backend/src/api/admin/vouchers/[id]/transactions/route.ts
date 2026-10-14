import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireAdmin, sendAdminError, vouchersService } from "../../shared"
import { fromMinor } from "../../../../../modules/gift-voucher/policy"

/** Persistent financial audit. Only explicit safe fields; never voucher codes, recipients or notes. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!requireAdmin(req, res)) return
  const id = req.params?.id
  if (!id || !/^gv_[A-Za-z0-9]{1,64}$/.test(id)) return res.status(400).json({ message: "ID poukazu nie je platné." })
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query?.limit ?? "50"), 10) || 50))
  const offset = Math.max(0, Number.parseInt(String(req.query?.offset ?? "0"), 10) || 0)
  try {
    const service = vouchersService(req)
    const voucher = await service.getVoucher(id)
    if (!voucher) return res.status(404).json({ message: "Poukaz neexistuje." })
    const [rows, count] = await service.listAndCountGiftVoucherTransactions({ voucher_id: id }, {
      take: limit, skip: offset, order: { created_at: "DESC", id: "DESC" },
      select: ["id", "type", "amount", "balance_after", "cart_id", "order_id", "reference_id", "actor_id", "created_at", "reversed_at"],
    })
    const transactions = rows.map((row) => ({
      id: row.id, type: row.type, amount: fromMinor(Number(row.amount)), balance_after: fromMinor(Number(row.balance_after)),
      cart_id: row.cart_id, order_id: row.order_id, reference_id: row.reference_id,
      actor_id: row.actor_id, created_at: row.created_at, reversed_at: row.reversed_at,
    }))
    return res.json({ voucher_id: id, currency_code: voucher.currency_code, transactions, count, limit, offset })
  } catch (error) {
    return sendAdminError(req, res, error, "história poukazu")
  }
}
