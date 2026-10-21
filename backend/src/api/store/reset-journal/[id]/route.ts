import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { RESET_JOURNAL_MODULE } from "../../../../modules/reset-journal"
import type ResetJournalModuleService from "../../../../modules/reset-journal/service"
import { resolveProgramAccess } from "../../../../lib/reset-program/access"
import { journalEntryDTO, requireCustomer, sendJournalError } from "../helpers"

/**
 * PATCH /store/reset-journal/:id – úprava VLASTNÉHO záznamu.
 * Body: { date?: "YYYY-MM-DD", week?: 1..16, metrics?: { "<key>": 1..10 } }
 * Cudzí záznam sa nedá upraviť – odpoveď je 404 rovnako ako pri neexistujúcom ID.
 */
export async function PATCH(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req, res)
  if (!customerId) return
  const id = req.params?.id
  if (!id) return res.status(400).json({ type: "invalid_data", message: "Chýba id záznamu." })
  try {
    const access = await resolveProgramAccess(req.scope, customerId)
    if (!access) {
      return res.status(403).json({ type: "forbidden", message: "Zrkadielko je dostupné len zákazníkom s programom RESET 40+." })
    }
    const body = (req.body ?? {}) as { date?: unknown; entry_date?: unknown; week?: unknown; metrics?: unknown }
    const rawDate = body.date ?? body.entry_date
    const hasDate = rawDate !== undefined && rawDate !== null
    const hasWeek = body.week !== undefined
    const hasMetrics = body.metrics !== undefined
    if (!hasDate && !hasWeek && !hasMetrics) {
      return res.status(400).json({ type: "invalid_data", message: "Nie je čo upraviť." })
    }
    if (hasMetrics && (!body.metrics || typeof body.metrics !== "object" || Array.isArray(body.metrics))) {
      return res.status(400).json({ type: "invalid_data", message: "Hodnotenia záznamu sú vo formáte objektu." })
    }
    const service = req.scope.resolve(RESET_JOURNAL_MODULE) as ResetJournalModuleService
    const entry = await service.updateEntry(
      id,
      customerId,
      access.program,
      {
        ...(hasDate ? { entry_date: rawDate as string | Date } : {}),
        ...(hasWeek ? { week: body.week } : {}),
        ...(hasMetrics ? { metrics: body.metrics } : {}),
      },
      access.metrics,
    )
    if (!entry) return res.status(404).json({ type: "not_found", message: "Záznam neexistuje." })
    res.setHeader("Cache-Control", "private, no-store")
    return res.status(200).json({ entry: journalEntryDTO(entry) })
  } catch (error) {
    return sendJournalError(req, res, error)
  }
}

/**
 * DELETE /store/reset-journal/:id – zmazanie VLASTNÉHO záznamu.
 * Cudzí záznam sa nedá zmazať (404, rovnako ako pri neexistujúcom ID).
 */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req, res)
  if (!customerId) return
  const id = req.params?.id
  if (!id) return res.status(400).json({ type: "invalid_data", message: "Chýba id záznamu." })
  try {
    const access = await resolveProgramAccess(req.scope, customerId)
    if (!access) {
      return res.status(403).json({ type: "forbidden", message: "Zrkadielko je dostupné len zákazníkom s programom RESET 40+." })
    }
    const service = req.scope.resolve(RESET_JOURNAL_MODULE) as ResetJournalModuleService
    const deleted = await service.deleteEntry(id, customerId, access.program)
    if (!deleted) return res.status(404).json({ type: "not_found", message: "Záznam neexistuje." })
    res.setHeader("Cache-Control", "private, no-store")
    return res.status(200).json({ deleted: true, id })
  } catch (error) {
    return sendJournalError(req, res, error)
  }
}
