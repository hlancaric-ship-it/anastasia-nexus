/** Události chatu na Medusa event bus. Odesílají se až po úspěšném uložení zprávy (mimo transakci). */
export const CHAT_EVENTS = {
  CUSTOMER_MESSAGE: "chat.customer_message",
  ADMIN_REPLY: "chat.admin_reply",
} as const

export type ChatMessageEvent = { conversation_id: string; message_id: string; customer_id: string }
