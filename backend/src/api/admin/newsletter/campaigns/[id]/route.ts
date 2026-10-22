import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { newsletterService, publicCampaign, requireAdmin, sendNewsletterError } from "../shared"

/** GET /admin/newsletter/campaigns/:id */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req, res)) return
  try {
    const campaign = await newsletterService(req).getCampaignOrThrow(String(req.params.id))
    return res.json({ campaign: publicCampaign(campaign) })
  } catch (error) {
    return sendNewsletterError(req, res, error)
  }
}

/** POST /admin/newsletter/campaigns/:id – úprava len v stave draft. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req, res)) return
  try {
    const campaign = await newsletterService(req).updateCampaignDraft(String(req.params.id), req.body)
    return res.json({ campaign: publicCampaign(campaign) })
  } catch (error) {
    return sendNewsletterError(req, res, error)
  }
}

/** DELETE /admin/newsletter/campaigns/:id – mäkké zmazanie konceptu. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req, res)) return
  try {
    await newsletterService(req).deleteCampaignDraft(String(req.params.id))
    return res.json({ deleted: true })
  } catch (error) {
    return sendNewsletterError(req, res, error)
  }
}
