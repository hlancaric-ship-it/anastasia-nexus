import type { MedusaContainer } from "@medusajs/framework/types"
import { isOrderPaid } from "../../modules/entitlement/policy"
import { recordEvent } from "../observability/events"
import { COMPANY_NAME_MAX, validCompanyId } from "./company-ids"
import { loadInvoiceOrder } from "./load"
import { buildInvoiceModel, cents, INVOICE_SELLER, type InvoiceModel, type InvoiceOrder } from "./model"

const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export function escapeXml(value: unknown): string {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value)
  return raw
    .replace(CONTROL_CHARS_RE, "")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

const isoDate = (value: Date): string => value.toISOString().slice(0, 10)

/**
 * Do účtovníctva (STORMWARE POHODA) smú vstúpiť VÝHRADNE reálne uhradené,
 * nestornované objednávky s kladnou sumou, ktoré predstavujú daňový doklad (`FA...`).
 * Nedokončené košíky, nezaplatené zálohové faktúry (`ZF...`), stornované ani plne
 * refundované objednávky sa do Pohody nikdy neprenášajú.
 */
export function isAccountingEligibleOrder(order: InvoiceOrder | null | undefined): boolean {
  if (!order || typeof order !== "object") return false
  const status = typeof order.status === "string" ? order.status.trim().toLowerCase() : ""
  if (status === "canceled" || status === "cancelled" || status === "draft") return false
  if (!isOrderPaid(order as never)) return false
  const model = buildInvoiceModel(order)
  return model.kind === "invoice" && model.paid === true && model.totals.gross > 0 && model.number.startsWith("FA")
}

function pohodaVatRateTag(rate: number): "high" | "low" | "none" {
  if (rate >= 18) return "high"
  if (rate > 0) return "low"
  return "none"
}

function pohodaPaymentType(model: InvoiceModel): "creditcard" | "draft" | "delivery" {
  if (model.method === "Kartou online") return "creditcard"
  if (model.method === "Na dobierku") return "delivery"
  return "draft"
}

function safeMServerUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw.trim())
    if (parsed.username || parsed.password) return null
    if (parsed.protocol === "https:") return parsed
    if (parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")) return parsed
    return null
  } catch {
    return null
  }
}

function renderInvoiceItemPack(order: InvoiceOrder, model: InvoiceModel): string {
  const a = (order.billing_address && Object.keys(order.billing_address).length ? order.billing_address : order.shipping_address) ?? {}
  const md = order.metadata ?? {}
  const company = escapeXml(typeof a.company === "string" ? a.company.slice(0, COMPANY_NAME_MAX) : "")
  const person = escapeXml([a.first_name, a.last_name].filter(v => typeof v === "string" && v.trim()).join(" "))
  const street = escapeXml([a.address_1, a.address_2].filter(v => typeof v === "string" && v.trim()).join(" "))
  const city = escapeXml(typeof a.city === "string" ? a.city : "")
  const zip = escapeXml(typeof a.postal_code === "string" ? a.postal_code : "")
  const country = escapeXml((typeof a.country_code === "string" && a.country_code.trim() ? a.country_code : "SK").toUpperCase())
  const ico = company ? validCompanyId("company_ico", md.company_ico) : null
  const dic = company ? validCompanyId("company_dic", md.company_dic) : null
  const icDph = company ? validCompanyId("company_ic_dph", md.company_ic_dph) : null
  const dateStr = isoDate(model.issued)

  const highRecap = model.recap.filter(r => pohodaVatRateTag(r.rate) === "high")
  const lowRecap = model.recap.filter(r => pohodaVatRateTag(r.rate) === "low")
  const noneRecap = model.recap.filter(r => pohodaVatRateTag(r.rate) === "none")
  const sumPart = (rows: typeof model.recap, key: "net" | "vat" | "gross") => cents(rows.reduce((s, r) => s + r[key], 0)).toFixed(2)

  const itemsXml = model.lines.map(line => {
    const rateTag = pohodaVatRateTag(line.rate)
    return [
      `        <inv:invoiceItem>`,
      `          <inv:text>${escapeXml(line.name)}</inv:text>`,
      `          <inv:quantity>${line.quantity}</inv:quantity>`,
      `          <inv:payVAT>true</inv:payVAT>`,
      `          <inv:rateVAT>${rateTag}</inv:rateVAT>`,
      `          <inv:homeCurrency>`,
      `            <typ:unitPrice>${line.unit_net.toFixed(2)}</typ:unitPrice>`,
      `            <typ:price>${line.net.toFixed(2)}</typ:price>`,
      `            <typ:priceVAT>${line.vat.toFixed(2)}</typ:priceVAT>`,
      `            <typ:priceSum>${line.gross.toFixed(2)}</typ:priceSum>`,
      `          </inv:homeCurrency>`,
      `        </inv:invoiceItem>`,
    ].join("\n")
  }).join("\n")

  return [
    `  <dat:dataPackItem id="${escapeXml(model.number)}" version="2.0">`,
    `    <inv:invoice version="2.0">`,
    `      <inv:invoiceHeader>`,
    `        <inv:invoiceType>issuedInvoice</inv:invoiceType>`,
    `        <inv:number>`,
    `          <typ:numberRequested>${escapeXml(model.number)}</typ:numberRequested>`,
    `        </inv:number>`,
    `        <inv:symVar>${escapeXml(model.variable_symbol)}</inv:symVar>`,
    `        <inv:date>${dateStr}</inv:date>`,
    `        <inv:dateTax>${dateStr}</inv:dateTax>`,
    `        <inv:dateAccounting>${dateStr}</inv:dateAccounting>`,
    `        <inv:dateDue>${dateStr}</inv:dateDue>`,
    `        <inv:text>${escapeXml(`Objednávka č. ${order.display_id ?? order.id} (e-shop ANASTASIA)`)}</inv:text>`,
    `        <inv:partnerIdentity>`,
    `          <typ:address>`,
    ...(company ? [`            <typ:company>${company}</typ:company>`] : []),
    `            <typ:name>${person || escapeXml(model.customer.name)}</typ:name>`,
    ...(city ? [`            <typ:city>${city}</typ:city>`] : []),
    ...(street ? [`            <typ:street>${street}</typ:street>`] : []),
    ...(zip ? [`            <typ:zip>${zip}</typ:zip>`] : []),
    `            <typ:country><typ:ids>${country}</typ:ids></typ:country>`,
    ...(ico ? [`            <typ:ico>${escapeXml(ico)}</typ:ico>`] : []),
    ...(dic ? [`            <typ:dic>${escapeXml(dic)}</typ:dic>`] : []),
    ...(icDph ? [`            <typ:icDph>${escapeXml(icDph)}</typ:icDph>`] : []),
    ...(model.customer.email ? [`            <typ:email>${escapeXml(model.customer.email)}</typ:email>`] : []),
    `          </typ:address>`,
    `        </inv:partnerIdentity>`,
    `        <inv:paymentType>`,
    `          <typ:paymentType>${pohodaPaymentType(model)}</typ:paymentType>`,
    `        </inv:paymentType>`,
    `      </inv:invoiceHeader>`,
    `      <inv:invoiceDetail>`,
    itemsXml,
    `      </inv:invoiceDetail>`,
    `      <inv:invoiceSummary>`,
    `        <inv:roundingDocument>none</inv:roundingDocument>`,
    `        <inv:homeCurrency>`,
    `          <typ:priceNone>${sumPart(noneRecap, "net")}</typ:priceNone>`,
    `          <typ:priceLow>${sumPart(lowRecap, "net")}</typ:priceLow>`,
    `          <typ:priceLowVAT>${sumPart(lowRecap, "vat")}</typ:priceLowVAT>`,
    `          <typ:priceLowSum>${sumPart(lowRecap, "gross")}</typ:priceLowSum>`,
    `          <typ:priceHigh>${sumPart(highRecap, "net")}</typ:priceHigh>`,
    `          <typ:priceHighVAT>${sumPart(highRecap, "vat")}</typ:priceHighVAT>`,
    `          <typ:priceHighSum>${sumPart(highRecap, "gross")}</typ:priceHighSum>`,
    `        </inv:homeCurrency>`,
    `      </inv:invoiceSummary>`,
    `    </inv:invoice>`,
    `  </dat:dataPackItem>`,
  ].join("\n")
}

/**
 * Zostaví STORMWARE POHODA XML `dat:dataPack` v2.0 výhradne zo zaplatených daňových
 * dokladov (`FA...`). Nezaplatené zálohové faktúry (`ZF...`), nedokončené ani stornované
 * objednávky sa automaticky vyfiltrujú.
 */
export function buildPohodaDataPackXml(orders: InvoiceOrder[], now = new Date()): { xml: string; count: number; invoiceNumbers: string[] } {
  const eligible = (orders ?? []).filter(isAccountingEligibleOrder)
  const items: string[] = []
  const invoiceNumbers: string[] = []
  for (const order of eligible) {
    const model = buildInvoiceModel(order, now)
    invoiceNumbers.push(model.number)
    items.push(renderInvoiceItemPack(order, model))
  }
  const packId = `ANASTASIA-${isoDate(now)}`
  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<dat:dataPack id="${escapeXml(packId)}" ico="${escapeXml(INVOICE_SELLER.ico)}" application="ANASTASIA-NEXUS" version="2.0" note="Automatický prenos uhradených daňových dokladov ANASTASIA" xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">`,
    ...items,
    `</dat:dataPack>`,
  ].join("\n")
  return { xml, count: invoiceNumbers.length, invoiceNumbers }
}

/**
 * Automatický zero-touch prenos daňového dokladu priamo do STORMWARE POHODA mServeru
 * hneď po úhrade objednávky (`order.placed` pri platbe kartou alebo `payment.captured`
 * pri prevode/dobierke). Ak objednávka nie je zaplatená (zálohová faktúra `ZF...`),
 * do Pohody sa nič neposiela.
 */
export async function syncOrderToPohodaIfPaid(
  container: Pick<MedusaContainer, "resolve">,
  orderId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ status: "synced" | "skipped" | "disabled" | "failed"; reason?: string; invoiceNumber?: string }> {
  try {
    const order = await loadInvoiceOrder(container, orderId)
    if (!order) return { status: "skipped", reason: "ORDER_NOT_FOUND" }
    if (!isAccountingEligibleOrder(order)) return { status: "skipped", reason: "NOT_TAX_INVOICE" }
    const pack = buildPohodaDataPackXml([order])
    const invoiceNumber = pack.invoiceNumbers[0]
    const rawUrl = (env.POHODA_MSERVER_URL || "").trim()
    if (!rawUrl) return { status: "disabled", invoiceNumber }
    const target = safeMServerUrl(rawUrl)
    if (!target) {
      await recordEvent(container as MedusaContainer, "warn", "payment", "pohoda_sync_invalid_url", { order_id: orderId, invoice_number: invoiceNumber })
      return { status: "failed", reason: "INVALID_MSERVER_URL", invoiceNumber }
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/xml; charset=utf-8",
      "STW-Application": "ANASTASIA-NEXUS",
      "STW-Instance": invoiceNumber,
    }
    const user = (env.POHODA_MSERVER_USER || "").trim()
    const pass = env.POHODA_MSERVER_PASSWORD || ""
    if (user) {
      headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(target.toString(), {
        method: "POST",
        headers,
        body: pack.xml,
        redirect: "error",
        signal: controller.signal,
      })
      if (!response.ok) {
        await recordEvent(container as MedusaContainer, "error", "payment", "pohoda_sync_failed", {
          order_id: orderId,
          invoice_number: invoiceNumber,
          http_status: response.status,
        })
        return { status: "failed", reason: `HTTP_${response.status}`, invoiceNumber }
      }
      await recordEvent(container as MedusaContainer, "info", "payment", "pohoda_synced", {
        order_id: orderId,
        invoice_number: invoiceNumber,
      })
      return { status: "synced", invoiceNumber }
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    await recordEvent(container as MedusaContainer, "error", "payment", "pohoda_sync_error", { order_id: orderId, error })
    return { status: "failed", reason: "NETWORK_ERROR" }
  }
}
