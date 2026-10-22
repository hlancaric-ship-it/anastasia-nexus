import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { CHAT_EVENTS, CHAT_MODULE, type ChatMessageEvent } from "../modules/chat"
import type ChatModuleService from "../modules/chat/service"
import { chatNotifier } from "../modules/chat/notifier"
import { recordEvent } from "../lib/observability/events"

/** Nová zpráva zákazníka → souhrnný e-mail Lucii, nejvýš 1×/h (claim pod zámkem v DB, bezpečné i pro víc instancí). */
export default async function chatCustomerMessageHandler({ container }: SubscriberArgs<ChatMessageEvent>) {
  try {
    const chat = container.resolve(CHAT_MODULE) as ChatModuleService
    const digest = await chat.claimAdminDigest(new Date())
    if (digest) await chatNotifier(container).adminDigest(digest)
  } catch (error) {
    await recordEvent(container, "error", "notification", "chat_admin_digest_failed", { error })
  }
}

export const config: SubscriberConfig = { event: CHAT_EVENTS.CUSTOMER_MESSAGE }
