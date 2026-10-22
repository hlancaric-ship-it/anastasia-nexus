import { recipientAllowed } from "../notification-zeptomail/service"
import { listUnsubscribeHeaders, remainingDailyBudget, renderCampaignEmail, unsubscribeUrl } from "./policy"

/**
 * Odosielanie kampaní: tenká vrstva nad úložiskom (aby sa limity a re-check súhlasu dali
 * testovať bez databázy) a samotné volanie notification modulu.
 *
 * Poradie kontrol pre každé doručenie:
 *  1. kampaň ešte nie je zrušená,
 *  2. súhlas je stále `subscribed` (odhlásenie po zafrontovaní sa respektuje),
 *  3. adresát prejde allowlistom poskytovateľa (testovacia prevádzka),
 *  4. až potom sa e-mail odosiela. Bežný limit je NEWSLETTER_BATCH na beh
 *     a NEWSLETTER_DAILY_LIMIT na posledných 24 hodín.
 */

export type PendingDelivery = {
  id: string
  campaign_id: string
  consent_id: string
  email: string
  campaign_status: string
  subject: string
  preheader: string | null
  body_html: string
}

export type DeliveryPatch = { status: "sent" | "failed" | "skipped"; error?: string | null; sent_at?: Date | null }

export interface NewsletterSendStore {
  /** Počet úspešne odoslaných e-mailov od `since` (denný limit). */
  sentSince(since: Date): Promise<number>
  /** Pending doručenia kampaní, ktoré sa majú odosielať (queued/sending), najstaršie prvé. */
  pending(limit: number): Promise<PendingDelivery[]>
  markCampaignsSending(campaignIds: string[], now: Date): Promise<void>
  /** Stav súhlasu alebo null, ak už neexistuje. */
  consentStatus(consentId: string): Promise<string | null>
  /** Aktuálny stav kampane alebo null, ak už neexistuje (zrušenie počas behu). */
  campaignStatus(campaignId: string): Promise<string | null>
  markDelivery(id: string, patch: DeliveryPatch, now: Date): Promise<void>
  /** Prepočíta počty a uzavrie kampaň (`sent`), keď nezostal žiadny pending. */
  finalizeCampaign(campaignId: string, now: Date): Promise<"sent" | "updated" | "missing">
}

export type NewsletterNotificationService = {
  createNotifications(data: Record<string, unknown>): Promise<unknown>
}

export type NewsletterSendDeps = {
  store: NewsletterSendStore
  notification: NewsletterNotificationService
  secret: string
  baseUrl: string
  allowlist?: string[]
  batch?: number
  dailyLimit?: number
  now?: Date
  logger?: { info?: (msg: string) => void; warn?: (msg: string) => void; error?: (msg: string, err?: unknown) => void }
}

export type NewsletterSendSummary = {
  attempted: number
  sent: number
  failed: number
  skipped: number
  suppressed: number
  sentLast24h: number
  budget: number
  dailyLimitReached: boolean
  campaignsSent: string[]
}

/** Chybová správa do záznamu doručenia: bez adries a bez riadkov, max 200 znakov. */
export function safeDeliveryError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "")
  return text
    .replace(/[^\s@<>()"]+@[^\s@<>()"]+/g, "[adresa]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 200) || "send_failed"
}

export function createNewsletterSendStore(db: any): NewsletterSendStore {
  const countByStatus = async (campaignId: string) => {
    const rows: Array<{ status: string; count: string | number }> = await db("newsletter_delivery")
      .select("status").count("* as count").where({ campaign_id: campaignId }).groupBy("status")
    const of = (status: string) => Number(rows.find(row => row.status === status)?.count ?? 0)
    return { total: rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0), sent: of("sent"), failed: of("failed"), pending: of("pending") }
  }

  return {
    async sentSince(since) {
      const row = await db("newsletter_delivery").where({ status: "sent" }).where("sent_at", ">=", since).count("* as count").first()
      return Number(row?.count ?? 0)
    },

    async pending(limit) {
      return db("newsletter_delivery as d")
        .join("newsletter_campaign as c", "c.id", "d.campaign_id")
        .select("d.id", "d.campaign_id", "d.consent_id", "d.email", "c.status as campaign_status", "c.subject", "c.preheader", "c.body_html")
        .where("d.status", "pending")
        .whereIn("c.status", ["queued", "sending"])
        .whereNull("c.deleted_at")
        .whereNull("d.deleted_at")
        .orderBy("d.created_at", "asc")
        .limit(limit)
    },

    async markCampaignsSending(campaignIds, now) {
      if (!campaignIds.length) return
      await db("newsletter_campaign").whereIn("id", campaignIds).whereIn("status", ["queued", "sending"]).update({ status: "sending", updated_at: now })
    },

    async consentStatus(consentId) {
      const row = await db("newsletter_consent").select("status").where({ id: consentId }).whereNull("deleted_at").first()
      return row?.status ?? null
    },

    async campaignStatus(campaignId) {
      const row = await db("newsletter_campaign").select("status").where({ id: campaignId }).whereNull("deleted_at").first()
      return row?.status ?? null
    },

    async markDelivery(id, patch, now) {
      await db("newsletter_delivery").where({ id }).update({ ...patch, updated_at: now })
    },

    async finalizeCampaign(campaignId, now) {
      const campaign = await db("newsletter_campaign").where({ id: campaignId }).whereNull("deleted_at").first()
      if (!campaign) return "missing"
      const counts = await countByStatus(campaignId)
      const patch: Record<string, unknown> = {
        recipients_count: counts.total,
        sent_count: counts.sent,
        failed_count: counts.failed,
        updated_at: now,
      }
      let outcome: "sent" | "updated" = "updated"
      if (counts.pending === 0 && (campaign.status === "queued" || campaign.status === "sending")) {
        patch.status = "sent"
        patch.sent_at = now
        outcome = "sent"
      }
      await db("newsletter_campaign").where({ id: campaignId }).update(patch)
      return outcome
    },
  }
}

export async function sendPendingNewsletterDeliveries(deps: NewsletterSendDeps): Promise<NewsletterSendSummary> {
  const now = deps.now ?? new Date()
  const batch = Math.max(1, deps.batch ?? 40)
  const limit = Math.max(1, deps.dailyLimit ?? 90)
  const sentLast24h = await deps.store.sentSince(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const budget = remainingDailyBudget(sentLast24h, limit, batch)
  const summary: NewsletterSendSummary = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    suppressed: 0,
    sentLast24h,
    budget,
    dailyLimitReached: budget === 0,
    campaignsSent: [],
  }
  if (budget === 0) return summary

  const rows = await deps.store.pending(budget)
  if (!rows.length) return summary
  await deps.store.markCampaignsSending([...new Set(rows.map(row => row.campaign_id))], now)

  for (const row of rows) {
    summary.attempted += 1
    if (row.campaign_status === "cancelled") {
      await deps.store.markDelivery(row.id, { status: "skipped", error: "campaign_cancelled" }, now)
      summary.skipped += 1
      continue
    }
    // Kampaň sa mohla zrušiť počas tohto behu – stav sa preto overuje pred každým e-mailom.
    const campaignStatus = await deps.store.campaignStatus(row.campaign_id)
    if (campaignStatus !== "queued" && campaignStatus !== "sending") {
      await deps.store.markDelivery(row.id, { status: "skipped", error: campaignStatus === "cancelled" ? "campaign_cancelled" : "campaign_not_active" }, now)
      summary.skipped += 1
      continue
    }

    const consentStatus = await deps.store.consentStatus(row.consent_id)
    if (consentStatus !== "subscribed") {
      await deps.store.markDelivery(row.id, { status: "skipped", error: "consent_not_subscribed" }, now)
      summary.skipped += 1
      continue
    }

    if (!recipientAllowed(row.email, deps.allowlist)) {
      await deps.store.markDelivery(row.id, { status: "skipped", error: "recipient_not_allowlisted" }, now)
      summary.suppressed += 1
      continue
    }

    const link = unsubscribeUrl(row.consent_id, deps.secret, deps.baseUrl)
    const email = renderCampaignEmail({ subject: row.subject, preheader: row.preheader, bodyHtml: row.body_html, unsubscribeUrl: link })
    try {
      await deps.notification.createNotifications({
        to: row.email,
        channel: "email",
        template: "newsletter-campaign",
        content: { subject: row.subject, html: email.html, text: email.text },
        data: { campaign_id: row.campaign_id },
        provider_data: { headers: listUnsubscribeHeaders(link) },
        idempotency_key: `newsletter-delivery-${row.id}`,
        resource_id: row.campaign_id,
        resource_type: "newsletter-campaign",
      })
      await deps.store.markDelivery(row.id, { status: "sent", error: null, sent_at: now }, now)
      summary.sent += 1
    } catch (error) {
      await deps.store.markDelivery(row.id, { status: "failed", error: safeDeliveryError(error), sent_at: null }, now)
      summary.failed += 1
      deps.logger?.error?.(`[newsletter] odoslanie zlyhalo (${row.id})`, error)
    }
  }

  for (const campaignId of new Set(rows.map(row => row.campaign_id))) {
    if (await deps.store.finalizeCampaign(campaignId, now) === "sent") summary.campaignsSent.push(campaignId)
  }

  summary.dailyLimitReached = sentLast24h + summary.sent >= limit
  return summary
}
