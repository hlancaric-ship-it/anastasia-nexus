import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { chatService, requireActor, sendChatError } from "../../../../../chat-helpers"

/** POST /store/chat/conversations/:id/read: zákaznice si přečetla odpovědi (obnoví e-mailová upozornění). */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireActor(req, res, "customer")
  if (!customerId) return
  try {
    const chat = chatService(req)
    const conversation = await chat.retrieveConversationOf(req.params.id, customerId)
    await chat.markReadByCustomer(conversation.id)
    return res.status(200).json({ id: conversation.id, read: true })
  } catch (error) {
    return sendChatError(req, res, error, "POST /store/chat/conversations/:id/read")
  }
}
