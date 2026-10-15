import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { validTexts } from "../../../lib/email/send"
import { EMAIL_TEMPLATE_MODULE } from "../../../modules/email-template"
import type { EmailTemplateOverrideRow } from "../../../modules/email-template/service"
import { getTemplateDef, type TemplateDef } from "../../../modules/notification-zeptomail/templates"

/** Prihlásený správca, žiadne cache. Vracia ID správcu alebo null (odpoveď už odoslaná). */
export function requireAdmin(req: AuthenticatedMedusaRequest, res: MedusaResponse): string | null {
  res.setHeader("Cache-Control", "no-store")
  if (!req.auth_context?.actor_id || req.auth_context.actor_type !== "user") {
    res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
    return null
  }
  return req.auth_context.actor_id
}

type Service = {
  listEmailTemplateOverrides: (f: Record<string, unknown>, c?: Record<string, unknown>) => Promise<EmailTemplateOverrideRow[]>
  createEmailTemplateOverrides: (data: Record<string, unknown>) => Promise<EmailTemplateOverrideRow>
  updateEmailTemplateOverrides: (data: Record<string, unknown>) => Promise<EmailTemplateOverrideRow>
  softDeleteEmailTemplateOverrides: (ids: string[]) => Promise<unknown>
}

export const templatesService = (req: AuthenticatedMedusaRequest) => req.scope.resolve(EMAIL_TEMPLATE_MODULE) as unknown as Service

/** Šablona z URL; neznáma → 404 (odpoveď odoslaná, vracia null). */
export function templateParam(req: AuthenticatedMedusaRequest, res: MedusaResponse): TemplateDef | null {
  const def = getTemplateDef(String(req.params.template ?? ""))
  if (!def) {
    res.status(404).json({ type: "not_found", message: "Šablóna e-mailu neexistuje." })
    return null
  }
  return def
}

export async function findOverride(req: AuthenticatedMedusaRequest, template: string): Promise<EmailTemplateOverrideRow | null> {
  const [row] = await templatesService(req).listEmailTemplateOverrides({ template }, { take: 1 })
  return row ?? null
}

/** Platné uložené prepisy (neplatné po zmene šablóny v kóde sa nezobrazia ani nepoužijú). */
export function storedTexts(row: EmailTemplateOverrideRow | null): Record<string, string> {
  return row ? validTexts(row.template, row.texts) : {}
}

export function templateResponse(def: TemplateDef, row: EmailTemplateOverrideRow | null) {
  const texts = storedTexts(row)
  return {
    template: {
      ...def,
      enabled: def.required ? true : row?.enabled !== false,
      customized: Object.keys(texts).length > 0 || row?.enabled === false,
      texts,
      slots: def.slots.map(slot => ({ ...slot, value: Object.prototype.hasOwnProperty.call(texts, slot.key) ? texts[slot.key] : slot.default })),
      updated_at: row?.updated_at ?? null,
    },
  }
}

export function sendUnexpected(req: AuthenticatedMedusaRequest, res: MedusaResponse, error: unknown, context: string, message: string) {
  req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(`[email-template] ${context} selhalo`, error instanceof Error ? error : new Error("unknown"))
  return res.status(500).json({ type: "unexpected_state", message })
}
