/**
 * Šablony transakčních e-mailů (SK). Vstupem jsou jen data, která posílá backend
 * (`createNotifications({ template, data })`); veškerý text z dat se escapuje.
 * Neznámá šablona vyhodí chybu – raději nedoručený e-mail než prázdný.
 */

export type RenderedEmail = { subject: string; html: string; text: string }

type Data = Record<string, unknown>
type Block = { kind: "p"; text: string } | { kind: "quote"; text: string } | { kind: "code"; label: string; value: string }
type Body = { subject: string; heading: string; blocks: Block[]; button?: { label: string; url: string } | null }

const TIME_ZONE = "Europe/Bratislava"
const BRAND = "ANASTASIA"
const ACCENT = "#6d1f2f"

export class UnknownTemplateError extends Error {
  constructor(template: string) {
    super(`Unknown e-mail template "${template}"`)
    this.name = "UnknownTemplateError"
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!)
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null)
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null)

/** Jen http(s) odkazy – cokoli jiného (javascript:, data:, relativní cesta) tlačítko nevykreslí. */
export function safeUrl(value: unknown): string | null {
  const raw = str(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

function parseDate(value: unknown): Date | null {
  const raw = value instanceof Date ? value : str(value)
  if (!raw) return null
  const date = raw instanceof Date ? raw : new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: unknown): string | null {
  const date = parseDate(value)
  return date ? new Intl.DateTimeFormat("sk-SK", { timeZone: TIME_ZONE, day: "numeric", month: "numeric", year: "numeric" }).format(date) : null
}

export function formatTime(value: unknown): string | null {
  const date = parseDate(value)
  return date ? new Intl.DateTimeFormat("sk-SK", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(date) : null
}

function bookingTerm(data: Data): string {
  const day = formatDate(data.starts_at)
  const from = formatTime(data.starts_at)
  const to = formatTime(data.ends_at)
  if (!day || !from) return "dohodnutý termín"
  return to ? `${day} od ${from} do ${to}` : `${day} o ${from}`
}

const CANCEL_TEXT: Record<string, string> = {
  order_canceled: "Konzultácia bola zrušená spolu s objednávkou.",
  customer_request: "Konzultáciu sme zrušili na Vašu žiadosť.",
  admin_canceled: "Konzultáciu sme z organizačných dôvodov museli zrušiť.",
}

const TEMPLATES: Record<string, (data: Data) => Body> = {
  "magic-link-sk": data => {
    const url = safeUrl(data.url)
    if (!url) throw new Error("magic-link-sk: missing url")
    const ttl = num(data.ttl_minutes)
    return {
      subject: "Prihlasovací odkaz k vášmu účtu ANASTASIA",
      heading: "Prihlásenie do účtu",
      blocks: [
        { kind: "p", text: "Kliknutím na tlačidlo nižšie sa prihlásite do svojho účtu ANASTASIA." },
        { kind: "p", text: `${ttl ? `Odkaz platí ${ttl} minút a` : "Odkaz"} je možné použiť iba raz.` },
        { kind: "p", text: "Ak ste o prihlásenie nežiadali, tento e-mail pokojne ignorujte." },
      ],
      button: { label: "Prihlásiť sa", url },
    }
  },

  "booking-confirmed-sk": data => ({
    subject: "Vaša konzultácia je potvrdená",
    heading: "Konzultácia je potvrdená",
    blocks: [
      { kind: "p", text: `Teším sa na Vás ${bookingTerm(data)}.` },
      { kind: "p", text: "Podrobnosti nájdete vo svojom účte." },
    ],
    button: safeUrl(data.url) ? { label: "Moje konzultácie", url: safeUrl(data.url)! } : null,
  }),

  "booking-canceled-sk": data => ({
    subject: "Vaša konzultácia bola zrušená",
    heading: "Konzultácia bola zrušená",
    blocks: [
      { kind: "p", text: `Termín ${bookingTerm(data)} je zrušený.` },
      { kind: "p", text: CANCEL_TEXT[str(data.cancel_kind) ?? ""] ?? "Ak máte otázky, odpovedzte na tento e-mail." },
    ],
    button: safeUrl(data.url) ? { label: "Moje konzultácie", url: safeUrl(data.url)! } : null,
  }),

  "gift-voucher-recipient-sk": data => {
    const code = str(data.code)
    if (!code) throw new Error("gift-voucher-recipient-sk: missing code")
    const name = str(data.recipient_name)
    const message = str(data.message)
    const expires = formatDate(data.expires_at)
    return {
      subject: "Dostali ste darčekový poukaz ANASTASIA",
      heading: name ? `${name}, máte darček` : "Máte darček",
      blocks: [
        { kind: "p", text: `Niekto Vám daroval poukaz ANASTASIA${str(data.amount) ? ` v hodnote ${str(data.amount)}` : ""}.` },
        ...(message ? [{ kind: "quote" as const, text: message }] : []),
        { kind: "code", label: "Kód poukazu", value: code },
        { kind: "p", text: `Kód zadajte v košíku e-shopu.${expires ? ` Poukaz platí do ${expires}.` : ""}` },
      ],
    }
  },

  "gift-voucher-buyer-sk": data => {
    const expires = formatDate(data.expires_at)
    return {
      subject: "Váš darčekový poukaz ANASTASIA (PDF)",
      heading: "Váš darčekový poukaz",
      blocks: [
        { kind: "p", text: `Ďakujeme za nákup. Poukaz${str(data.amount) ? ` v hodnote ${str(data.amount)}` : ""} nájdete v prílohe vo formáte PDF, pripravený na tlač alebo odoslanie.` },
        ...(str(data.masked_code) ? [{ kind: "code" as const, label: "Kód poukazu", value: str(data.masked_code)! }] : []),
        ...(expires ? [{ kind: "p" as const, text: `Poukaz platí do ${expires}.` }] : []),
      ],
    }
  },

  "chat-admin-digest": data => {
    const messages = num(data.messages) ?? 0
    const conversations = num(data.conversations) ?? 0
    return {
      subject: `Nové správy od zákazníčok (${messages})`,
      heading: "Nové správy v chate",
      blocks: [{ kind: "p", text: `Neprečítané správy: ${messages}, konverzácie: ${conversations}.` }],
      button: safeUrl(data.url) ? { label: "Otvoriť chat", url: safeUrl(data.url)! } : null,
    }
  },

  "chat-admin-reply": data => {
    const name = str(data.first_name)
    return {
      subject: "Lucia vám odpovedala",
      heading: name ? `${name}, máte novú odpoveď` : "Máte novú odpoveď",
      blocks: [{ kind: "p", text: "Lucia odpovedala na Vašu správu. Odpoveď si prečítate vo svojom účte." }],
      button: safeUrl(data.url) ? { label: "Zobraziť odpoveď", url: safeUrl(data.url)! } : null,
    }
  },
}

export const TEMPLATE_NAMES = Object.freeze(Object.keys(TEMPLATES))

function renderHtml(body: Body): string {
  const blocks = body.blocks.map(block => {
    if (block.kind === "quote") {
      return `<p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid ${ACCENT};background:#faf6f6;font-style:italic;white-space:pre-line">${escapeHtml(block.text)}</p>`
    }
    if (block.kind === "code") {
      return `<p style="margin:0 0 6px;font-size:13px;color:#6b6b6b">${escapeHtml(block.label)}</p>` +
        `<p style="margin:0 0 16px;font-size:22px;font-weight:bold;letter-spacing:2px;font-family:Menlo,Consolas,monospace">${escapeHtml(block.value)}</p>`
    }
    return `<p style="margin:0 0 16px">${escapeHtml(block.text)}</p>`
  }).join("\n")
  const button = body.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(body.button.url)}" style="display:inline-block;padding:12px 24px;background:${ACCENT};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">${escapeHtml(body.button.label)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:12px;color:#6b6b6b;word-break:break-all">Ak tlačidlo nefunguje, skopírujte do prehliadača: ${escapeHtml(body.button.url)}</p>`
    : ""
  return `<!doctype html>
<html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(body.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.5;color:#2b2b2b">
<tr><td style="padding:24px 28px 8px;font-size:13px;letter-spacing:3px;color:${ACCENT}">${BRAND}</td></tr>
<tr><td style="padding:8px 28px 20px">
<h1 style="margin:0 0 16px;font-size:22px;font-weight:normal;color:${ACCENT}">${escapeHtml(body.heading)}</h1>
${blocks}
${button}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #eee;font-size:12px;color:#8a8a8a">${BRAND} · anastasiaoz.eu</td></tr>
</table></td></tr></table>
</body></html>`
}

function renderText(body: Body): string {
  const lines = [body.heading, ""]
  for (const block of body.blocks) {
    if (block.kind === "code") lines.push(`${block.label}: ${block.value}`, "")
    else if (block.kind === "quote") lines.push(block.text.split("\n").map(l => `> ${l}`).join("\n"), "")
    else lines.push(block.text, "")
  }
  if (body.button) lines.push(`${body.button.label}: ${body.button.url}`, "")
  lines.push("--", `${BRAND} · anastasiaoz.eu`)
  return lines.join("\n")
}

/** Předmět bere z `data.subject`, pokud ho volající poslal; jinak výchozí předmět šablony. */
export function renderTemplate(template: string, data: Data = {}): RenderedEmail {
  const build = Object.prototype.hasOwnProperty.call(TEMPLATES, template) ? TEMPLATES[template] : undefined
  if (!build) throw new UnknownTemplateError(template)
  const body = build(data)
  const subject = (str(data.subject) ?? body.subject).replace(/[\r\n]+/g, " ")
  return { subject, html: renderHtml({ ...body, subject }), text: renderText(body) }
}
