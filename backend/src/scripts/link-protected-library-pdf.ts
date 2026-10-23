// link-protected-library-pdf.ts: Přidá PDF materiály do reset-40-plus registru bez přepsání existujících.
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse } from "csv-parse/sync"

const PDF_MAP_PATH = "backend/data-private/reset40-pdf-map.tsv"

function pdfMapPath(): string {
  const candidates = [resolve(process.cwd(), PDF_MAP_PATH), resolve(process.cwd(), "data-private/reset40-pdf-map.tsv")]
  const found = candidates.find(existsSync)
  if (!found) throw Error("RESET 40+ PDF map not found")
  return found
}

/** Načte PDF mapu z TSV souboru (týden, typ, stará cesta). */
function loadPdfMap(): Array<{ week: number; type: string; oldPath: string }> {
  const content = readFileSync(pdfMapPath(), "utf8")
  const records = parse(content, {
    delimiter: "\t",
    columns: ["week", "type", "oldPath"],
    skip_empty_lines: true,
    cast: (value, context) => {
      if (context.column === "week") return parseInt(value, 10)
      return value
    },
  }) as Array<{ week: number; type: string; oldPath: string }>
  return records
}

/** Přidá PDF do registru produktu reset-40-plus. */
export default async function linkProtectedLibraryPdf({ container }: ExecArgs) {
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "metadata"],
    filters: { handle: "reset-40-plus" },
  })

  if (data.length !== 1) throw Error(`Expected exactly one reset-40-plus product, got ${data.length}`)
  const product = data[0]

  // Načíst existující média
  const existingMedia = Array.isArray(product.metadata?.protected_media)
    ? product.metadata.protected_media
    : []

  // Vytvořit mapu klíčů existujících médií
  const existingKeys = new Set(existingMedia.map((m: any) => (typeof m === "string" ? m : m.key)))

  // Načíst PDF mapu
  const pdfRecords = loadPdfMap()

  // Seskupit PDF podle týdne
  const weekMap = new Map<number, Array<{ key: string; title: string }>>()
  for (const rec of pdfRecords) {
    const key = `reset-40-plus/tyzden-${String(rec.week).padStart(2, "0")}/${rec.type}.pdf`
    if (existingKeys.has(key)) continue // již registrováno

    let title: string
    if (rec.type === "samostudium") {
      title = `Týždeň ${rec.week} – Samoštúdium`
    } else if (rec.type.startsWith("den-")) {
      const dayNum = parseInt(rec.type.split("-")[1], 10)
      title = `Týždeň ${rec.week} – Deň ${dayNum}`
    } else if (rec.type === "material") {
      title = `Týždeň ${rec.week} – Materiál`
    } else {
      continue // neznámý typ
    }

    if (!weekMap.has(rec.week)) weekMap.set(rec.week, [])
    weekMap.get(rec.week)!.push({ key, title })
  }

  // Přidat nová PDF do existujících médií
  const newMedia = [...existingMedia]
  for (const items of weekMap.values()) {
    for (const item of items) {
      newMedia.push(item)
    }
  }

  console.log(`Přidáno ${newMedia.length - existingMedia.length} PDF do registru reset-40-plus`)
  console.log(`Celkem médií v registru: ${newMedia.length}`)

  const apply = process.env.PROTECTED_LIBRARY_APPLY === "1"
  if (apply) {
    const { updateProductsWorkflow } = await import("@medusajs/medusa/core-flows")
    await updateProductsWorkflow(container).run({
      input: { products: [{ id: product.id, metadata: { ...product.metadata, protected_media: newMedia } }] },
    })
    console.log("Změny uloženy.")
  } else {
    console.log("Režim dry-run: změny neuloženy. Nastavte PROTECTED_LIBRARY_APPLY=1 pro aplikaci.")
  }
}
