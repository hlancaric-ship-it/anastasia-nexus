import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { ILockingModule, IProductModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../../../lib/observability/audit"
import { librarySnapshot } from "../../../../../../lib/protected-library/editor"
import { readLibraryProduct, registeredKey, registeredMedia } from "../../../../../../lib/protected-library/product"
import { keyBelongsToProduct, productFolder } from "../../../../../../lib/protected-library/upload"

/**
 * DELETE /admin/products/:id/protected-media/:key
 *
 * Súbor sa iba ODPÁJÍ od produktu. Objekt v súkromnom bucketu zostáva
 * ležať (môže ho ešte používať iný produkt alebo záloha) – mazanie objektu
 * je samostatná, schválená operácia.
 */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  // Kľúč je v ceste; prehliadač ho posiela ako %2F, Express ho rozluší.
  const body = (req.body ?? {}) as { key?: unknown }
  const raw = req.params?.key ?? (req.query?.key as string | undefined) ?? body.key
  const key = typeof raw === "string" ? raw.trim() : ""
  if (!key) return res.status(400).json({ message: "Chýba kľúč súboru." })

  try {
    const product = await readLibraryProduct(req)
    if (!product) return res.status(404).json({ message: "Produkt sa nenašiel." })
    const folder = productFolder(product.handle, product.id)
    if (!keyBelongsToProduct(key, folder)) {
      return res.status(400).json({ message: "Súbor nepatrí k tomuto produktu." })
    }

    const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING)
    return await locking.execute(`protected-library:${req.params.id}`, async () => {
      const current = await readLibraryProduct(req)
      if (!current) return res.status(404).json({ message: "Produkt sa nenašiel." })
      const before = librarySnapshot(current.metadata)
      const registered = registeredMedia(current.metadata)
      const remaining = registered.filter((item) => registeredKey(item) !== key)
      if (remaining.length === registered.length) {
        // Už odpojený – bez zápisu a bez auditu, aby sa opakované kliknutie nič nemenilo.
        return res.status(200).json({ ...before, replayed: true })
      }
      const products = req.scope.resolve<IProductModuleService>(Modules.PRODUCT)
      await products.updateProducts(req.params.id, { metadata: { protected_media: remaining } })
      const afterProduct = await readLibraryProduct(req)
      const after = librarySnapshot(afterProduct?.metadata)
      if (!afterProduct || after.media.some((item) => item.key === key)) throw new Error("LIBRARY_READBACK_MISMATCH")
      await auditAdminChange(req, "product.library.detach", "product", req.params.id,
        { revision: before.revision, file_count: before.media.length, key }, { revision: after.revision, file_count: after.media.length })
      return res.status(200).json({ ...after, replayed: false })
    })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("DELETE /admin/products/:id/protected-media/:key zlyhal", error as Error)
    return res.status(503).json({ message: "Výsledok odpojenia treba overiť. Načítajte uložený obsah pred ďalším pokusom." })
  }
}
