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

/** Paleta webu ANASTASIA: šedomodrá, levanduľa, olivová, krémová, zlatá. */
const BRAND = {
  cream: "#e9e9f2",
  paper: "#f7f4ec",
  card: "#fdfbf7",
  lavender: "#a7a5cf",
  accent: "#73729c",
  olive: "#2f3424",
  gold: "#c9a55c",
  ink: "#2b2a3a",
  muted: "#5a5b70",
  line: "#d8d8e8",
}

/** Verejná adresa obrázkov v e-maile (logo). Nastaviteľná cez NEWSLETTER_ASSET_URL, kým beží test, ukazuje na testovací web. */
export function newsletterAssetUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.NEWSLETTER_ASSET_URL || "https://anastasia-test.l-code-dynamics.com").replace(/\/+$/, "")
}

/**
 * Odsek, v ktorom je len jeden odkaz (`<p><a href="https://…">Text</a></p>`), sa v e-maile zobrazí ako tlačidlo.
 * Jeden odkaz = jedno tlačidlo, ostatné odkazy v texte zostávajú obyčajné.
 */
export function ctaButtons(bodyHtml: string, dark = false): string {
  const fill = dark ? "#f7f4ec" : BRAND.olive
  const ink = dark ? BRAND.olive : "#f7f4ec"
  return bodyHtml.replace(/<p>\s*<a [^>]*href="([^"]+)"[^>]*>([^<]{1,80})<\/a>\s*<\/p>/gi, (_m, href: string, label: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 14px"><tr><td align="center" bgcolor="${fill}" style="border-radius:999px;background:${fill}"><a data-cta="1" href="${href}" style="display:inline-block;padding:17px 38px;font-family:Figtree,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;letter-spacing:.04em;color:${ink};text-decoration:none;border-radius:999px">${label}</a></td></tr></table>`)
}

/** Panely ako na webe: šedomodrá, svetlá zelená, olivová, zlatá. Každý nadpis (h2) začína nový panel. */
const PANELS = [
  { bg: "#e9e9f2", ink: BRAND.ink, head: BRAND.olive, link: BRAND.accent, dark: false },
  { bg: "#e4e6d6", ink: BRAND.ink, head: BRAND.olive, link: BRAND.accent, dark: false },
  { bg: BRAND.olive, ink: "#e9eadf", head: "#f7f4ec", link: BRAND.gold, dark: true },
  { bg: "#f3e9d0", ink: BRAND.ink, head: BRAND.olive, link: "#8a6d2e", dark: false },
]

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
 * Šablóna „Dopis“: šedomodré pozadie, krémová karta, serif nadpis, jedno tlačidlo, olivová pätička.
 * Testovací e-mail bez známeho súhlasu odkaz na odhlásenie nemá (nemá čo podpísať).
 */
export function renderCampaignEmail(input: CampaignEmailInput): { html: string; text: string } {
  const preheader = String(input.preheader ?? "").trim()
  const unsubscribe = input.unsubscribeUrl ? String(input.unsubscribeUrl) : ""
  const asset = newsletterAssetUrl()
  const serif = "Fraunces,Georgia,'Times New Roman',serif"
  const sans = "Figtree,Helvetica,Arial,sans-serif"
  const styleBlock = (html: string, panel: (typeof PANELS)[number]): string => ctaButtons(html, panel.dark)
    .replace(/<a href=/gi, `<a style="color:${panel.link};text-decoration:underline" href=`)
    .replace(/<h2>/gi, `<h2 style="margin:0 0 20px;font-family:${serif};font-size:32px;line-height:1.15;font-weight:300;letter-spacing:-.01em;color:${panel.head}">`)
    .replace(/<h3>/gi, `<h3 style="margin:26px 0 10px;font-family:${serif};font-size:21px;line-height:1.25;font-weight:400;color:${panel.link}">`)
    .replace(/<p>/gi, `<p style="margin:0 0 18px">`)
    .replace(/<ul>/gi, `<ul style="margin:0 0 18px;padding-left:22px">`)
    .replace(/<ol>/gi, `<ol style="margin:0 0 18px;padding-left:22px">`)
    .replace(/<li>/gi, `<li style="margin:0 0 8px">`)
    .replace(/<img /gi, `<img style="display:block;width:100%;max-width:520px;height:auto;border-radius:16px;margin:8px 0 22px" `)
    .replace(/ data-cta="1"/g, "")
  const sections = input.bodyHtml.split(/(?=<h2>)/i).filter(part => part.trim())
  const rows = (sections.length ? sections : [""]).map((part, index) => {
    const panel = PANELS[index % PANELS.length]
    return `<tr><td bgcolor="${panel.bg}" style="padding:44px 48px 36px;background:${panel.bg};font-family:${sans};font-size:16px;line-height:1.8;color:${panel.ink}">
${styleBlock(part, panel)}
</td></tr>`
  }).join("\n")
  const footer = unsubscribe
    ? `<p style="margin:0 0 6px;font-family:${sans};font-size:12px;line-height:1.7;color:#cfd2c0">Odhlásiť sa môžete kedykoľvek jedným kliknutím.</p>
<p style="margin:0"><a href="${escapeHtml(unsubscribe)}" style="font-family:${sans};font-size:12px;line-height:1.7;color:${BRAND.gold};text-decoration:underline">Odhlásiť sa z odberu</a></p>`
    : `<p style="margin:0;font-family:${sans};font-size:12px;line-height:1.7;color:#cfd2c0">Toto je testovacia správa. Ak ste ju dostali omylom, ignorujte ju.</p>`

  const html = `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.cream}" style="background:${BRAND.cream}">
<tr><td align="center" background="${asset}/assets/email-lines.png" style="padding:36px 16px 44px;background:${BRAND.cream} url(${asset}/assets/email-lines.png) center top repeat-y;background-size:1200px auto">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:${BRAND.card};border-radius:28px;overflow:hidden">
<tr><td align="center" style="padding:44px 40px 26px;background:${BRAND.paper}">
<img src="${asset}/assets/lucia-koule.png" width="64" height="64" alt="ANASTASIA" style="display:block;width:64px;height:64px;margin:0 auto 16px;border:0">
<div style="font-family:${serif};font-size:26px;font-weight:300;letter-spacing:9px;color:${BRAND.olive};text-transform:uppercase">ANASTASIA</div>
<div style="font-family:${sans};font-size:10px;letter-spacing:4px;color:${BRAND.gold};text-transform:uppercase;padding-top:10px">Light for the future</div>
</td></tr>
<tr><td height="3" bgcolor="${BRAND.gold}" style="height:3px;background:${BRAND.gold};line-height:3px;font-size:3px"></td></tr>
${rows}
<tr><td style="padding:34px 48px 36px;background:${BRAND.olive}">
<p style="margin:0 0 10px;font-family:${sans};font-size:12px;line-height:1.7;color:#cfd2c0">Tento e-mail ste dostali, pretože ste sa prihlásili na odber noviniek ANASTASIA.</p>
${footer}
<p style="margin:18px 0 0;font-family:${serif};font-size:11px;letter-spacing:3px;color:${BRAND.gold};text-transform:uppercase">ANASTASIA · Light for the future</p>
<p style="margin:10px 0 0;font-family:${sans};font-size:11px;line-height:1.6;color:#aeb29c">LUCRAT spol. s r.o. · IČO 36652164 · <a href="https://anastasiaoz.eu" style="color:${BRAND.gold}">anastasiaoz.eu</a> · info@anastasiaoz.eu</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const text = [
    htmlToText(input.bodyHtml),
    "— ANASTASIA · Light for the future",
    "LUCRAT spol. s r.o. · IČO 36652164 · https://anastasiaoz.eu",
    "info@anastasiaoz.eu",
    unsubscribe
      ? `Odhlásiť sa z odberu: ${unsubscribe}`
      : "Toto je testovacia správa. Ak ste ju dostali omylom, ignorujte ju.",
  ].filter(Boolean).join("\n\n")

  return { html, text }
}
