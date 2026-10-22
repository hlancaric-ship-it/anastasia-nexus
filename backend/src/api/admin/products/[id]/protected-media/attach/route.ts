import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { ILockingModule, IProductModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../../../lib/observability/audit"
import { librarySnapshot } from "../../../../../../lib/protected-library/editor"
import { readLibraryProduct, registeredKey, registeredMedia } from "../../../../../../lib/protected-library/product"
import { headProtectedObject, protectedStorageFromEnv } from "../../../../../../lib/protected-library/storage"
import {
  describeLimit,
  keyBelongsToProduct,
  libraryAttachRequest,
  productFolder,
  titleFromFilename,
  uploadType,
} from "../../../../../../lib/protected-library/upload"

/**
 * POST /admin/products/:id/protected-media/attach
 *
 * Po nahratí súboru do R2 sa kľúč pripojí k produktu. Server najprv overí,
 * že objekt naozaj existuje a neprekračuje limit, potom ho zapíše do
 * metadata.protected_media pod zámkom a s auditem.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  const parsed = libraryAttachRequest.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Klúč súboru je povinný a názov môže mať najviac 200 znakov." })

  const storage = protectedStorageFromEnv()
  if (!storage) {
    return res.status(503).json({ message: "Nahrávanie chránených súborov nie je nakonfigurované. Obráťte sa na podporu." })
  }

  try {
    const product = await readLibraryProduct(req)
    if (!product) return res.status(404).json({ message: "Produkt sa nenašiel." })

    const folder = productFolder(product.handle, product.id)
    const key = parsed.data.key.trim()
    if (!keyBelongsToProduct(key, folder)) {
      return res.status(400).json({ message: "Súbor nepatrí k tomuto produktu." })
    }
    const type = uploadType(key)
    if (!type) {
      return res.status(400).json({ message: "Povolené typy súborov sú MP4, MP3, M4A a PDF." })
    }

    // Objekt musí naozaj ležať v úložisku – inak by sa do knižnice dostal neexistujúci súbor.
    const object = await headProtectedObject(storage, key)
    if (!object) {
      return res.status(409).json({ message: "Súbor sa v úložisku nenašiel. Nahrajte ho prosím znova." })
    }
    if (object.size > type.maxBytes) {
      return res.status(409).json({ message: `Nahratý súbor je príliš veľký. Limit pre ${type.extension.toUpperCase()} je ${describeLimit(type)}.` })
    }

    const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING)
    return await locking.execute(`protected-library:${req.params.id}`, async () => {
      const current = await readLibraryProduct(req)
      if (!current) return res.status(404).json({ message: "Produkt sa nenašiel." })
      const before = librarySnapshot(current.metadata)
      const registered = registeredMedia(current.metadata)
      if (registered.some((item) => registeredKey(item) === key)) {
        return res.status(409).json({ message: "Tento súbor je už k produktu pripojený." })
      }
      const title = (parsed.data.title ?? "").trim() || titleFromFilename(key)
      const protectedMedia = [...registered.map((item) => (typeof item === "object" && item ? item : { key: registeredKey(item) ?? "" })), { key, title }]
      const products = req.scope.resolve<IProductModuleService>(Modules.PRODUCT)
      await products.updateProducts(req.params.id, { metadata: { protected_media: protectedMedia } })
      const afterProduct = await readLibraryProduct(req)
      const after = librarySnapshot(afterProduct?.metadata)
      const attached = after.media.some((item) => item.key === key)
      if (!afterProduct || !attached) throw new Error("LIBRARY_READBACK_MISMATCH")
      await auditAdminChange(req, "product.library.attach", "product", req.params.id,
        { revision: before.revision, file_count: before.media.length }, { revision: after.revision, file_count: after.media.length, key })
      return res.status(200).json({ ...after, replayed: false })
    })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/products/:id/protected-media/attach zlyhal", error as Error)
    return res.status(503).json({ message: "Výsledok pripojenia treba overiť. Načítajte uložený obsah pred ďalším pokusom." })
  }
}
