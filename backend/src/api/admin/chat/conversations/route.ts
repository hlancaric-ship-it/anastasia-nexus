import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CHAT_EVENTS, sortForAdmin, isUnreadByAdmin } from "../../../../modules/chat"
import { toAdminConversationDTO, toMessageDTO } from "../../../../modules/chat/dto"
import type { ChatConversationRow } from "../../../../modules/chat/service"
import { adminNewMessageSchema, chatService, emitChatEvent, parseBody, requireActor, sendChatError } from "../../../chat-helpers"
import { loadCustomers } from "../helpers"
import { auditAdminChange } from "../../../../lib/observability/audit"

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

/**
 * POST /admin/chat/conversations { customer_id, body, subject? } – nová zpráva pro zákazníka.
 * Pokud zákazník už má otevřenou konverzaci, zpráva se přidá do ní, jinak se založí nová.
 * Zákazníkovi odejde i e-mail (stejná šablona jako u odpovědi).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const adminId = requireActor(req, res, "user")
  if (!adminId) return
  const input = parseBody(adminNewMessageSchema, req, res)
  if (!input) return
  try {
    const customers = await loadCustomers(req.scope, [input.customer_id])
    if (!customers.has(input.customer_id)) {
      return res.status(404).json({ type: "not_found", message: "Zákazník sa nenašiel." })
    }
    const { conversation, message } = await chatService(req).sendAdminMessage({
      customer_id: input.customer_id,
      admin_id: adminId,
      body: input.body,
      subject: input.subject,
    })
    await emitChatEvent(req, CHAT_EVENTS.ADMIN_REPLY, { conversation_id: conversation.id, message_id: message.id, customer_id: conversation.customer_id })
    await auditAdminChange(req, "chat.conversation.start", "customer", input.customer_id, null, {
      conversation_id: conversation.id,
      subject: conversation.subject,
      created: true,
    })
    return res.status(201).json({ conversation_id: conversation.id, message: toMessageDTO(message) })
  } catch (error) {
    return sendChatError(req, res, error, "POST /admin/chat/conversations")
  }
}
