import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { FIGTREE_MEDIUM, FIGTREE_REGULAR, FRAUNCES_LIGHT } from "../../modules/gift-voucher/voucher-fonts"
import { LUCIA_BALL_PNG } from "../../modules/gift-voucher/voucher-logo"
import { INVOICE_SELLER, type InvoiceModel } from "./model"
import { qrPng, transferQrTexts } from "../payments/qr-payment"

const W = 595.28, H = 841.89, M = 44
const INK = rgb(0.18, 0.2, 0.14), MUTED = rgb(0.42, 0.42, 0.42), LINE = rgb(0.82, 0.79, 0.89), ACCENT = rgb(0.45, 0.45, 0.61)

function safe(text: string, font: PDFFont): string {
  const set = new Set(font.getCharacterSet())
  return [...text.replace(/[\t\v\f\r\n]+/g, " ")].map(ch => {
    if (set.has(ch.codePointAt(0)!)) return ch
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "")
    return base && [...base].every(b => set.has(b.codePointAt(0)!)) ? base : ""
  }).join("")
}
const money = (value: number, currency: string) => `${new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency === "EUR" ? "€" : currency}`
const day = (date: Date) => new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", day: "numeric", month: "numeric", year: "numeric" }).format(date)

export async function renderInvoicePdf(model: InvoiceModel): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(`${model.kind === "invoice" ? "Faktúra" : "Zálohová faktúra"} ${model.number}`)
  doc.setAuthor(INVOICE_SELLER.name)
  const [display, regular, medium] = await Promise.all([FRAUNCES_LIGHT, FIGTREE_REGULAR, FIGTREE_MEDIUM].map(b64 => doc.embedFont(Buffer.from(b64, "base64"), { subset: true })))
  const logo = await doc.embedPng(Buffer.from(LUCIA_BALL_PNG, "base64")).catch(() => null)
  let page = doc.addPage([W, H])
  const put = (p: PDFPage, value: string, x: number, y: number, font: PDFFont, size: number, color = INK, align: "left" | "right" = "left") => {
    const t = safe(value, font)
    p.drawText(t, { x: align === "right" ? x - font.widthOfTextAtSize(t, size) : x, y, size, font, color })
  }

  // Hlavička
  if (logo) page.drawImage(logo, { x: M, y: H - M - 38, width: 38, height: 38 })
  put(page, "ANASTASIA", M + 48, H - M - 16, medium, 12, INK)
  put(page, "LIGHT FOR THE FUTURE", M + 48, H - M - 30, regular, 7.5, MUTED)
  put(page, model.kind === "invoice" ? "Faktúra – daňový doklad" : "Zálohová faktúra", W - M, H - M - 14, display, 20, INK, "right")
  put(page, `Číslo ${model.number}`, W - M, H - M - 32, medium, 11, ACCENT, "right")
  page.drawLine({ start: { x: M, y: H - M - 52 }, end: { x: W - M, y: H - M - 52 }, thickness: 0.7, color: LINE })

  // Dodávateľ a odberateľ
  let y = H - M - 78
  const block = (title: string, rows: string[], x: number) => {
    put(page, title, x, y, regular, 8, MUTED)
    let yy = y - 15
    rows.forEach((row, i) => { put(page, row, x, yy, i === 0 ? medium : regular, i === 0 ? 11 : 9.5); yy -= 13.5 })
    return yy
  }
  const s = INVOICE_SELLER
  const left = block("DODÁVATEĽ", [s.name, ...s.address, `IČO: ${s.ico}`, `DIČ: ${s.dic}`, `IČ DPH: ${s.ic_dph}`], M)
  const right = block("ODBERATEĽ", [model.customer.name, ...model.customer.lines, model.customer.email], W / 2 + 10)
  y = Math.min(left, right) - 14

  // Údaje o platbe a dátumoch
  const info: Array<[string, string]> = [
    ["Dátum vystavenia", day(model.issued)],
    ["Dátum dodania", day(model.issued)],
    ...(model.due ? [["Dátum splatnosti", day(model.due)] as [string, string]] : []),
    ["Spôsob úhrady", model.method || "—"],
    ["Variabilný symbol", model.variable_symbol],
  ]
  info.forEach(([label, value], i) => {
    const x = M + (i % 3) * 170, yy = y - Math.floor(i / 3) * 30
    put(page, label.toUpperCase(), x, yy, regular, 7.5, MUTED); put(page, value, x, yy - 12, medium, 10.5)
  })
  y -= Math.ceil(info.length / 3) * 30 + 14

  // Tabuľka položiek
  const cols = { name: M, qty: 300, unit: 352, rate: 412, vat: 462, gross: W - M }
  const header = (p: PDFPage, yy: number) => {
    p.drawRectangle({ x: M - 4, y: yy - 6, width: W - 2 * M + 8, height: 20, color: rgb(0.93, 0.92, 0.97) })
    put(p, "Názov", cols.name, yy, medium, 8.5, MUTED); put(p, "Množ.", cols.qty, yy, medium, 8.5, MUTED, "right")
    put(p, "Cena bez DPH", cols.unit + 36, yy, medium, 8.5, MUTED, "right"); put(p, "DPH", cols.rate + 24, yy, medium, 8.5, MUTED, "right")
    put(p, "DPH spolu", cols.vat + 36, yy, medium, 8.5, MUTED, "right"); put(p, "Spolu s DPH", cols.gross, yy, medium, 8.5, MUTED, "right")
  }
  header(page, y); y -= 24
  for (const line of model.lines) {
    if (y < 150) { page = doc.addPage([W, H]); y = H - M - 10; header(page, y); y -= 24 }
    let name = safe(line.name, regular)
    while (regular.widthOfTextAtSize(name, 9.5) > 240 && name.length > 1) name = name.slice(0, -1)
    if (name !== safe(line.name, regular)) name = `${name.trimEnd()}…`
    put(page, name, cols.name, y, regular, 9.5)
    put(page, String(line.quantity), cols.qty, y, regular, 9.5, INK, "right")
    put(page, money(line.unit_net, model.currency), cols.unit + 36, y, regular, 9.5, INK, "right")
    put(page, `${line.rate} %`, cols.rate + 24, y, regular, 9.5, INK, "right")
    put(page, money(line.vat, model.currency), cols.vat + 36, y, regular, 9.5, INK, "right")
    put(page, money(line.gross, model.currency), cols.gross, y, medium, 9.5, INK, "right")
    page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 0.4, color: LINE })
    y -= 20
  }

  // Rekapitulácia DPH a súčet
  y -= 10
  if (y < (model.paid ? 190 : 300)) { page = doc.addPage([W, H]); y = H - M - 10 }
  put(page, "REKAPITULÁCIA DPH", M, y, regular, 8, MUTED)
  put(page, "Sadzba", M, y - 16, medium, 8.5, MUTED); put(page, "Základ", M + 90, y - 16, medium, 8.5, MUTED, "right")
  put(page, "DPH", M + 170, y - 16, medium, 8.5, MUTED, "right"); put(page, "Spolu", M + 250, y - 16, medium, 8.5, MUTED, "right")
  let ry = y - 32
  for (const row of model.recap) {
    put(page, `${row.rate} %`, M, ry, regular, 9.5); put(page, money(row.net, model.currency), M + 90, ry, regular, 9.5, INK, "right")
    put(page, money(row.vat, model.currency), M + 170, ry, regular, 9.5, INK, "right"); put(page, money(row.gross, model.currency), M + 250, ry, regular, 9.5, INK, "right")
    ry -= 15
  }
  const tx = W - M
  put(page, model.paid ? "Uhradené" : "Celkom na úhradu", tx - 150, y - 16, medium, 10, MUTED)
  put(page, money(model.totals.gross, model.currency), tx, y - 34, display, 22, INK, "right")
  if (!model.paid && model.bank_transfer) {
    put(page, `Banka: ${s.bank}`, tx - 150, y - 56, regular, 9, MUTED)
    put(page, `IBAN: ${s.iban}`, tx - 150, y - 69, regular, 9, MUTED)
    put(page, `Variabilný symbol: ${model.variable_symbol}`, tx - 150, y - 82, regular, 9, MUTED)
    // QR platba (PAY by square): zákazník ju naskenuje v bankovej aplikácii a platba sa vyplní.
    if (Number.isFinite(model.totals.gross) && model.totals.gross > 0 && model.variable_symbol) {
      try {
        const texts = await transferQrTexts({
          iban: s.iban, beneficiary: s.name, amount: model.totals.gross, currency: model.currency,
          variable_symbol: model.variable_symbol, note: `Faktúra ${model.number}`, bic: s.swift,
        })
        const qr = await doc.embedPng(await qrPng(texts.pay_by_square))
        const size = 96
        page.drawImage(qr, { x: tx - size, y: y - 100 - size, width: size, height: size })
        put(page, "QR platba", tx - size, y - 112 - size, medium, 8, MUTED)
      } catch {
        // QR je len pomôcka: bez neho sa faktúra vystaví s platobnými údajmi v texte.
      }
    }
  }

  // Pätička
  const foot = [
    "Faktúra bola vystavená elektronicky a je platná bez podpisu a pečiatky.",
    `${s.name} · IČO ${s.ico} · IČ DPH ${s.ic_dph} · ${s.email} · ${s.phone}`,
  ]
  foot.forEach((row, i) => put(page, row, M, 40 - i * 11, regular, 8, MUTED))
  return Buffer.from(await doc.save())
}
