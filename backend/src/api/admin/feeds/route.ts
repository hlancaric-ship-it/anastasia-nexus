/**
 * GET /admin/feeds – prehľad produktových feedov pre administráciu (Nastavenia → Pripojenia).
 * Vracia verejné URL feedov a počet produktov, ktoré sa do feedu dostanú. Kľúče ani tajomstvá neobsahuje.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { adminActor } from '../../../lib/observability/audit'
import { loadFeedItems } from '../../../lib/feeds/catalog'
import { resolveStorefrontOrigin } from '../../../lib/feeds/policy'

/** Základná verejná adresa jadra (z env, inak z hostiteľa požiadavky). */
export function publicApiOrigin(req: AuthenticatedMedusaRequest): string {
  const configured = (process.env.BACKEND_PUBLIC_URL || '').trim().replace(/\/+$/, '')
  if (configured) return configured
  const host = req.get('host')
  return host ? `${req.protocol || 'https'}://${host}` : ''
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!adminActor(req)) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const api = publicApiOrigin(req)
  const site = resolveStorefrontOrigin(process.env)
  const feeds = [
    { id: 'heureka', label: 'Heureka', path: '/feeds/heureka.xml', hint: 'XML pre porovnávač Heureka.' },
    { id: 'google', label: 'Google Merchant Center', path: '/feeds/google.xml', hint: 'RSS 2.0 pre Google Merchant Center.' },
  ].map((f) => ({ ...f, url: api ? `${api}${f.path}` : f.path }))
  let products: number | null = null
  try { products = (await loadFeedItems(req.scope)).length } catch { products = null }
  return res.json({ feeds, products, site_url: site || null })
}
