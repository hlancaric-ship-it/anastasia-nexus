import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow, createProductVariantsWorkflow, deleteProductVariantsWorkflow, updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { DIGITAL_PROFILE_NAME, SALES_CHANNEL_NAME } from "../../scripts/anastasia-bootstrap"
import {
  formatEur, fromMinor, GIFT_VOUCHER_CURRENCY, GIFT_VOUCHER_OPTION_TITLE, GIFT_VOUCHER_PRODUCT_HANDLE, variantAmountMinor,
  type GiftVoucherSettings,
} from "./policy"

type Container = Pick<MedusaContainer, "resolve">

export const variantSku = (amountMinor: number) => `GIFT-VOUCHER-${amountMinor}`
export const variantLabel = (amountMinor: number) => formatEur(amountMinor)

export type ProductSyncPlan = { create: number[]; remove: string[]; keep: number[] }

/** Čistý plán: které hodnoty doplnit a které varianty smazat (podle metadata.gift_voucher_amount_minor). */
export function planVariantSync(wanted: number[], variants: Array<{ id: string; metadata?: Record<string, unknown> | null }>): ProductSyncPlan {
  const target = new Set(wanted)
  const seen = new Set<number>()
  const remove: string[] = []
  for (const variant of variants) {
    const amount = variantAmountMinor(variant)
    // Neznámá/duplicitní varianta se odebere – poukaz smí mít jen nakonfigurované hodnoty.
    if (!Number.isInteger(amount) || !target.has(amount) || seen.has(amount)) remove.push(variant.id)
    else seen.add(amount)
  }
  return { create: wanted.filter((amount) => !seen.has(amount)), remove, keep: wanted.filter((amount) => seen.has(amount)) }
}

function variantInput(amount: number) {
  return {
    title: variantLabel(amount), sku: variantSku(amount), manage_inventory: false, allow_backorder: false,
    options: { [GIFT_VOUCHER_OPTION_TITLE]: variantLabel(amount) },
    prices: [{ amount: fromMinor(amount), currency_code: GIFT_VOUCHER_CURRENCY }],
    metadata: { gift_voucher_amount_minor: amount },
  }
}

/**
 * Udržuje produkt „Darčekový poukaz“ v souladu s nastavením: jedna varianta na hodnotu,
 * cena = nominální hodnota (EUR), digitální profil (bez dopravy), bez skladu. Vypnutý
 * poukaz = produkt v draftu. Volá se po uložení nastavení v adminu; je idempotentní.
 */
export async function syncGiftVoucherProduct(container: Container, settings: GiftVoucherSettings): Promise<{ product_id: string; created: number; removed: number }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const find = async (entity: string, filters: Record<string, unknown>, fields: string[]) => (await query.graph({ entity, filters, fields })).data?.[0]
  const status = settings.enabled ? "published" : "draft"
  const existing = await find("product", { handle: GIFT_VOUCHER_PRODUCT_HANDLE },
    ["id", "status", "metadata", "options.id", "options.title", "variants.id", "variants.metadata"])

  if (!existing) {
    const channel = await find("sales_channel", { name: SALES_CHANNEL_NAME }, ["id"])
    const profile = await find("shipping_profile", { name: DIGITAL_PROFILE_NAME }, ["id"])
    if (!channel || !profile) throw new Error("GIFT_VOUCHER_BOOTSTRAP_MISSING")
    const { result } = await createProductsWorkflow(container as any).run({ input: { products: [{
      title: "Darčekový poukaz", handle: GIFT_VOUCHER_PRODUCT_HANDLE, status, is_giftcard: true, discountable: false,
      description: "Darčekový poukaz ANASTASIA na nákup v e-shope.",
      shipping_profile_id: profile.id, sales_channels: [{ id: channel.id }],
      metadata: { gift_voucher: true },
      options: [{ title: GIFT_VOUCHER_OPTION_TITLE, values: settings.values_minor.map(variantLabel) }],
      variants: settings.values_minor.map(variantInput),
    }] } } as any)
    return { product_id: (result as any)[0].id, created: settings.values_minor.length, removed: 0 }
  }

  const plan = planVariantSync(settings.values_minor, existing.variants ?? [])
  if (plan.remove.length) await deleteProductVariantsWorkflow(container as any).run({ input: { ids: plan.remove } })
  if (plan.create.length) {
    const option = (existing.options ?? []).find((o: any) => o.title === GIFT_VOUCHER_OPTION_TITLE)
    if (!option) throw new Error("GIFT_VOUCHER_PRODUCT_OPTION_MISSING")
    // Nové hodnoty se nejdřív přidají k volbě produktu, pak vznikne varianta.
    const productModule = container.resolve(Modules.PRODUCT) as any
    await productModule.updateProductOptionValuesOnProduct({
      product_id: existing.id, product_option_id: option.id, add: plan.create.map((amount) => ({ value: variantLabel(amount) })),
    })
    await createProductVariantsWorkflow(container as any).run({ input: {
      product_variants: plan.create.map((amount) => ({ product_id: existing.id, ...variantInput(amount) })),
    } } as any)
  }
  if (existing.status !== status || existing.metadata?.gift_voucher !== true) {
    await updateProductsWorkflow(container as any).run({ input: { selector: { id: existing.id },
      update: { status, metadata: { ...(existing.metadata ?? {}), gift_voucher: true } } } } as any)
  }
  return { product_id: existing.id, created: plan.create.length, removed: plan.remove.length }
}
