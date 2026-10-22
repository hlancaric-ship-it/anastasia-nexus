import { model } from "@medusajs/framework/utils"

export const CHAT_CONVERSATION_STATUSES = ["open", "closed"] as const

/**
 * Konverzace zákazníka s Luciou. Volitelně navázaná na objednávku nebo rezervaci (vlastnictví ověřuje API).
 * Časové značky slouží k řazení (nepřečtené nahoře) a k souhrnným notifikacím.
 * `muted` = Lucia nechce upozornění na tuto konverzaci (zákazník může psát dál v rámci limitů).
 */
const ChatConversation = model
  .define("chat_conversation", {
    id: model.id({ prefix: "chconv" }).primaryKey(),
    customer_id: model.text(),
    subject: model.text().nullable(),
    order_id: model.text().nullable(),
    booking_id: model.text().nullable(),
    status: model.enum([...CHAT_CONVERSATION_STATUSES]).default("open"),
    muted: model.boolean().default(false),
    closed_at: model.dateTime().nullable(),
    last_message_at: model.dateTime().nullable(),
    last_customer_message_at: model.dateTime().nullable(),
    last_admin_message_at: model.dateTime().nullable(),
    admin_last_read_at: model.dateTime().nullable(),
    customer_last_read_at: model.dateTime().nullable(),
    customer_notified_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["customer_id", "status"] },
    { on: ["status", "last_message_at"] },
  ])

export default ChatConversation
