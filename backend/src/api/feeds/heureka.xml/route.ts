/**
 * Verejný feed pre Heuriku: GET /feeds/heureka.xml
 * Portál si feed sťahuje sám (bez prihlásenia), preto je trasa bez autentifikácie a bez CORS.
 * Ceny počíta server (calculated_price s region kontextom), klient nič nedopočítava.
 */
import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { buildHeurekaXml, feedVatRate, resolveStorefrontOrigin } from '../../../lib/feeds/policy'
import { loadFeedItems } from '../../../lib/feeds/catalog'

export const AUTHENTICATE = false
export const CORS = false

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const env = process.env
  const origin = resolveStorefrontOrigin(env)
  if (!origin) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).send('<?xml version="1.0" encoding="utf-8"?><SHOP><SHOPINFO><NAME>ANASTASIA</NAME><DESCRIPTION>Adresa webu nie je nastavená.</DESCRIPTION></SHOPINFO></SHOP>')
  }
  try {
    const items = await loadFeedItems(req.scope, env)
    const xml = buildHeurekaXml(items, { origin, vatRate: feedVatRate(env) })
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).send(xml)
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).send('<?xml version="1.0" encoding="utf-8"?><SHOP><SHOPINFO><NAME>ANASTASIA</NAME><DESCRIPTION>Feed sa práve nedá vytvoriť.</DESCRIPTION></SHOPINFO></SHOP>')
  }
}
