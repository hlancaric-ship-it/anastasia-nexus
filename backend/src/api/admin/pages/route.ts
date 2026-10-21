/**
 * GET /admin/pages – zoznam textov stránok webu so znením (predvolené aj uložené).
 * POST /admin/pages – uloženie znenia jednej stránky.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { adminActor, auditAdminChange } from '../../../lib/observability/audit'
import { pageDefinitions, isPageSlug, validatePageHtml } from '../../../lib/pages/policy'
import { seedPage } from '../../../lib/content/policy'
import { readPages, readStore, writePages, writeStoreMetadata } from '../../../lib/pages/store'

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!adminActor(req)) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  try {
    const store = await readStore(req.scope)
    const pages = readPages(store?.metadata)
    return res.json({
      // Stránky, ktoré sú už v obsahu webu (seed zo storefrontu), sa tu neopakujú – edited sú v /admin/content.
      pages: pageDefinitions()
        .filter((def) => !seedPage(def.slug))
        .map((def) => {
          const stored = pages[def.slug]
          return {
            slug: def.slug,
            label: def.label,
            description: def.description,
            html: stored?.html ?? def.default_html,
            default_html: def.default_html,
            is_default: !stored,
            updated_at: stored?.updated_at ?? null,
            updated_by: stored?.updated_by ?? null,
          }
        }),
    })
  } catch {
    return res.status(503).json({ message: 'Texty stránok sa teraz nedajú načítať. Skúste to znova.' })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const body = (req.body ?? {}) as { slug?: unknown; html?: unknown }
  if (!isPageSlug(body.slug)) return res.status(400).json({ message: 'Neznámy text stránky.' })
  const validated = validatePageHtml(body.html)
  if (!validated.ok) return res.status(400).json({ message: validated.message })
  try {
    const store = await readStore(req.scope)
    if (!store) return res.status(503).json({ message: 'Text stránky sa teraz nedá uložiť. Skúste to znova.' })
    const before = readPages(store.metadata)
    const pages = { ...before, [body.slug]: { html: validated.html, updated_at: new Date().toISOString(), updated_by: actor } }
    await writeStoreMetadata(req.scope, store.id, writePages(store.metadata, pages))
    const verified = readPages((await readStore(req.scope))?.metadata)
    if (verified[body.slug]?.html !== validated.html) throw new Error('PAGE_READBACK_MISMATCH')
    await auditAdminChange(req, 'admin.page.update', 'store', store.id, { slug: body.slug, changed: before[body.slug] !== undefined }, { slug: body.slug })
    return res.json({ slug: body.slug, html: validated.html, updated_at: pages[body.slug].updated_at })
  } catch {
    return res.status(503).json({ message: 'Text stránky sa nepodarilo uložiť. Skúste to znova.' })
  }
}
