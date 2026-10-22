import { createHash } from "node:crypto"
import { z } from "zod"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { adminInput, linkInput, legacyQuantity, type LinkInput } from "./links"
import { codeAvailable } from "./validation"

export const generationInput = adminInput
export const pageInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  q: z.string().trim().max(128).default(""),
}).strict()
export const importInput = z.object({
  dry_run: z.boolean().default(true),
  links: z.array(z.object({ url: z.string().min(1).max(2048), issued_at: z.string().datetime({ offset: true }).nullable().optional() }).strict()).min(1).max(100),
}).strict()
export const downloadInput = z.object({ format: z.enum(["svg", "png"]).default("svg") }).strict()
export const deactivateInput = z.object({ confirmation: z.string().min(1).max(128) }).strict()
export type QrRecord = { id: string; tenant_id: string; url: string; sku: string; coupon_code: string; quantity: number; source: "generated" | "legacy"; issued_at: Date | string | null; created_by: string; created_at?: Date | string }
export function tenant(): string {
  const value = process.env.NEXUS_TENANT_ID?.trim()
  if (!value || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) throw new Error("QR_TENANT_UNCONFIGURED")
  return value
}
export function recordId(tenantId: string, url: string): string {
  return "qrl_" + createHash("sha256").update(JSON.stringify([tenantId, url])).digest("hex")
}
export function legacyLink(raw: string): LinkInput {
  if (!/^https?:\/\//.test(raw) || /[\u0000-\u0020\u007f]/.test(raw)) throw new Error("INVALID_LEGACY_URL")
  const url = new URL(raw)
  const allowed = [process.env.COUPON_LINK_STOREFRONT_ORIGIN, ...(process.env.COUPON_LINK_LEGACY_ORIGINS || "").split(",")].filter(v => v?.trim()).map(v => {
    const origin = new URL(v!.trim())
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("INVALID_QR_ORIGIN")
    return origin.origin
  })
  if (!allowed.includes(url.origin) || url.username || url.password || url.hash || !["/eshop/kosik", "/eshop/kosik/"].includes(url.pathname)) throw new Error("INVALID_LEGACY_URL")
  for (const key of url.searchParams.keys()) if (!["produkt", "kupon", "ks"].includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error("INVALID_LEGACY_QUERY")
  return linkInput.parse({ produkt: url.searchParams.get("produkt"), kupon: url.searchParams.get("kupon"), ks: legacyQuantity(url.searchParams.get("ks") ?? undefined) })
}
export function database(scope: any): any { return scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) }
export async function saveRecord(scope: any, input: LinkInput, url: string, source: QrRecord["source"], actor: string, issuedAt: string | Date | null) {
  const tenantId = tenant()
  const id = recordId(tenantId, url)
  const row: QrRecord = { id, tenant_id: tenantId, url, sku: input.produkt, coupon_code: input.kupon, quantity: input.ks, source, issued_at: issuedAt, created_by: actor }
  const inserted = await database(scope)("coupon_link_record").insert(row).onConflict("id").ignore().returning("id")
  // No metadata updates on retry: original URL, source and issue date remain immutable.
  const record = await getRecord(scope, id)
  if (!record) throw new Error("QR_WRITE_FAILED")
  return { record, created: inserted.length === 1 }
}
export async function getRecord(scope: any, id: string): Promise<QrRecord | undefined> {
  if (!/^qrl_[a-f0-9]{64}$/.test(id)) return undefined
  return database(scope)("coupon_link_record").where({ id, tenant_id: tenant() }).whereNull("deleted_at").first()
}
export async function listRecords(scope: any, page: z.infer<typeof pageInput>) {
  const query = database(scope)("coupon_link_record").where({ tenant_id: tenant() }).whereNull("deleted_at")
  if (page.q) query.andWhere(function(this: any) { this.where("sku", page.q).orWhere("coupon_code", page.q) })
  const [rows, count] = await Promise.all([query.clone().orderBy("created_at", "desc").orderBy("id", "desc").limit(page.limit).offset(page.offset), query.clone().count({ count: "*" }).first()])
  return { links: rows, count: Number(count.count), limit: page.limit, offset: page.offset }
}
export async function describeRecord(scope: any, record: QrRecord) {
  const promotionService = scope.resolve(Modules.PROMOTION)
  const matches = await promotionService.listPromotions({ code: record.coupon_code }, { relations: ["campaign"], take: 2 })
  const p = matches.length === 1 ? matches[0] : undefined
  const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product_variant", fields: ["id", "sku", "product.id", "product.title", "product.status"], filters: { sku: record.sku } })
  const product = data.length === 1 ? data[0]?.product : undefined
  return { ...record, product_title: product?.title ?? null, product_available: product?.status === "published", coupon: p ? { id: p.id, status: p.status, used: p.used ?? 0, limit: p.limit ?? null, starts_at: p.campaign?.starts_at ?? null, ends_at: p.campaign?.ends_at ?? null, available: codeAvailable(p, record.coupon_code) } : null }
}
