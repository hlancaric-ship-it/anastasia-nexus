import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ConversationNotFoundError } from "../../../../../../modules/chat/service"
import { chatService, requireActor, sendChatError } from "../../../../../chat-helpers"

/** POST /admin/chat/conversations/:id/read: Lucia si konverzaci přečetla. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!requireActor(req, res, "user")) return
  try {
    const chat = chatService(req)
    const [row] = (await chat.listChatConversations({ id: req.params.id }, { take: 1 })) as any[]
    if (!row) throw new ConversationNotFoundError()
    await chat.markReadByAdmin(row.id)
    return res.status(200).json({ id: row.id, read: true })
  } catch (error) {
    return sendChatError(req, res, error, "POST /admin/chat/conversations/:id/read")
  }
}
