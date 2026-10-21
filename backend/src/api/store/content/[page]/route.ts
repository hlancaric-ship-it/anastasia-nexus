/**
 * GET /store/content/:page – obsah stránky webu pre storefronte (verejné, bez prihlásenia).
 * Vracia všetky polia stránky: hodnotu zo zmeny, ak existuje, inak pôvodný text zo seeda.
 */
import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { mergeContent, seedPage } from '../../../../lib/content/policy'
import { readContentOverrides } from '../../../../lib/content/store'
import { readStore } from '../../../../lib/pages/store'

export const AUTHENTICATE = false

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pageKey = String(req.params.page ?? '').trim().toLowerCase()
  const seed = seedPage(pageKey)
  if (!seed) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(404).json({ message: 'Stránka neexistuje.' })
  }
  try {
    const store = await readStore(req.scope)
    const overrides = readContentOverrides(store?.metadata)
    const page = mergeContent(overrides).find((p) => p.key === pageKey)!
    res.setHeader('Cache-Control', 'public, max-age=60')
    return res.json({
      page: { key: page.key, title: page.title, path: page.path },
      sections: page.sections.map((section) => ({
        key: section.key,
        title: section.title,
        order: section.order,
        fields: section.fields.map((field) => ({
          key: field.key,
          type: field.type,
          label: field.label,
          value: field.value,
          fallback: field.fallback,
          lang: field.lang,
          max_length: field.max_length,
          hint: field.hint ?? null,
          alt: field.alt ?? null,
          label_text: field.label_text ?? null,
          changed: !!field.changed,
        })),
      })),
    })
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).json({ message: 'Obsah stránky sa teraz nedá načítať.' })
  }
}
