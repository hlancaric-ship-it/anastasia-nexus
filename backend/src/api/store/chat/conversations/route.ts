import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CHAT_EVENTS, ChatPolicyError } from "../../../../modules/chat"
import { toCustomerConversationDTO, toMessageDTO } from "../../../../modules/chat/dto"
import { customerOwnsBooking, customerOwnsOrder, isCustomerChatEligible } from "../../../../modules/chat/eligibility"
import type { ChatConversationRow } from "../../../../modules/chat/service"
import { chatService, customerNewConversationSchema, emitChatEvent, parseBody, requireActor, sendChatError } from "../../../chat-helpers"

/** GET /store/chat/conversations: konverzace přihlášeného zákazníka, nejnovější nahoře. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireActor(req, res, "customer")
  if (!customerId) return
  try {
    const rows = (await chatService(req).listChatConversations({ customer_id: customerId }, { take: 100, order: { last_message_at: "DESC" } })) as unknown as ChatConversationRow[]
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json({ conversations: rows.map(toCustomerConversationDTO) })
  } catch (error) {
    return sendChatError(req, res, error, "GET /store/chat/conversations")
  }
}

/** POST /store/chat/conversations { body, subject?, order_id?, booking_id? }: nová konverzace s první zprávou. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireActor(req, res, "customer")
  if (!customerId) return
  const input = parseBody(customerNewConversationSchema, req, res)
  if (!input) return
  try {
    if (input.order_id && input.booking_id) return res.status(400).json({ type: "invalid_data", message: "Konverzace může být navázaná jen na objednávku, nebo na rezervaci." })
    if (!(await isCustomerChatEligible(req.scope, customerId))) throw new ChatPolicyError("chat_not_eligible")
    // Vazbu lze vytvořit jen na vlastní objednávku/rezervaci; cizí = 404 (neprozrazuje existenci).
    if (input.order_id && !(await customerOwnsOrder(req.scope, customerId, input.order_id))) return res.status(404).json({ type: "not_found", message: "Objednávka nenalezena" })
    if (input.booking_id && !(await customerOwnsBooking(req.scope, customerId, input.booking_id))) return res.status(404).json({ type: "not_found", message: "Rezervace nenalezena" })
    const { conversation, message } = await chatService(req).sendCustomerMessage({
      customer_id: customerId, body: input.body, subject: input.subject, order_id: input.order_id ?? null, booking_id: input.booking_id ?? null,
    })
    await emitChatEvent(req, CHAT_EVENTS.CUSTOMER_MESSAGE, { conversation_id: conversation.id, message_id: message.id, customer_id: customerId })
    res.setHeader("Cache-Control", "no-store")
    return res.status(201).json({ conversation: toCustomerConversationDTO(conversation), message: toMessageDTO(message) })
  } catch (error) {
    return sendChatError(req, res, error, "POST /store/chat/conversations")
  }
}
