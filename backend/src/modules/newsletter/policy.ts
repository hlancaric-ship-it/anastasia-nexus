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

/** Jediné atribúty, ktoré sa z vstupu prenášajú: href pri odkaze, src/alt pri obrázku a rola šablóny `data-nl`. */
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

const ALLOWED_TAGS = new Set(["p", "h2", "h3", "strong", "em", "a", "ul", "ol", "li", "img", "br", "hr"])
const VOID_TAGS = new Set(["img", "br", "hr"])
const DROPPED_BLOCKS = new Set(["script", "style"])

/** Značky šablóny: nadtitulok, citát, textový odkaz (nie tlačidlo) a pozdrav podpisu, štýl sekcie na `hr`. Iné hodnoty `data-nl` sa zahodia. */
const NL_ROLES: Record<string, string[]> = { p: ["eyebrow", "sign", "quote", "link"], hr: ["dark", "light", "olive"] }

function roleAttribute(tag: string, raw: string): string {
  const role = attributeValue(raw, "data-nl").toLowerCase()
  return (NL_ROLES[tag] ?? []).includes(role) ? ` data-nl="${role}"` : ""
}

function safeAttributes(tag: string, raw: string): string {
  if (tag === "p" || tag === "hr") return roleAttribute(tag, raw)
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
 * Bezpečná podmnožina HTML: p, h2, h3, strong, em, a[href^=https:], ul, ol, li, img[src^=https:], br, hr.
 * Šablóna smie označiť `p` atribútom `data-nl` (eyebrow, sign, quote, link) a `hr` štýlom sekcie (dark, light, olive).
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

/** Paleta návrhu ANASTASIA: krémová karta, levanduľa, grafitovo-levanduľový panel, olivová, zlatá. */
const BRAND = {
  cream: "#f6f2ea",
  paper: "#f8f3ea",
  lavender: "#a7a5cf",
  lavenderInk: "#8f86c4",
  olive: "#2f3424",
  ink: "#26291d",
  text: "#45443f",
  gold: "#c9a55c",
  goldInk: "#a8823f",
  goldButton: "#b28646",
  line: "#e6dcc4",
}

/** Verejná adresa obrázkov v e-maile (pečať, úvodná fotografia, ozdoby). Nastaviteľná cez NEWSLETTER_ASSET_URL, kým beží test, ukazuje na testovací web. */
export function newsletterAssetUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.NEWSLETTER_ASSET_URL || "https://anastasia-test.l-code-dynamics.com").replace(/\/+$/, "")
}

/** Ikony v pätičke: web vždy, sociálne siete len s nastavenou https adresou (bez cudzích odkazov navyše). */
export function newsletterSocialLinks(env: NodeJS.ProcessEnv = process.env): { icon: string; href: string; label: string }[] {
  const links = [
    { icon: "ig", href: env.NEWSLETTER_INSTAGRAM_URL || "", label: "Instagram" },
    { icon: "fb", href: env.NEWSLETTER_FACEBOOK_URL || "https://www.facebook.com/profile.php?id=100063901301928", label: "Facebook" },
    { icon: "yt", href: env.NEWSLETTER_YOUTUBE_URL || "https://www.youtube.com/@luciarogozanova544", label: "YouTube" },
    { icon: "web", href: "https://anastasiaoz.eu", label: "anastasiaoz.eu" },
  ]
  return links.filter(link => isHttpsUrl(link.href))
}

const SERIF = "Fraunces,Georgia,'Times New Roman',serif"
const SANS = "Figtree,Helvetica,Arial,sans-serif"
const SCRIPT = "'Pinyon Script','Snell Roundhand','Apple Chancery',Fraunces,Georgia,serif"
const MONTHS = ["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"]

export type SectionVariant = "dark" | "light" | "olive"
const VARIANTS: SectionVariant[] = ["dark", "light", "olive"]

type Button = { href: string; label: string }

const BUTTON_STYLE: Record<SectionVariant, { bg: string; ink: string; border: string }> = {
  dark: { bg: "transparent", ink: "#ffffff", border: "#ece6da" },
  light: { bg: BRAND.goldButton, ink: "#ffffff", border: BRAND.goldButton },
  olive: { bg: BRAND.paper, ink: BRAND.ink, border: BRAND.paper },
}

function buttonHtml(button: Button, variant: SectionVariant, margin = "26px 0 0"): string {
  const s = BUTTON_STYLE[variant]
  const fill = s.bg === "transparent" ? "" : ` bgcolor="${s.bg}"`
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${margin}"><tr><td align="center"${fill} style="border-radius:999px;background:${s.bg};border:1px solid ${s.border}"><a href="${button.href}" style="display:inline-block;padding:17px 34px;white-space:nowrap;font-family:${SANS};font-size:16px;font-weight:400;letter-spacing:2px;text-transform:uppercase;color:${s.ink};text-decoration:none;border-radius:999px">${button.label}<span style="padding-left:16px">→</span></a></td></tr></table>`
}

/**
 * Odsek, v ktorom je len jeden odkaz (`<p><a href="https://…">Text</a></p>`), sa v e-maile zobrazí ako tlačidlo.
 * Jeden odkaz = jedno tlačidlo, ostatné odkazy v texte zostávajú obyčajné.
 */
export function ctaButtons(bodyHtml: string, variant: SectionVariant = "light"): string {
  return bodyHtml.replace(/<p>\s*<a [^>]*href="([^"]+)"[^>]*>([^<]{1,80})<\/a>\s*<\/p>/gi, (_m, href: string, label: string) => buttonHtml({ href, label }, variant))
}

/** Prevod sanitizovaného HTML na čitateľný text (pätička sa pridáva zvlášť). */
export function htmlToText(html: string): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr[^>]*>/gi, "\n\n")
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
  issuedAt?: Date
}

export type CampaignSection = { variant: SectionVariant; html: string }

export type CampaignLayout = {
  intro: string
  sections: CampaignSection[]
  signature: string
}

/**
 * Rozloženie obsahu: úvod (všetko pred prvým `<hr>`, vedľa stálej fotografie Lucie), sekcie oddelené
 * `<hr data-nl="dark|light|olive">` (bez štýlu sa striedajú) a pozdrav podpisu (`p[data-nl=sign]`).
 * Staršie kampane bez `<hr>` sa delia podľa `<h2>`, prvá časť je úvod.
 */
export function campaignLayout(bodyHtml: string): CampaignLayout {
  let body = String(bodyHtml ?? "")
  let signature = ""
  body = body.replace(/<p data-nl="sign">([\s\S]*?)<\/p>/gi, (_m, inner: string) => {
    if (!signature) signature = inner.trim()
    return ""
  })
  const hasContent = (part: string) => Boolean(part.replace(/<[^>]+>/g, "").trim() || /<img /i.test(part))
  let intro = ""
  const sections: CampaignSection[] = []
  if (/<hr[ >]/i.test(body)) {
    const tokens = body.split(/<hr(?: data-nl="(dark|light|olive)")?>/i)
    intro = tokens[0]
    for (let i = 1; i < tokens.length; i += 2) {
      const html = tokens[i + 1] ?? ""
      if (!hasContent(html)) continue
      const role = (tokens[i] || "").toLowerCase() as SectionVariant | ""
      sections.push({ variant: role || VARIANTS[sections.length % VARIANTS.length], html })
    }
  } else {
    const parts = body.split(/(?=<h2>)/i).filter(hasContent)
    intro = parts.shift() ?? ""
    for (const html of parts) sections.push({ variant: VARIANTS[sections.length % VARIANTS.length], html })
  }
  return { intro: hasContent(intro) ? intro : "", sections, signature }
}

/** Vytiahne z časti nadtitulok, citát, prvú fotografiu a tlačidlá, zvyšok je text. */
function splitPart(part: string): { eyebrow: string; quote: string; image: { src: string; alt: string } | null; buttons: Button[]; rest: string } {
  let eyebrow = ""
  let quote = ""
  let image: { src: string; alt: string } | null = null
  const buttons: Button[] = []
  const rest = part
    .replace(/<p data-nl="eyebrow">([\s\S]*?)<\/p>/i, (_m, inner: string) => { eyebrow = inner.trim(); return "" })
    .replace(/<p data-nl="quote">([\s\S]*?)<\/p>/i, (_m, inner: string) => { quote = inner.trim(); return "" })
    .replace(/<img src="([^"]*)" alt="([^"]*)">/i, (_m, src: string, alt: string) => { image = { src, alt }; return "" })
    .replace(/<p>\s*<a [^>]*href="([^"]+)"[^>]*>([^<]{1,80})<\/a>\s*<\/p>/gi, (_m, href: string, label: string) => { buttons.push({ href, label }); return "" })
  return { eyebrow, quote, image, buttons, rest }
}

type Tone = { head: string; em: string; text: string; link: string; eyebrow: string; size: number }

function styledText(html: string, tone: Tone): string {
  return html
    .replace(/<p data-nl="link">/gi, `<p style="margin:0 0 12px;font-family:${SANS};font-size:14px;font-weight:600;letter-spacing:.02em">`)
    .replace(/<a href=/gi, `<a style="color:${tone.link};text-decoration:underline" href=`)
    .replace(/<h2>/gi, `<h2 style="margin:0 0 18px;font-family:${SERIF};font-size:${tone.size}px;line-height:.94;font-weight:300;letter-spacing:-.03em;word-spacing:.06em;font-optical-sizing:auto;color:${tone.head}">`)
    .replace(/<em>/gi, `<em style="font-style:italic;color:${tone.em}">`)
    .replace(/<h3>/gi, `<h3 style="margin:22px 0 8px;font-family:${SERIF};font-size:21px;line-height:1.25;font-weight:400;color:${tone.head}">`)
    .replace(/<p>/gi, `<p style="margin:0 0 14px">`)
    .replace(/<ul>/gi, `<ul style="margin:0 0 14px;padding-left:20px">`)
    .replace(/<ol>/gi, `<ol style="margin:0 0 14px;padding-left:20px">`)
    .replace(/<li>/gi, `<li style="margin:0 0 6px">`)
    .replace(/<img /gi, `<img width="320" style="display:block;width:100%;max-width:320px;height:auto;border:0;border-radius:14px;margin:4px 0 16px" `)
}

function eyebrowHtml(text: string, color: string): string {
  return text ? `<div style="margin:0 0 12px;font-family:${SANS};font-size:12px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:${color}">${text}</div>` : ""
}

function textCell(content: string, tone: Tone, width: string, padding: string, type = "font-size:22px;line-height:1.55"): string {
  return `<td class="nl-c" width="${width}" valign="middle" style="padding:${padding};font-family:${SANS};${type};letter-spacing:.015em;color:${tone.text}">${content}</td>`
}

const TONES: Record<SectionVariant, Tone> = {
  dark: { head: "#ffffff", em: "#c9c3ee", text: "#ecebf2", link: "#f1dfb4", eyebrow: "#d9b978", size: 80 },
  light: { head: BRAND.ink, em: BRAND.lavenderInk, text: BRAND.text, link: BRAND.goldInk, eyebrow: BRAND.goldInk, size: 60 },
  olive: { head: BRAND.paper, em: BRAND.lavender, text: "#d9dccb", link: BRAND.gold, eyebrow: "#cda65e", size: 64 },
}

function sectionHtml(section: CampaignSection, asset: string): string {
  const { variant } = section
  const tone = TONES[variant]
  const part = splitPart(section.html)
  // V tmavej sekcii začína zvýraznená časť nadpisu vždy na novom riadku, inde ostáva v jednom riadku.
  const text = styledText(part.rest, tone)
  const head = eyebrowHtml(part.eyebrow, tone.eyebrow) + (variant !== "dark" ? text : text.replace(/<h2 [^>]*>[\s\S]*?<\/h2>/i, h2 => h2.replace(/<em style="/g, '<em style="display:block;')))

  if (variant === "dark") {
    const buttons = part.buttons.map(b => buttonHtml(b, "dark")).join("")
    const side = part.quote
      ? `<div style="font-family:${SERIF};font-size:84px;line-height:.6;font-weight:300;color:#ffffff">“</div><div style="padding-top:16px;font-family:${SERIF};font-size:38px;line-height:1.18;font-style:italic;font-weight:300;color:#ffffff">${part.quote}</div>`
      : part.image
        // Výrez ako na webe: hore polkruh, vpravo dole oblúk, vľavo dole rovný roh.
        // Zlatý prstenec okolo výrezu ako pri fotke v úvode.
        ? `<div style="max-width:366px;padding:11px;border:1.5px solid #c4a068;border-radius:184px 184px 116px 0"><img src="${part.image.src}" alt="${part.image.alt}" width="340" style="display:block;width:100%;max-width:340px;height:auto;border:0;border-radius:173px 173px 105px 0"></div>`
        : ""
    const cells = side
      // Citát a lístok vľavo, text s tlačidlom vpravo.
      ? `<td class="nl-c" width="36%" valign="middle" style="padding:30px 6px 30px 30px">${side}</td>`
        + `<td class="nl-c nl-h" width="20%" valign="middle" align="center" style="padding:16px 0"><img src="${asset}/assets/newsletter-leaf.png" width="220" alt="" style="display:block;width:220px;height:auto;border:0;margin-left:-150px;position:relative"></td>`
        + textCell(head + buttons, tone, "44%", "34px 40px 34px 8px")
      : textCell(head + buttons, tone, "100%", "34px 40px")
    return `<tr><td class="nl-o" style="padding:0 14px 6px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#45475a" style="border-radius:22px;background:#45475a;background-image:radial-gradient(circle at 100% 0%,rgba(222,190,136,.95) 0%,rgba(222,190,136,0) 34%),linear-gradient(100deg,#363a3a 0%,#454852 30%,#5e5d75 52%,#8d879b 76%,#a39bb3 100%)"><tr>${cells}</tr></table>
</td></tr>`
  }

  if (variant === "olive") {
    const buttons = part.buttons.map(b => buttonHtml(b, "olive", "0")).join("")
    return `<tr><td class="nl-s" bgcolor="${BRAND.olive}" style="padding:0 0 0 40px;background:${BRAND.olive}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${textCell(head, tone, "56%", "30px 16px 30px 0")}
<td class="nl-c" width="28%" valign="middle" align="right" style="padding:16px 0">${buttons}</td>
<td class="nl-c nl-h" width="16%" valign="middle" align="right" style="padding:10px 14px 10px 0"><img src="${asset}/assets/newsletter-leaf-olive.png" width="124" alt="" style="display:block;width:124px;height:auto;border:0"></td>
</tr></table></td></tr>`
  }

  const buttons = part.buttons.map(b => buttonHtml(b, "light")).join("")
  const image = part.image
    ? `<td class="nl-c" width="50%" valign="bottom" align="right" style="padding:18px 49px 13px 0"><img src="${part.image.src}" alt="${part.image.alt}" width="480" align="right" style="display:block;margin-left:auto;width:100%;max-width:480px;height:auto;border:0;border-radius:150px 150px 14px 14px"></td>`
    : ""
  return `<tr><td class="nl-s" style="padding:0 0 0 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${textCell(head + buttons, tone, image ? "50%" : "100%", image ? "24px 28px 24px 0" : "24px 40px 24px 0")}
${image}
</tr></table></td></tr>`
}

/** Ako v návrhu: zvýraznená časť hlavného nadpisu začína na novom riadku. */
function introHeading(html: string): string {
  // Celý nadpis je kurzívou a oba riadky sú tesne na sebe, bez odsadenia.
  return html.replace(/<h2 [^>]*>[\s\S]*?<\/h2>/i, h2 => h2
    .replace(/^<h2 style="/, '<h2 style="font-style:italic;')
    .replace(/<em style="/g, '<em style="display:block;margin-top:-.16em;font-size:1.18em;line-height:.84;word-spacing:-.02em;'))
}

function introHtml(intro: string, signature: string, asset: string): string {
  const tone: Tone = { head: BRAND.ink, em: BRAND.lavenderInk, text: BRAND.text, link: BRAND.goldInk, eyebrow: BRAND.goldInk, size: 118 }
  const part = splitPart(intro)
  const image = part.image ? `<img src="${part.image.src}" alt="${part.image.alt}" width="300" style="display:block;width:100%;max-width:300px;height:auto;border:0;border-radius:14px;margin:4px 0 16px">` : ""
  const buttons = part.buttons.map(b => buttonHtml(b, "light", "6px 0 18px")).join("")
  const sign = `<p style="margin:10px 0 0">${signature || "S láskou,"}</p>
<div class="nl-sig" style="padding:30px 0 0 120px;font-family:${SCRIPT};font-size:44px;line-height:1.2;font-weight:400;color:${BRAND.goldInk}">Lucia Rogožanová</div>
<div class="nl-sig nl-sig-t" style="padding:8px 0 0 124px;font-family:${SANS};font-size:10px;letter-spacing:2.2px;white-space:nowrap;text-transform:uppercase;color:${BRAND.text}">Farmaceutka • Tvorkyňa ANASTASIA</div>`
  // Linka pod hlavičkou je v ľavej bunke a priamo v obrázku, aby ju prstenec pretínal ako v návrhu.
  return `<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="nl-c" width="46%" valign="top" style="padding:0"><div style="height:6px;font-size:0;line-height:0"></div><div style="height:0;border-top:1px solid ${BRAND.line};font-size:0;line-height:0"></div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${textCell(eyebrowHtml(part.eyebrow, tone.eyebrow) + introHeading(styledText(part.rest, tone)) + image + buttons + sign, tone, "100%", "30px 4px 14px 40px", "font-size:23px;line-height:1.5")}
</tr></table></td>
<td class="nl-c" width="54%" valign="top" align="right" style="padding:0 0 10px 0"><img src="${asset}/assets/newsletter-hero.jpg" width="637" alt="Lucia Rogožanová" style="display:block;width:100%;max-width:637px;height:auto;border:0"></td>
</tr></table></td></tr>`
}

/** Nové zlaté logo: kruh so štvorčekmi a nápis ANASTASIA (obrázky, aby písmo sedelo 1:1 vo všetkých klientoch). */
function wordmark(asset: string, ring: number, word: number): string {
  // PNG majú okolo seba okraj pre tieň: krúžok 14 px, nápis 10 px pri pôvodnej šírke 240 a 520 px.
  const ringWidth = Math.round(ring * 268 / 240)
  const ringHeight = Math.round(ringWidth * 254 / 268)
  const wordWidth = Math.round(word * 540 / 520)
  const wordHeight = Math.round(wordWidth * 95 / 540)
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="${ringWidth}" valign="middle"><img src="${asset}/assets/newsletter-logo-ring.png" width="${ringWidth}" height="${ringHeight}" alt="" style="display:block;width:${ringWidth}px;height:${ringHeight}px;border:0"></td>
<td valign="middle" style="padding-left:4px"><img src="${asset}/assets/newsletter-logo-word.png" width="${wordWidth}" height="${wordHeight}" alt="ANASTASIA" style="display:block;width:${wordWidth}px;height:${wordHeight}px;border:0;font-family:${SERIF};font-size:22px;letter-spacing:6px;color:${BRAND.goldInk}">
<div style="padding:5px 0 0 10px;font-family:${SANS};font-size:9px;letter-spacing:4px;text-transform:uppercase;color:${BRAND.goldInk}">Light for the future</div></td>
</tr></table>`
}

/**
 * Šablóna vo vzhľade návrhu ANASTASIA: hlavička s pečaťou a mesiacom vydania, úvod so stálou fotografiou Lucie
 * a podpisom, sekcie v troch štýloch (grafitovo-levanduľový panel s citátom, krémová s fotografiou, olivový pás)
 * a pätička s ikonami a odhlásením. Testovací e-mail bez známeho súhlasu odkaz na odhlásenie nemá.
 */
export function renderCampaignEmail(input: CampaignEmailInput): { html: string; text: string } {
  const preheader = String(input.preheader ?? "").trim()
  const unsubscribe = input.unsubscribeUrl ? String(input.unsubscribeUrl) : ""
  const asset = newsletterAssetUrl()
  const issued = input.issuedAt instanceof Date && !Number.isNaN(input.issuedAt.getTime()) ? input.issuedAt : new Date()
  const month = `${MONTHS[issued.getMonth()]} ${issued.getFullYear()}`
  const layout = campaignLayout(input.bodyHtml)
  const rows = layout.sections.map(section => sectionHtml(section, asset)).join("\n")
  const hasIntro = Boolean(layout.intro || !layout.sections.length)
  const icons = newsletterSocialLinks().map((link, index) =>
    `<td class="nl-ic" align="center" style="padding:6px 38px;${index ? "border-left:1px solid #d9c7a3" : ""}"><a href="${escapeHtml(link.href)}" title="${link.label}"><img src="${asset}/assets/newsletter-ic-${link.icon}.png" width="34" height="34" alt="${link.label}" style="display:block;width:34px;height:34px;border:0"></a></td>`).join("")
  const unsubscribeLine = unsubscribe
    ? `<a href="${escapeHtml(unsubscribe)}" style="color:${BRAND.text};text-decoration:underline">Odhlásiť sa</a>`
    : `Toto je testovacia správa. Ak ste ju dostali omylom, ignorujte ju.`

  const html = `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,300" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@600" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Pinyon+Script" rel="stylesheet">
<style>@media (max-width:620px){.nl-s{padding-left:22px!important;padding-right:22px!important}.nl-ic{padding:6px 22px!important}.nl-o{padding-left:8px!important;padding-right:8px!important}.nl-c{display:block!important;width:100%!important;box-sizing:border-box}.nl-h{display:none!important}.nl-r{text-align:left!important;border-left:0!important;padding:16px 0 0!important}.nl-sig{padding-left:24px!important;font-size:38px!important}.nl-sig-t{padding-left:28px!important;font-size:9px!important;letter-spacing:1.6px!important;white-space:normal!important}}</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.cream}" style="background:${BRAND.cream};background-image:radial-gradient(ellipse 60% 38% at 100% 0%,rgba(227,197,142,1) 0%,rgba(227,197,142,0) 100%),radial-gradient(ellipse 45% 30% at 100% 100%,rgba(222,189,130,1) 0%,rgba(222,189,130,0) 100%),radial-gradient(ellipse 35% 22% at 0% 90%,rgba(214,188,146,.95) 0%,rgba(214,188,146,0) 100%),radial-gradient(ellipse 50% 40% at 100% 50%,rgba(176,166,178,.9) 0%,rgba(176,166,178,0) 100%),linear-gradient(180deg,#6f6f82 0%,#5a5c6e 25%,#5c5e72 45%,#938ba8 72%,#7c7aa4 100%)">
<tr><td align="center" style="padding:18px 8px 22px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.paper}" style="max-width:1180px;background:${BRAND.paper};border-radius:22px;overflow:hidden">
<tr><td class="nl-s" style="padding:30px 32px ${hasIntro ? "10px" : "24px;border-bottom:1px solid " + BRAND.line}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="nl-c" valign="middle">${wordmark(asset, 54, 168)}</td>
<td class="nl-c nl-r" valign="middle" align="right" style="padding-left:22px;border-left:1px solid ${BRAND.line};text-align:right"><div style="font-family:${SERIF};font-size:20px;letter-spacing:3px;text-transform:uppercase;color:${BRAND.ink}">Newsletter</div><div style="padding-top:4px;font-family:${SERIF};font-size:20px;font-style:italic;color:${BRAND.ink}">${month}</div></td>
</tr></table></td></tr>
${hasIntro ? introHtml(layout.intro, layout.signature, asset) : ""}
${rows}
<tr><td class="nl-s" style="padding:24px 32px 22px 70px;border-top:1px solid ${BRAND.line}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="nl-c" valign="middle">${wordmark(asset, 58, 176)}</td>
<td class="nl-c nl-r" valign="middle" align="right"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr>${icons}</tr></table></td>
</tr></table></td></tr>
<tr><td align="center" style="padding:0 32px 22px;font-family:${SANS};font-size:13px;line-height:1.8;color:#5f5b52">
<div style="border-top:1px solid ${BRAND.line};padding-top:14px">Tento e-mail ste dostali, pretože ste súčasťou komunity ANASTASIA.</div>
<div>${unsubscribeLine}</div>
<div style="padding-top:6px;font-size:11px;color:#9a9588">LUCRAT spol. s r.o. · IČO 36652164 · anastasiaoz.eu · info@anastasiaoz.eu</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const text = [
    `ANASTASIA · Newsletter · ${month}`,
    htmlToText(input.bodyHtml),
    `${layout.signature || "S láskou,"}\nLucia Rogožanová`,
    "— ANASTASIA · Light for the future",
    "LUCRAT spol. s r.o. · IČO 36652164 · https://anastasiaoz.eu",
    "info@anastasiaoz.eu",
    unsubscribe
      ? `Odhlásiť sa z odberu: ${unsubscribe}`
      : "Toto je testovacia správa. Ak ste ju dostali omylom, ignorujte ju.",
  ].filter(Boolean).join("\n\n")

  return { html, text }
}
