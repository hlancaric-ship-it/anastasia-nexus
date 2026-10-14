import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CHAT_EVENTS, CHAT_MODULE, type ChatMessageEvent } from "../modules/chat"
import type ChatModuleService from "../modules/chat/service"
import { chatNotifier } from "../modules/chat/notifier"

/** Luciina odpověď → e-mail zákaznici (jen pokud si předchozí upozornění už přečetla). */
export default async function chatAdminReplyHandler({ event, container }: SubscriberArgs<ChatMessageEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const chat = container.resolve(CHAT_MODULE) as ChatModuleService
    const claimed = await chat.claimCustomerReplyNotification(event.data.conversation_id)
    if (!claimed) return
    const customer = await container.resolve(Modules.CUSTOMER).retrieveCustomer(claimed.customer_id).catch(() => null)
    if (!customer?.email) {
      logger.info(`[chat] odpověď v konverzaci ${claimed.id}: zákaznice nemá e-mail, upozornění se neposílá`)
      return
    }
    await chatNotifier(container).customerReply({ email: customer.email, conversation_id: claimed.id, first_name: customer.first_name })
  } catch (error) {
    logger.error("[chat] upozornění zákaznice selhalo", error as Error)
  }
}

export const config: SubscriberConfig = { event: CHAT_EVENTS.ADMIN_REPLY }
