import type { MedusaRequest } from "@medusajs/framework/http"
import type { IPromotionModuleService, PromotionDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { LinkInput } from "./links"

/** Preliminary code availability only. Cart rules and atomic redemption belong to pricing. */
export function codeAvailable(p: PromotionDTO | undefined, code: string, now = Date.now()): boolean {
  if (!p || p.code !== code || p.status !== "active" || p.is_automatic) return false
  if (p.limit != null && (p.used ?? 0) >= p.limit) return false
  if (p.campaign_id && !p.campaign) return false
  const c = p.campaign
  for (const [value, start] of [[c?.starts_at, true], [c?.ends_at, false]] as const) {
    if (value == null) continue
    const time = new Date(value).getTime()
    if (!Number.isFinite(time) || (start ? now < time : now >= time)) return false
  }
  return true
}

export async function validateLink(scope: MedusaRequest["scope"], input: LinkInput, channels?: string[]) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "product.id", "product.status", "product.sales_channels.id"],
    filters: { sku: input.produkt },
  })
  // Never choose arbitrarily when migration produced ambiguous SKUs.
  if (data.length !== 1) return null
  const variant = data[0]
  if (!variant.product || variant.product.status !== "published") return null
  if (channels && !variant.product.sales_channels?.some(c => c && channels.includes(c.id))) return null
  const promotions = scope.resolve<IPromotionModuleService>(Modules.PROMOTION)
  const matches = await promotions.listPromotions({ code: input.kupon }, { relations: ["campaign"], take: 2 })
  if (matches.length !== 1 || !codeAvailable(matches[0], input.kupon)) return null
  return { variant_id: variant.id, product_id: variant.product.id }
}
