import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CHAT_MODULE } from "../modules/chat"
import type ChatModuleService from "../modules/chat/service"
import { chatNotifier } from "../modules/chat/notifier"

/**
 * Doběh souhrnu: zprávy, které přišly během hodinové pauzy po posledním souhrnu, by jinak čekaly
 * na další zprávu zákazník. Claim v DB zaručí max 1 souhrn/h i při souběhu se subscriberem.
 */
export default async function chatAdminDigestJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const chat = container.resolve(CHAT_MODULE) as ChatModuleService
    const digest = await chat.claimAdminDigest(new Date())
    if (digest) await chatNotifier(container).adminDigest(digest)
  } catch (error) {
    logger.error("[chat] plánovaný souhrn pro Luciu selhal", error as Error)
  }
}

export const config = { name: "chat-admin-digest", schedule: "*/10 * * * *" }
