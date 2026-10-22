import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Pravidlá newslettera: sanitizácia obsahu, podpísaný odhlasovací odkaz, šablóna e-mailu
 * a limity dávky. Všetko čisté funkcie bez databázy, aby sa dali testovať samostatne.
 */

export class NewsletterError extends Error {
  constructor(public code: string, public status = 422) { super(code); this.name = "NewsletterError" }
  get statusCode() { return this.status }
}

export const CAMPAIGN_STATUSES = ["draft", "queued", "sending", "sent", "cancelled"] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

/** Povolené prechody. Z `sent` a `cancelled` sa už nič nemení. */
const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["queued"],
  queued: ["sending", "cancelled"],
  sending: ["sent", "cancelled"],
  sent: [],
  cancelled: [],
}

export function assertCampaignTransition(from: string, to: CampaignStatus): CampaignStatus {
  if (!(CAMPAIGN_STATUSES as readonly string[]).includes(from) || !(TRANSITIONS[from as CampaignStatus] ?? []).includes(to)) {
    throw new NewsletterError("CAMPAIGN_STATE_CONFLICT", 409)
  }
  return to
}

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(value)
}

export const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))

/** Jediné atribúty, ktoré sa z vstupu prenášajú: href pri odkaze a src/alt pri obrázku. */
function attributeValue(raw: string, name: string): string {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, "i")
  const match = raw.match(re)
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : ""
}

function isHttpsUrl(value: string): boolean {
  const text = value.trim()
  if (!/^https:\/\//i.test(text) || /[\s<>"']/.test(text)) return false
  try { return new URL(text).protocol === "https:" } catch { return false }
}

const ALLOWED_TAGS = new Set(["p", "h2", "h3", "strong", "em", "a", "ul", "ol", "li", "img", "br"])
const VOID_TAGS = new Set(["img", "br"])
const DROPPED_BLOCKS = new Set(["script", "style"])

function safeAttributes(tag: string, raw: string): string {
  if (tag === "a") {
    const href = attributeValue(raw, "href")
    return isHttpsUrl(href) ? ` href="${escapeHtml(href)}" rel="noopener noreferrer"` : ""
  }
  if (tag === "img") {
    const src = attributeValue(raw, "src")
    if (!isHttpsUrl(src)) return ""
    const alt = attributeValue(raw, "alt").slice(0, 200)
    return ` src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"`
  }
  return ""
}

export const MAX_BODY_INPUT = 60_000

/**
 * Bezpečná podmnožina HTML: p, h2, h3, strong, em, a[href^=https:], ul, ol, li, img[src^=https:], br.
 * Všetko ostatné sa zahodí (text zostane), `script`/`style` vrátane obsahu zmiznú,
 * atribúty ako style/class/on* sa nikdy neprenášajú a značky sa vyvažujú.
 */
export function sanitizeCampaignHtml(input: unknown): string {
  if (typeof input !== "string") return ""
  const source = input.replace(/\u0000/g, "").slice(0, MAX_BODY_INPUT)
  const tagRe = /<([/!]?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
  const stack: string[] = []
  let out = ""
  let skip: string | null = null
  let last = 0
  let match: RegExpExecArray | null
  while ((match = tagRe.exec(source))) {
    const text = source.slice(last, match.index)
    last = match.index + match[0].length
    if (!skip) out += escapeHtml(text)
    const closing = match[1] === "/"
    const name = match[2].toLowerCase()
    const rawAttrs = match[3] || ""
    if (DROPPED_BLOCKS.has(name)) {
      const selfClosing = /\/\s*$/.test(rawAttrs)
      if (!closing && !selfClosing) skip = name
      else if (closing && skip === name) skip = null
      continue
    }
    if (skip || match[1] === "!") continue
    if (!ALLOWED_TAGS.has(name)) continue
    if (VOID_TAGS.has(name)) {
      if (closing) continue
      const attributes = safeAttributes(name, rawAttrs)
      if (name === "img" && !attributes) continue
      out += `<${name}${attributes}>`
      continue
    }
    if (closing) {
      const index = stack.lastIndexOf(name)
      if (index === -1) continue
      while (stack.length > index) out += `</${stack.pop()}>`
      continue
    }
    stack.push(name)
    out += `<${name}${safeAttributes(name, rawAttrs)}>`
  }
  if (!skip) out += escapeHtml(source.slice(last))
  while (stack.length) out += `</${stack.pop()}>`
  return out
}

export const MAX_SUBJECT = 200
export const MAX_PREHEADER = 300

export type CampaignFields = { subject: string; preheader: string | null; body_html: string }

/** Validácia vstupu z administrácie. Obsah sa vždy sanitizuje, nikdy neukladá surový. */
export function campaignFields(input: any): CampaignFields {
  const subject = typeof input?.subject === "string" ? input.subject.replace(/[\r\n]+/g, " ").trim() : ""
  if (!subject || subject.length > MAX_SUBJECT) throw new NewsletterError("INVALID_CAMPAIGN_SUBJECT")
  const preheaderRaw = typeof input?.preheader === "string" ? input.preheader.replace(/[\r\n]+/g, " ").trim() : ""
  if (preheaderRaw.length > MAX_PREHEADER) throw new NewsletterError("INVALID_CAMPAIGN_PREHEADER")
  const body_html = sanitizeCampaignHtml(input?.body_html)
  if (!body_html.trim()) throw new NewsletterError("INVALID_CAMPAIGN_BODY")
  return { subject, preheader: preheaderRaw || null, body_html }
}

// --- Odhlasovací odkaz: HMAC-SHA256(consent_id), v DB je len token_hash, preto sa ID podpisuje. ---

export const MIN_SECRET_LENGTH = 32

export function newsletterSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = (env.NEWSLETTER_UNSUBSCRIBE_SECRET || "").trim()
  if (secret.length < MIN_SECRET_LENGTH) throw new NewsletterError("NEWSLETTER_NOT_CONFIGURED", 503)
  return secret
}

export function hasNewsletterSecret(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NEWSLETTER_UNSUBSCRIBE_SECRET || "").trim().length >= MIN_SECRET_LENGTH
}

export const CONSENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const SIGNATURE_RE = /^[a-f0-9]{64}$/

export function unsubscribeSignature(consentId: string, secret: string): string {
  return createHmac("sha256", secret).update(consentId).digest("hex")
}

/** Porovnanie podpisu v konštantnom čase. Neplatný tvar podpisu nikdy nevyhodí chybu. */
export function verifyUnsubscribeSignature(consentId: unknown, signature: unknown, secret: string): boolean {
  if (typeof consentId !== "string" || !CONSENT_ID_RE.test(consentId)) return false
  if (typeof signature !== "string" || !SIGNATURE_RE.test(signature)) return false
  const expected = Buffer.from(unsubscribeSignature(consentId, secret), "hex")
  const given = Buffer.from(signature, "hex")
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export function newsletterBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = (env.NEWSLETTER_PUBLIC_URL || env.BACKEND_PUBLIC_URL || "http://localhost:9000").trim()
  return value.replace(/\/+$/, "")
}

export function unsubscribeUrl(consentId: string, secret: string, baseUrl = newsletterBaseUrl()): string {
  const signature = unsubscribeSignature(consentId, secret)
  return `${baseUrl.replace(/\/+$/, "")}/store/newsletter/unsubscribe/link?c=${encodeURIComponent(consentId)}&s=${signature}`
}

/** Hlavičky pre jednoklikové odhlásenie (RFC 8058). Hodnoty sú čistý ASCII bez CR/LF. */
export function listUnsubscribeHeaders(url: string): Array<{ name: string; value: string }> {
  return [
    { name: "List-Unsubscribe", value: `<${url}>` },
    { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
  ]
}

// --- Limity dávky ---

function positiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

/** Koľko e-mailov smie odísť za jeden beh jobu (NEWSLETTER_BATCH, predvolene 40). */
export function batchSize(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env.NEWSLETTER_BATCH, 40, 1, 200)
}

/** Koľko e-mailov smie odísť za posledných 24 hodín (NEWSLETTER_DAILY_LIMIT, predvolene 90). */
export function dailyLimit(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env.NEWSLETTER_DAILY_LIMIT, 90, 1, 1000)
}

/** Koľko e-mailov ešte smie odísť v tomto behu. 0 = denný limit je vyčerpaný. */
export function remainingDailyBudget(sentLast24h: number, limit: number, batch: number): number {
  const used = Number.isFinite(sentLast24h) ? Math.max(0, sentLast24h) : 0
  return Math.max(0, Math.min(batch, limit - used))
}

// --- Šablóna e-mailu ---

const BRAND = {
  cream: "#fbf8f2",
  card: "#fffdf8",
  lavender: "#8e7cc3",
  sage: "#5f7a5a",
  ink: "#2c2a23",
  muted: "#7a7368",
  line: "#ece4d6",
}

/** Prevod sanitizovaného HTML na čitateľný text (pätička sa pridáva zvlášť). */
export function htmlToText(html: string): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h2|h3|li|ul|ol)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export type CampaignEmailInput = {
  subject: string
  preheader?: string | null
  bodyHtml: string
  unsubscribeUrl?: string | null
  isTest?: boolean
}

/**
 * Svetlá šablóna: krémové pozadie, levanduľová a šalviová, tenký serif v hlavičke.
 * Testovací e-mail bez známeho súhlasu odkaz na odhlásenie nemá (nemá čo podpísať).
 */
export function renderCampaignEmail(input: CampaignEmailInput): { html: string; text: string } {
  const preheader = String(input.preheader ?? "").trim()
  const unsubscribe = input.unsubscribeUrl ? String(input.unsubscribeUrl) : ""
  const footer = unsubscribe
    ? `<p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.7;color:${BRAND.muted}">Odhlásiť sa môžete kedykoľvek jedným kliknutím.</p>
<p style="margin:0"><a href="${escapeHtml(unsubscribe)}" style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.7;color:${BRAND.sage};text-decoration:underline">Odhlásiť sa z odberu</a></p>`
    : `<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.7;color:${BRAND.muted}">Toto je testovacia správa. Ak ste ju dostali omylom, ignorujte ju.</p>`

  const html = `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:14px">
<tr><td style="padding:36px 40px 0;text-align:center">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:8px;color:${BRAND.sage};text-transform:uppercase">ANASTASIA</div>
<div style="font-family:Georgia,'Times New Roman',serif;font-size:10px;letter-spacing:4px;color:${BRAND.lavender};text-transform:uppercase;padding-top:8px">Light for the future</div>
<div style="height:1px;background:${BRAND.lavender};opacity:0.35;margin:22px 0 0"></div>
</td></tr>
<tr><td style="padding:26px 40px 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.75;color:${BRAND.ink}">
${input.bodyHtml}
</td></tr>
<tr><td style="padding:28px 40px 34px">
<div style="height:1px;background:${BRAND.sage};opacity:0.25;margin:0 0 20px"></div>
<p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.7;color:${BRAND.muted}">Tento e-mail ste dostali, pretože ste sa prihlásili na odber noviniek ANASTASIA.</p>
${footer}
<p style="margin:14px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:2px;color:${BRAND.sage};text-transform:uppercase">ANASTASIA · Light for the future</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const text = [
    htmlToText(input.bodyHtml),
    "— ANASTASIA · Light for the future",
    unsubscribe
      ? `Odhlásiť sa z odberu: ${unsubscribe}`
      : "Toto je testovacia správa. Ak ste ju dostali omylom, ignorujte ju.",
  ].filter(Boolean).join("\n\n")

  return { html, text }
}
