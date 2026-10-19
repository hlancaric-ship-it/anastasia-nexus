import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import type { ILockingModule, IProductModuleService } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { adminActor, auditAdminChange } from '../../../../../lib/observability/audit'
import { librarySnapshot, libraryWrite, sameLibraryKeys } from '../../../../../lib/protected-library/editor'

const read = async (req: AuthenticatedMedusaRequest) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: 'product', fields: ['id', 'metadata'], filters: { id: req.params.id } })
  return data[0]
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (!adminActor(req)) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  try {
    const product = await read(req)
    if (!product) return res.status(404).json({ message: 'Produkt sa nenašiel.' })
    return res.json(librarySnapshot(product.metadata))
  } catch { return res.status(503).json({ message: 'Obsah sa nepodarilo načítať. Skúste to znova.' }) }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (!adminActor(req)) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const parsed = libraryWrite.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'Každý súbor musí mať názov s najviac 200 znakmi. Načítajte aktuálny obsah a skúste to znova.' })
  try {
    const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING)
    return await locking.execute(`protected-library:${req.params.id}`, async () => {
      const product = await read(req)
      if (!product) return res.status(404).json({ message: 'Produkt sa nenašiel.' })
      const before = librarySnapshot(product.metadata)
      const registered = product.metadata?.protected_media
      if (Array.isArray(registered) && registered.length !== before.media.length) return res.status(409).json({ message: 'Zoznam obsahuje nečitateľné alebo opakované súbory. Pred úpravou požiadajte podporu o kontrolu; pôvodný obsah zostal zachovaný.' })
      if (!sameLibraryKeys(before.media, parsed.data.media)) return res.status(409).json({ message: 'Zoznam súborov sa zmenil. Načítajte uložený obsah; súbory nemožno presúvať medzi produktmi ani odoberať týmto formulárom.' })
      const same = before.media.every((m, i) => m.key === parsed.data.media[i].key && m.title === parsed.data.media[i].title)
      // Safe replay of an already completed write, including a lost HTTP response.
      if (same) return res.json({ ...before, replayed: true })
      if (before.revision !== parsed.data.revision) return res.status(409).json({ message: 'Obsah už niekto upravil v inom okne. Načítajte uložený obsah a svoje zmeny skontrolujte.' })
      const products = req.scope.resolve<IProductModuleService>(Modules.PRODUCT)
      // Only this metadata field is written; prices, grants and unrelated metadata are untouched.
      const protectedMedia = parsed.data.media.map(item => {
        const original = Array.isArray(registered) ? registered.find((m: any) => (typeof m === 'string' ? m : m?.key) === item.key) : undefined
        return { ...(typeof original === 'object' && original ? original : {}), ...item }
      })
      await products.updateProducts(req.params.id, { metadata: { protected_media: protectedMedia } })
      const afterProduct = await read(req)
      const after = librarySnapshot(afterProduct?.metadata)
      if (!afterProduct || JSON.stringify(after.media.map(({ key, title }) => ({ key, title }))) !== JSON.stringify(parsed.data.media)) throw new Error('LIBRARY_READBACK_MISMATCH')
      await auditAdminChange(req, 'product.library.update', 'product', req.params.id,
        { revision: before.revision, file_count: before.media.length }, { revision: after.revision, file_count: after.media.length })
      return res.json({ ...after, replayed: false })
    })
  } catch { return res.status(503).json({ message: 'Výsledok uloženia obsahu treba overiť. Načítajte uložený obsah pred ďalším pokusom.' }) }
}
