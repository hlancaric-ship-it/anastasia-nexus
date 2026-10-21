/**
 * DELETE /admin/media/:key – zmaže obrázok z knihovne (aj súbor v úložisku).
 * Pred zmažaním overí, že obrázok nie je použitý v žiadnom produkte.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import type { IFileModuleService } from '@medusajs/types'
import { adminActor, auditAdminChange } from '../../../../lib/observability/audit'
import { readMedia, readStore, writeMedia, writeStoreMetadata } from '../../../../lib/pages/store'

/** Nájde produkty, ktoré používajú daný obrázok (thumbnail alebo galéria). */
async function usage(scope: AuthenticatedMedusaRequest['scope'], url: string): Promise<{ id: string; title: string }[]> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'product',
    fields: ['id', 'title', 'thumbnail', 'images.url'],
    pagination: { take: 2000 },
  })
  return (data || [])
    .filter((p: any) => p?.thumbnail === url || (p?.images || []).some((i: any) => i?.url === url))
    .map((p: any) => ({ id: String(p.id), title: String(p.title || '') }))
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const key = String(req.params.key ?? '').trim()
  if (!key || key.length > 300) return res.status(400).json({ message: 'Neplatný obrázok.' })
  try {
    const store = await readStore(req.scope)
    const files = readMedia(store?.metadata)
    const item = files.find((f) => f.key === key)
    if (!item) return res.status(404).json({ message: 'Obrázok v knihovne nebol nájdený.' })
    const used = await usage(req.scope, item.url)
    if (used.length) {
      return res.status(409).json({
        message: `Obrázok používa produkt: ${used.map((p) => p.title).join(', ')}. Najprv ho v produkte nastavte iný.`,
      })
    }
    try {
      const filesService = req.scope.resolve<IFileModuleService>(Modules.FILE)
      await filesService.deleteFiles([item.key])
    } catch {
      // Súbor v úložisku mohol zmiznúť; z knihovne ho odstránime aj tak.
    }
    const remaining = files.filter((f) => f.key !== item.key)
    await writeStoreMetadata(req.scope, store!.id, writeMedia(store!.metadata, remaining))
    await auditAdminChange(req, 'admin.media.delete', 'store', store!.id, { key: item.key }, null)
    return res.json({ files: readMedia((await readStore(req.scope))?.metadata), deleted: item.key })
  } catch {
    return res.status(503).json({ message: 'Obrázok sa nepodarilo zmazať. Skúste to znova.' })
  }
}
