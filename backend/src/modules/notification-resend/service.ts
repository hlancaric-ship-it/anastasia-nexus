import { MedusaError } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import ZeptoMailNotificationService, { type ZeptoMailOptions } from "../notification-zeptomail/service"

export type ResendOptions = Omit<ZeptoMailOptions, "apiUrl"> & {
  /** API kľúč Resend (re_…). */
  apiKey: string
  /** Predvolene https://api.resend.com/emails. */
  apiUrl?: string
}

const DEFAULT_API_URL = "https://api.resend.com/emails"
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/
const DOMAIN_RE = /^@[^\s@<>()",;]+\.[^\s@<>()",;]+$/

type ZeptoPayload = ReturnType<ZeptoMailNotificationService["buildPayload"]>

/** Meno odosielateľa bez znakov, ktoré by rozbili hlavičku From. */
const displayName = (name: string) => name.replace(/["<>\r\n]/g, "").trim()

/**
 * Doručenie transakčných e-mailov cez Resend (HTTP API).
 * Šablóny, allowlist adresátov, logovanie a spracovanie chýb zdieľa so ZeptoMail providerom;
 * mení sa len autorizácia, formát tela a ID správy.
 */
export default class ResendNotificationService extends ZeptoMailNotificationService {
  static identifier = "notification-resend"

  static validateOptions(options: Record<string, unknown>) {
    if (typeof options.apiKey !== "string" || !options.apiKey.trim()) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Resend: chýba apiKey (RESEND_API_KEY)")
    }
    if (typeof options.fromEmail !== "string" || !EMAIL_RE.test(options.fromEmail.trim())) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Resend: chýba alebo je neplatný fromEmail (RESEND_FROM_EMAIL)")
    }
    if (options.replyTo != null && options.replyTo !== "" && (typeof options.replyTo !== "string" || !EMAIL_RE.test(options.replyTo.trim()))) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Resend: neplatný replyTo (RESEND_REPLY_TO)")
    }
    if (options.apiUrl != null && options.apiUrl !== "") {
      let url: URL
      try { url = new URL(String(options.apiUrl)) } catch { throw new MedusaError(MedusaError.Types.INVALID_DATA, "Resend: neplatná apiUrl") }
      if (url.protocol !== "https:") throw new MedusaError(MedusaError.Types.INVALID_DATA, "Resend: apiUrl musí byť https")
    }
    if (options.recipientAllowlist !== undefined) {
      const list = options.recipientAllowlist
      if (!Array.isArray(list) || !list.every(e => typeof e === "string" && (EMAIL_RE.test(e.trim()) || DOMAIN_RE.test(e.trim())))) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Resend: neplatný zoznam povolených adresátov (EMAIL_RECIPIENT_ALLOWLIST)")
      }
    }
  }

  constructor(deps: { logger: Logger }, options: ResendOptions, fetchImpl?: typeof fetch) {
    super(deps, { ...options, apiUrl: options.apiUrl?.trim() || DEFAULT_API_URL }, fetchImpl)
  }

  protected get providerName(): string {
    return "Resend"
  }

  protected authHeader(): string {
    const key = this.options_.apiKey
    return /^Bearer\s/i.test(key) ? key : `Bearer ${key}`
  }

  protected serialize(payload: ZeptoPayload): unknown {
    const name = payload.from.name ? displayName(payload.from.name) : ""
    return {
      from: name ? `${name} <${payload.from.address}>` : payload.from.address,
      to: payload.to.map(r => r.email_address.address),
      subject: payload.subject,
      ...(payload.htmlbody ? { html: payload.htmlbody } : {}),
      ...(payload.textbody ? { text: payload.textbody } : {}),
      ...(payload.reply_to?.length ? { reply_to: payload.reply_to.map(r => r.address) } : {}),
      ...(payload.attachments?.length
        ? { attachments: payload.attachments.map(a => ({ filename: a.name, content: a.content, content_type: a.mime_type })) }
        : {}),
      ...(payload.headers?.length
        ? { headers: Object.fromEntries(payload.headers.map(h => [h.name, h.value])) }
        : {}),
      tags: [{ name: "template", value: payload.client_reference.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256) }],
    }
  }

  protected messageId(body: any): string | undefined {
    return typeof body?.id === "string" ? body.id : undefined
  }
}
