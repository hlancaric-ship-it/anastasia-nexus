import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { adminActor } from '../../../lib/observability/audit'
import { loadReadiness } from '../../../lib/admin-readiness/readiness'

/** Read-only store readiness from real data; unreadable checks are 'unknown', never reported as ready. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!adminActor(req)) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  try { return res.json(await loadReadiness(req.scope)) }
  catch { return res.status(503).json({ message: 'Pripravenosť obchodu sa teraz nedá overiť. Skúste to znova.' }) }
}
