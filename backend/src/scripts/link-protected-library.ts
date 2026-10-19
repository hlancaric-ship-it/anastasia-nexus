import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
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
  const apply = process.env.PROTECTED_LIBRARY_APPLY === "1"
  let updated = 0
  for (const p of plan) if (apply && p.changed) {
    await updateProductsWorkflow(container).run({ input: { products: [{ id: p.id, metadata: p.metadata }] } })
    updated++
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", products: plan.length, files: protectedLibrary.reduce((n, p) => n + p.media.length, 0), changes: plan.filter(p => p.changed).length, updated }))
}
