import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { logEvent, type LoggerLike } from "../lib/observability/log"
import { OPS_AUDIT_MODULE } from "../modules/ops-audit"
import { retentionCutoff } from "../modules/ops-audit/events-policy"

type RetentionService = {
  listOpsEvents: (f: Record<string, unknown>, c: Record<string, unknown>) => Promise<{ id: string }[]>
  deleteOpsEvents: (ids: string[]) => Promise<void>
  listOpsAuditEntries: (f: Record<string, unknown>, c: Record<string, unknown>) => Promise<{ id: string }[]>
  deleteOpsAuditEntries: (ids: string[]) => Promise<void>
}

const BATCH = 500
const MAX_BATCHES = 20

async function purge(list: (f: Record<string, unknown>, c: Record<string, unknown>) => Promise<{ id: string }[]>, remove: (ids: string[]) => Promise<void>, cutoff: Date): Promise<number> {
  let removed = 0
  for (let i = 0; i < MAX_BATCHES; i++) {
    const rows = await list({ created_at: { $lt: cutoff } }, { select: ["id"], take: BATCH, order: { created_at: "ASC" } })
    if (!rows.length) break
    await remove(rows.map((row) => row.id))
    removed += rows.length
    if (rows.length < BATCH) break
  }
  return removed
}

/**
 * Retence provozních logů: `OPS_EVENT_RETENTION_DAYS` (výchozí 90, 7–730) a auditu admin změn
 * `OPS_AUDIT_RETENTION_DAYS` (výchozí 1095, 365–3650). Maže dávkově, nejvýše 10 000 řádků na běh.
 */
export default async function opsRetentionJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as unknown as LoggerLike
  try {
    const service = container.resolve(OPS_AUDIT_MODULE) as RetentionService
    const events = await purge(service.listOpsEvents.bind(service), service.deleteOpsEvents.bind(service),
      retentionCutoff(process.env.OPS_EVENT_RETENTION_DAYS, 90, 7, 730))
    const audit = await purge(service.listOpsAuditEntries.bind(service), service.deleteOpsAuditEntries.bind(service),
      retentionCutoff(process.env.OPS_AUDIT_RETENTION_DAYS, 1095, 365, 3650))
    if (events || audit) logEvent(logger, "info", "job", "ops_retention", { events_removed: events, audit_removed: audit })
  } catch (error) {
    logEvent(logger, "error", "job", "ops_retention_failed", { error })
  }
}

export const config = { name: "ops-retention", schedule: "17 3 * * *" }
