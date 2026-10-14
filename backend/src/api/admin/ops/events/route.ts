import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor } from "../../../../lib/observability/audit"
import { logEvent, type LoggerLike } from "../../../../lib/observability/log"
import { OPS_AUDIT_MODULE } from "../../../../modules/ops-audit"
import { parseOpsEventQuery } from "../../../../modules/ops-audit/events-policy"
import { auditPage } from "../../../../modules/ops-audit/policy"

type EventService = {
  listAndCountOpsEvents: (filters: Record<string, unknown>, config: Record<string, unknown>) => Promise<[unknown[], number]>
}

/**
 * GET /admin/ops/events?request_id=&order_id=&cart_id=&customer_id=&entity_id=&domain=&level=&event=&from=&to=&limit=&offset=
 * Trvalé provozní události (nejnovější první). Jen správce; pole jsou už zredigovaná.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Vyžaduje se přihlášení správce." })
  const parsed = parseOpsEventQuery(req.query as Record<string, unknown>)
  if ("error" in parsed) return res.status(400).json({ message: parsed.error })
  const { limit, offset } = auditPage(req.query as Record<string, unknown>)
  try {
    const service = req.scope.resolve(OPS_AUDIT_MODULE) as EventService
    const [events, count] = await service.listAndCountOpsEvents(parsed.filters, { take: limit, skip: offset, order: { created_at: "DESC" } })
    return res.json({ events, count, limit, offset })
  } catch (error) {
    logEvent(req.scope.resolve(ContainerRegistrationKeys.LOGGER) as unknown as LoggerLike, "error", "admin_audit", "ops_events_read_failed", { error })
    return res.status(500).json({ message: "Provozní události se nepodařilo načíst." })
  }
}
