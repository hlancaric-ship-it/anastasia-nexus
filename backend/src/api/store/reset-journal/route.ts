import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { RESET_JOURNAL_MODULE } from "../../../modules/reset-journal"
import type ResetJournalModuleService from "../../../modules/reset-journal/service"
import { resolveProgramAccess } from "../../../lib/reset-program/access"
import { journalEntryDTO, requireCustomer, sendJournalError } from "./helpers"

function intParam(value: unknown, fallback: number): number {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

/**
 * GET /store/reset-journal – vlastné záznamy zákazníka + konfigurácia hodnotení.
 * Bez aktívneho prístupu k programu endpoint neexistuje (403).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req, res)
  if (!customerId) return
  try {
    const access = await resolveProgramAccess(req.scope, customerId)
    if (!access) {
      return res.status(403).json({ type: "forbidden", message: "Zrkadielko je dostupné len zákazníkom s programom RESET 40+." })
    }
    const service = req.scope.resolve(RESET_JOURNAL_MODULE) as ResetJournalModuleService
    const limit = Math.min(Math.max(intParam(req.query?.limit, 50), 1), 200)
    const offset = Math.max(intParam(req.query?.offset, 0), 0)
    const { data, count } = await service.listEntries(customerId, access.program, { limit, offset })
    res.setHeader("Cache-Control", "private, no-store")
    return res.status(200).json({
      program: access.program,
      metrics: access.metrics,
      entries: data.map(journalEntryDTO),
      count,
      limit,
      offset,
    })
  } catch (error) {
    return sendJournalError(req, res, error)
  }
}

/**
 * POST /store/reset-journal – nový vlastný záznam.
 * Body: { date: "YYYY-MM-DD", week?: 1..16, metrics: { "<key>": 1..10 } }
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req, res)
  if (!customerId) return
  try {
    const access = await resolveProgramAccess(req.scope, customerId)
    if (!access) {
      return res.status(403).json({ type: "forbidden", message: "Zrkadielko je dostupné len zákazníkom s programom RESET 40+." })
    }
    const body = (req.body ?? {}) as { date?: unknown; entry_date?: unknown; week?: unknown; metrics?: unknown }
    const rawDate = body.date ?? body.entry_date
    if (typeof rawDate !== "string" && !(rawDate instanceof Date)) {
      return res.status(400).json({ type: "invalid_data", message: "Dátum záznamu je povinný." })
    }
    if (!body.metrics || typeof body.metrics !== "object" || Array.isArray(body.metrics)) {
      return res.status(400).json({ type: "invalid_data", message: "Hodnotenia záznamu sú povinné." })
    }
    const service = req.scope.resolve(RESET_JOURNAL_MODULE) as ResetJournalModuleService
    const entry = await service.createEntry(
      {
        customer_id: customerId,
        program: access.program,
        entitlement_id: access.entitlement_id,
        week: body.week ?? null,
        entry_date: rawDate as string | Date,
        metrics: body.metrics,
      },
      access.metrics,
    )
    res.setHeader("Cache-Control", "private, no-store")
    return res.status(201).json({ entry: journalEntryDTO(entry) })
  } catch (error) {
    return sendJournalError(req, res, error)
  }
}
