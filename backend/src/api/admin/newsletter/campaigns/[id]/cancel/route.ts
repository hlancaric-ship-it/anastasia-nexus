import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { newsletterService, publicCampaign, requireAdmin, sendNewsletterError } from "../../shared"

/** POST /admin/newsletter/campaigns/:id/cancel – zvyšné pending doručenia sa označia ako skipped. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req, res)) return
  try {
    const campaign = await newsletterService(req).cancelCampaign(String(req.params.id))
    return res.json({ campaign: publicCampaign(campaign) })
  } catch (error) {
    return sendNewsletterError(req, res, error)
  }
}
