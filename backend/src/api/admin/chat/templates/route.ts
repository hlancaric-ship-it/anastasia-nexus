/**
 * GET /admin/chat/templates – šablóny odpovedí v chate.
 * POST /admin/chat/templates – uloženie (pridanie alebo úprava) šablóny.
 * Mazanie je v traste /admin/chat/templates/:id.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { adminActor, auditAdminChange } from '../../../../lib/observability/audit'
import { readChatTemplates, validateChatTemplate, writeChatTemplates, type ChatTemplate } from '../../../../lib/chat-templates'
import { readStore, writeStoreMetadata } from '../../../../lib/pages/store'

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!adminActor(req)) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  try {
    const store = await readStore(req.scope)
    return res.json({ templates: readChatTemplates(store?.metadata) })
  } catch {
    return res.status(503).json({ message: 'Šablóny odpovedí sa teraz nedajú načítať. Skúste to znova.' })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const body = (req.body ?? {}) as { id?: unknown; title?: unknown; text?: unknown }
  const validated = validateChatTemplate(body)
  if (!validated.ok) return res.status(400).json({ message: validated.message })
  try {
    const store = await readStore(req.scope)
    if (!store) return res.status(503).json({ message: 'Šablóna sa teraz nedá uložiť. Skúste to znova.' })
    const templates = readChatTemplates(store.metadata)
    const id = String(body.id ?? '').trim() || `tpl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const existing = templates.find((t) => t.id === id)
    const item: ChatTemplate = { id, title: validated.title, text: validated.text, updated_at: new Date().toISOString(), updated_by: actor }
    const next = existing ? templates.map((t) => (t.id === id ? item : t)) : [...templates, item]
    await writeStoreMetadata(req.scope, store.id, writeChatTemplates(store.metadata, next))
    await auditAdminChange(req, 'admin.chat_template.update', 'store', store.id, existing ? { id } : null, { id, title: item.title })
    return res.json({ templates: readChatTemplates((await readStore(req.scope))?.metadata) })
  } catch {
    return res.status(503).json({ message: 'Šablóna sa nepodarilo uložiť. Skúste to znova.' })
  }
}
