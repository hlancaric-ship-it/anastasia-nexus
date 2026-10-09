import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, QueryContext } from "@medusajs/framework/utils"
import { updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows"
import { refreshPaymentCollectionForCartWorkflow } from "@medusajs/medusa/core-flows"

type PriceResponse = {
  ok: true
  tenantId: string
  calculated: { finalPrice: number; appliedRules: string[]; rejected: unknown[] }
}

/** Recalculate every existing cart line using Medusa catalog data and NEXUS. */
export async function repriceCart(cartId: string, scope: MedusaRequest["scope"], applyChanges = true) {
  if (!cartId || typeof cartId !== "string") throw new Error("INVALID_CART_ID")
  const query: any = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id", "currency_code", "region_id", "customer.metadata", "customer.groups.name",
      "items.id", "items.quantity", "items.variant_id", "items.unit_price",
    ],
    filters: { id: cartId },
  })
  const cart = data?.[0]
  if (!cart) throw new Error("CART_NOT_FOUND")
  const tenantId = process.env.NEXUS_TENANT_ID
  const pricingUrl = process.env.NEXUS_PRICING_URL
  const apiKey = process.env.NEXUS_PRICING_API_KEY
  if (!tenantId || !pricingUrl || !apiKey) throw new Error("NEXUS_PRICING_NOT_CONFIGURED")
  if (cart.currency_code !== "eur") throw new Error("UNSUPPORTED_CURRENCY")
  const variantIds = (cart.items || []).map((item: any) => item.variant_id).filter(Boolean)
  const variantsResult = variantIds.length ? await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "calculated_price.calculated_amount", "calculated_price.original_amount", "calculated_price.currency_code", "product.title", "product.metadata"],
    filters: { id: variantIds },
    context: {
      calculated_price: QueryContext({
        region_id: cart.region_id,
        currency_code: cart.currency_code,
      }),
    },
  }) : { data: [] }
  const variants = new Map((variantsResult.data || []).map((variant: any) => [variant.id, variant]))

  const groups = (cart.customer?.groups || []).map((group: any) => String(group.name || "").toUpperCase())
  const customerTier = groups.find((name: string) => /^ZR\d+$/.test(name))
  const pricedItems: Array<{ id: string; sku: string; quantity: number; unit_price: number; is_discountable: boolean; metadata: Record<string, unknown> }> = []
  let pricesChanged = false
  for (const item of cart.items || []) {
    const variant = variants.get(item.variant_id) as any
    const product = variant?.product
    const currentAmount = Number(variant?.calculated_price?.calculated_amount)
    const originalAmount = Number(variant?.calculated_price?.original_amount)
    const quantity = Number(item.quantity)
    if (!variant?.id || !variant.sku || variant.calculated_price?.currency_code !== cart.currency_code || !Number.isFinite(currentAmount) || currentAmount < 0 || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error("INVALID_MEDUSA_LINE_ITEM")
    }
    const basePrice = Number.isFinite(originalAmount) && originalAmount >= currentAmount ? originalAmount : currentAmount
    const salePrice = basePrice > currentAmount ? currentAmount : undefined
    const metadata = product?.metadata || {}
    let response: Response
    try {
      response = await fetch(pricingUrl, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
        tenantId,
        sku: variant.sku,
        basePrice,
        salePrice,
        customerTier,
        manufacturer: typeof metadata.manufacturer === "string" ? metadata.manufacturer : undefined,
        category: typeof metadata.category === "string" ? metadata.category : undefined,
        productMaxDiscount: typeof metadata.max_discount === "number" ? metadata.max_discount : undefined,
        allowLoyaltyDiscount: true,
        }),
      })
    } catch {
      throw new Error("NEXUS_PRICING_UNAVAILABLE")
    }
    if (!response.ok) throw new Error(`NEXUS_PRICING_FAILED_${response.status}`)
    const price = await response.json() as PriceResponse
    if (!price.ok || price.tenantId !== tenantId || !Number.isFinite(price.calculated?.finalPrice) || price.calculated.finalPrice < 0) {
      throw new Error("INVALID_NEXUS_PRICE_RESPONSE")
    }
    pricedItems.push({
      id: item.id,
      sku: variant.sku,
      quantity,
      unit_price: price.calculated.finalPrice,
      is_discountable: false,
      metadata: { nexus_tenant_id: tenantId, nexus_pricing_rules: price.calculated.appliedRules },
    })
    pricesChanged ||= Number(item.unit_price) !== price.calculated.finalPrice
  }

  if (applyChanges) {
    for (const item of pricedItems) {
      await updateLineItemInCartWorkflow(scope).run({ input: { cart_id: cartId, item_id: item.id, update: { unit_price: item.unit_price, is_discountable: false, metadata: item.metadata } } })
    }
    await refreshPaymentCollectionForCartWorkflow(scope).run({ input: { cart_id: cartId } })
  }
  return { tenantId, items: pricedItems, pricesChanged }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { cart_id: cartId } = req.body as { cart_id?: string }
    const pricing = await repriceCart(cartId || "", req.scope)
    return res.status(200).json({ ok: true, ...pricing })
  } catch (error) {
    const message = error instanceof Error ? error.message : "PRICING_FAILED"
    const status = message === "CART_NOT_FOUND" ? 404 : message.startsWith("NEXUS_PRICING") ? 503 : 400
    return res.status(status).json({ ok: false, error: message })
  }
}
