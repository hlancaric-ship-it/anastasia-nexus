import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import type { Logger, ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types"
import { formatLogLine } from "../../lib/observability/log"
import { renderTemplate } from "./templates"

export type ZeptoMailOptions = {
  /** Send Mail token z ZeptoMail (Mail Agent → SMTP/API); prefix „Zoho-enczapikey“ je volitelný. */
  apiKey: string
  /** Odesílatel z ověřené domény, např. noreply@anastasiaoz.eu. */
  fromEmail: string
  fromName?: string
  replyTo?: string
  /** EU datacentrum – ZeptoMail běží v Zoho CPaaS (cpaas.zoho.eu), účet L-Code Dynamics, agent „Anastasia“. */
  apiUrl?: string
  timeoutMs?: number
  /**
   * Testovací provoz: e-mail odejde jen na adresy ze seznamu (přesná adresa nebo „@doména“).
   * `undefined` = bez omezení (ostrý provoz). Prázdné pole = neodejde nic, jen záznam v logu.
   */
  recipientAllowlist?: string[]
}

type Fetch = typeof fetch

const DEFAULT_API_URL = "https://cpaas.zoho.eu/v1.1/email"
const DEFAULT_TIMEOUT_MS = 15_000
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/

const isEmail = (value: unknown): value is string => typeof value === "string" && EMAIL_RE.test(value.trim())
const DOMAIN_RE = /^@[^\s@<>()",;]+\.[^\s@<>()",;]+$/
const isAllowlistEntry = (value: unknown): boolean =>
  typeof value === "string" && (EMAIL_RE.test(value.trim()) || DOMAIN_RE.test(value.trim()))

/** Adresát je na seznamu povolených (bez ohledu na velikost písmen; „@doména“ = celá doména, ne subdomény). */
export function recipientAllowed(to: string, allowlist: string[] | undefined): boolean {
  if (allowlist === undefined) return true
  const address = to.trim().toLowerCase()
  const domain = address.slice(address.lastIndexOf("@"))
  return allowlist.some(entry => {
    const e = entry.trim().toLowerCase()
    return e.startsWith("@") ? e === domain : e === address
  })
}
const SAFE_CODE_RE = /^[A-Za-z0-9_.-]{1,40}$/

/**
 * Voliteľné hlavičky e-mailu (napr. List-Unsubscribe pre newsletter). Povoľujeme len
 * hlavičky, ktoré backend naozaj používa, a len tlačiteľné ASCII bez CR/LF –
 * do hlavičiek sa tak nedá prepašovať ďalší príkaz ani osobné údaje.
 */
const SAFE_HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/
const ALLOWED_HEADERS = new Set(["list-unsubscribe", "list-unsubscribe-post"])
export type ProviderHeader = { name: string; value: string }

export function providerHeaders(providerData: unknown): ProviderHeader[] {
  const list = (providerData as any)?.headers
  if (!Array.isArray(list)) return []
  const out: ProviderHeader[] = []
  for (const entry of list) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : ""
    const value = typeof entry?.value === "string" ? entry.value.trim() : ""
    if (!SAFE_HEADER_NAME.test(name) || !ALLOWED_HEADERS.has(name.toLowerCase())) continue
    if (!value || value.length > 998 || /[^\x20-\x7E]/.test(value)) continue
    out.push({ name, value })
  }
  return out
}

/**
 * Kódy chyb z odpovědi – Zoho CPaaS vrací `data.error_code` (objekt i pole), klasický ZeptoMail
 * `error.code` + `error.details[].code`. Do zprávy jdou jen kódy, nikdy texty (mohou obsahovat adresu).
 */
export function errorCodes(body: any): string {
  const data = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : []
  const codes = [
    body?.error?.code,
    body?.name,
    ...(Array.isArray(body?.error?.details) ? body.error.details.map((d: any) => d?.code) : []),
    ...data.map((d: any) => d?.error_code),
  ].filter((c): c is string => typeof c === "string" && SAFE_CODE_RE.test(c))
  return [...new Set(codes)].join(",") || "unknown"
}

/**
 * Doručení transakčních e-mailů přes ZeptoMail (HTTP API).
 * - obsah se renderuje z vlastních šablon (`templates.ts`), případně z `notification.content`;
 * - sledování otevření a prokliků je vypnuté (přepis odkazů by rozbil jednorázové přihlašovací odkazy);
 * - žádné opakování: ZeptoMail nemá idempotenci a po timeoutu mohl e-mail už odejít,
 *   duplicity hlídá `idempotency_key` na straně volajícího;
 * - do logu jde jen šablona, výsledek a ID požadavku – nikdy adresát ani obsah.
 */
export default class ZeptoMailNotificationService extends AbstractNotificationProviderService {
  static identifier = "notification-zeptomail"

  protected logger_: Logger
  protected options_: Required<Pick<ZeptoMailOptions, "apiUrl" | "timeoutMs">> & ZeptoMailOptions
  protected fetch_: Fetch

  static validateOptions(options: Record<string, unknown>) {
    if (typeof options.apiKey !== "string" || !options.apiKey.trim()) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "ZeptoMail: chybí apiKey (ZEPTOMAIL_API_KEY)")
    }
    if (!isEmail(options.fromEmail)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "ZeptoMail: chybí nebo je neplatný fromEmail (ZEPTOMAIL_FROM_EMAIL)")
    }
    if (options.replyTo != null && options.replyTo !== "" && !isEmail(options.replyTo)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "ZeptoMail: neplatný replyTo (ZEPTOMAIL_REPLY_TO)")
    }
    if (options.apiUrl != null && options.apiUrl !== "") {
      let url: URL
      try { url = new URL(String(options.apiUrl)) } catch { throw new MedusaError(MedusaError.Types.INVALID_DATA, "ZeptoMail: neplatná apiUrl") }
      if (url.protocol !== "https:") throw new MedusaError(MedusaError.Types.INVALID_DATA, "ZeptoMail: apiUrl musí být https")
    }
    if (options.recipientAllowlist !== undefined) {
      const list = options.recipientAllowlist
      if (!Array.isArray(list) || !list.every(isAllowlistEntry)) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "ZeptoMail: neplatný seznam povolených adresátů (EMAIL_RECIPIENT_ALLOWLIST)")
      }
    }
  }

  constructor({ logger }: { logger: Logger }, options: ZeptoMailOptions, fetchImpl?: Fetch) {
    super()
    this.logger_ = logger
    this.options_ = {
      ...options,
      apiKey: options.apiKey.trim(),
      fromEmail: options.fromEmail.trim(),
      replyTo: options.replyTo?.trim() || undefined,
      apiUrl: options.apiUrl?.trim() || DEFAULT_API_URL,
      timeoutMs: options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS,
      recipientAllowlist: options.recipientAllowlist?.map(e => e.trim().toLowerCase()),
    }
    this.fetch_ = fetchImpl ?? ((input, init) => fetch(input, init))
  }

  protected authHeader(): string {
    const key = this.options_.apiKey
    return /^Zoho-enczapikey\s/i.test(key) ? key : `Zoho-enczapikey ${key}`
  }

  /** Telo požiadavky pre API poskytovateľa (Resend podtrieda mení formát, šablóny a allowlist zdieľa). */
  protected serialize(payload: ReturnType<ZeptoMailNotificationService["buildPayload"]>): unknown {
    return payload
  }

  /** ID správy z odpovede poskytovateľa. */
  protected messageId(body: any): string | undefined {
    return typeof body?.request_id === "string" ? body.request_id : undefined
  }

  protected get providerName(): string {
    return "ZeptoMail"
  }

  protected buildPayload(notification: ProviderSendNotificationDTO) {
    if (notification.channel !== "email") {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `ZeptoMail podporuje jen kanál email, ne "${notification.channel}"`)
    }
    const to = typeof notification.to === "string" ? notification.to.trim() : ""
    if (!isEmail(to)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "ZeptoMail: neplatný adresát")

    const content = notification.content
    const rendered = content?.html || content?.text
      ? { subject: (content.subject ?? "").replace(/[\r\n]+/g, " ").trim(), html: content.html ?? undefined, text: content.text ?? undefined }
      : renderTemplate(notification.template, notification.data ?? {})
    if (!rendered.subject) throw new MedusaError(MedusaError.Types.INVALID_DATA, "ZeptoMail: e-mail nemá předmět")

    const from = isEmail(notification.from) ? notification.from.trim() : this.options_.fromEmail
    const attachments = (notification.attachments ?? []).map(a => {
      if (!a?.content || !a.filename) throw new MedusaError(MedusaError.Types.INVALID_DATA, "ZeptoMail: příloha bez obsahu nebo názvu")
      return { content: a.content, name: a.filename, mime_type: a.content_type || "application/octet-stream" }
    })

    const headers = providerHeaders(notification.provider_data)

    return {
      from: { address: from, ...(this.options_.fromName ? { name: this.options_.fromName } : {}) },
      to: [{ email_address: { address: to } }],
      // Kontaktný formulár: odpoveď ide odosielateľke (overená adresa z dát), inak globálne ZEPTOMAIL_REPLY_TO.
      ...(notification.template === "contact-form-admin" && isEmail(notification.data?.email)
        ? { reply_to: [{ address: String(notification.data!.email).trim() }] }
        : this.options_.replyTo ? { reply_to: [{ address: this.options_.replyTo }] } : {}),
      subject: rendered.subject,
      ...(rendered.html ? { htmlbody: rendered.html } : {}),
      ...(rendered.text ? { textbody: rendered.text } : {}),
      ...(attachments.length ? { attachments } : {}),
      ...(headers.length ? { headers } : {}),
      track_clicks: false,
      track_opens: false,
      client_reference: notification.template.slice(0, 100),
    }
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    if (!notification) throw new MedusaError(MedusaError.Types.INVALID_DATA, "No notification information provided")
    const template = notification.template
    let payload: ReturnType<ZeptoMailNotificationService["buildPayload"]>
    try {
      payload = this.buildPayload(notification)
    } catch (error) {
      this.log("error", "render_failed", { template, error })
      throw error
    }

    // Testovací provoz: mimo seznam se nic neodesílá. Vrací úspěch bez ID, aby tok (např. objednávka) nespadl.
    if (!recipientAllowed(payload.to[0].email_address.address, this.options_.recipientAllowlist)) {
      this.log("info", "send_suppressed", { template, reason: "recipient_not_allowlisted" })
      return {}
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options_.timeoutMs)
    let status = 0
    let body: any = null
    try {
      const res = await this.fetch_(this.options_.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: this.authHeader() },
        body: JSON.stringify(this.serialize(payload)),
        signal: controller.signal,
      })
      status = res.status
      body = await res.json().catch(() => null)
    } catch (error) {
      const reason = (error as Error)?.name === "AbortError" ? "timeout" : "network"
      this.log("error", "send_failed", { template, failure: reason })
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `${this.providerName}: odeslání selhalo (${reason})`)
    } finally {
      clearTimeout(timer)
    }

    if (status < 200 || status >= 300) {
      const code = errorCodes(body)
      this.log("error", "send_rejected", { template, http_status: status, error_code: code, provider_message_id: this.messageId(body) })
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `${this.providerName}: odeslání odmítnuto (HTTP ${status}, ${code})`)
    }

    const id = this.messageId(body)
    this.log("info", "provider_send", { template, attachments: payload.attachments?.length ?? 0, provider_message_id: id })
    return id ? { id } : {}
  }

  protected log(level: "info" | "error", action: string, fields: Record<string, unknown>) {
    const line = formatLogLine(level, "notification", action, { provider: (this.constructor as typeof ZeptoMailNotificationService).identifier, ...fields })
    if (level === "error") this.logger_.error(line)
    else this.logger_.info(line)
  }
}
