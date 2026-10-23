import type { MedusaContainer } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import fs from "node:fs"
import path from "node:path"

type Product = {
  id: string
  handle: string
  title: string
  thumbnail?: string | null
  images?: Array<{ url: string }>
}

const LOCAL_PREFIX = "http://localhost:9000/static/anastasia/"
const STATIC_ROOT = path.resolve(process.cwd(), "static")
const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
}

function localFileForUrl(url: string): { filePath: string; filename: string; mimeType: string } {
  if (!url.startsWith(LOCAL_PREFIX)) throw new Error("URL_NOT_IN_LOCAL_CATALOG_MEDIA")
  let relative = url.slice("http://localhost:9000/static/".length)
  for (let pass = 0; pass < 3 && /%[0-9a-f]{2}/i.test(relative); pass++) {
    const decoded = decodeURIComponent(relative)
    if (decoded === relative) break
    relative = decoded
  }
  const filePath = path.resolve(STATIC_ROOT, relative)
  if (!filePath.startsWith(`${STATIC_ROOT}${path.sep}`)) throw new Error("CATALOG_MEDIA_PATH_TRAVERSAL")
  const extension = path.extname(filePath).toLowerCase()
  const mimeType = MIME_TYPES[extension]
  if (!mimeType) throw new Error(`UNSUPPORTED_CATALOG_IMAGE_TYPE:${extension}`)
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`CATALOG_IMAGE_FILE_MISSING:${relative}`)
  return { filePath, filename: relative, mimeType }
}

export default async function fixTestCatalogMedia({ container }: { container: MedusaContainer }) {
  if (process.env.ANASTASIA_IMPORT_TEST_SERVER !== "1") {
    throw new Error("Refusing to run: set ANASTASIA_IMPORT_TEST_SERVER=1 for the isolated test database")
  }
  const dryRun = process.argv.some((arg) => arg === "dry-run" || arg === "--dry-run")
  const productsModule = container.resolve(Modules.PRODUCT) as any
  const products: Product[] = await productsModule.listProducts({}, {
    take: 1000,
    order: { id: "ASC" },
    relations: ["images"],
  })
  const affected = products.filter((product) =>
    product.thumbnail?.startsWith("http://localhost") || product.images?.some((image) => image.url.startsWith("http://localhost"))
  )
  const sourceUrls = [...new Set(affected.flatMap((product) => [
    ...(product.thumbnail ? [product.thumbnail] : []),
    ...(product.images ?? []).map((image) => image.url),
  ]).filter((url) => url.startsWith("http://localhost")))]

  const sources = new Map(sourceUrls.map((url) => [url, localFileForUrl(url)]))
  const changes = affected.map((product) => ({
    product,
    thumbnail: product.thumbnail?.startsWith("http://localhost") ? product.thumbnail : null,
    imageUrls: (product.images ?? []).filter((image) => image.url.startsWith("http://localhost")).map((image) => image.url),
  }))
  console.info(`[catalog-media] ${dryRun ? "DRY RUN" : "APPLY"}: ${affected.length} products, ${sourceUrls.length} unique local image URLs, ${changes.reduce((n, item) => n + (item.thumbnail ? 1 : 0) + item.imageUrls.length, 0)} references`)
  if (dryRun) {
    console.info(`[catalog-media] All ${sourceUrls.length} local files exist and have supported image types; no database or storage writes performed`)
    return
  }

  const files = container.resolve(Modules.FILE) as any
  const uploaded = new Map<string, string>()
  for (const [url, source] of sources) {
    const bytes = fs.readFileSync(source.filePath)
    if (bytes.byteLength > 20 * 1024 * 1024) throw new Error(`CATALOG_IMAGE_TOO_LARGE:${source.filename}`)
    const file = await files.createFiles({
      filename: source.filename,
      mimeType: source.mimeType,
      content: bytes.toString("base64"),
      access: "public",
    })
    if (!file?.url) throw new Error("CATALOG_IMAGE_UPLOAD_FAILED")
    let publicUrl: URL
    try { publicUrl = new URL(file.url) } catch { throw new Error("CATALOG_IMAGE_UPLOAD_URL_INVALID") }
    if (publicUrl.protocol !== "https:" || /^(localhost|127\.0\.0\.1)$/i.test(publicUrl.hostname)) {
      throw new Error("PUBLIC_CATALOG_IMAGE_PROVIDER_REQUIRED")
    }
    uploaded.set(url, file.url)
  }

  let updated = 0
  for (const { product } of changes) {
    const thumbnail = product.thumbnail?.startsWith("http://localhost")
      ? uploaded.get(product.thumbnail)
      : product.thumbnail
    const images = (product.images ?? []).map((image) => ({
      url: image.url.startsWith("http://localhost") ? uploaded.get(image.url)! : image.url,
    }))
    if (images.some((image) => image.url.startsWith("http://localhost")) || thumbnail?.startsWith("http://localhost")) {
      throw new Error(`UNRESOLVED_LOCAL_MEDIA:${product.id}`)
    }
    await updateProductsWorkflow(container).run({
      input: { products: [{ id: product.id, thumbnail, images }] },
    } as any)
    updated++
  }
  console.info(`[catalog-media] Updated ${updated} products and replaced ${uploaded.size} unique image URLs`)
}
