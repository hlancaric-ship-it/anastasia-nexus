import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sortForAdmin, isUnreadByAdmin } from "../../../../modules/chat"
import { toAdminConversationDTO } from "../../../../modules/chat/dto"
import type { ChatConversationRow } from "../../../../modules/chat/service"
import { chatService, requireActor, sendChatError } from "../../../chat-helpers"
import { loadCustomers } from "../helpers"

const STATUSES = ["open", "closed", "all"] as const

/** GET /admin/chat/conversations?status=open|closed|all&limit=&offset=: nepřečtené (neztlumené) nahoře. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!requireActor(req, res, "user")) return
  const status = STATUSES.includes(req.query.status as any) ? (req.query.status as (typeof STATUSES)[number]) : "open"
  const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit) || 100), 1), 200)
  const offset = Math.max(Math.trunc(Number(req.query.offset) || 0), 0)
  try {
    const chat = chatService(req)
    const filters = status === "all" ? {} : { status }
    const [rows, count] = (await chat.listAndCountChatConversations(filters, { take: limit, skip: offset, order: { last_message_at: "DESC" } })) as unknown as [ChatConversationRow[], number]
    const sorted = sortForAdmin(rows)
    const ids = sorted.map((c) => c.customer_id)
    const [customers, blocked] = await Promise.all([loadCustomers(req.scope, ids), chat.blockedCustomerIds([...new Set(ids)])])
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json({
      conversations: sorted.map((c) => toAdminConversationDTO(c, { customer: customers.get(c.customer_id), blocked: blocked.has(c.customer_id) })),
      count,
      unread: sorted.filter((c) => isUnreadByAdmin(c) && !c.muted).length,
      limit,
      offset,
    })
  } catch (error) {
    return sendChatError(req, res, error, "GET /admin/chat/conversations")
  }
}
