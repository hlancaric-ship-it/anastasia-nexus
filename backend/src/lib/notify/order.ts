import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { resolveOrderIdByPayment } from "../../modules/entitlement/order-sync"
import { capturedTotal, isOrderPaid, refundedTotal, toNumber, type OrderPaymentView } from "../../modules/entitlement/policy"
import { sendEmail } from "../email/send"
import { recordEvent } from "../observability/events"
import type { NotifyResult } from "./index"

/**
 * E-maily k objednávce a účtu (C-1). Stejná pravidla jako `notify` u rezervací:
 * adresát jen ze serveru (e-mail objednávky / zákaznice), idempotency_key = typ + ID,
 * do šablony jen čísla, částky, názvy položek a odkaz; nikdy nevyhodí.
 *
 * Zdvojení platba × objednávka: platba kartou se zachytí ještě před `order.placed`, potvrzení objednávky
 * pak rovnou říká „platba prijatá“. Samostatný e-mail o platbě jde jen tehdy, když potvrzení objednávky
 * odešlo jako nezaplacené (`data.paid !== true`) – typicky převod nebo ruční zachycení v adminu.
 */
export const ORDER_TEMPLATES = {
  placed: "order-placed-sk",
  paymentCaptured: "payment-captured-sk",
  shipped: "order-shipped-sk",
  refunded: "order-refunded-sk",
  canceled: "order-canceled-sk",
  welcome: "customer-welcome-sk",
  withdrawalReceived: "withdrawal-received-sk",
} as const

/** Uvítání jen pro účet založený právě teď (ne import, ne staré účty při pozdějším eventu). */
export const WELCOME_MAX_AGE_MS = 60 * 60 * 1000
const MAX_ITEMS = 50

type Container = Pick<MedusaContainer, "resolve">
type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: any[] }> }
type NotificationRow = { id: string; data?: Record<string, unknown> | null }
type Fields = Record<string, unknown>

type OrderRow = OrderPaymentView & {
  id: string
  display_id?: number | string | null
  email?: string | null
  currency_code?: string | null
  item_total?: unknown
  shipping_total?: unknown
  discount_total?: unknown
  customer?: { first_name?: string | null } | null
  shipping_address?: { first_name?: string | null } | null
  billing_address?: { first_name?: string | null } | null
  items?: Array<{ title?: string | null; product_title?: string | null; quantity?: unknown; total?: unknown }> | null
}

const ORDER_FIELDS = [
  "id", "display_id", "email", "currency_code", "status", "total", "item_total", "shipping_total", "discount_total",
  "customer.first_name", "shipping_address.first_name", "billing_address.first_name",
  "items.title", "items.product_title", "items.quantity", "items.total",
  "payment_collections.captured_amount", "payment_collections.refunded_amount", "payment_collections.payments.captured_at",
]

const env = (name: string) => (process.env[name] || "").trim()
const query = (container: Container) => container.resolve(ContainerRegistrationKeys.QUERY) as Query
const clean = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)

export function formatMoney(amount: unknown, currency: string | null | undefined): string {
  const code = (clean(currency) ?? "eur").toUpperCase()
  const value = toNumber(amount)
  try {
    return new Intl.NumberFormat("sk-SK", { style: "currency", currency: code }).format(value)
  } catch {
    return `${value.toFixed(2).replace(".", ",")} ${code}`
  }
}

/** Odkaz do účtu na detail objednávky (`ACCOUNT_ORDERS_URL/<order_id>`); bez nastavení bez tlačítka. */
export function orderUrl(orderId: string): string | null {
  const base = env("ACCOUNT_ORDERS_URL")
  return base ? `${base.replace(/\/$/, "")}/${encodeURIComponent(orderId)}` : null
}

const firstName = (order: OrderRow) =>
  clean(order.customer?.first_name) ?? clean(order.shipping_address?.first_name) ?? clean(order.billing_address?.first_name)

/** Data pro `order-placed-sk` (čistá funkce, testovatelná bez kontejneru). */
export function orderPlacedData(order: OrderRow): Record<string, unknown> {
  const money = (value: unknown) => formatMoney(value, order.currency_code)
  const shipping = toNumber(order.shipping_total)
  const discount = toNumber(order.discount_total)
  return {
    order_display_id: order.display_id != null ? String(order.display_id) : null,
    first_name: firstName(order),
    items: (order.items ?? []).slice(0, MAX_ITEMS).map(item => ({
      title: clean(item.product_title) ?? clean(item.title) ?? "Položka",
      quantity: toNumber(item.quantity) || 1,
      total: money(item.total),
    })),
    subtotal: money(order.item_total),
    shipping_total: shipping > 0 ? money(shipping) : null,
    discount_total: discount > 0 ? money(discount) : null,
    total: money(order.total),
    paid: isOrderPaid(order),
    url: orderUrl(order.id),
  }
}

async function loadOrder(container: Container, orderId: string): Promise<OrderRow | null> {
  const { data } = await query(container).graph({ entity: "order", fields: ORDER_FIELDS, filters: { id: orderId } })
  return (data?.[0] as OrderRow) ?? null
}

/** Běžné důvody, proč e-mail neodejde (nejde o chybu) – logují se jako info. */
const EXPECTED_SKIPS = new Set(["TEMPLATE_DISABLED", "NO_NOTIFICATION", "ORDER_EMAIL_PENDING", "PAID_IN_ORDER_EMAIL", "NO_ACCOUNT", "LEGACY_MIGRATION", "NOT_NEW"])

async function result(container: Container, fields: Fields, run: () => Promise<NotifyResult>): Promise<NotifyResult> {
  try {
    const out = await run()
    if (out.status === "sent") await recordEvent(container as MedusaContainer, "info", "notification", "sent", fields)
    else if (out.status === "skipped") await recordEvent(container as MedusaContainer, EXPECTED_SKIPS.has(out.reason ?? "") ? "info" : "warn", "notification", "skipped", { ...fields, skip_reason: out.reason })
    return out
  } catch (error) {
    await recordEvent(container as MedusaContainer, "error", "notification", "send_failed", { ...fields, error })
    return { status: "skipped", reason: "SEND_FAILED" }
  }
}

async function send(container: Container, input: Parameters<typeof sendEmail>[1]): Promise<NotifyResult> {
  const out = await sendEmail(container, input)
  if (out.status === "disabled") return { status: "skipped", reason: "TEMPLATE_DISABLED" }
  return { status: out.status }
}

const skip = (reason: string): NotifyResult => ({ status: "skipped", reason })

export async function notifyOrderPlaced(container: Container, orderId: string): Promise<NotifyResult> {
  const fields = { notify_type: "order.placed", template: ORDER_TEMPLATES.placed, order_id: orderId }
  return result(container, fields, async () => {
    const order = await loadOrder(container, orderId)
    if (!order) return skip("ORDER_NOT_FOUND")
    const to = clean(order.email)
    if (!to) return skip("NO_EMAIL")
    return send(container, {
      to, template: ORDER_TEMPLATES.placed, idempotency_key: `order.placed:${order.id}`,
      resource_id: order.id, resource_type: "order", data: orderPlacedData(order),
    })
  })
}

export async function notifyPaymentCaptured(container: Container, paymentId: string): Promise<NotifyResult> {
  const fields = { notify_type: "payment.captured", template: ORDER_TEMPLATES.paymentCaptured, payment_id: paymentId }
  return result(container, fields, async () => {
    const orderId = await resolveOrderIdByPayment(container, paymentId)
    if (!orderId) return skip("ORDER_NOT_FOUND")
    const notifications = container.resolve(Modules.NOTIFICATION) as unknown as {
      listNotifications: (f: Fields, c?: Fields) => Promise<NotificationRow[]>
    }
    const [placed] = await notifications.listNotifications({ idempotency_key: `order.placed:${orderId}` }, { take: 1, select: ["id", "data"] })
    // Potvrzení objednávky ještě neodešlo → až odejde, uvidí objednávku jako zaplacenou.
    if (!placed) return skip("ORDER_EMAIL_PENDING")
    if (placed.data?.paid === true) return skip("PAID_IN_ORDER_EMAIL")
    const order = await loadOrder(container, orderId)
    if (!order) return skip("ORDER_NOT_FOUND")
    if (!isOrderPaid(order)) return skip("NOT_PAID")
    const to = clean(order.email)
    if (!to) return skip("NO_EMAIL")
    return send(container, {
      to, template: ORDER_TEMPLATES.paymentCaptured, idempotency_key: `order.paid:${order.id}`,
      resource_id: order.id, resource_type: "order",
      data: {
        order_display_id: order.display_id != null ? String(order.display_id) : null,
        amount: formatMoney(capturedTotal(order), order.currency_code),
        url: orderUrl(order.id),
      },
    })
  })
}

export async function notifyShipment(container: Container, fulfillmentId: string, noNotification = false): Promise<NotifyResult> {
  const fields = { notify_type: "shipment.created", template: ORDER_TEMPLATES.shipped, fulfillment_id: fulfillmentId }
  return result(container, fields, async () => {
    if (noNotification) return skip("NO_NOTIFICATION")
    const { data: links } = await query(container).graph({ entity: "order_fulfillment", fields: ["order_id", "fulfillment_id"], filters: { fulfillment_id: fulfillmentId } })
    const orderId = links?.[0]?.order_id as string | undefined
    if (!orderId) return skip("ORDER_NOT_FOUND")
    const order = await loadOrder(container, orderId)
    if (!order) return skip("ORDER_NOT_FOUND")
    const to = clean(order.email)
    if (!to) return skip("NO_EMAIL")
    const { data: fulfillments } = await query(container).graph({ entity: "fulfillment", fields: ["id", "labels.tracking_number", "labels.tracking_url"], filters: { id: fulfillmentId } })
    const label = (fulfillments?.[0]?.labels ?? []).find((l: Fields) => clean(l?.tracking_number)) as Fields | undefined
    return send(container, {
      to, template: ORDER_TEMPLATES.shipped, idempotency_key: `order.shipped:${fulfillmentId}`,
      resource_id: order.id, resource_type: "order",
      data: {
        order_display_id: order.display_id != null ? String(order.display_id) : null,
        tracking_number: clean(label?.tracking_number),
        tracking_url: clean(label?.tracking_url),
        url: orderUrl(order.id),
      },
    })
  })
}

/** Jeden e-mail za každý refund platby (idempotentně podle ID refundu – starší refundy se znovu neposílají). */
export async function notifyRefunds(container: Container, paymentId: string): Promise<NotifyResult[]> {
  const fields = { notify_type: "payment.refunded", template: ORDER_TEMPLATES.refunded, payment_id: paymentId }
  let order: OrderRow | null = null
  let payment: { currency_code?: string | null; refunds?: Array<{ id?: string; amount?: unknown }> | null } | undefined
  const prepared = await result(container, fields, async () => {
    const orderId = await resolveOrderIdByPayment(container, paymentId)
    if (!orderId) return skip("ORDER_NOT_FOUND")
    order = await loadOrder(container, orderId)
    if (!order) return skip("ORDER_NOT_FOUND")
    if (!clean(order.email)) return skip("NO_EMAIL")
    const { data } = await query(container).graph({ entity: "payment", fields: ["id", "currency_code", "refunds.id", "refunds.amount"], filters: { id: paymentId } })
    payment = data?.[0]
    return { status: "duplicate" } // jen příprava; výsledek každého refundu se zapisuje zvlášť níže
  })
  if (prepared.status === "skipped" || !order) return [prepared]
  const target = order as OrderRow
  const refunds = (payment?.refunds ?? []).filter(r => r?.id && toNumber(r.amount) > 0)
  if (!refunds.length) return [await result(container, fields, async () => skip("NO_REFUNDS"))]
  const out: NotifyResult[] = []
  for (const refund of refunds) {
    out.push(await result(container, { ...fields, order_id: target.id, refund_id: refund.id }, () => send(container, {
      to: clean(target.email)!, template: ORDER_TEMPLATES.refunded, idempotency_key: `order.refunded:${refund.id}`,
      resource_id: target.id, resource_type: "order",
      data: {
        order_display_id: target.display_id != null ? String(target.display_id) : null,
        amount: formatMoney(refund.amount, payment?.currency_code ?? target.currency_code),
        url: orderUrl(target.id),
      },
    })))
  }
  return out
}

export async function notifyOrderCanceled(container: Container, orderId: string): Promise<NotifyResult> {
  const fields = { notify_type: "order.canceled", template: ORDER_TEMPLATES.canceled, order_id: orderId }
  return result(container, fields, async () => {
    const order = await loadOrder(container, orderId)
    if (!order) return skip("ORDER_NOT_FOUND")
    const to = clean(order.email)
    if (!to) return skip("NO_EMAIL")
    return send(container, {
      to, template: ORDER_TEMPLATES.canceled, idempotency_key: `order.canceled:${order.id}`,
      resource_id: order.id, resource_type: "order",
      data: {
        order_display_id: order.display_id != null ? String(order.display_id) : null,
        // Zaplaceno a ještě nevráceno → věta „peniaze Vám vrátime“.
        paid: capturedTotal(order) - refundedTotal(order) > 0.005,
        url: orderUrl(order.id),
      },
    })
  })
}

type CustomerRow = { id: string; email?: string | null; first_name?: string | null; has_account?: boolean | null; created_at?: Date | string | null; metadata?: Record<string, unknown> | null }

/** Uvítání po registraci: jen skutečný účet, založený před chvílí, ne převedený ze starého webu. */
export function welcomeEligibility(customer: CustomerRow | null | undefined, now = new Date()): string | null {
  if (!customer) return "CUSTOMER_NOT_FOUND"
  if (!customer.has_account) return "NO_ACCOUNT"
  if (customer.metadata && Object.prototype.hasOwnProperty.call(customer.metadata, "legacy_customer_migration")) return "LEGACY_MIGRATION"
  const created = customer.created_at ? new Date(customer.created_at) : null
  if (!created || Number.isNaN(created.getTime()) || now.getTime() - created.getTime() > WELCOME_MAX_AGE_MS) return "NOT_NEW"
  if (!clean(customer.email)) return "NO_EMAIL"
  return null
}

export async function notifyCustomerWelcome(container: Container, customerId: string, now = new Date()): Promise<NotifyResult> {
  const fields = { notify_type: "customer.created", template: ORDER_TEMPLATES.welcome, customer_id: customerId }
  return result(container, fields, async () => {
    const { data } = await query(container).graph({ entity: "customer", fields: ["id", "email", "first_name", "has_account", "created_at", "metadata"], filters: { id: customerId } })
    const customer = data?.[0] as CustomerRow | undefined
    const reason = welcomeEligibility(customer, now)
    if (reason) return skip(reason)
    return send(container, {
      to: clean(customer!.email)!, template: ORDER_TEMPLATES.welcome, idempotency_key: `customer.welcome:${customer!.id}`,
      resource_id: customer!.id, resource_type: "customer",
      data: { first_name: clean(customer!.first_name), url: env("ACCOUNT_URL") || null },
    })
  })
}
