/**
 * Minimální jednostránkové PDF bez externí závislosti (Helvetica, WinAnsiEncoding).
 * Znaky mimo WinAnsi (např. č, ľ, ť) se převedou na základní písmeno bez diakritiky.
 */

const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "Š": 0x8a, "š": 0x9a, "Ž": 0x8e, "ž": 0x9e, "Œ": 0x8c, "œ": 0x9c, "Ÿ": 0x9f,
}

function encodeChar(char: string): number[] {
  if (char in WIN_ANSI_EXTRA) return [WIN_ANSI_EXTRA[char]]
  const code = char.codePointAt(0)!
  if ((code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff)) return [code]
  const base = char.normalize("NFD").replace(/[̀-ͯ]/g, "")
  if (base && base !== char) return [...base].flatMap(encodeChar)
  return [0x3f]
}

/** Text -> bajty WinAnsi s escapováním pro PDF literal string. */
export function pdfString(text: string): string {
  const bytes = [...text.replace(/[\r\n\t]+/g, " ")].flatMap(encodeChar)
  let out = ""
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += "\\" + String.fromCharCode(byte)
    else out += String.fromCharCode(byte)
  }
  return `(${out})`
}

/** Zalomí text na řádky o max. `width` znacích (po slovech). */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    let line = ""
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (!line) line = word.slice(0, width)
      else if (line.length + 1 + word.length <= width) line += ` ${word}`
      else { lines.push(line); line = word.slice(0, width) }
    }
    if (line) lines.push(line)
  }
  return lines
}

export type PdfLine = { text: string; size: number; gap?: number }

export function renderPdf(lines: PdfLine[], title = "Darcekovy poukaz"): Buffer {
  let y = 780
  const ops: string[] = ["BT"]
  for (const line of lines) {
    y -= line.gap ?? Math.round(line.size * 1.5)
    if (y < 40) break
    ops.push(`/F1 ${line.size} Tf`, `1 0 0 1 56 ${y} Tm`, `${pdfString(line.text)} Tj`)
  }
  ops.push("ET")
  const stream = ops.join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    `<< /Title ${pdfString(title)} /Producer (ANASTASIA) >>`,
  ]
  let body = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(body, "latin1")
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, "latin1")
}
