import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  addShippingMethodToCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  listShippingOptionsForCartWithPricingWorkflow,
} from "@medusajs/medusa/core-flows"
import { repriceCart } from "../../nexus-cart/route"
import { recordEvent } from "../../../../lib/observability/events"
import {
  PAYMENT_METHODS, PICKUP_ADDRESS, CheckoutChoiceError, amountValue, assertCartShippingReady, freeShippingThreshold, loadCartShape, resolvePhysicalShippingType,
  type CartShape, type DeliveryCode, type PaymentMethodCode, type ShippingTypeCode,
} from "../../../../lib/checkout/delivery-payment"

/**
 * Výber dopravy a platby v pokladni. Server vráti možnosti s cenami z Medusy (GET) a po výbere
 * (POST) sám nastaví dopravu, prepočíta košík cez NEXUS a založí platobnú session. Klient posiela
 * len kódy (`courier`/`pickup`, `cod`/`card`/`bank_transfer`), nikdy sumy ani provider ID.
 */

const CART_FIELDS = [
  "id", "customer_id", "completed_at", "currency_code", "region_id",
  "shipping_address.country_code",
  "items.id", "items.product.shipping_profile.id",
  "shipping_methods.id", "shipping_methods.shipping_option_id",
  "region.payment_providers.id", "region.countries.iso_2",
  "payment_collection.id",
]

const SUMMARY_FIELDS = [
  "id", "currency_code", "total", "item_total", "shipping_total", "tax_total",
  "shipping_methods.name", "shipping_methods.amount", "shipping_methods.shipping_option_id",
  "payment_collection.id", "payment_collection.payment_sessions.id", "payment_collection.payment_sessions.provider_id",
  "payment_collection.payment_sessions.data", "payment_collection.payment_sessions.status",
]

type PricedOption = { id: string; name: string; shipping_profile_id: string; type?: { code?: string } | null; amount?: unknown; calculated_price?: { calculated_amount?: unknown } | null; prices?: any[] }

async function loadOwnedCart(req: AuthenticatedMedusaRequest, cartId: unknown, actorId: string) {
  if (typeof cartId !== "string" || !/^cart_[A-Za-z0-9]+$/.test(cartId)) throw new CheckoutChoiceError("INVALID_CART_ID")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({ entity: "cart", fields: CART_FIELDS, filters: { id: cartId } })
  const cart = data?.[0]
  if (!cart) throw new CheckoutChoiceError("CART_NOT_FOUND", 404)
  if (cart.customer_id !== actorId) throw new CheckoutChoiceError("CART_ACCESS_DENIED", 403)
  if (cart.completed_at) throw new CheckoutChoiceError("CART_COMPLETED", 409)
  if (cart.currency_code !== "eur") throw new CheckoutChoiceError("UNSUPPORTED_CURRENCY")
  if (!cart.items?.length) throw new CheckoutChoiceError("CART_EMPTY")
  return cart
}

async function shapeOf(req: AuthenticatedMedusaRequest, cart: any): Promise<CartShape> {
  return loadCartShape(req.scope, {
    profileIds: (cart.items || []).map((item: any) => item?.product?.shipping_profile?.id).filter(Boolean),
    shippingOptionIds: (cart.shipping_methods || []).map((method: any) => method?.shipping_option_id).filter(Boolean),
  })
}

async function pricedOptions(req: AuthenticatedMedusaRequest, cart: any): Promise<PricedOption[]> {
  if (!cart.shipping_address?.country_code) throw new CheckoutChoiceError("ADDRESS_REQUIRED", 409)
  const { result } = await listShippingOptionsForCartWithPricingWorkflow(req.scope).run({ input: { cart_id: cart.id, is_return: false } })
  return (result || []) as PricedOption[]
}

const priceOf = (option: PricedOption | undefined) => {
  const amount = amountValue(option?.calculated_price?.calculated_amount ?? option?.amount)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

function pick(options: PricedOption[], profileIds: string[], type: ShippingTypeCode): PricedOption | undefined {
  return options.find((option) => profileIds.includes(option.shipping_profile_id) && option.type?.code === type && priceOf(option) !== null)
}

function regionProviders(cart: any): Set<string> {
  return new Set((cart.region?.payment_providers || []).map((provider: any) => provider?.id).filter(Boolean))
}

function sendError(res: MedusaResponse, error: unknown) {
  if (error instanceof CheckoutChoiceError) return res.status(error.status).json({ ok: false, error: error.code })
  const message = error instanceof Error ? error.message : ""
  if (message === "CART_ACCESS_DENIED") return res.status(403).json({ ok: false, error: message })
  if (message.startsWith("NEXUS_PRICING")) return res.status(503).json({ ok: false, error: message })
  return res.status(400).json({ ok: false, error: /^[A-Z][A-Z0-9_]{2,63}$/.test(message) ? message : "CHECKOUT_OPTIONS_FAILED" })
}

/** Možnosti dopravy a platby pre aktuálny košík (ceny podľa aktuálnej hodnoty tovaru). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const actorId = req.auth_context?.actor_type === "customer" ? req.auth_context.actor_id : undefined
  if (!actorId) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" })
  try {
    const cart = await loadOwnedCart(req, (req.query as Record<string, unknown>)?.cart_id, actorId)
    const shape = await shapeOf(req, cart)
    const options = shape.hasPhysical ? await pricedOptions(req, cart) : []
    const courier = pick(options, shape.physicalProfileIds, "courier")
    const courierCod = pick(options, shape.physicalProfileIds, "courier_cod")
    const pickup = pick(options, shape.physicalProfileIds, "pickup")
    const providers = regionProviders(cart)
    const codFee = courier && courierCod ? Math.round((priceOf(courierCod)! - priceOf(courier)!) * 100) / 100 : null
    const delivery = shape.hasPhysical ? [
      ...(courier ? [{ code: "courier" as DeliveryCode, name: courier.name, amount: priceOf(courier), free_from: freeShippingThreshold(courier.prices) }] : []),
      ...(pickup ? [{ code: "pickup" as DeliveryCode, name: pickup.name, amount: priceOf(pickup), address: PICKUP_ADDRESS }] : []),
    ] : []
    const payment = PAYMENT_METHODS.map((method) => {
      const inRegion = providers.has(method.provider_id)
      if (method.code === "cod") {
        const available = inRegion && shape.hasPhysical && Boolean(courierCod) && codFee !== null && codFee >= 0
        return { code: method.code, label: method.label, available, fee: available ? codFee : null, requires_delivery: "courier" as DeliveryCode, reason: !shape.hasPhysical ? "DIGITAL_ONLY" : available ? null : "UNAVAILABLE" }
      }
      return { code: method.code, label: method.label, available: inRegion, fee: 0, reason: inRegion ? null : "UNAVAILABLE" }
    })
    return res.status(200).json({ ok: true, requires_delivery: shape.hasPhysical, delivery, payment })
  } catch (error) {
    return sendError(res, error)
  }
}

/** Uloží výber dopravy a platby a pripraví platbu (pri karte vráti client_secret pre Stripe). */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const actorId = req.auth_context?.actor_type === "customer" ? req.auth_context.actor_id : undefined
  if (!actorId) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" })
  const body = (req.body || {}) as { cart_id?: unknown; delivery?: unknown; payment?: unknown }
  try {
    const payment = PAYMENT_METHODS.find((method) => method.code === body.payment)
    if (!payment) throw new CheckoutChoiceError("INVALID_PAYMENT_METHOD")
    if (body.delivery !== undefined && body.delivery !== null && body.delivery !== "courier" && body.delivery !== "pickup") throw new CheckoutChoiceError("INVALID_DELIVERY")
    const cart = await loadOwnedCart(req, body.cart_id, actorId)
    if (!regionProviders(cart).has(payment.provider_id)) throw new CheckoutChoiceError("PAYMENT_METHOD_UNAVAILABLE")
    const shape = await shapeOf(req, cart)
    const physicalType = resolvePhysicalShippingType(shape, body.delivery as DeliveryCode | null | undefined, payment.code as PaymentMethodCode)

    // Doprava: jedna možnosť pre každý profil v košíku, typ určuje server.
    const options = await pricedOptions(req, cart)
    const chosen: PricedOption[] = []
    if (physicalType) {
      for (const profileId of shape.physicalProfileIds) {
        const option = pick(options, [profileId], physicalType)
        if (!option) throw new CheckoutChoiceError("SHIPPING_OPTION_UNAVAILABLE", 409)
        chosen.push(option)
      }
    }
    for (const profileId of shape.digitalProfileIds) {
      const option = pick(options, [profileId], "digital")
      if (!option) throw new CheckoutChoiceError("SHIPPING_OPTION_UNAVAILABLE", 409)
      chosen.push(option)
    }
    const profiles = new Set([...shape.physicalProfileIds, ...shape.digitalProfileIds])
    const optionProfile = new Map(options.map((option) => [option.id, option.shipping_profile_id]))
    // Doprava z profilu, ktorý už v košíku nie je (napr. kuriér po odobratí fyzického tovaru), sa odstráni.
    const stale = (cart.shipping_methods || []).filter((method: any) => !profiles.has(optionProfile.get(method.shipping_option_id) as string)).map((method: any) => method.id)
    if (stale.length) await (req.scope.resolve(Modules.CART) as any).deleteShippingMethods(stale)
    if (chosen.length) {
      await addShippingMethodToCartWorkflow(req.scope).run({ input: { cart_id: cart.id, options: chosen.map((option) => ({ id: option.id })) } })
    }

    // Bez platnej dopravy pre všetky profily sa platba vôbec nepripraví (inak by zákazník zaplatil bez objednávky).
    await assertCartShippingReady(req.scope, cart.id)
    // Ceny položiek (NEXUS) a suma platby sa prepočítajú až po zmene dopravy.
    await repriceCart(cart.id, req.scope, true, undefined, actorId)
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    let summary = (await query.graph({ entity: "cart", fields: SUMMARY_FIELDS, filters: { id: cart.id } })).data?.[0]
    const total = amountValue(summary?.total)
    if (!summary || !Number.isFinite(total) || total < 0) throw new CheckoutChoiceError("CART_TOTAL_INVALID", 409)

    let clientSecret: string | null = null
    if (total > 0) {
      let collectionId = summary.payment_collection?.id as string | undefined
      if (!collectionId) {
        await createPaymentCollectionForCartWorkflow(req.scope).run({ input: { cart_id: cart.id } })
        summary = (await query.graph({ entity: "cart", fields: SUMMARY_FIELDS, filters: { id: cart.id } })).data?.[0]
        collectionId = summary?.payment_collection?.id
      }
      if (!collectionId) throw new CheckoutChoiceError("PAYMENT_COLLECTION_FAILED", 409)
      const { result: session } = await createPaymentSessionsWorkflow(req.scope).run({
        input: { payment_collection_id: collectionId, provider_id: payment.provider_id, customer_id: actorId },
      })
      const secret = (session as any)?.data?.client_secret
      if (payment.code === "card") {
        if (typeof secret !== "string" || !secret) throw new CheckoutChoiceError("PAYMENT_PROVIDER_UNAVAILABLE", 503)
        clientSecret = secret
      }
    }
    const shipping = (summary.shipping_methods || []).map((method: any) => ({ name: method.name, amount: amountValue(method.amount) }))
    await recordEvent(req.scope, "info", "checkout", "options_selected", {
      cart_id: cart.id, payment_method: payment.code, delivery: physicalType ?? "digital", total,
    })
    return res.status(200).json({
      ok: true,
      delivery: physicalType === "courier_cod" ? "courier" : physicalType,
      payment: payment.code,
      payment_required: total > 0,
      client_secret: clientSecret,
      shipping,
      totals: {
        item_total: amountValue(summary.item_total), shipping_total: amountValue(summary.shipping_total),
        tax_total: amountValue(summary.tax_total), total,
      },
    })
  } catch (error) {
    const code = error instanceof CheckoutChoiceError ? error.code : error instanceof Error && /^[A-Z][A-Z0-9_]{2,63}$/.test(error.message) ? error.message : "CHECKOUT_OPTIONS_FAILED"
    await recordEvent(req.scope, "warn", "checkout", "options_rejected", { cart_id: typeof body.cart_id === "string" ? body.cart_id : null, error_code: code }).catch(() => undefined)
    return sendError(res, error)
  }
}
