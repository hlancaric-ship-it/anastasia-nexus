import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Doručení upozornění chatu. Obsah zpráv se do e-mailů nevkládá (jen počty a odkaz),
 * aby citlivé texty neputovaly mimo administraci a účet zákaznice.
 */
export interface ChatNotifier {
  adminDigest(input: { conversations: number; messages: number }): Promise<void>
  customerReply(input: { email: string; conversation_id: string; first_name?: string | null }): Promise<void>
}

const env = (name: string) => (process.env[name] || "").trim()

export const CHAT_TEMPLATES = { ADMIN_DIGEST: "chat-admin-digest", ADMIN_REPLY: "chat-admin-reply" } as const

/**
 * Výchozí notifier nad modulem Notification (provider podle medusa-config; lokálně notification-local = log).
 * Bez CHAT_ADMIN_NOTIFY_EMAIL se souhrn Lucii jen zaloguje (bez osobních údajů).
 */
export function chatNotifier(container: MedusaContainer): ChatNotifier {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const notification = (() => {
    try { return container.resolve(Modules.NOTIFICATION) } catch { return null }
  })()
  const adminUrl = env("CHAT_ADMIN_URL") || `${env("BACKEND_PUBLIC_URL") || "http://localhost:9000"}/app/chat`
  const storefrontUrl = env("CHAT_STOREFRONT_URL")

  return {
    async adminDigest({ conversations, messages }) {
      const to = env("CHAT_ADMIN_NOTIFY_EMAIL")
      if (!to || !notification) {
        logger.info(`[chat] souhrn pro Luciu: ${messages} nepřečtených zpráv v ${conversations} konverzacích (e-mail není nastaven: CHAT_ADMIN_NOTIFY_EMAIL)`)
        return
      }
      await notification.createNotifications({
        to,
        channel: "email",
        template: CHAT_TEMPLATES.ADMIN_DIGEST,
        data: { subject: `Nové zprávy od zákaznic (${messages})`, conversations, messages, url: adminUrl },
      })
    },
    async customerReply({ email, conversation_id, first_name }) {
      if (!notification) {
        logger.info(`[chat] odpověď v konverzaci ${conversation_id}: e-mail zákaznici nelze odeslat (modul notifikací chybí)`)
        return
      }
      await notification.createNotifications({
        to: email,
        channel: "email",
        template: CHAT_TEMPLATES.ADMIN_REPLY,
        data: {
          subject: "Lucia vám odpověděla",
          first_name: first_name ?? null,
          conversation_id,
          url: storefrontUrl ? `${storefrontUrl.replace(/\/$/, "")}/${encodeURIComponent(conversation_id)}` : null,
        },
      })
    },
  }
}
