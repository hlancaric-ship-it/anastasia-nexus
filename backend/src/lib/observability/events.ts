import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OPS_AUDIT_MODULE } from "../../modules/ops-audit"
import { buildOpsEvent } from "../../modules/ops-audit/events-policy"
import { currentRequestId, logEvent, type LogDomain, type LogFields, type LoggerLike, type LogLevel } from "./log"

type EventService = { createOpsEvents: (data: ReturnType<typeof buildOpsEvent>) => Promise<{ id: string }> }

/**
 * Provozní událost: vždy strukturovaný stdout log a k tomu trvalý záznam `ops_event` pro admin přehled.
 * Nikdy nevyhodí – selhání zápisu jen zaloguje (`ops_event_write_failed`), obchodní operace pokračuje.
 */
export async function recordEvent(scope: MedusaContainer, level: LogLevel, domain: LogDomain, event: string, fields: LogFields = {}): Promise<void> {
  let logger: LoggerLike | null = null
  try {
    logger = scope.resolve(ContainerRegistrationKeys.LOGGER) as unknown as LoggerLike
    logEvent(logger, level, domain, event, fields)
    const entry = buildOpsEvent(level, domain, event, fields, fields.request_id ?? currentRequestId() ?? null)
    await (scope.resolve(OPS_AUDIT_MODULE) as EventService).createOpsEvents(entry)
  } catch (error) {
    if (logger) logEvent(logger, "error", domain, "ops_event_write_failed", { failed_event: event, error })
  }
}
