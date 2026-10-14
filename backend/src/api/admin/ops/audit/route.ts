import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor } from "../../../../lib/observability/audit"
import { logEvent, type LoggerLike } from "../../../../lib/observability/log"
import { OPS_AUDIT_MODULE } from "../../../../modules/ops-audit"
import { auditPage } from "../../../../modules/ops-audit/policy"

type AuditService = {
  listAndCountOpsAuditEntries: (filters: Record<string, unknown>, config: Record<string, unknown>) => Promise<[unknown[], number]>
}

const FILTER_RE = /^[A-Za-z0-9_.:-]{1,80}$/

/**
 * GET /admin/ops/audit?entity_type=&entity_id=&actor_id=&action=&limit=&offset=
 * Čtení trvalého auditu změn (nejnovější první). Jen správce; záznamy jsou už zredigované.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Vyžaduje se přihlášení správce." })
  const filters: Record<string, string> = {}
  for (const key of ["entity_type", "entity_id", "actor_id", "action"]) {
    const value = req.query?.[key]
    if (value === undefined || value === "") continue
    if (typeof value !== "string" || !FILTER_RE.test(value)) return res.status(400).json({ message: `Neplatný filtr ${key}.` })
    filters[key] = value
  }
  const { limit, offset } = auditPage(req.query as Record<string, unknown>)
  try {
    const service = req.scope.resolve(OPS_AUDIT_MODULE) as AuditService
    const [entries, count] = await service.listAndCountOpsAuditEntries(filters, { take: limit, skip: offset, order: { created_at: "DESC" } })
    return res.json({ entries, count, limit, offset })
  } catch (error) {
    logEvent(req.scope.resolve(ContainerRegistrationKeys.LOGGER) as unknown as LoggerLike, "error", "admin_audit", "audit_read_failed", { error })
    return res.status(500).json({ message: "Audit se nepodařilo načíst." })
  }
}
