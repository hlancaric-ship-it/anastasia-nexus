/**
 * Verejný feed pre Google Merchant Center: GET /feeds/google.xml
 * Portál si feed sťahuje sám (bez prihlásenia), preto je trasa bez autentifikácie a bez CORS.
 * Ceny počíta server (calculated_price s region kontextom), klient nič nedopočítava.
 */
import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { buildGoogleXml, resolveStorefrontOrigin } from '../../../lib/feeds/policy'
import { loadFeedItems } from '../../../lib/feeds/catalog'

export const AUTHENTICATE = false
export const CORS = false

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const env = process.env
  const origin = resolveStorefrontOrigin(env)
  if (!origin) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).send('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>ANASTASIA</title><description>Adresa webu nie je nastavená.</description></channel></rss>')
  }
  try {
    const items = await loadFeedItems(req.scope, env)
    const xml = buildGoogleXml(items, { origin, vatRate: 0 })
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).send(xml)
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).send('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>ANASTASIA</title><description>Feed sa práve nedá vytvoriť.</description></channel></rss>')
  }
}
