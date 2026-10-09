import { z } from "zod"

// Codes remain case-sensitive; punctuation is encoded, never interpolated into URLs.
const code = z.string().trim().min(1).max(128).refine(v => !/[\u0000-\u001f\u007f]/.test(v))
export const linkInput = z.object({
  produkt: code,
  kupon: code,
  ks: z.number().int().min(1).max(999).default(1),
}).strict()
export const adminInput = linkInput.extend({ format: z.enum(["svg", "png"]).default("svg") })
export type LinkInput = z.infer<typeof linkInput>

/** Match Int32.TryParse and the legacy fallback/clamp, including overflow. */
export function legacyQuantity(value: string | undefined): number {
  const text = value?.trim() || ""
  if (!/^[+-]?\d+$/.test(text)) return 1
  const n = Number(text)
  return !Number.isInteger(n) || n < 1 || n > 2147483647 ? 1 : Math.min(n, 999)
}

export function buildCouponUrl(origin: string, input: LinkInput): string {
  const data = linkInput.parse(input)
  const base = new URL(origin)
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("INVALID_STOREFRONT_ORIGIN")
  }
  const url = new URL("/eshop/kosik", base)
  url.search = new URLSearchParams({ produkt: data.produkt, kupon: data.kupon, ks: String(data.ks) }).toString()
  return url.href
}

export interface QrRenderer {
  render(url: string, format: "svg" | "png"): Promise<{ mime_type: string; base64: string }>
}

/** Local encoder; the URL is never sent to an external service. */
export const localQrRenderer: QrRenderer = {
  async render(url, format) {
    // Runtime dependency intentionally declared in the package handoff, not package.json.
    const qr = require("qrcode") as {
      toString(text: string, options: object): Promise<string>
      toBuffer(text: string, options: object): Promise<Buffer>
    }
    const options = { errorCorrectionLevel: "M", margin: 4, width: 768 }
    const bytes = format === "svg"
      ? Buffer.from(await qr.toString(url, { ...options, type: "svg" }), "utf8")
      : await qr.toBuffer(url, { ...options, type: "png" })
    return { mime_type: format === "svg" ? "image/svg+xml" : "image/png", base64: bytes.toString("base64") }
  },
}
