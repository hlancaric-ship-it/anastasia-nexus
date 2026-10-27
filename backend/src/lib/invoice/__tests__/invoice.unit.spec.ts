import { buildInvoiceModel, invoiceNumber } from "../model"
import { renderInvoicePdf } from "../pdf"

const order: any = {
  id: "order_1", display_id: 63, created_at: "2026-10-27T09:20:00.000Z", currency_code: "eur", email: "zakaznik@example.test", status: "pending", total: 17,
  items: [{ title: "x", product_title: "Tvoja pleťová voda osviežujúca", quantity: 1, total: 11, tax_total: 2.06, tax_lines: [{ rate: 23 }] }],
  shipping_methods: [{ name: "Kuriér (zásielka)", total: 6, tax_total: 1.12, tax_lines: [{ rate: 23 }] }],
  billing_address: { first_name: "Ján", last_name: "Novák", address_1: "Hlavná 1", postal_code: "960 01", city: "Zvolen", country_code: "sk" },
  payment_collections: [{ captured_amount: 17, payments: [{ provider_id: "pp_stripe_stripe", captured_at: "2026-10-27T09:21:00.000Z" }] }],
}

describe("faktúra", () => {
  it("číslo faktúry je rok a šesťmiestne číslo objednávky", () => {
    expect(invoiceNumber(order)).toBe("FA2026000063")
  })
  it("zaplatená objednávka dá daňový doklad s rekapituláciou DPH", () => {
    const m = buildInvoiceModel(order)
    expect(m.kind).toBe("invoice"); expect(m.paid).toBe(true); expect(m.due).toBeNull()
    expect(m.lines).toHaveLength(2)
    expect(m.recap).toEqual([{ rate: 23, net: 13.82, vat: 3.18, gross: 17 }])
    expect(m.totals).toEqual({ net: 13.82, vat: 3.18, gross: 17 })
    expect(m.method).toBe("Kartou online"); expect(m.customer.name).toBe("Ján Novák")
  })
  it("nezaplatený prevod je zálohová faktúra so splatnosťou", () => {
    const m = buildInvoiceModel({ ...order, payment_collections: [{ captured_amount: 0, payments: [{ provider_id: "pp_bank_transfer_bank_transfer", captured_at: null }] }] })
    expect(m.kind).toBe("proforma"); expect(m.paid).toBe(false); expect(m.due).not.toBeNull()
  })
  it("viac sadzieb DPH sa rekapituluje zvlášť", () => {
    const m = buildInvoiceModel({ ...order, items: [{ product_title: "A", quantity: 2, total: 10, tax_total: 1.87, tax_lines: [{ rate: 23 }] }, { product_title: "B", quantity: 1, total: 5, tax_total: 0.24, tax_lines: [{ rate: 5 }] }] })
    expect(m.recap.map(r => r.rate)).toEqual([23, 5])
  })
  it("nákup na firmu doplní IČO, DIČ a IČ DPH do údajov odberateľa", () => {
    const m = buildInvoiceModel({ ...order, billing_address: { ...order.billing_address, company: "Firma s.r.o." }, metadata: { company_ico: "12 345 678", company_dic: "2020202020", company_ic_dph: "SK2020202020" } })
    expect(m.customer.name).toBe("Firma s.r.o.")
    expect(m.customer.lines).toEqual(expect.arrayContaining(["IČO: 12345678", "DIČ: 2020202020", "IČ DPH: SK2020202020"]))
  })
  it("neplatný text v metadátach sa na faktúru nedostane", () => {
    const m = buildInvoiceModel({ ...order, billing_address: { ...order.billing_address, company: "F".repeat(500) }, metadata: { company_ico: "Zaplatené", company_dic: "2020202020", company_ic_dph: "<b>x</b>" } })
    expect(m.customer.name).toHaveLength(120)
    expect(m.customer.lines).toContain("DIČ: 2020202020")
    expect(m.customer.lines.join(" ")).not.toMatch(/IČO|IČ DPH|Zaplatené|<b>/)
  })
  it("bez firmy sa IČO z metadát nepoužije", () => {
    const m = buildInvoiceModel({ ...order, metadata: { company_ico: "12345678" } })
    expect(m.customer.lines.join(" ")).not.toContain("IČO")
  })
  it("nezaplatená faktúra má QR platbu, zaplatená nie", async () => {
    const unpaid = await renderInvoicePdf(buildInvoiceModel({ ...order, payment_collections: [{ captured_amount: 0, payments: [{ provider_id: "pp_bank_transfer_bank_transfer", captured_at: null }] }] }))
    const paid = await renderInvoicePdf(buildInvoiceModel(order))
    const images = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length
    expect(images(unpaid)).toBe(images(paid) + 1)
    const cod = await renderInvoicePdf(buildInvoiceModel({ ...order, payment_collections: [{ captured_amount: 0, payments: [{ provider_id: "pp_cod_cod", captured_at: null }] }] }))
    expect(images(cod)).toBe(images(paid))
    if (process.env.INVOICE_DUMP) require("fs").writeFileSync(process.env.INVOICE_DUMP, unpaid)
  })
  it("PDF sa vyrobí a začína hlavičkou PDF", async () => {
    const pdf = await renderInvoicePdf(buildInvoiceModel(order))
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-"); expect(pdf.length).toBeGreaterThan(5000)
  })
})
