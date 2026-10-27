import QRCode from "qrcode"

/**
 * QR kód pre platbu prevodom na účet.
 *
 * - PAY by square: slovenský bankový štandard (aplikácie slovenských bánk ho čítajú pri skene).
 *   Reťazec polí oddelených tabulátorom + CRC32 sa skomprimuje LZMA (lc=3, lp=0, pb=2, bez hlavičky),
 *   pred dáta sa pridá 2-bajtová hlavička a 2-bajtová dĺžka a výsledok sa zapíše ako base32hex bez výplne.
 * - SPAYD: český štandard „QR platba“ pre české banky (obyčajný text).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const lzma: { compress: (data: number[] | Uint8Array | string, mode: number, done: (result: number[] | null, error?: unknown) => void) => void } = require("lzma")

export type TransferQrInput = {
  iban: string
  beneficiary: string
  amount: number
  currency?: string
  variable_symbol?: string
  note?: string
  bic?: string
}

const BASE32HEX = "0123456789ABCDEFGHIJKLMNOPQRSTUV"

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function base32hex(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) { out += BASE32HEX[(value >>> (bits - 5)) & 31]; bits -= 5 }
    value &= (1 << bits) - 1
  }
  if (bits > 0) out += BASE32HEX[(value << (5 - bits)) & 31]
  return out
}

const clean = (value: unknown, max: number) => String(value ?? "").replace(/[\t\r\n]+/g, " ").trim().slice(0, max)
const compactIban = (iban: string) => iban.replace(/\s+/g, "").toUpperCase()
const amountText = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("QR_INVALID_AMOUNT")
  return (Math.round(amount * 100) / 100).toFixed(2)
}

/** Reťazec polí pre PAY by square (jedna platba, jeden účet). */
export function payBySquareFields(input: TransferQrInput): string {
  const iban = compactIban(input.iban)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) throw new Error("QR_INVALID_IBAN")
  return [
    "", "1", "1", amountText(input.amount), clean(input.currency || "EUR", 3).toUpperCase(), "",
    clean(input.variable_symbol, 10).replace(/\D/g, ""), "", "", "", clean(input.note, 140),
    "1", iban, clean(input.bic, 11), "0", "0", clean(input.beneficiary, 70), "", "",
  ].join("\t")
}

function compress(bytes: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    lzma.compress(Array.from(bytes), 9, (result, error) => {
      if (!result || error) return reject(error ?? new Error("QR_COMPRESS_FAILED"))
      // Hlavičku LZMA (props 1 B, dictionary 4 B, veľkosť 8 B) formát PAY by square neobsahuje.
      resolve(Uint8Array.from(result.slice(13).map(byte => byte & 0xff)))
    })
  })
}

export async function payBySquareText(input: TransferQrInput): Promise<string> {
  const data = new TextEncoder().encode(payBySquareFields(input))
  const crc = crc32(data)
  const withCrc = new Uint8Array(4 + data.length)
  withCrc.set([crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff], 0)
  withCrc.set(data, 4)
  const packed = await compress(withCrc)
  const out = new Uint8Array(4 + packed.length)
  out.set([0x00, 0x00, withCrc.length & 0xff, (withCrc.length >>> 8) & 0xff], 0)
  out.set(packed, 4)
  return base32hex(out)
}

/** Český formát QR platby (SPAYD 1.0). */
export function spaydText(input: TransferQrInput): string {
  const safe = (value: string, max: number) => clean(value, max).replace(/\*/g, "")
  const parts = ["SPD*1.0", `ACC:${compactIban(input.iban)}`, `AM:${amountText(input.amount)}`, `CC:${safe(input.currency || "EUR", 3).toUpperCase()}`]
  const vs = clean(input.variable_symbol, 10).replace(/\D/g, "")
  if (vs) parts.push(`X-VS:${vs}`)
  if (input.note) parts.push(`MSG:${safe(input.note, 60).toUpperCase()}`)
  return parts.join("*")
}

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#2F3424", light: "#ffffff" } })
}

export async function qrPng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 360 })
}

/** Texty obou QR kódov pre jednu platbu. */
export async function transferQrTexts(input: TransferQrInput): Promise<{ pay_by_square: string; spayd: string }> {
  return { pay_by_square: await payBySquareText(input), spayd: spaydText(input) }
}
