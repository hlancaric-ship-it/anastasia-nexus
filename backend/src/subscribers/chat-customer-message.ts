import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CHAT_EVENTS, CHAT_MODULE, type ChatMessageEvent } from "../modules/chat"
import type ChatModuleService from "../modules/chat/service"
import { chatNotifier } from "../modules/chat/notifier"

/** Nová zpráva zákaznice → souhrnný e-mail Lucii, nejvýš 1×/h (claim pod zámkem v DB, bezpečné i pro víc instancí). */
export default async function chatCustomerMessageHandler({ container }: SubscriberArgs<ChatMessageEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const chat = container.resolve(CHAT_MODULE) as ChatModuleService
    const digest = await chat.claimAdminDigest(new Date())
    if (digest) await chatNotifier(container).adminDigest(digest)
  } catch (error) {
    logger.error("[chat] souhrn pro Luciu selhal", error as Error)
  }
}

export const config: SubscriberConfig = { event: CHAT_EVENTS.CUSTOMER_MESSAGE }
