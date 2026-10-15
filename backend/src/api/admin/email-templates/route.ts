import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listTemplateDefs } from "../../../modules/notification-zeptomail/templates"
import { requireAdmin, sendUnexpected, storedTexts, templatesService } from "./shared"

/** GET /admin/email-templates – všetky šablóny s informáciou, či sú upravené alebo vypnuté. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!requireAdmin(req, res)) return
  try {
    const rows = await templatesService(req).listEmailTemplateOverrides({}, { take: 200 })
    const byTemplate = new Map(rows.map(row => [row.template, row]))
    const templates = listTemplateDefs().map(def => {
      const row = byTemplate.get(def.name) ?? null
      return {
        name: def.name,
        label: def.label,
        description: def.description,
        audience: def.audience,
        required: def.required,
        enabled: def.required ? true : row?.enabled !== false,
        customized: Object.keys(storedTexts(row)).length > 0 || row?.enabled === false,
        updated_at: row?.updated_at ?? null,
      }
    })
    return res.json({ templates })
  } catch (error) {
    return sendUnexpected(req, res, error, "list", "Šablóny sa nepodarilo načítať.")
  }
}
