/**
 * GET /store/pages/:slug – aktuálne znenie textu stránky pre web (verejné, bez prihlásenia).
 * Web zatím znenie nenačítava; táto trasa je pripravená na pripojenie.
 */
import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { isPageSlug, pageDefault } from '../../../../lib/pages/policy'
import { readPages, readStore } from '../../../../lib/pages/store'

export const AUTHENTICATE = false

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const slug = req.params.slug
  if (!isPageSlug(slug)) return res.status(404).json({ message: 'Stránka neexistuje.' })
  try {
    const store = await readStore(req.scope)
    const stored = readPages(store?.metadata)[slug]
    const fallback = pageDefault(slug)
    res.setHeader('Cache-Control', 'public, max-age=60')
    return res.json({
      slug,
      label: fallback?.label ?? slug,
      html: stored?.html ?? fallback?.html ?? '',
      updated_at: stored?.updated_at ?? null,
    })
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).json({ message: 'Text stránky sa teraz nedá načítať.' })
  }
}
