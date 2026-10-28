/**
 * GET /store/novinky – verejná stránka Noviniek a výsuvný panel (bez prihlásenia).
 * Vracia len zverejnené príspevky a aktívne reklamné plochy, s aktuálnym stavom ankiet.
 */
import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { publicView, readDoc } from '../../../lib/novinky/policy'
import { readVotes } from '../../../lib/novinky/store'
import { readStore } from '../../../lib/pages/store'

export const AUTHENTICATE = false

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const store = await readStore(req.scope)
    const doc = readDoc(store?.metadata)
    const votes = await readVotes(req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION), doc)
    res.setHeader('Cache-Control', 'public, max-age=60')
    return res.json(publicView(doc, votes))
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).json({ message: 'Novinky sa teraz nedajú načítať.' })
  }
}
