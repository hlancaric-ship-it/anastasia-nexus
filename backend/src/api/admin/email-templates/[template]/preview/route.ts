import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { renderPreview, validateTexts } from "../../../../../modules/notification-zeptomail/templates"
import { requireAdmin, sendUnexpected, templateParam } from "../../shared"

/**
 * POST /admin/email-templates/:template/preview { texts? } – náhľad s ukážkovými údajmi (nič sa neukladá ani neposiela).
 * Vracia vykreslený predmet, HTML a textovú verziu.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!requireAdmin(req, res)) return
  const def = templateParam(req, res)
  if (!def) return
  const body = (req.body ?? {}) as { texts?: unknown }
  const valid = validateTexts(def.name, body.texts ?? {})
  if (!valid.ok) return res.status(400).json({ type: "invalid_data", errors: valid.errors, message: "Skontrolujte texty e-mailu." })
  try {
    return res.json({ preview: renderPreview(def.name, valid.texts) })
  } catch (error) {
    return sendUnexpected(req, res, error, "preview", "Náhľad sa nepodarilo vytvoriť.")
  }
}
