import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { formatEur } from "./policy"
import { FIGTREE_MEDIUM, FIGTREE_REGULAR, FRAUNCES_ITALIC, FRAUNCES_LIGHT } from "./voucher-fonts"
import { LUCIA_BALL_PNG } from "./voucher-logo"

/**
 * Darčekový poukaz ANASTASIA ako A4 PDF v tmavej olivovej so zlatými linkami.
 * Písma sú vložené (podmnožina), takže diakritika aj € sa zobrazia správne v každom prehliadači PDF.
 */

export type VoucherPdfInput = {
  code: string
  initial_amount: number
  expires_at: Date | string
  recipient_name?: string | null
  message?: string | null
}

const hex = (value: string): RGB => {
  const n = parseInt(value.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const C = {
  bg: hex("#1E261D"),
  panel: hex("#283020"),
  gold: hex("#C9A355"),
  goldDeep: hex("#B08D57"),
  cream: hex("#EFE5C7"),
  muted: hex("#A9A58E"),
}

const W = 595.28
const H = 841.89

// Organické zlaté linky v pozadí (aura ako na webe), súradnice strany s počiatkom vľavo hore.
const AURA_PATHS = [
  "M-40 150C80 90 170 210 300 160S520 40 640 110",
  "M-40 172C84 114 176 234 306 184S526 64 640 134",
  "M-40 194C88 138 182 258 312 208S532 88 640 158",
  "M-40 700C100 650 210 770 350 725S560 620 640 680",
  "M-40 724C104 676 216 796 356 750S566 646 640 706",
]

function spaced(page: PDFPage, text: string, cx: number, y: number, font: PDFFont, size: number, tracking: number, color: RGB, opacity = 1) {
  const chars = [...text]
  const widths = chars.map((ch) => font.widthOfTextAtSize(ch, size))
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1)
  let x = cx - total / 2
  chars.forEach((ch, i) => {
    if (ch !== " ") page.drawText(ch, { x, y, size, font, color, opacity })
    x += widths[i] + tracking
  })
}

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB, opacity = 1) {
  page.drawText(text, { x: (W - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color, opacity })
}

/** Zalomí text podľa skutočnej šírky písma, najviac `maxLines` riadkov (posledný skráti výpustkou). */
export function wrapToWidth(text: string, font: PDFFont, size: number, width: number, maxLines: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    let line = ""
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width) line = next
      else {
        if (line) lines.push(line)
        line = word
        while (font.widthOfTextAtSize(line, size) > width && line.length > 1) line = line.slice(0, -1)
      }
    }
    if (line) lines.push(line)
  }
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && font.widthOfTextAtSize(`${last}…`, size) > width) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last.trimEnd()}…`
  return kept
}

// Znaky mimo vložených písem nahradíme základným písmenom, aby PDF nikdy nespadlo na neznámom glyfe.
function safe(text: string, font: PDFFont): string {
  const set = new Set(font.getCharacterSet())
  return [...text.replace(/[\t\v\f]+/g, " ")]
    .map((ch) => {
      if (ch === "\n" || set.has(ch.codePointAt(0)!)) return ch
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "")
      return base && [...base].every((b) => set.has(b.codePointAt(0)!)) ? base : ""
    })
    .join("")
}

export async function renderVoucherPdf(voucher: VoucherPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle("Darčekový poukaz ANASTASIA")
  doc.setAuthor("ANASTASIA")
  doc.setCreator("ANASTASIA")
  doc.setProducer("ANASTASIA")
  const [light, italic, regular, medium] = await Promise.all(
    [FRAUNCES_LIGHT, FRAUNCES_ITALIC, FIGTREE_REGULAR, FIGTREE_MEDIUM].map((b64) => doc.embedFont(Buffer.from(b64, "base64"), { subset: true }))
  )
  const page = doc.addPage([W, H])

  // Podklad, jemne svetlejší vnútorný panel a dvojitý zlatý rám.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.bg })
  page.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, color: C.panel, opacity: 0.55 })
  page.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, borderColor: C.goldDeep, borderWidth: 0.8, borderOpacity: 0.85 })
  page.drawRectangle({ x: 33, y: 33, width: W - 66, height: H - 66, borderColor: C.gold, borderWidth: 0.35, borderOpacity: 0.45 })
  for (const [x, y] of [[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]]) page.drawCircle({ x, y, size: 2.2, color: C.gold })
  for (const d of AURA_PATHS) page.drawSvgPath(d, { x: 0, y: H, borderColor: C.gold, borderWidth: 0.7, borderOpacity: 0.16 })

  // Guľa z loga Lucie a značka.
  const markSize = 86
  const markTop = H - 92
  const ball = await doc.embedPng(Buffer.from(LUCIA_BALL_PNG, "base64"))
  page.drawImage(ball, { x: (W - markSize) / 2, y: markTop - markSize, width: markSize, height: markSize })

  let y = markTop - markSize - 34
  spaced(page, "ANASTASIA", W / 2, y, medium, 13, 6.5, C.cream)
  y -= 18
  spaced(page, "LIGHT FOR THE FUTURE", W / 2, y, regular, 7, 3.2, C.gold, 0.9)

  y -= 64
  centered(page, "Darčekový poukaz", y, italic, 36, C.cream)
  y -= 26
  page.drawLine({ start: { x: W / 2 - 34, y }, end: { x: W / 2 + 34, y }, thickness: 0.6, color: C.gold, opacity: 0.8 })
  page.drawCircle({ x: W / 2, y, size: 1.6, color: C.gold })

  y -= 92
  centered(page, safe(formatEur(voucher.initial_amount), light), y, light, 84, C.cream)

  const name = voucher.recipient_name?.trim()
  if (name) {
    y -= 58
    spaced(page, "PRE", W / 2, y, medium, 8, 3.5, C.gold)
    y -= 26
    centered(page, safe(name, italic).slice(0, 60), y, italic, 21, C.cream)
  }

  const message = voucher.message?.trim()
  if (message) {
    y -= name ? 34 : 58
    for (const line of wrapToWidth(safe(message, italic), italic, 12.5, 380, 5)) {
      centered(page, line, y, italic, 12.5, C.cream, 0.82)
      y -= 18
    }
  }

  // Kód poukazu v zlatom rámčeku, pod ním platnosť a drobná tlač pri spodnom okraji.
  const boxW = 340
  const boxH = 78
  const boxY = Math.min(y - 40 - boxH, 196)
  page.drawRectangle({ x: (W - boxW) / 2, y: boxY, width: boxW, height: boxH, color: C.bg, opacity: 0.6 })
  page.drawSvgPath(roundedRect(boxW, boxH, 16), { x: (W - boxW) / 2, y: boxY + boxH, borderColor: C.gold, borderWidth: 0.9 })
  spaced(page, "KÓD POUKAZU", W / 2, boxY + boxH - 24, medium, 7.5, 3.2, C.gold)
  spaced(page, safe(voucher.code, medium), W / 2, boxY + 22, medium, 19, 1.6, C.cream)

  const expires = new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", day: "numeric", month: "numeric", year: "numeric" }).format(new Date(voucher.expires_at))
  centered(page, `Platnosť do ${expires}`, boxY - 30, regular, 10.5, C.cream, 0.8)

  centered(page, "Kód zadajte v košíku pri nákupe na webe ANASTASIA.", 74, regular, 8, C.muted)
  centered(page, "Poukaz nie je možné vymeniť za hotovosť.", 62, regular, 8, C.muted)

  return Buffer.from(await doc.save({ useObjectStreams: false }))
}

function roundedRect(w: number, h: number, r: number): string {
  return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`
}
