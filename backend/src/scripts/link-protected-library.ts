import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { protectedLibrary } from "../lib/protected-library/manifest"

/** Existing files only. Dry-run by default; never touches prices, grants, orders or notifications. */
export default async function linkProtectedLibrary({ container }: ExecArgs) {
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: ["id", "handle", "metadata"], filters: { handle: protectedLibrary.map(p => p.handle) } })
  const plan = protectedLibrary.map(entry => {
    const products = data.filter((p: any) => p.handle === entry.handle)
    if (products.length !== 1) throw Error(`Expected exactly one product: ${entry.handle}`)
    const p = products[0]
    const old = p.metadata?.protected_media
    if (old?.length && JSON.stringify(old) !== JSON.stringify(entry.media)) throw Error(`Existing media registry differs: ${entry.handle}; review before replacing`)
    return { id: p.id, changed: JSON.stringify(old) !== JSON.stringify(entry.media), metadata: { ...p.metadata, protected_media: entry.media } }
  })

  // PDF registry is opt-in; loading failures must stop the dry-run/apply instead of hiding omissions.
  if (process.env.PROTECTED_LIBRARY_PDF === "1") {
    const mapPath = resolve(process.cwd(), "data-private/reset40-pdf-map.tsv")
    const rows = readFileSync(mapPath, "utf8").split(/\r?\n/).filter(Boolean)
    const pdfRecords = rows.slice(1).map((row, index) => {
      const [weekText, type] = row.split("\t")
      const week = Number(weekText)
      if (!Number.isInteger(week) || week < 1 || week > 16 || !/^(samostudium|den-[1-7])$/.test(type || ""))
        throw Error(`Invalid PDF map row ${index + 2}`)
      return { week, type }
    })
    const reset40 = plan.find(p => data.find((d: any) => d.id === p.id)?.handle === "reset-40-plus")
    if (!reset40) throw Error("Missing reset-40-plus product in plan")
    const existing = reset40.metadata.protected_media || []
    const existingKeys = new Set(existing.map((m: any) => typeof m === "string" ? m : m.key))
    const newMedia = [...existing]
    for (const rec of pdfRecords) {
      const key = `reset-40-plus/tyzden-${String(rec.week).padStart(2, "0")}/${rec.type}.pdf`
      if (existingKeys.has(key)) continue
      const title = rec.type === "samostudium"
        ? `Týždeň ${rec.week} – Samoštúdium`
        : `Týždeň ${rec.week} – Deň ${Number(rec.type.slice(4))}`
      newMedia.push({ key, title, kind: "pdf" })
      existingKeys.add(key)
    }
    if (JSON.stringify(existing) !== JSON.stringify(newMedia)) {
      reset40.metadata.protected_media = newMedia
      reset40.changed = true
    }
  }

  const apply = process.env.PROTECTED_LIBRARY_APPLY === "1"
  let updated = 0
  for (const p of plan) if (apply && p.changed) {
    await updateProductsWorkflow(container).run({ input: { products: [{ id: p.id, metadata: p.metadata }] } })
    updated++
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", products: plan.length, files: protectedLibrary.reduce((n, p) => n + p.media.length, 0), changes: plan.filter(p => p.changed).length, updated }))
}
