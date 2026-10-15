import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

type Row = { id: string; handle: string; metadata?: Record<string, unknown> | null }
type Redirect = { from: string; to: string; status: 301; preserve_query: true }

function pathOnly(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\?#\u0000-\u0020\u007f]/.test(value)) {
    throw new Error("INVALID_REDIRECT_PATH")
  }
  const parsed = new URL(value, "https://redirect.example")
  if (parsed.origin !== "https://redirect.example" || parsed.pathname !== value) throw new Error("INVALID_REDIRECT_PATH")
  return value
}

/** Use only imported, published DB entities. No guessed targets for missing pages or hidden products. */
export function buildEdgeRedirects(products: Row[], categories: Row[]) {
  const redirects = new Map<string, Redirect>()
  const targets = new Map<string, string>()
  function add(row: Row, prefix: string, category = false) {
    const legacy = row.metadata?.legacy_path
    if (legacy === undefined || legacy === null || legacy === "") return
    const from = pathOnly(legacy)
    if (!from.startsWith(prefix)) throw new Error("INVALID_REDIRECT_PREFIX")
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.handle)) throw new Error("INVALID_REDIRECT_HANDLE")
    // Same route convention as the catalog parser; retain category parent path.
    const parents = category ? from.slice(prefix.length).split("/").slice(0, -1).map((s) => s.toLowerCase()) : []
    const to = pathOnly(`${prefix}${[...parents, row.handle].join("/")}`)
    const existing = targets.get(from)
    if (existing && existing !== to) throw new Error("CONFLICTING_REDIRECT_TARGET")
    targets.set(from, to)
    if (from !== to) redirects.set(from, { from, to, status: 301, preserve_query: true })
  }
  products.forEach((row) => add(row, "/eshop/produkt/"))
  categories.forEach((row) => add(row, "/eshop/kategoria/", true))
  for (const entry of redirects.values()) {
    // Refuse chains and loops. A single deterministic redirect is reviewable at the edge.
    if (redirects.has(entry.to)) throw new Error("REDIRECT_CHAIN_OR_CYCLE")
  }
  return {
    version: 1,
    canonical_origin: "https://www.anastasiaoz.eu",
    methods: ["GET", "HEAD"],
    redirects: [...redirects.values()].sort((a, b) => a.from.localeCompare(b.from)),
  }
}

export async function readRedirectEntities(query: { graph(input: unknown): Promise<{ data: Row[] }> }, entity: string, filters: Record<string, unknown>) {
  const rows: Row[] = []
  for (let skip = 0; ; skip += 100) {
    const { data } = await query.graph({ entity, fields: ["id", "handle", "metadata"], filters, pagination: { take: 100, skip, order: { id: "ASC" } } })
    rows.push(...data)
    if (data.length < 100) return rows
    if (skip >= 100000) throw new Error("REDIRECT_EXPORT_TOO_LARGE")
  }
}

/** Read-only DB export, local artifact only. Run with medusa exec; optional file=... under ci-evidence. */
export default async function exportEdgeRedirects({ container, args = [] }: { container: MedusaContainer; args?: string[] }) {
  const file = args.find((arg) => arg.startsWith("file="))?.slice(5) || "ci-evidence/edge-redirects.json"
  const output = resolve(file)
  const allowed = resolve("ci-evidence")
  if (!output.startsWith(`${allowed}/`) || !output.endsWith(".json")) throw new Error("REDIRECT_EXPORT_PATH_INVALID")
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const products = await readRedirectEntities(query, "product", { status: "published" })
  const categories = await readRedirectEntities(query, "product_category", { is_active: true, is_internal: false })
  const manifest = buildEdgeRedirects(products, categories)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
  container.resolve(ContainerRegistrationKeys.LOGGER).info(`[redirects] exported ${manifest.redirects.length} redirects`)
}
