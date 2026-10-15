import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { toAdminConversationDTO, toMessageDTO } from "../../../../../modules/chat/dto"
import type { ChatConversationRow } from "../../../../../modules/chat/service"
import { ConversationNotFoundError } from "../../../../../modules/chat/service"
import { chatService, conversationActionSchema, parseBody, requireActor, sendChatError } from "../../../../chat-helpers"
import { loadCustomers } from "../../helpers"
import { auditAdminChange } from "../../../../../lib/observability/audit"

async function detail(req: AuthenticatedMedusaRequest, conversation: ChatConversationRow) {
  const chat = chatService(req)
  const [messages, customers, blocked] = await Promise.all([
    chat.listConversationMessages(conversation.id),
    loadCustomers(req.scope, [conversation.customer_id]),
    chat.isCustomerBlocked(conversation.customer_id),
  ])
  return {
    conversation: toAdminConversationDTO(conversation, { customer: customers.get(conversation.customer_id), blocked }),
    messages: messages.map(toMessageDTO),
  }
}

async function load(req: AuthenticatedMedusaRequest): Promise<ChatConversationRow> {
  const [row] = (await chatService(req).listChatConversations({ id: req.params.id }, { take: 1 })) as unknown as ChatConversationRow[]
  if (!row) throw new ConversationNotFoundError()
  return row
}

/** GET /admin/chat/conversations/:id: konverzace se zprávami, zákaznicí a stavem blokace. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!requireActor(req, res, "user")) return
  try {
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json(await detail(req, await load(req)))
  } catch (error) {
    return sendChatError(req, res, error, "GET /admin/chat/conversations/:id")
  }
}

/** POST /admin/chat/conversations/:id { action: close|reopen|mute|unmute }. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!requireActor(req, res, "user")) return
  const input = parseBody(conversationActionSchema, req, res)
  if (!input) return
  try {
    const updated = await chatService(req).applyConversationAction(req.params.id, input.action)
    await auditAdminChange(req, `chat_conversation.${input.action}`, "chat_conversation", req.params.id, null, { action: input.action })
    return res.status(200).json(await detail(req, updated))
  } catch (error) {
    return sendChatError(req, res, error, "POST /admin/chat/conversations/:id")
  }
}
