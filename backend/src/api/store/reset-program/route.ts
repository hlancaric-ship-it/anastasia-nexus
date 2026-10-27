import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveProgramAccess } from "../../../lib/reset-program/access"
import { requireCustomer, sendJournalError } from "../reset-journal/helpers"

/**
 * GET /store/reset-program – štruktúra programu pre zákazníka s prístupom:
 * 16 týždňov, materiály a pracovné listy po dňoch, záverečné zhrnutie a odkaz na vstupný dotazník.
 * Obsah (texty a súbory) dodá Lucia alebo import – bez neho je štruktúra prázdna (`content_ready: false`).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req, res)
  if (!customerId) return
  try {
    const access = await resolveProgramAccess(req.scope, customerId)
    if (!access) {
      return res.status(403).json({ type: "forbidden", message: "Program je dostupný len zákazníkom s aktívnym prístupom." })
    }
    res.setHeader("Cache-Control", "private, no-store")
    return res.status(200).json({
      program: access.program,
      total_weeks: access.structure.total_weeks,
      entry_questionnaire_url: access.structure.entry_questionnaire_url,
      exit_questionnaire_url: access.structure.exit_questionnaire_url,
      final_summary: access.structure.final_summary,
      weeks: access.structure.weeks,
      content_ready: access.structure.content_ready,
      metrics: access.metrics,
    })
  } catch (error) {
    return sendJournalError(req, res, error)
  }
}
