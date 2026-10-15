import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { EMAIL_TEMPLATE_MODULE } from "../../modules/email-template"
import type { EmailTemplateOverrideRow } from "../../modules/email-template/service"
import { getTemplateDef, validateTexts } from "../../modules/notification-zeptomail/templates"
import { recordEvent } from "../observability/events"

/**
 * Jediná cesta odeslání transakčního e-mailu z backendu.
 *
 * - Přidá přepisy textů z adminu (`data.texts`) – provider sám k modulu `email-template` nemá přístup.
 * - Šablonu vypnutou v adminu nepošle (kromě povinných: přihlášení, poukazy).
 * - S `idempotency_key` pošle nejvýš jednou (opakovaný subscriber / retry).
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
  listNotifications: (filters: Record<string, unknown>, config?: Record<string, unknown>) => Promise<Array<{ id: string }>>
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
  if (input.idempotency_key) {
    const existing = await notifications.listNotifications({ idempotency_key: input.idempotency_key }, { take: 1, select: ["id"] })
    if (existing?.length) {
      await recordEvent(container as MedusaContainer, "info", "notification", "duplicate_suppressed", fields)
      return { status: "duplicate" }
    }
  }

  const data = { ...(input.data ?? {}) }
  if (Object.keys(settings.texts).length) data.texts = settings.texts
  else delete data.texts
  await notifications.createNotifications({
    to: input.to,
    channel: "email",
    template: input.template,
    data,
    ...(input.idempotency_key ? { idempotency_key: input.idempotency_key } : {}),
    ...(input.resource_id ? { resource_id: input.resource_id } : {}),
    ...(input.resource_type ? { resource_type: input.resource_type } : {}),
    ...(input.attachments ? { attachments: input.attachments } : {}),
  })
  return { status: "sent" }
}
