/**
 * Uloženie textov stránok a knihovny obrázkov v metadátach obchodu (tabuľka `store`).
 * Bez nového modulu a bez migrácie – obchod má jediný riadok, `metadata` je na to najjednoduchšie.
 */
import type { IStoreModuleService } from '@medusajs/types'
import { Modules } from '@medusajs/framework/utils'
import type { MedusaRequest } from '@medusajs/framework/http'
import { PAGE_SLUGS, type StoredPage } from './policy'

export const PAGES_METADATA_KEY = 'anastasia_pages'
export const MEDIA_METADATA_KEY = 'anastasia_media'

export type MediaItem = {
  key: string
  url: string
  name: string
  size: number
  content_type: string
  uploaded_at: string
  uploaded_by: string
}

/** Obchod (jediný riadok v tabuľke store) – v jeho metadátach sú uložené texty a knihovna. */
export async function readStore(scope: MedusaRequest['scope']): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
  const service = scope.resolve<IStoreModuleService>(Modules.STORE)
  const [store] = await service.listStores({}, { take: 1 })
  return store ? { id: store.id, metadata: (store.metadata as Record<string, unknown>) || {} } : null
}

export async function writeStoreMetadata(scope: MedusaRequest['scope'], id: string, metadata: Record<string, unknown>): Promise<void> {
  const service = scope.resolve<IStoreModuleService>(Modules.STORE)
  await service.updateStores(id, { metadata })
}

// --- texty stránok ---
export function readPages(metadata: unknown): Record<string, StoredPage> {
  const source = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  const raw = source[PAGES_METADATA_KEY]
  if (!raw || typeof raw !== 'object') return {}
  const pages: Record<string, StoredPage> = {}
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!PAGE_SLUGS.includes(slug) || !value || typeof value !== 'object') continue
    const page = value as Record<string, unknown>
    if (typeof page.html !== 'string' || !page.html) continue
    pages[slug] = {
      html: page.html,
      updated_at: typeof page.updated_at === 'string' ? page.updated_at : '',
      updated_by: typeof page.updated_by === 'string' ? page.updated_by : '',
    }
  }
  return pages
}

export function writePages(metadata: unknown, pages: Record<string, StoredPage>): Record<string, unknown> {
  const source = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  return { ...source, [PAGES_METADATA_KEY]: pages }
}

// --- knihovna obrázkov ---
export function readMedia(metadata: unknown): MediaItem[] {
  const source = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  const raw = source[MEDIA_METADATA_KEY]
  if (!Array.isArray(raw)) return []
  const items: MediaItem[] = []
  for (const value of raw) {
    if (!value || typeof value !== 'object') continue
    const item = value as Record<string, unknown>
    if (typeof item.key !== 'string' || typeof item.url !== 'string' || !item.url) continue
    items.push({
      key: item.key,
      url: item.url,
      name: typeof item.name === 'string' ? item.name : item.key,
      size: Number(item.size) || 0,
      content_type: typeof item.content_type === 'string' ? item.content_type : 'image/*',
      uploaded_at: typeof item.uploaded_at === 'string' ? item.uploaded_at : '',
      uploaded_by: typeof item.uploaded_by === 'string' ? item.uploaded_by : '',
    })
  }
  return items.sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1))
}

export function writeMedia(metadata: unknown, items: MediaItem[]): Record<string, unknown> {
  const source = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  return { ...source, [MEDIA_METADATA_KEY]: items }
}
