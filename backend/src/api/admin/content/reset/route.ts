/**
 * POST /admin/content/reset – obnovenie poľa na pôvodné znenie (zo seeda)
 * alebo na staršiu verziu (version = index v zozname verzií).
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { adminActor, auditAdminChange } from '../../../../lib/observability/audit'
import { findSeedField, contentRevision } from '../../../../lib/content/policy'
import { applyFieldChange, readContentOverrides, writeContentOverrides } from '../../../../lib/content/store'
import { readStore, writeStoreMetadata } from '../../../../lib/pages/store'
import { REVISION_CONFLICT_MESSAGE, isRevisionConflict } from '../../../../lib/revision'

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const body = (req.body ?? {}) as { page?: unknown; field?: unknown; version?: unknown; revision?: unknown }
  const pageKey = String(body.page ?? '').trim().toLowerCase()
  const fieldKey = String(body.field ?? '').trim()
  const found = findSeedField(pageKey, fieldKey)
  if (!found) return res.status(404).json({ message: 'Toto pole na webe neexistuje.' })
  try {
    const store = await readStore(req.scope)
    if (!store) return res.status(503).json({ message: 'Pôvodné znenie sa teraz nedá obnoviť. Skúste to znova.' })
    const overrides = readContentOverrides(store.metadata)
    // Ochrana proti súbežnému ukladaniu: ak sa pole medzitým zmenilo, obnovenie sa odmietne.
    const currentRevision = contentRevision(overrides.fields[fieldKey]?.updated_at)
    if (isRevisionConflict(body.revision, currentRevision)) {
      return res.status(409).json({ message: REVISION_CONFLICT_MESSAGE })
    }
    const version = body.version === undefined || body.version === null ? null : Number(body.version)
    let value = found.field.fallback
    if (version !== null && Number.isInteger(version)) {
      const history = overrides.fields[fieldKey]?.history ?? []
      const entry = history[version]
      if (!entry) return res.status(400).json({ message: 'Táto verzia už nie je dostupná.' })
      value = entry.value
    }
    const next = applyFieldChange(overrides, fieldKey, value, actor)
    await writeStoreMetadata(req.scope, store.id, writeContentOverrides(store.metadata, next))
    await auditAdminChange(req, 'admin.content.reset', 'store', store.id, { page: pageKey, field: fieldKey }, { page: pageKey, field: fieldKey, version })
    return res.json({ ok: true, field: fieldKey, value })
  } catch {
    return res.status(503).json({ message: 'Pôvodné znenie sa nepodarilo obnoviť. Skúste to znova.' })
  }
}
