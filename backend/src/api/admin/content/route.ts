/**
 * GET /admin/content – celý obsah webu po sekciách (zo seeda + zmeny Lucy).
 * POST /admin/content – uloženie hodnoty jedného poľa (verzie sa ukladajú).
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { adminActor, auditAdminChange } from '../../../lib/observability/audit'
import { findSeedField, mergeContent, validateFieldValue } from '../../../lib/content/policy'
import { applyFieldChange, readContentOverrides, writeContentOverrides } from '../../../lib/content/store'
import { readStore, writeStoreMetadata } from '../../../lib/pages/store'

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!adminActor(req)) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  try {
    const store = await readStore(req.scope)
    const overrides = readContentOverrides(store?.metadata)
    const pages = mergeContent(overrides)
    return res.json({
      pages: pages.map((page) => ({
        key: page.key,
        title: page.title,
        path: page.path,
        changed: page.sections.some((s) => s.fields.some((f) => f.changed)),
        sections: page.sections.map((section) => ({
          key: section.key,
          title: section.title,
          order: section.order,
          changed: section.fields.some((f) => f.changed),
          fields: section.fields.map((field) => ({
            key: field.key,
            type: field.type,
            label: field.label,
            value: field.value,
            fallback: field.fallback,
            changed: !!field.changed,
            max_length: field.max_length,
            lang: field.lang,
            hint: field.hint ?? null,
            alt: field.alt ?? null,
            label_text: field.label_text ?? null,
            updated_at: field.updated_at ?? null,
            updated_by: field.updated_by ?? null,
            history: (field.history ?? []).map((h) => ({ value: h.value, updated_at: h.updated_at, updated_by: h.updated_by })),
          })),
        })),
      })),
    })
  } catch {
    return res.status(503).json({ message: 'Obsah webu sa teraz nedá načítať. Skúste to znova.' })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const body = (req.body ?? {}) as { page?: unknown; field?: unknown; value?: unknown }
  const pageKey = String(body.page ?? '').trim().toLowerCase()
  const fieldKey = String(body.field ?? '').trim()
  const found = findSeedField(pageKey, fieldKey)
  if (!found) return res.status(404).json({ message: 'Toto pole na webe neexistuje.' })
  const validated = validateFieldValue(found.field, body.value)
  if (!validated.ok) return res.status(400).json({ message: validated.message })
  try {
    const store = await readStore(req.scope)
    if (!store) return res.status(503).json({ message: 'Text sa teraz nedá uložiť. Skúste to znova.' })
    const overrides = readContentOverrides(store.metadata)
    const before = overrides.fields[fieldKey]?.value ?? found.field.fallback
    const next = applyFieldChange(overrides, fieldKey, validated.value, actor)
    await writeStoreMetadata(req.scope, store.id, writeContentOverrides(store.metadata, next))
    const verified = readContentOverrides((await readStore(req.scope))?.metadata)
    if (verified.fields[fieldKey]?.value !== validated.value) throw new Error('CONTENT_READBACK_MISMATCH')
    await auditAdminChange(req, 'admin.content.update', 'store', store.id, { page: pageKey, field: fieldKey }, { page: pageKey, field: fieldKey })
    return res.json({ ok: true, field: fieldKey, value: validated.value })
  } catch {
    return res.status(503).json({ message: 'Text sa nepodarilo uložiť. Skúste to znova.' })
  }
}
