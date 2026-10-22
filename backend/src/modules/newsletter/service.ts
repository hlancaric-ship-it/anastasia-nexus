import { randomUUID } from "node:crypto"
import { InjectTransactionManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import NewsletterCampaign from "./models/newsletter-campaign"
import NewsletterDelivery from "./models/newsletter-delivery"
import { assertCampaignTransition, campaignFields, NewsletterError, type CampaignFields } from "./policy"

export type CampaignRow = CampaignFields & {
  id: string
  status: "draft" | "queued" | "sending" | "sent" | "cancelled"
  queued_at: Date | string | null
  sent_at: Date | string | null
  recipients_count: number
  sent_count: number
  failed_count: number
  created_at?: Date | string
  updated_at?: Date | string
}

type Counts = { recipients: number; sent: number; failed: number }

/**
 * Kampane a ich doručenia. Súhlasy číta tento modul z tabuľky `newsletter_consent`
 * (vlastní ich modul legal) – kampaň si robí len snapshot, stav súhlasu sa pred
 * každým odoslaním overuje znova v senderi.
 */
class NewsletterModuleService extends MedusaService({ NewsletterCampaign, NewsletterDelivery }) {
  protected db(context: Context) {
    const db = (context.transactionManager as any)?.getTransactionContext?.()
    if (!db) throw new Error("NEWSLETTER_TRANSACTION_REQUIRED")
    return db
  }

  protected async lock(db: any, key: string) {
    await db.raw("SET LOCAL lock_timeout = '5s'")
    await db.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`newsletter:${key}`])
  }

  private async counts(db: any, campaignId: string): Promise<Counts> {
    const rows = await db("newsletter_delivery").select("status").count("* as count").where({ campaign_id: campaignId }).groupBy("status")
    const of = (status: string) => Number(rows.find((r: any) => r.status === status)?.count ?? 0)
    return {
      recipients: rows.reduce((sum: number, r: any) => sum + Number(r.count ?? 0), 0),
      sent: of("sent"),
      failed: of("failed"),
    }
  }

  private async current(db: any, id: string): Promise<CampaignRow | undefined> {
    return db("newsletter_campaign").where({ id }).whereNull("deleted_at").first()
  }

  @InjectTransactionManager()
  async getCampaignOrThrow(id: string, @MedusaContext() context: Context = {}): Promise<CampaignRow> {
    const row = await this.current(this.db(context), id)
    if (!row) throw new NewsletterError("CAMPAIGN_NOT_FOUND", 404)
    return row
  }

  @InjectTransactionManager()
  async createCampaignDraft(input: any, @MedusaContext() context: Context = {}): Promise<CampaignRow> {
    const db = this.db(context)
    const fields = campaignFields(input)
    const now = new Date()
    const [row] = await db("newsletter_campaign").insert({
      id: `nlc_${randomUUID()}`,
      ...fields,
      status: "draft",
      recipients_count: 0,
      sent_count: 0,
      failed_count: 0,
      created_at: now,
      updated_at: now,
    }).returning("*")
    return row
  }

  @InjectTransactionManager()
  async updateCampaignDraft(id: string, input: any, @MedusaContext() context: Context = {}): Promise<CampaignRow> {
    const db = this.db(context)
    await this.lock(db, `campaign:${id}`)
    const row = await db("newsletter_campaign").where({ id }).whereNull("deleted_at").forUpdate().first()
    if (!row) throw new NewsletterError("CAMPAIGN_NOT_FOUND", 404)
    if (row.status !== "draft") throw new NewsletterError("CAMPAIGN_NOT_EDITABLE", 409)
    const fields = campaignFields(input)
    const now = new Date()
    const [updated] = await db("newsletter_campaign").where({ id }).update({ ...fields, updated_at: now }).returning("*")
    return updated
  }

  @InjectTransactionManager()
  async deleteCampaignDraft(id: string, @MedusaContext() context: Context = {}): Promise<void> {
    const db = this.db(context)
    await this.lock(db, `campaign:${id}`)
    const row = await db("newsletter_campaign").where({ id }).whereNull("deleted_at").forUpdate().first()
    if (!row) throw new NewsletterError("CAMPAIGN_NOT_FOUND", 404)
    if (row.status !== "draft") throw new NewsletterError("CAMPAIGN_NOT_EDITABLE", 409)
    await db("newsletter_campaign").where({ id }).update({ deleted_at: new Date(), updated_at: new Date() })
  }

  /**
   * Zafrontovanie: snapshot všetkých práve prihlásených súhlasov. Opakované volanie
   * nevytvorí duplicitné doručenia (unikátny index campaign_id + consent_id).
   */
  @InjectTransactionManager()
  async queueCampaign(id: string, @MedusaContext() context: Context = {}): Promise<CampaignRow> {
    const db = this.db(context)
    await this.lock(db, `campaign:${id}`)
    const row = await db("newsletter_campaign").where({ id }).whereNull("deleted_at").forUpdate().first()
    if (!row) throw new NewsletterError("CAMPAIGN_NOT_FOUND", 404)
    if (row.status === "queued" || row.status === "sending") return row
    assertCampaignTransition(row.status, "queued")

    const consents: Array<{ id: string; email: string }> = await db("newsletter_consent")
      .select("id", "email")
      .where({ status: "subscribed" })
      .whereNull("deleted_at")
      .orderBy("id", "asc")
    if (!consents.length) throw new NewsletterError("CAMPAIGN_NO_RECIPIENTS", 422)

    const now = new Date()
    for (let index = 0; index < consents.length; index += 500) {
      const chunk = consents.slice(index, index + 500).map((consent) => ({
        id: `nld_${randomUUID()}`,
        campaign_id: id,
        consent_id: consent.id,
        email: consent.email,
        status: "pending",
        created_at: now,
        updated_at: now,
      }))
      await db("newsletter_delivery").insert(chunk).onConflict(["campaign_id", "consent_id"]).ignore()
    }

    const counts = await this.counts(db, id)
    const [updated] = await db("newsletter_campaign").where({ id }).update({
      status: "queued",
      queued_at: now,
      recipients_count: counts.recipients,
      sent_count: counts.sent,
      failed_count: counts.failed,
      updated_at: now,
    }).returning("*")
    return updated
  }

  /** Zrušenie: zvyšné pending doručenia sa označia ako skipped, kampaň ako cancelled. */
  @InjectTransactionManager()
  async cancelCampaign(id: string, @MedusaContext() context: Context = {}): Promise<CampaignRow> {
    const db = this.db(context)
    await this.lock(db, `campaign:${id}`)
    const row = await db("newsletter_campaign").where({ id }).whereNull("deleted_at").forUpdate().first()
    if (!row) throw new NewsletterError("CAMPAIGN_NOT_FOUND", 404)
    if (row.status === "cancelled") return row
    if (row.status !== "queued" && row.status !== "sending") throw new NewsletterError("CAMPAIGN_STATE_CONFLICT", 409)

    const now = new Date()
    await db("newsletter_delivery").where({ campaign_id: id, status: "pending" }).update({ status: "skipped", error: "campaign_cancelled", updated_at: now })
    const counts = await this.counts(db, id)
    const [updated] = await db("newsletter_campaign").where({ id }).update({
      status: "cancelled",
      sent_count: counts.sent,
      failed_count: counts.failed,
      updated_at: now,
    }).returning("*")
    return updated
  }
}

export default NewsletterModuleService
