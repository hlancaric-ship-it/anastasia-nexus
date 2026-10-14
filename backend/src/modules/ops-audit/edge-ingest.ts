import { createHmac, timingSafeEqual } from "node:crypto"
import type { LogLevel } from "../../lib/observability/log"
import { buildOpsEvent } from "./events-policy"

/**
 * Příjem provozních událostí z NEXUS Workeru (Cloudflare) do `ops_event`.
 * Podpis: hex HMAC-SHA256(`${timestamp}.${rawBody}`) sdíleným `OPS_INGEST_SECRET` (min. 32 znaků),
 * hlavičky `x-nexus-timestamp` (unix s) a `x-nexus-signature`. Okno ±300 s.
 */
export const EDGE_INGEST_MAX_EVENTS = 100
export const EDGE_INGEST_MAX_BYTES = 256 * 1024
const SKEW_SECONDS = 300
const SIG_RE = /^[0-9a-f]{64}$/
const LEVELS: LogLevel[] = ["info", "warn", "error"]

export class EdgeIngestError extends Error {
  constructor(public code: "INGEST_NOT_CONFIGURED" | "INGEST_UNAUTHORIZED" | "INGEST_INVALID", public status: number) {
    super(code)
  }
}

export function signEdgeBatch(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")
}

export function verifyEdgeSignature(secret: string | undefined, timestamp: unknown, signature: unknown, rawBody: string, nowMs = Date.now()): void {
  if (!secret || secret.length < 32) throw new EdgeIngestError("INGEST_NOT_CONFIGURED", 503)
  if (typeof timestamp !== "string" || !/^\d{9,11}$/.test(timestamp)) throw new EdgeIngestError("INGEST_UNAUTHORIZED", 401)
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > SKEW_SECONDS) throw new EdgeIngestError("INGEST_UNAUTHORIZED", 401)
  if (typeof signature !== "string" || !SIG_RE.test(signature)) throw new EdgeIngestError("INGEST_UNAUTHORIZED", 401)
  const expected = Buffer.from(signEdgeBatch(secret, timestamp, rawBody), "hex")
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw new EdgeIngestError("INGEST_UNAUTHORIZED", 401)
}

/** Validace dávky; neplatné jednotlivé záznamy se přeskočí a spočítají, celá dávka kvůli nim nepadá. */
export function parseEdgeBatch(rawBody: string): { events: ReturnType<typeof buildOpsEvent>[]; rejected: number } {
  if (rawBody.length > EDGE_INGEST_MAX_BYTES) throw new EdgeIngestError("INGEST_INVALID", 413)
  let body: unknown
  try { body = JSON.parse(rawBody) } catch { throw new EdgeIngestError("INGEST_INVALID", 400) }
  const list = (body as { events?: unknown })?.events
  if (!Array.isArray(list) || list.length > EDGE_INGEST_MAX_EVENTS) throw new EdgeIngestError("INGEST_INVALID", 400)
  const events: ReturnType<typeof buildOpsEvent>[] = []
  let rejected = 0
  for (const item of list) {
    try {
      if (!item || typeof item !== "object") throw new Error("shape")
      const { level, event, ts, request_id, ...fields } = item as Record<string, unknown>
      const lvl = (level === "debug" ? "info" : level) as LogLevel
      if (!LEVELS.includes(lvl) || typeof event !== "string") throw new Error("shape")
      const edgeTs = typeof ts === "string" && !Number.isNaN(Date.parse(ts)) ? new Date(ts).toISOString() : null
      // stack ani volné zprávy z Workeru se neukládají
      delete fields.stack
      delete fields.message
      events.push(buildOpsEvent(lvl, "edge", event.toLowerCase(), { ...fields, edge_ts: edgeTs }, typeof request_id === "string" ? request_id : null))
    } catch {
      rejected++
    }
  }
  return { events, rejected }
}
