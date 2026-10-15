import { redact } from "../../lib/observability/log"

export type AuditChanges = Record<string, { from: unknown; to: unknown }>

export type AuditInput = {
  actor_type: "user" | "system"
  actor_id: string
  action: string
  entity_type: string
  entity_id?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  request_id?: string | null
}

const ACTION_RE = /^[a-z][a-z0-9_.:-]{2,79}$/
const ENTITY_RE = /^[a-z][a-z0-9_]{1,59}$/

const stable = (value: unknown): string => JSON.stringify(value, (_k, v) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)

/**
 * Diff jen změněných polí (mělký, na úrovni klíčů nastavení), hodnoty už zredigované.
 * Vytvoření = `before` null, smazání/archivace = `after` null.
 */
export function diffForAudit(before?: Record<string, unknown> | null, after?: Record<string, unknown> | null): AuditChanges {
  const b = (redact(before ?? {}) ?? {}) as Record<string, unknown>
  const a = (redact(after ?? {}) ?? {}) as Record<string, unknown>
  const changes: AuditChanges = {}
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (["updated_at", "created_at", "deleted_at"].includes(key)) continue
    if (stable(b[key]) !== stable(a[key])) changes[key] = { from: b[key] ?? null, to: a[key] ?? null }
  }
  return changes
}

/** Validace a normalizace vstupu auditu; vyhodí chybu při neplatném actor/action/entity (chyba programátora). */
export function buildAuditEntry(input: AuditInput) {
  if (!input.actor_id || !["user", "system"].includes(input.actor_type)) throw new Error("OPS_AUDIT_INVALID_ACTOR")
  if (!ACTION_RE.test(input.action)) throw new Error("OPS_AUDIT_INVALID_ACTION")
  if (!ENTITY_RE.test(input.entity_type)) throw new Error("OPS_AUDIT_INVALID_ENTITY")
  return {
    actor_type: input.actor_type,
    actor_id: input.actor_id,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    changes: diffForAudit(input.before, input.after),
    request_id: input.request_id ?? null,
  }
}

export const AUDIT_PAGE_MAX = 100

/** Stránkování pro čtecí API auditu (limit 1–100, offset ≥ 0). */
export function auditPage(query: Record<string, unknown> | undefined): { limit: number; offset: number } {
  const limit = Math.min(AUDIT_PAGE_MAX, Math.max(1, Number.parseInt(String(query?.limit ?? 50), 10) || 50))
  const offset = Math.max(0, Number.parseInt(String(query?.offset ?? 0), 10) || 0)
  return { limit, offset }
}
