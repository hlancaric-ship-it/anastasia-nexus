/**
 * Šablóny odpovedí v chate – krátke texty, ktoré Lucia posiela zákazníčkam opakovane.
 * Ukladajú sa v metadátach obchodu (jediný riadok tabuľky `store`), spolu s textami stránok a knihovnou.
 */
import { readStore, writeStoreMetadata } from './pages/store'

export const CHAT_TEMPLATES_METADATA_KEY = 'anastasia_chat_templates'
export const CHAT_TEMPLATE_MAX = 30
export const CHAT_TEMPLATE_TEXT_MAX = 1000
export const CHAT_TEMPLATE_TITLE_MAX = 60

export type ChatTemplate = { id: string; title: string; text: string; updated_at: string; updated_by: string }

export function readChatTemplates(metadata: unknown): ChatTemplate[] {
  const source = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  const raw = source[CHAT_TEMPLATES_METADATA_KEY]
  if (!Array.isArray(raw)) return []
  const items: ChatTemplate[] = []
  for (const value of raw) {
    if (!value || typeof value !== 'object') continue
    const item = value as Record<string, unknown>
    if (typeof item.id !== 'string' || !item.id.trim() || typeof item.text !== 'string' || !item.text) continue
    items.push({
      id: item.id,
      title: typeof item.title === 'string' && item.title ? item.title : item.text.slice(0, 40),
      text: item.text,
      updated_at: typeof item.updated_at === 'string' ? item.updated_at : '',
      updated_by: typeof item.updated_by === 'string' ? item.updated_by : '',
    })
  }
  return items.slice(0, CHAT_TEMPLATE_MAX)
}

export function writeChatTemplates(metadata: unknown, items: ChatTemplate[]): Record<string, unknown> {
  const source = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  return { ...source, [CHAT_TEMPLATES_METADATA_KEY]: items.slice(0, CHAT_TEMPLATE_MAX) }
}

/** Overenie vstupu od administrácie. */
export function validateChatTemplate(input: { title?: unknown; text?: unknown }): { ok: true; title: string; text: string } | { ok: false; message: string } {
  const text = String(input.text ?? '').trim()
  if (!text) return { ok: false, message: 'Napíšte text odpovede.' }
  if (text.length > CHAT_TEMPLATE_TEXT_MAX) return { ok: false, message: `Text je príliš dlhý (maximálne ${CHAT_TEMPLATE_TEXT_MAX} znakov).` }
  const title = String(input.title ?? '').trim().slice(0, CHAT_TEMPLATE_TITLE_MAX) || text.slice(0, 40)
  return { ok: true, title, text }
}
