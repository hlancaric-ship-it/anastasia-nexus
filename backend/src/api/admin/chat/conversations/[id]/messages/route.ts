import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CHAT_EVENTS } from "../../../../../../modules/chat"
import { toMessageDTO } from "../../../../../../modules/chat/dto"
import { chatService, emitChatEvent, messageSchema, parseBody, requireActor, sendChatError } from "../../../../../chat-helpers"

/** POST /admin/chat/conversations/:id/messages { body }: Luciina odpověď (zákazníkovi přijde e-mail). */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const adminId = requireActor(req, res, "user")
  if (!adminId) return
  const input = parseBody(messageSchema, req, res)
  if (!input) return
  try {
    const { conversation, message } = await chatService(req).sendAdminReply({ conversation_id: req.params.id, admin_id: adminId, body: input.body })
    await emitChatEvent(req, CHAT_EVENTS.ADMIN_REPLY, { conversation_id: conversation.id, message_id: message.id, customer_id: conversation.customer_id })
    return res.status(201).json({ message: toMessageDTO(message) })
  } catch (error) {
    return sendChatError(req, res, error, "POST /admin/chat/conversations/:id/messages")
  }
}
