import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { logEvent, type LoggerLike } from "../../../../lib/observability/log"
import { OPS_AUDIT_MODULE } from "../../../../modules/ops-audit"
import { EdgeIngestError, parseEdgeBatch, resolveIngestTenant, verifyEdgeSignature } from "../../../../modules/ops-audit/edge-ingest"

type EventService = { createOpsEvents: (data: unknown[]) => Promise<unknown[]> }

/** POST /hooks/ops/edge-events: podepsaná dávka provozních událostí z NEXUS Workeru. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as unknown as LoggerLike
  try {
    const raw = (req as MedusaRequest & { rawBody?: Buffer | string }).rawBody
    const rawBody = Buffer.isBuffer(raw) ? raw.toString("utf8") : typeof raw === "string" ? raw : ""
    // podpis až po kontrole konfigurace tenanta; obojí před parsováním těla
    resolveIngestTenant()
    verifyEdgeSignature(process.env.OPS_INGEST_SECRET, req.headers["x-nexus-timestamp"], req.headers["x-nexus-signature"], rawBody)
    const tenant = resolveIngestTenant()
    const { events, rejected } = parseEdgeBatch(rawBody, tenant)
    if (events.length) await (req.scope.resolve(OPS_AUDIT_MODULE) as EventService).createOpsEvents(events)
    if (rejected) logEvent(logger, "warn", "edge", "ingest_rejected_items", { rejected, accepted: events.length })
    return res.status(202).json({ accepted: events.length, rejected })
  } catch (error) {
    if (error instanceof EdgeIngestError) {
      logEvent(logger, "warn", "edge", "ingest_refused", { error_code: error.code, http_status: error.status })
      return res.status(error.status).json({ error: error.code })
    }
    logEvent(logger, "error", "edge", "ingest_failed", { error })
    return res.status(500).json({ error: "INGEST_FAILED" })
  }
}
