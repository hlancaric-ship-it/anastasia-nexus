import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CAMPAIGN_FIELDS, campaignPage, legalService, newsletterService, publicCampaign, requireAdmin, sendNewsletterError } from "./shared"

/** GET /admin/newsletter/campaigns – zoznam kampaní a čísla pre horné karty. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req, res)) return
  try {
    const page = campaignPage(req.query)
    const service = newsletterService(req)
    const [rows, count] = await service.listAndCountNewsletterCampaigns({}, page)
    const [, sentCount] = await service.listAndCountNewsletterCampaigns({ status: "sent" }, { take: 1 })
    const [lastRows] = await service.listAndCountNewsletterCampaigns({}, { take: 1, order: { created_at: "DESC" }, select: CAMPAIGN_FIELDS })
    const [, subscribedCount] = await legalService(req).listAndCountNewsletterConsents({ status: "subscribed" }, { take: 1 })
    return res.json({
      campaigns: rows.map(publicCampaign),
      count,
      limit: page.take,
      offset: page.skip,
      stats: {
        subscribed: subscribedCount,
        campaigns_sent: sentCount,
        last_campaign: lastRows[0] ? publicCampaign(lastRows[0]) : null,
      },
    })
  } catch (error) {
    return sendNewsletterError(req, res, error)
  }
}

/** POST /admin/newsletter/campaigns – nový koncept (obsah sa hneď sanitizuje). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req, res)) return
  try {
    const campaign = await newsletterService(req).createCampaignDraft(req.body)
    return res.status(201).json({ campaign: publicCampaign(campaign) })
  } catch (error) {
    return sendNewsletterError(req, res, error)
  }
}
