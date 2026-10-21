import { model } from "@medusajs/framework/utils"

export const CHAT_AUTHOR_TYPES = ["customer", "admin"] as const

/**
 * Jedna zpráva. Tělo je čistý text (bez HTML, bez příloh); zobrazuje se vždy jako text, odkazy nejsou aktivní.
 * `customer_id` je duplikováno z konverzace kvůli atomickým limitům (počty za den / po sobě na zákazníka).
 */
const ChatMessage = model
  .define("chat_message", {
    id: model.id({ prefix: "chmsg" }).primaryKey(),
    conversation_id: model.text(),
    customer_id: model.text(),
    author_type: model.enum([...CHAT_AUTHOR_TYPES]),
    author_id: model.text(),
    body: model.text(),
  })
  .indexes([
    { on: ["conversation_id", "created_at"] },
    { on: ["customer_id", "author_type", "created_at"] },
  ])

export default ChatMessage
