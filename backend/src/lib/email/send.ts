import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules, NotificationStatus } from "@medusajs/framework/utils"
import { EMAIL_TEMPLATE_MODULE } from "../../modules/email-template"
import type { EmailTemplateOverrideRow } from "../../modules/email-template/service"
import { getTemplateDef, validateTexts } from "../../modules/notification-zeptomail/templates"
import { recordEvent } from "../observability/events"

/**
 * Jediná cesta odeslání transakčního e-mailu z backendu.
 *
 * - Přidá přepisy textů z adminu (`data.texts`) – provider sám k modulu `email-template` nemá přístup.
 * - Šablonu vypnutou v adminu nepošle (kromě povinných: přihlášení, poukazy, kontaktní formulář).
 * - S `idempotency_key` potlačí jen prokázaný úspěch; pending/failure nesmí spustit slepý retry.
 * - Selhání načtení přepisů e-mail nezastaví – pošle se s výchozími texty.
 * - Selhání odeslání vyhodí; volající rozhodne (subscribery chybu jen zapíší, poukaz ji potřebuje pro opakování).
 */
type Container = Pick<MedusaContainer, "resolve">

export type SendEmailInput = {
  to: string
  template: string
  data?: Record<string, unknown>
  idempotency_key?: string
  resource_id?: string
  resource_type?: string
  attachments?: Array<{ content: string; filename: string; content_type: string }>
}

export type SendEmailResult = { status: "sent" | "duplicate" | "disabled" }

type NotificationService = {
  createNotifications: (data: Record<string, unknown>) => Promise<unknown>
  listNotifications: (filters: Record<string, unknown>, config?: Record<string, unknown>) => Promise<NotificationRow[]>
}
type NotificationRow = { id: string; status: string; to: string; channel: string; template: string; idempotency_key?: string | null; resource_id?: string | null; resource_type?: string | null }
const receiptSelect = ["id", "status", "to", "channel", "template", "idempotency_key", "resource_id", "resource_type"]

export class EmailOutcomeUnknownError extends Error {
  constructor() { super("EMAIL_OUTCOME_REQUIRES_REVIEW"); this.name = "EmailOutcomeUnknownError" }
}

function confirmed(row: NotificationRow, input: SendEmailInput): boolean {
  return typeof row.id === "string" && !!row.id && row.status === NotificationStatus.SUCCESS &&
    row.channel === "email" && row.template === input.template && row.to === input.to &&
    (!input.idempotency_key || row.idempotency_key === input.idempotency_key) &&
    (!input.resource_id || row.resource_id === input.resource_id) &&
    (!input.resource_type || row.resource_type === input.resource_type)
}
type TemplateService = { listEmailTemplateOverrides: (f: Record<string, unknown>, c?: Record<string, unknown>) => Promise<EmailTemplateOverrideRow[]> }

export type TemplateSettings = { texts: Record<string, string>; enabled: boolean }

/** Jen platné přepisy (po změně šablony v kódu může být některý neplatný – ten se přeskočí, ostatní platí). */
export function validTexts(template: string, texts: unknown): Record<string, string> {
  if (!texts || typeof texts !== "object" || Array.isArray(texts)) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(texts as Record<string, unknown>)) {
    const single = validateTexts(template, { [key]: value })
    if (single.ok && Object.prototype.hasOwnProperty.call(single.texts, key)) out[key] = single.texts[key]
  }
  return out
}

/** Uložené přepisy šablony; bez modulu nebo při chybě výchozí stav (texty z kódu, zapnuto). */
export async function loadTemplateSettings(container: Container, template: string): Promise<TemplateSettings> {
  const fallback = { texts: {}, enabled: true }
  let service: TemplateService | null = null
  try { service = container.resolve(EMAIL_TEMPLATE_MODULE) as TemplateService } catch { return fallback }
  if (!service?.listEmailTemplateOverrides) return fallback
  try {
    const [row] = await service.listEmailTemplateOverrides({ template }, { take: 1 })
    if (!row) return fallback
    return { texts: validTexts(template, row.texts), enabled: row.enabled !== false }
  } catch (error) {
    await recordEvent(container as MedusaContainer, "warn", "notification", "template_settings_failed", { template, error })
    return fallback
  }
}

export async function sendEmail(container: Container, input: SendEmailInput): Promise<SendEmailResult> {
  const def = getTemplateDef(input.template)
  const settings = await loadTemplateSettings(container, input.template)
  const fields = { template: input.template, resource_type: input.resource_type, resource_id: input.resource_id }
  if (!settings.enabled && def && !def.required) {
    await recordEvent(container as MedusaContainer, "info", "notification", "template_disabled", fields)
    return { status: "disabled" }
  }

  const notifications = container.resolve(Modules.NOTIFICATION) as unknown as NotificationService
  const uncertain = async (reason: string): Promise<never> => {
    await recordEvent(container as MedusaContainer, "error", "notification", "outcome_requires_review", { ...fields, reason })
    throw new EmailOutcomeUnknownError()
  }
  if (input.idempotency_key) {
    let existing: NotificationRow[]
    try {
      existing = await notifications.listNotifications({ idempotency_key: input.idempotency_key }, { take: 2, select: receiptSelect })
    } catch { return uncertain("LOOKUP_UNAVAILABLE") }
    if (existing?.length) {
      if (existing.length !== 1 || !confirmed(existing[0]!, input)) return uncertain("EXISTING_UNCONFIRMED")
      await recordEvent(container as MedusaContainer, "info", "notification", "duplicate_suppressed", fields)
      return { status: "duplicate" }
    }
  }

  const data = { ...(input.data ?? {}) }
  if (Object.keys(settings.texts).length) data.texts = settings.texts
  else delete data.texts
  let created: unknown
  try {
    created = await notifications.createNotifications({
      to: input.to,
      channel: "email",
      template: input.template,
      data,
      ...(input.idempotency_key ? { idempotency_key: input.idempotency_key } : {}),
      ...(input.resource_id ? { resource_id: input.resource_id } : {}),
      ...(input.resource_type ? { resource_type: input.resource_type } : {}),
      ...(input.attachments ? { attachments: input.attachments } : {}),
    })
  } catch { return uncertain("SEND_UNCONFIRMED") }
  // Native createNotifications(single DTO) returns one object, or undefined
  // when another attempt already created the key. Read persisted state in both cases.
  const id = created && !Array.isArray(created) && typeof (created as NotificationRow).id === "string" ? (created as NotificationRow).id : null
  if (!id && !input.idempotency_key) return uncertain("MISSING_RECEIPT")
  let receipts: NotificationRow[]
  try {
    receipts = await notifications.listNotifications(id ? { id } : { idempotency_key: input.idempotency_key }, { take: 2, select: receiptSelect })
  } catch { return uncertain("READBACK_UNAVAILABLE") }
  if (receipts.length !== 1 || !confirmed(receipts[0]!, input) || (id && receipts[0]!.id !== id)) return uncertain("READBACK_UNCONFIRMED")
  return { status: id ? "sent" : "duplicate" }
}
