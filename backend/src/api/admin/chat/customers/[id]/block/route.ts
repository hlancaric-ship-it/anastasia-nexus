import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { blockSchema, chatService, parseBody, requireActor, sendChatError } from "../../../../../chat-helpers"
import { loadCustomers } from "../../../helpers"

/** POST /admin/chat/customers/:id/block { blocked, reason? }: vratné zablokování chatu zákaznice. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const adminId = requireActor(req, res, "user")
  if (!adminId) return
  const input = parseBody(blockSchema, req, res)
  if (!input) return
  try {
    const customers = await loadCustomers(req.scope, [req.params.id])
    if (!customers.has(req.params.id)) return res.status(404).json({ type: "not_found", message: "Zákaznice nenalezena" })
    await chatService(req).setCustomerBlocked({ customer_id: req.params.id, blocked: input.blocked, reason: input.reason ?? null, admin_id: adminId })
    return res.status(200).json({ customer_id: req.params.id, chat_blocked: input.blocked })
  } catch (error) {
    return sendChatError(req, res, error, "POST /admin/chat/customers/:id/block")
  }
}
