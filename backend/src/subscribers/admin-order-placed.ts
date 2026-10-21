import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { sendEmail } from "../lib/email/send"
import { recordEvent } from "../lib/observability/events"

const env = (name: string) => (process.env[name] || "").trim()

/**
 * Nová objednávka → e-mail správcovi.
 *
 * Bez tohto e-mailu sa o novej objednávke dozvie správca až pri otvorení administrácie.
 * Adresa správcu: `ORDER_NOTIFY_EMAIL` (bez nej sa použije `CHAT_ADMIN_NOTIFY_EMAIL`).
 * Šablóna: „order-placed-admin“ (v zozname e-mailových šablón v administrácii).
 */
export default async function adminOrderPlacedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const orderId = event.data?.id
  try {
    const to = env("ORDER_NOTIFY_EMAIL") || env("CHAT_ADMIN_NOTIFY_EMAIL")
    if (!to) {
      await recordEvent(container, "info", "notification", "order_admin_notify_no_email", { order_id: orderId })
      return
    }
    const orders = container.resolve(Modules.ORDER) as any
    const order = await orders.retrieveOrder(orderId, {
      relations: ["items", "customer", "shipping_address", "payment_collections.payment_sessions"],
    })
    const customer = order.customer ?? {}
    const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || order.email || "—"
    const total = new Intl.NumberFormat("sk-SK", { style: "currency", currency: order.currency_code || "eur" }).format(Number(order.total ?? 0))
    const payment = (order.payment_collections ?? []).flatMap((pc: any) => pc.payment_sessions ?? []).map((ps: any) => ps.provider_id ?? ps.id).filter(Boolean)
    const shipping = (order.shipping_methods ?? []).map((m: any) => m.name).filter(Boolean).join(", ")
    // Vlastná administrácia (Medusa /app je vypnutý); bez ADMIN_URL prvý pôvod z ADMIN_CORS.
    const adminUrl = env("ADMIN_URL") || `${(env("ADMIN_CORS") || "http://localhost:5173").split(",")[0].trim().replace(/\/+$/, "")}/#/objednavky`
    await sendEmail(container, {
      to,
      template: "order-placed-admin",
      idempotency_key: `order-placed-admin:${order.id}`,
      resource_type: "order",
      resource_id: order.id,
      data: {
        order_display_id: order.display_id,
        first_name: name,
        total,
        payment_status: payment.join(", ") || "nepoplatená",
        shipping_method: shipping || "—",
        admin_url: adminUrl,
      },
    })
  } catch (error) {
    // Chyba notifikácie nesmie zablokovať objednávku – len ju zapíšeme.
    await recordEvent(container, "error", "notification", "order_admin_notify_failed", { order_id: orderId, error })
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
