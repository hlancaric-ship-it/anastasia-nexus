import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor } from "../../../../../../lib/observability/audit"
import { readLibraryProduct } from "../../../../../../lib/protected-library/product"
import { createProtectedUploadUrl, protectedStorageFromEnv } from "../../../../../../lib/protected-library/storage"
import {
  buildUploadKey,
  describeLimit,
  libraryUploadRequest,
  productFolder,
  titleFromFilename,
  uploadType,
} from "../../../../../../lib/protected-library/upload"

/**
 * POST /admin/products/:id/protected-media/upload-url
 *
 * Vráti presigned PUT URL na JEDEN konkrétny kľúč v súkromnom bucketu.
 * Klient si kľúč nevymýšľa, dostane iba URL, hlavičky a navrhovaný názov.
 * Prístupové údaje k úložisku nikdy neopúšťajú server.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  const parsed = libraryUploadRequest.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Názov súboru a jeho veľkosť sú povinné." })
  }
  const type = uploadType(parsed.data.filename)
  if (!type) {
    return res.status(400).json({ message: "Povolené typy súborov sú MP4, MP3, M4A a PDF." })
  }
  if (parsed.data.size > type.maxBytes) {
    return res.status(400).json({ message: `Súbor je príliš veľký. Limit pre ${type.extension.toUpperCase()} je ${describeLimit(type)}.` })
  }

  const storage = protectedStorageFromEnv()
  if (!storage) {
    return res.status(503).json({ message: "Nahrávanie chránených súborov nie je nakonfigurované. Obráťte sa na podporu." })
  }

  try {
    const product = await readLibraryProduct(req)
    if (!product) return res.status(404).json({ message: "Produkt sa nenašiel." })
    const folder = productFolder(product.handle, product.id)
    const key = buildUploadKey({ folder, filename: parsed.data.filename })
    const target = await createProtectedUploadUrl(storage, { key, contentType: type.contentType })
    return res.status(200).json({
      key: target.key,
      url: target.url,
      method: target.method,
      headers: target.headers,
      expires_at: target.expiresAt,
      kind: type.kind,
      max_bytes: type.maxBytes,
      suggested_title: titleFromFilename(parsed.data.filename),
    })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/products/:id/protected-media/upload-url zlyhal", error as Error)
    return res.status(503).json({ message: "Nahrávanie sa nepodarilo pripraviť. Skúste to znova." })
  }
}
