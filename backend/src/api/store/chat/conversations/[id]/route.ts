import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { toCustomerConversationDTO, toMessageDTO } from "../../../../../modules/chat/dto"
import { chatService, requireActor, sendChatError } from "../../../../chat-helpers"

/** GET /store/chat/conversations/:id: vlastní konverzace se zprávami (cizí = 404). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireActor(req, res, "customer")
  if (!customerId) return
  try {
    const chat = chatService(req)
    const conversation = await chat.retrieveConversationOf(req.params.id, customerId)
    const messages = await chat.listConversationMessages(conversation.id)
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json({ conversation: toCustomerConversationDTO(conversation), messages: messages.map(toMessageDTO) })
  } catch (error) {
    return sendChatError(req, res, error, "GET /store/chat/conversations/:id")
  }
}
