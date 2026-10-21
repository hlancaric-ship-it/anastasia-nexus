/**
 * DELETE /admin/pages/:slug – obnoví pôvodné (predvolené) znenie stránky.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { adminActor, auditAdminChange } from '../../../../lib/observability/audit'
import { isPageSlug, pageDefault } from '../../../../lib/pages/policy'
import { readPages, readStore, writePages, writeStoreMetadata } from '../../../../lib/pages/store'

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const slug = req.params.slug
  if (!isPageSlug(slug)) return res.status(404).json({ message: 'Neznámy text stránky.' })
  try {
    const store = await readStore(req.scope)
    if (!store) return res.status(503).json({ message: 'Text stránky sa teraz nedá obnoviť. Skúste to znova.' })
    const before = readPages(store.metadata)
    if (!before[slug]) return res.status(404).json({ message: 'Tento text stránky ešte nikto nemenil.' })
    const pages = { ...before }
    delete pages[slug]
    await writeStoreMetadata(req.scope, store.id, writePages(store.metadata, pages))
    await auditAdminChange(req, 'admin.page.reset', 'store', store.id, { slug }, { slug })
    const fallback = pageDefault(slug)
    return res.json({ slug, html: fallback?.html ?? '', is_default: true })
  } catch {
    return res.status(503).json({ message: 'Pôvodné znenie sa nepodarilo obnoviť. Skúste to znova.' })
  }
}
