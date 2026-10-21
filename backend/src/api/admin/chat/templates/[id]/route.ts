/**
 * DELETE /admin/chat/templates/:id – zmaže šablónu odpovede.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { adminActor, auditAdminChange } from '../../../../../lib/observability/audit'
import { readChatTemplates, writeChatTemplates } from '../../../../../lib/chat-templates'
import { readStore, writeStoreMetadata } from '../../../../../lib/pages/store'

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const id = String(req.params.id ?? '').trim()
  if (!id) return res.status(400).json({ message: 'Neplatná šablóna.' })
  try {
    const store = await readStore(req.scope)
    if (!store) return res.status(503).json({ message: 'Šablóna sa teraz nedá zmazať. Skúste to znova.' })
    const templates = readChatTemplates(store.metadata)
    if (!templates.some((t) => t.id === id)) return res.status(404).json({ message: 'Šablóna neexistuje.' })
    await writeStoreMetadata(req.scope, store.id, writeChatTemplates(store.metadata, templates.filter((t) => t.id !== id)))
    await auditAdminChange(req, 'admin.chat_template.delete', 'store', store.id, { id }, null)
    return res.json({ templates: readChatTemplates((await readStore(req.scope))?.metadata) })
  } catch {
    return res.status(503).json({ message: 'Šablóna sa nepodarilo zmazať. Skúste to znova.' })
  }
}
