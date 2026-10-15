import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OPS_AUDIT_MODULE } from "../../modules/ops-audit"
import { buildAuditEntry, type AuditInput } from "../../modules/ops-audit/policy"
import { currentRequestId, logEvent, type LoggerLike } from "./log"

type AuditService = { createOpsAuditEntries: (data: ReturnType<typeof buildAuditEntry>) => Promise<{ id: string }> }

/**
 * Zapíše změnu do trvalého auditu a zároveň strukturovaný log `admin_audit`.
 * Volá se PO úspěšné změně. Selhání zápisu auditu změnu nevrací (ta už proběhla), ale zaloguje se
 * jako `error` s `audit_write_failed`, aby ho monitoring zachytil – nikdy se neztratí potichu.
 */
export async function recordAudit(scope: MedusaContainer, input: Omit<AuditInput, "request_id"> & { request_id?: string | null }): Promise<string | null> {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER) as unknown as LoggerLike
  let entry: ReturnType<typeof buildAuditEntry>
  try {
    entry = buildAuditEntry({ ...input, request_id: input.request_id ?? currentRequestId() ?? null })
  } catch (error) {
    // chyba programátora (neplatná akce/entita) nesmí po úspěšné změně vrátit klientovi 500
    logEvent(logger, "error", "admin_audit", "audit_invalid_input", { action: input.action, entity_type: input.entity_type, error })
    return null
  }
  try {
    const service = scope.resolve(OPS_AUDIT_MODULE) as AuditService
    const saved = await service.createOpsAuditEntries(entry)
    logEvent(logger, "info", "admin_audit", entry.action, {
      audit_id: saved.id, actor_type: entry.actor_type, actor_id: entry.actor_id,
      entity_type: entry.entity_type, entity_id: entry.entity_id, changed_fields: Object.keys(entry.changes),
    })
    return saved.id
  } catch (error) {
    logEvent(logger, "error", "admin_audit", "audit_write_failed", {
      action: entry.action, entity_type: entry.entity_type, entity_id: entry.entity_id, actor_id: entry.actor_id, error,
    })
    return null
  }
}

/** Zkratka pro admin routy: actor z `auth_context` (jen typ `user`). */
export function adminActor(req: { auth_context?: { actor_type?: string; actor_id?: string } }): string | null {
  return req.auth_context?.actor_type === "user" && req.auth_context.actor_id ? req.auth_context.actor_id : null
}

/** Audit změny z admin routy (aktér = přihlášený admin). Nikdy nevyhodí. */
export function auditAdminChange(
  req: { scope: MedusaContainer; auth_context?: { actor_type?: string; actor_id?: string } },
  action: string, entity_type: string, entity_id: string | null,
  before: Record<string, unknown> | null, after: Record<string, unknown> | null,
): Promise<string | null> {
  return recordAudit(req.scope, { actor_type: "user", actor_id: adminActor(req) ?? "unknown_admin", action, entity_type, entity_id, before, after })
}
