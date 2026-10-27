import { BANK_TRANSFER_ACCOUNT, variableSymbol } from "../checkout/delivery-payment"
import { isOrderPaid } from "../../modules/entitlement/policy"

/** Údaje predávajúceho (verejné údaje spoločnosti zo zmluvy a zo starého webu). */
export const INVOICE_SELLER = {
  name: "LUCRAT spol. s r.o.",
  address: ["Sokolská 1646/88", "960 01 Zvolen", "Slovenská republika"],
  ico: "36652164",
  dic: "2022216372",
  ic_dph: "SK2022216372",
  email: "zdravysvet@anastasiaoz.eu",
  phone: "+421 905 363 778",
  bank: BANK_TRANSFER_ACCOUNT.bank,
  iban: BANK_TRANSFER_ACCOUNT.iban,
  swift: BANK_TRANSFER_ACCOUNT.swift,
} as const

type TaxLine = { rate?: unknown }
type Row = Record<string, unknown>
export type InvoiceOrder = {
  id: string
  display_id?: unknown
  created_at?: string | Date | null
  currency_code?: string | null
  status?: string | null
  email?: string | null
  total?: unknown
  items?: Array<{ title?: string | null; product_title?: string | null; quantity?: unknown; total?: unknown; tax_total?: unknown; tax_lines?: TaxLine[] | null }> | null
  shipping_methods?: Array<{ name?: string | null; total?: unknown; amount?: unknown; tax_total?: unknown; tax_lines?: TaxLine[] | null }> | null
  customer?: { first_name?: string | null; last_name?: string | null; company_name?: string | null } | null
  metadata?: Record<string, unknown> | null
  billing_address?: Row | null
  shipping_address?: Row | null
  payment_collections?: Array<{ captured_amount?: unknown; refunded_amount?: unknown; payments?: Array<{ provider_id?: string | null; captured_at?: string | Date | null }> | null }> | null
}

export type InvoiceLine = { name: string; quantity: number; rate: number; net: number; vat: number; gross: number; unit_net: number; unit_gross: number }
export type InvoiceModel = {
  number: string
  kind: "invoice" | "proforma"
  issued: Date
  due: Date | null
  variable_symbol: string
  currency: string
  paid: boolean
  method: string
  /** Platba prevodom na účet: iba vtedy sa na nezaplatenej faktúre ukážu bankové údaje a QR platba. */
  bank_transfer: boolean
  customer: { name: string; lines: string[]; email: string }
  lines: InvoiceLine[]
  recap: Array<{ rate: number; net: number; vat: number; gross: number }>
  totals: { net: number; vat: number; gross: number }
}

const num = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") { const parsed = Number(value.replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0 }
  if (value && typeof value === "object" && "numeric_" in (value as Row)) return num((value as Row).numeric_)
  return 0
}
export const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
const rateOf = (lines?: TaxLine[] | null) => cents((lines ?? []).reduce((sum, line) => sum + num(line.rate), 0))

export function invoiceNumber(order: Pick<InvoiceOrder, "display_id" | "created_at">): string {
  const id = String(num(order.display_id) || "").replace(/\D/g, "")
  const year = new Date(order.created_at ?? Date.now()).getUTCFullYear()
  return `FA${year}${id.padStart(6, "0")}`
}

const METHOD_LABEL: Record<string, string> = {
  pp_stripe_stripe: "Kartou online",
  pp_cod_cod: "Na dobierku",
  pp_bank_transfer_bank_transfer: "Prevodom na účet",
}

/** Firemné údaje zákazníka z pokladne (metadáta objednávky): IČO, DIČ a IČ DPH iba pri nákupe na firmu. */
function companyIds(order: InvoiceOrder, isCompany: boolean): string[] {
  if (!isCompany) return []
  const md = order.metadata ?? {}
  const clean = (value: unknown) => text(value).replace(/\s+/g, "")
  return [["IČO", clean(md.company_ico)], ["DIČ", clean(md.company_dic)], ["IČ DPH", clean(md.company_ic_dph)]]
    .filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`)
}

function address(order: InvoiceOrder): { name: string; lines: string[] } {
  const a = (order.billing_address && Object.keys(order.billing_address).length ? order.billing_address : order.shipping_address) ?? {}
  const person = [text(a.first_name), text(a.last_name)].filter(Boolean).join(" ")
  const company = text(a.company)
  const street = [text(a.address_1), text(a.address_2)].filter(Boolean).join(" ")
  const city = [text(a.postal_code), text(a.city)].filter(Boolean).join(" ")
  const fallback = [text(order.customer?.first_name), text(order.customer?.last_name)].filter(Boolean).join(" ")
  return { name: company || person || fallback || text(order.email) || "Zákazník", lines: [company ? person : "", street, city, text(a.country_code).toUpperCase() === "SK" ? "" : text(a.country_code).toUpperCase(), ...companyIds(order, Boolean(company))].filter(Boolean) }
}

/** Z objednávky zostaví podklad pre faktúru: riadky s DPH, rekapitulácia podľa sadzieb a súčty. */
export function buildInvoiceModel(order: InvoiceOrder, now = new Date()): InvoiceModel {
  const paid = isOrderPaid(order as never)
  const lines: InvoiceLine[] = []
  const push = (name: string, quantity: number, gross: number, vat: number, rate: number) => {
    const g = cents(gross), v = cents(vat), n = cents(g - v), q = quantity > 0 ? quantity : 1
    lines.push({ name, quantity: q, rate, net: n, vat: v, gross: g, unit_net: cents(n / q), unit_gross: cents(g / q) })
  }
  for (const item of order.items ?? []) {
    push(text(item.product_title) || text(item.title) || "Položka", num(item.quantity) || 1, num(item.total), num(item.tax_total), rateOf(item.tax_lines))
  }
  for (const method of order.shipping_methods ?? []) {
    const gross = num(method.total ?? method.amount)
    if (gross > 0) push(text(method.name) || "Doprava", 1, gross, num(method.tax_total), rateOf(method.tax_lines))
  }
  const rates = [...new Set(lines.map(line => line.rate))].sort((a, b) => b - a)
  const recap = rates.map(rate => {
    const part = lines.filter(line => line.rate === rate)
    return { rate, net: cents(part.reduce((s, l) => s + l.net, 0)), vat: cents(part.reduce((s, l) => s + l.vat, 0)), gross: cents(part.reduce((s, l) => s + l.gross, 0)) }
  })
  const totals = { net: cents(recap.reduce((s, r) => s + r.net, 0)), vat: cents(recap.reduce((s, r) => s + r.vat, 0)), gross: cents(recap.reduce((s, r) => s + r.gross, 0)) }
  const provider = (order.payment_collections ?? []).flatMap(c => c.payments ?? []).map(p => p.provider_id ?? "").find(Boolean) ?? ""
  const capturedAt = (order.payment_collections ?? []).flatMap(c => c.payments ?? []).map(p => p.captured_at).find(Boolean)
  const created = new Date(order.created_at ?? now)
  const issued = paid && capturedAt ? new Date(capturedAt) : created
  const customer = address(order)
  return {
    number: invoiceNumber(order),
    kind: paid ? "invoice" : "proforma",
    issued,
    due: paid ? null : new Date(created.getTime() + 2 * 24 * 3600 * 1000),
    variable_symbol: variableSymbol(num(order.display_id) || null, order.created_at) ?? "",
    currency: (text(order.currency_code) || "eur").toUpperCase(),
    paid,
    method: METHOD_LABEL[provider] ?? "",
    bank_transfer: provider === "pp_bank_transfer_bank_transfer",
    customer: { name: customer.name, lines: customer.lines, email: text(order.email) },
    lines, recap, totals,
  }
}
