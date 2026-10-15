import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { adminActor } from '../../../../lib/observability/audit'
import { recordEvent } from '../../../../lib/observability/events'
import { loadOperations, operationsPage } from '../../../../lib/nexus/operations'

/** Read-only operator overview; protected by existing /admin/ops/* middleware and actor check. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!adminActor(req)) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  let page: ReturnType<typeof operationsPage>
  try { page = operationsPage(req.query as Record<string, unknown>) }
  catch { return res.status(400).json({ message: 'Vyberte platnú stránku prehľadu.' }) }
  try { return res.json(await loadOperations(page)) }
  catch {
    await recordEvent(req.scope, 'error', 'admin_audit', 'nexus_status_unavailable', { error_code: 'NEXUS_OPERATIONS_UNAVAILABLE' })
    return res.status(503).json({ message: 'Prehľad spracovania sa teraz nedá načítať. Skúste to neskôr.' })
  }
}
