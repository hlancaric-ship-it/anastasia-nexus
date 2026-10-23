import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

function assertTestTunnel() {
  const value = process.env.DATABASE_URL
  if (process.env.ANASTASIA_IMPORT_TEST_SERVER !== "1" || !value) throw new Error("TEST_DATABASE_GUARD")
  const parsed = new URL(value)
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "15432") throw new Error("TEST_TUNNEL_REQUIRED")
}

export default async function exportTestCatalog({ container, args = [] }: { container: MedusaContainer; args?: string[] }) {
  assertTestTunnel()
  const file = args.find((arg) => arg.startsWith("file="))?.slice(5) || "data-private/test-catalog-before.json"
  const output = resolve(file)
  const privateDir = resolve("data-private")
  if (!output.startsWith(`${privateDir}/`) || !output.endsWith(".json")) throw new Error("OUTPUT_PATH_GUARD")
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const readAll = async (entity: string, fields: string[], filters: Record<string, unknown> = {}) => {
    const rows: any[] = []
    for (let skip = 0; ; skip += 100) {
      const { data } = await query.graph({ entity, fields, filters, pagination: { take: 100, skip, order: { id: "ASC" } } })
      rows.push(...data)
      if (data.length < 100) return rows
      if (skip >= 100000) throw new Error("CATALOG_EXPORT_TOO_LARGE")
    }
  }
  const [products, categories] = await Promise.all([
    readAll("product", ["id", "title", "handle", "status", "thumbnail", "images.url", "metadata", "shipping_profile.id", "variants.id", "variants.sku", "variants.prices.amount", "variants.prices.currency_code", "variants.inventory_items.inventory.location_levels.stocked_quantity", "categories.id", "categories.handle"]),
    readAll("product_category", ["id", "name", "handle", "is_active", "is_internal", "rank", "parent_category_id", "parent_category.id", "parent_category.handle"]),
  ])
  const outputData = { exported_at: new Date().toISOString(), products, categories }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(outputData, null, 2)}\n`, { mode: 0o600 })
  container.resolve(ContainerRegistrationKeys.LOGGER).info(`[test-catalog] exported ${products.length} products and ${categories.length} categories`)
}
