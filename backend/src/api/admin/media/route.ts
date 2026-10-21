/**
 * GET /admin/media – knihovna verejných obrázkov.
 * POST /admin/media – zapíše nahraté súbory do knihovne (samotné nahrávanie robí natívne /admin/uploads).
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { adminActor, auditAdminChange } from '../../../lib/observability/audit'
import { readMedia, readStore, writeMedia, writeStoreMetadata, type MediaItem } from '../../../lib/pages/store'

const MEDIA_MAX_ITEMS = 500
const MEDIA_MAX_SIZE = 12 * 1024 * 1024

/**
 * Povolené typy obrázkov v knižnine.
 *
 * `image/svg+xml` je VYŤATÝ ZÁMERNE (2026-10-21): SVG je dokument, ktorý
 * môže obsahovať skript. Servírovaný z vlastnej domény sa dá otvoriť priamo
 * v prehliadači a spustiť JavaScript v kontexte stránky (XSS). Obrázkový
 * formát (JPG, PNG, WebP, GIF, AVIF) sa vykresľuje ako obrázok a skript
 * nespustí.
 *
 * Na strane klienta (nahrávanie v administrácii) je allowlist užitočný len
 * ako vstupná kontrola -- rozhoduje server.
 */
export const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const

/** True = typ smie byť v knižnine. */
export function isAllowedMediaType(contentType: string): boolean {
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(contentType)
}

function safeUrl(value: unknown): string | null {
  const url = String(value ?? '').trim()
  if (!url || url.length > 500) return null
  if (!/^https?:\/\//i.test(url)) return null
  return url
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!adminActor(req)) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  try {
    const store = await readStore(req.scope)
    return res.json({ files: readMedia(store?.metadata) })
  } catch {
    return res.status(503).json({ message: 'Knihovna obrázkov sa teraz nedá načítať. Skúste to znova.' })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const body = (req.body ?? {}) as { files?: unknown }
  const incoming = Array.isArray(body.files) ? body.files : []
  if (!incoming.length) return res.status(400).json({ message: 'Žiadny súbor na pridanie.' })
  const store = await readStore(req.scope)
  if (!store) return res.status(503).json({ message: 'Knihovna obrázkov sa teraz nedá uložiť. Skúste to znova.' })
  const existing = readMedia(store.metadata)
  const known = new Set(existing.map((f) => f.key))
  const added: MediaItem[] = []
  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const url = safeUrl(item.url)
    if (!url) continue
    const key = String(item.key ?? url.split('/').pop() ?? '').trim()
    if (!key || known.has(key)) continue
    const size = Number(item.size) || 0
    const contentType = String(item.content_type ?? '').trim()
    if (size > MEDIA_MAX_SIZE) return res.status(400).json({ message: 'Niektorý obrázok je väčší ako 12 MB.' })
    if (contentType && !isAllowedMediaType(contentType)) return res.status(400).json({ message: 'V knižne sú len obrázky (JPG, PNG, WebP, GIF, AVIF).' })
    known.add(key)
    added.push({
      key,
      url,
      name: String(item.name ?? key).slice(0, 200),
      size,
      content_type: contentType || 'image/*',
      uploaded_at: new Date().toISOString(),
      uploaded_by: actor,
    })
  }
  if (!added.length) return res.json({ files: existing, added: 0 })
  const files = [...added, ...existing].slice(0, MEDIA_MAX_ITEMS)
  try {
    await writeStoreMetadata(req.scope, store.id, writeMedia(store.metadata, files))
    const verified = readMedia((await readStore(req.scope))?.metadata)
    if (!verified.some((f) => f.key === added[0].key)) throw new Error('MEDIA_READBACK_MISMATCH')
    await auditAdminChange(req, 'admin.media.add', 'store', store.id, null, { files: added.map((f) => f.key) })
    return res.json({ files: verified, added: added.length })
  } catch {
    return res.status(503).json({ message: 'Obrázky sa nepodarilo pridať do knihovne. Skúste to znova.' })
  }
}
