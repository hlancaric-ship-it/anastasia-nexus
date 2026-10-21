import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { blockSchema, chatService, parseBody, requireActor, sendChatError } from "../../../../../chat-helpers"
import { loadCustomers } from "../../../helpers"
import { auditAdminChange } from "../../../../../../lib/observability/audit"

/** POST /admin/chat/customers/:id/block { blocked, reason? }: vratné zablokování chatu zákazníka. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const adminId = requireActor(req, res, "user")
  if (!adminId) return
  const input = parseBody(blockSchema, req, res)
  if (!input) return
  try {
    const customers = await loadCustomers(req.scope, [req.params.id])
    if (!customers.has(req.params.id)) return res.status(404).json({ type: "not_found", message: "Zákazník nenalezen" })
    await chatService(req).setCustomerBlocked({ customer_id: req.params.id, blocked: input.blocked, reason: input.reason ?? null, admin_id: adminId })
    await auditAdminChange(req, input.blocked ? "chat_customer.block" : "chat_customer.unblock", "customer", req.params.id, null, { chat_blocked: input.blocked })
    return res.status(200).json({ customer_id: req.params.id, chat_blocked: input.blocked })
  } catch (error) {
    return sendChatError(req, res, error, "POST /admin/chat/customers/:id/block")
  }
}
