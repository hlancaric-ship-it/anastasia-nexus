import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CHAT_MODULE } from "../modules/chat"
import type ChatModuleService from "../modules/chat/service"
import { chatRetentionCutoff } from "../modules/chat/retention"

export default async function chatRetentionJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const cutoff = chatRetentionCutoff(process.env.CHAT_RETENTION_DAYS)
    const result = await (container.resolve(CHAT_MODULE) as ChatModuleService).redactExpiredContent(cutoff)
    if (result.conversations || result.messages) logger.info(`[chat] retencia: konverzácie ${result.conversations}, správy ${result.messages}`)
  } catch {
    logger.error("[chat] retencia obsahu zlyhala; skontrolujte CHAT_RETENTION_DAYS a databázu")
  }
}
export const config = { name: "chat-retention", schedule: "*/10 * * * *" }
