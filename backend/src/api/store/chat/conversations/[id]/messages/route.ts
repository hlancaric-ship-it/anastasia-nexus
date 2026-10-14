import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CHAT_EVENTS, ChatPolicyError } from "../../../../../../modules/chat"
import { toCustomerConversationDTO, toMessageDTO } from "../../../../../../modules/chat/dto"
import { isCustomerChatEligible } from "../../../../../../modules/chat/eligibility"
import { chatService, emitChatEvent, messageSchema, parseBody, requireActor, sendChatError } from "../../../../../chat-helpers"

/** POST /store/chat/conversations/:id/messages { body }: další zpráva zákaznice (limity hlídá služba pod zámkem). */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireActor(req, res, "customer")
  if (!customerId) return
  const input = parseBody(messageSchema, req, res)
  if (!input) return
  try {
    if (!(await isCustomerChatEligible(req.scope, customerId))) throw new ChatPolicyError("chat_not_eligible")
    const { conversation, message } = await chatService(req).sendCustomerMessage({ customer_id: customerId, conversation_id: req.params.id, body: input.body })
    await emitChatEvent(req, CHAT_EVENTS.CUSTOMER_MESSAGE, { conversation_id: conversation.id, message_id: message.id, customer_id: customerId })
    res.setHeader("Cache-Control", "no-store")
    return res.status(201).json({ conversation: toCustomerConversationDTO(conversation), message: toMessageDTO(message) })
  } catch (error) {
    return sendChatError(req, res, error, "POST /store/chat/conversations/:id/messages")
  }
}
