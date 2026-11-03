import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { buildInvoiceModel, type InvoiceModel, type InvoiceOrder } from "./model"
import { renderInvoicePdf } from "./pdf"

const FIELDS = [
  "id", "display_id", "created_at", "currency_code", "status", "email", "total",
  "items.title", "items.product_title", "items.quantity", "items.total", "items.tax_total", "items.tax_lines.rate",
  "shipping_methods.name", "shipping_methods.amount", "shipping_methods.total", "shipping_methods.tax_total", "shipping_methods.tax_lines.rate",
  "metadata", "customer.first_name", "customer.last_name",
  "billing_address.first_name", "billing_address.last_name", "billing_address.company", "billing_address.address_1", "billing_address.address_2", "billing_address.postal_code", "billing_address.city", "billing_address.country_code",
  "shipping_address.first_name", "shipping_address.last_name", "shipping_address.company", "shipping_address.address_1", "shipping_address.address_2", "shipping_address.postal_code", "shipping_address.city", "shipping_address.country_code",
  "payment_collections.captured_amount", "payment_collections.refunded_amount", "payment_collections.payments.provider_id", "payment_collections.payments.captured_at",
]

export async function loadInvoiceOrder(container: Pick<MedusaContainer, "resolve">, orderId: string): Promise<InvoiceOrder | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as { graph: (q: Record<string, unknown>) => Promise<{ data?: unknown[] }> }
  const { data } = await query.graph({ entity: "order", fields: FIELDS, filters: { id: orderId } })
  return (data?.[0] as InvoiceOrder | undefined) ?? null
}

export async function loadAllInvoiceOrders(container: Pick<MedusaContainer, "resolve">, limit = 500): Promise<InvoiceOrder[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as { graph: (q: Record<string, unknown>) => Promise<{ data?: unknown[] }> }
  const { data } = await query.graph({ entity: "order", fields: FIELDS, pagination: { take: Math.min(Math.max(limit, 1), 1000), order: { created_at: "DESC" } } })
  return (data as InvoiceOrder[] | undefined) ?? []
}

export async function invoicePdfForOrder(container: Pick<MedusaContainer, "resolve">, orderId: string): Promise<{ model: InvoiceModel; pdf: Buffer } | null> {
  const order = await loadInvoiceOrder(container, orderId)
  if (!order) return null
  const model = buildInvoiceModel(order)
  return { model, pdf: await renderInvoicePdf(model) }
}

export const invoiceFileName = (model: InvoiceModel) => `${model.kind === "invoice" ? "Faktura" : "Zalohova-faktura"}-${model.number}.pdf`

/** Faktúra ako príloha e-mailu. Pri chybe vráti null a e-mail odíde aj bez nej. */
export async function invoiceAttachment(container: Pick<MedusaContainer, "resolve">, orderId: string): Promise<{ content: string; filename: string; content_type: string } | null> {
  try {
    const out = await invoicePdfForOrder(container, orderId)
    if (!out) return null
    return { content: out.pdf.toString("base64"), filename: invoiceFileName(out.model), content_type: "application/pdf" }
  } catch {
    return null
  }
}
