import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { sendPendingNewsletterDeliveries, createNewsletterSendStore, type NewsletterNotificationService } from "../modules/newsletter/sender"
import { newsletterRuntime } from "../modules/newsletter/runtime"

/**
 * Každých 10 minút: pošle najviac NEWSLETTER_BATCH (40) pending doručení a najviac
 * NEWSLETTER_DAILY_LIMIT (90) za posledných 24 hodín. Pred odoslaním znova overí súhlas.
 * Bez NEWSLETTER_UNSUBSCRIBE_SECRET sa neposiela nič (nedá sa vytvoriť odhlasovací odkaz).
 */
export default async function newsletterSendJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  const runtime = newsletterRuntime()
  if (!runtime.configured || !runtime.secret) {
    logger.warn("[newsletter] job preskočený: chýba NEWSLETTER_UNSUBSCRIBE_SECRET (aspoň 32 znakov)")
    return
  }

  try {
    const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
    const notification = container.resolve(Modules.NOTIFICATION) as unknown as NewsletterNotificationService
    const summary = await sendPendingNewsletterDeliveries({
      store: createNewsletterSendStore(db),
      notification,
      secret: runtime.secret,
      baseUrl: runtime.baseUrl,
      allowlist: runtime.allowlist,
      batch: runtime.batch,
      dailyLimit: runtime.dailyLimit,
      logger,
    })
    if (summary.attempted || summary.campaignsSent.length || summary.dailyLimitReached) {
      logger.info(`[newsletter] job: odoslané ${summary.sent}, zlyhané ${summary.failed}, preskočené ${summary.skipped}, potlačené ${summary.suppressed}, uzavreté kampane ${summary.campaignsSent.length}, denný limit ${summary.dailyLimitReached ? "vyčerpaný" : "voľný"}`)
    }
  } catch (error) {
    logger.error("[newsletter] job zlyhal", error as Error)
  }
}

export const config = { name: "newsletter-send", schedule: "*/10 * * * *" }
