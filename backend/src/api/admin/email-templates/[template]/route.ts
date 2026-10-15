import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { validateTexts } from "../../../../modules/notification-zeptomail/templates"
import { auditAdminChange } from "../../../../lib/observability/audit"
import { findOverride, requireAdmin, sendUnexpected, storedTexts, templateParam, templateResponse, templatesService } from "../shared"

/** GET /admin/email-templates/:template – texty (uložené aj predvolené), premenné a vypínač. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!requireAdmin(req, res)) return
  const def = templateParam(req, res)
  if (!def) return
  try {
    return res.json(templateResponse(def, await findOverride(req, def.name)))
  } catch (error) {
    return sendUnexpected(req, res, error, "detail", "Šablónu sa nepodarilo načítať.")
  }
}

/**
 * POST /admin/email-templates/:template { texts?: { slot: text|null }, enabled?: boolean }
 * `texts` nahradí všetky uložené prepisy (null alebo predvolený text = vrátiť predvolený).
 * Povinné šablóny (prihlásenie, poukazy) sa nedajú vypnúť.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const actorId = requireAdmin(req, res)
  if (!actorId) return
  const def = templateParam(req, res)
  if (!def) return
  const body = (req.body ?? {}) as { texts?: unknown; enabled?: unknown }
  const errors: string[] = []
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") errors.push("enabled: očakáva sa true alebo false")
  if (body.enabled === false && def.required) errors.push("enabled: tento e-mail sa nedá vypnúť")
  let texts: Record<string, string> | undefined
  if (body.texts !== undefined) {
    const valid = validateTexts(def.name, body.texts)
    if (valid.ok) texts = valid.texts
    else errors.push(...valid.errors)
  }
  if (errors.length) return res.status(400).json({ type: "invalid_data", errors, message: "Skontrolujte texty e-mailu." })

  try {
    const service = templatesService(req)
    const existing = await findOverride(req, def.name)
    const before = existing ? { texts: storedTexts(existing), enabled: existing.enabled } : null
    const next = { texts: texts ?? storedTexts(existing), enabled: typeof body.enabled === "boolean" ? body.enabled : existing?.enabled !== false }
    const isDefault = !Object.keys(next.texts).length && next.enabled
    let row = existing
    if (isDefault) {
      if (existing) await service.softDeleteEmailTemplateOverrides([existing.id])
      row = null
    } else if (existing) {
      row = await service.updateEmailTemplateOverrides({ id: existing.id, texts: next.texts, enabled: next.enabled, updated_by: actorId })
    } else {
      try {
        row = await service.createEmailTemplateOverrides({ template: def.name, texts: next.texts, enabled: next.enabled, updated_by: actorId })
      } catch (error) {
        // Súbežné prvé uloženie: unikátny index pustí len jedno, druhé prepíše.
        const raced = await findOverride(req, def.name)
        if (!raced) throw error
        row = await service.updateEmailTemplateOverrides({ id: raced.id, texts: next.texts, enabled: next.enabled, updated_by: actorId })
      }
    }
    await auditAdminChange(req, "email_template.update", "email_template", def.name, before, isDefault ? null : next)
    return res.json(templateResponse(def, row))
  } catch (error) {
    return sendUnexpected(req, res, error, "save", "Texty sa nepodarilo uložiť.")
  }
}

/** DELETE /admin/email-templates/:template – vráti predvolené texty a zapne e-mail. */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!requireAdmin(req, res)) return
  const def = templateParam(req, res)
  if (!def) return
  try {
    const existing = await findOverride(req, def.name)
    if (existing) {
      await templatesService(req).softDeleteEmailTemplateOverrides([existing.id])
      await auditAdminChange(req, "email_template.reset", "email_template", def.name, { texts: storedTexts(existing), enabled: existing.enabled }, null)
    }
    return res.json(templateResponse(def, null))
  } catch (error) {
    return sendUnexpected(req, res, error, "reset", "Predvolené texty sa nepodarilo obnoviť.")
  }
}
