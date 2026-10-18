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
}

type Fetch = typeof fetch

const DEFAULT_API_URL = "https://cpaas.zoho.eu/v1.1/email"
const DEFAULT_TIMEOUT_MS = 15_000
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/

const isEmail = (value: unknown): value is string => typeof value === "string" && EMAIL_RE.test(value.trim())
const SAFE_CODE_RE = /^[A-Za-z0-9_.-]{1,40}$/

/**
 * Kódy chyb z odpovědi – Zoho CPaaS vrací `data.error_code` (objekt i pole), klasický ZeptoMail
 * `error.code` + `error.details[].code`. Do zprávy jdou jen kódy, nikdy texty (mohou obsahovat adresu).
 */
function errorCodes(body: any): string {
  const data = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : []
  const codes = [
    body?.error?.code,
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
    }
    this.fetch_ = fetchImpl ?? ((input, init) => fetch(input, init))
  }

  protected authHeader(): string {
    const key = this.options_.apiKey
    return /^Zoho-enczapikey\s/i.test(key) ? key : `Zoho-enczapikey ${key}`
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

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options_.timeoutMs)
    let status = 0
    let body: any = null
    try {
      const res = await this.fetch_(this.options_.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: this.authHeader() },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      status = res.status
      body = await res.json().catch(() => null)
    } catch (error) {
      const reason = (error as Error)?.name === "AbortError" ? "timeout" : "network"
      this.log("error", "send_failed", { template, failure: reason })
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `ZeptoMail: odeslání selhalo (${reason})`)
    } finally {
      clearTimeout(timer)
    }

    if (status < 200 || status >= 300) {
      const code = errorCodes(body)
      this.log("error", "send_rejected", { template, http_status: status, error_code: code, provider_message_id: typeof body?.request_id === "string" ? body.request_id : undefined })
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `ZeptoMail: odeslání odmítnuto (HTTP ${status}, ${code})`)
    }

    const id = typeof body?.request_id === "string" ? body.request_id : undefined
    this.log("info", "provider_send", { template, attachments: payload.attachments?.length ?? 0, provider_message_id: id })
    return id ? { id } : {}
  }

  protected log(level: "info" | "error", action: string, fields: Record<string, unknown>) {
    const line = formatLogLine(level, "notification", action, { provider: ZeptoMailNotificationService.identifier, ...fields })
    if (level === "error") this.logger_.error(line)
    else this.logger_.info(line)
  }
}
