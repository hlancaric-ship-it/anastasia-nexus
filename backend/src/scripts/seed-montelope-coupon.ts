/**
 * Seed kupónu „Montelope“ 1:1 zo starého e-shopu (dáta z `~/Downloads/anozeu/DB.sql`,
 * tabuľka `ecCoupon`):
 *
 *   couponCode      = Montelope
 *   discountPerc    = 0        → fixná zľava
 *   discountAmount  = 20.00 €  → zľava 20 € (nie percento)
 *   validFrom       = 2026-09-17
 *   validUntil      = 2026-12-31
 *   useMultiple     = 1        → použiteľ viackrát
 *   quotePriceMin/Max = 0      → bez obmedzenia sumy
 *   productCodes    = EP.002   → len produkt „AI ANASTASIA RESET 40+“ (SKU EP.002)
 *
 * Idempotentné: ak kupón s kódom „Montelope“ existuje, nič sa nemení a len sa vypíše stav.
 * Použitie:  npx medusa exec src/scripts/seed-montelope-coupon.ts
 */
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys, MedusaError, Modules, QueryContext } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

const CODE = "Montelope"
const DISCOUNT_AMOUNT = 20
const CURRENCY = "eur"
const VALID_FROM = "2026-09-17T00:00:00.000Z"
const VALID_UNTIL = "2026-12-31T23:59:59.999Z"
const PRODUCT_SKU = "EP.002" // AI ANASTASIA RESET 40+

type VariantRow = { id: string; product_id: string; sku: string | null }
type ProductRow = { id: string; title: string; handle: string }

/** Nájde variant podľa SKU a produkt, ku ktorému patrí. */
async function findProduct(query: any, sku: string): Promise<{ product: ProductRow; variant: VariantRow } | null> {
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "product.id", "product.title", "product.handle"],
    filters: { sku },
  })
  const variant = (data || [])[0] as any
  if (!variant) return null
  return {
    variant: { id: String(variant.id), product_id: String(variant.product_id ?? variant.product?.id), sku: variant.sku },
    product: { id: String(variant.product?.id), title: String(variant.product?.title ?? ""), handle: String(variant.product?.handle ?? "") },
  }
}

export default async function seedMontelopeCoupon({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const log = (m: string) => logger.info(`[seed-montelope] ${m}`)

  // 1) existuje už kupón s týmto kódom? (idempotencia)
  const { data: existing } = await query.graph({ entity: "promotion", fields: ["id", "code", "status", "limit"], filters: { code: CODE } })
  const found = (existing || [])[0] as any
  if (found) {
    log(`kupón ${CODE} už existuje (id=${found.id}, stav=${found.status}) – nič sa nemení`)
    return { created: false, id: found.id }
  }

  // 2) produkt, na ktorý kupón platí (1:1 zo starého e-shopu: EP.002 = AI ANASTASIA RESET 40+)
  const target = await findProduct(query, PRODUCT_SKU)
  if (!target) {
    log(`produkt so SKU ${PRODUCT_SKU} sa nenašiel – kupón sa nevytvorí`)
    return { created: false, error: "PRODUCT_NOT_FOUND" }
  }
  log(`ciel: ${target.product.title} (${target.product.handle}), SKU ${PRODUCT_SKU}`)

  // 3) platnosť ako kampan (Medusa nevie platnosť kupónu priamo)
  const identifier = `legacy-coupon-${CODE.toLowerCase()}`
  const { data: campaigns } = await query.graph({ entity: "campaign", fields: ["id", "campaign_identifier"], filters: { campaign_identifier: identifier } })
  const campaign = (campaigns || [])[0] as any
  const campaignData = campaign
    ? { campaign_id: campaign.id }
    : {
        campaign: {
          name: `Legacy kupón ${CODE}`,
          campaign_identifier: identifier,
          starts_at: new Date(VALID_FROM),
          ends_at: new Date(VALID_UNTIL),
        },
      }

  // 4) samotný kupón: fixná zľava 20 €, viacnásobné použitie (bez limitu), len na jeden produkt
  const input = {
    code: CODE,
    type: "standard" as const,
    status: "active" as const,
    is_automatic: false,
    is_tax_inclusive: true,
    // viacnásobné použitie → žiadny limit použití
    ...campaignData,
    application_method: {
      type: "fixed" as const,
      target_type: "items" as const,
      allocation: "across" as const,
      value: DISCOUNT_AMOUNT,
      currency_code: CURRENCY,
      target_rules: [{ attribute: "items.product.id", operator: "in" as const, values: [target.product.id] }],
    },
  }

  try {
    const { result } = await createPromotionsWorkflow(container).run({ input: { promotionsData: [input] } } as any)
    const created = (result as any[])?.[0]
    log(`kupón ${CODE} vytvorený (id=${created?.id ?? "?"}): -${DISCOUNT_AMOUNT} ${CURRENCY.toUpperCase()} na ${target.product.title}, platí ${VALID_FROM.slice(0, 10)} – ${VALID_UNTIL.slice(0, 10)}, viacnásobné použitie`)
    return { created: true, id: created?.id }
  } catch (error) {
    log(`vytvorenie kupónu zlyhalo: ${(error as Error).message}`)
    throw new MedusaError("UNEXPECTED_STATE", `Kupón ${CODE} sa nepodarilo vytvoriť: ${(error as Error).message}`)
  }
}
