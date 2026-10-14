import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { CHAT_EVENTS, CHAT_MODULE, type ChatMessageEvent } from "../modules/chat"
import type ChatModuleService from "../modules/chat/service"
import { chatNotifier } from "../modules/chat/notifier"
import { recordEvent } from "../lib/observability/events"

/** Luciina odpověď → e-mail zákaznici (jen pokud si předchozí upozornění už přečetla). */
export default async function chatAdminReplyHandler({ event, container }: SubscriberArgs<ChatMessageEvent>) {
  try {
    const chat = container.resolve(CHAT_MODULE) as ChatModuleService
    const claimed = await chat.claimCustomerReplyNotification(event.data.conversation_id)
    if (!claimed) return
    const customer = await container.resolve(Modules.CUSTOMER).retrieveCustomer(claimed.customer_id).catch(() => null)
    if (!customer?.email) {
      await recordEvent(container, "info", "chat", "reply_notification_skipped_no_email", { entity_id: claimed.id })
      return
    }
    await chatNotifier(container).customerReply({ email: customer.email, conversation_id: claimed.id, first_name: customer.first_name })
  } catch (error) {
    await recordEvent(container, "error", "notification", "chat_reply_notification_failed", { entity_id: event.data.conversation_id, error })
  }
}

export const config: SubscriberConfig = { event: CHAT_EVENTS.ADMIN_REPLY }
