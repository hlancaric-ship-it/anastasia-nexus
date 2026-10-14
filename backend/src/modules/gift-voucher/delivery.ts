import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { GIFT_VOUCHER_MODULE } from "./index"
import { formatEur, isoDateInZone, maskVoucherCode, requiresRecipient } from "./policy"
import { renderPdf, wrap, type PdfLine } from "./pdf"
import type GiftVoucherModuleService from "./service"
import type { GiftVoucherRow } from "./service"

type Container = Pick<MedusaContainer, "resolve">

export type DeliveryMessage = {
  kind: "recipient_email" | "buyer_pdf"
  to: string
  template: string
  data: Record<string, unknown>
  attachments?: Array<{ content: string; filename: string; content_type: string }>
}

/** Rozhraní doručení – e-mail/PDF poskytovatel je vyměnitelný (Resend/SMTP přes Notification modul). */
export interface GiftVoucherDeliveryChannel {
  readonly live: boolean
  send(message: DeliveryMessage): Promise<void>
}

/**
 * Notification modul se použije jen při GIFT_VOUCHER_DELIVERY=notification (produkční
 * provider). Lokální „notification-local“ provider loguje celé `data`, takže by kód
 * poukazu skončil v logu – bez explicitního zapnutí proto běží jen maskovaný log.
 */
export function resolveDeliveryChannel(container: Container, env: Record<string, string | undefined> = process.env): GiftVoucherDeliveryChannel {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  if (env.GIFT_VOUCHER_DELIVERY === "notification") {
    const notification = container.resolve(Modules.NOTIFICATION) as any
    return {
      live: true,
      async send(message) {
        await notification.createNotifications({ to: message.to, channel: "email", template: message.template, data: message.data,
          ...(message.attachments ? { attachments: message.attachments } : {}) })
      },
    }
  }
  return {
    live: false,
    async send(message) {
      logger.info(`[gift-voucher] doručení vypnuto (GIFT_VOUCHER_DELIVERY), ${message.kind} pro ${String(message.data.masked_code)} se neposílá`)
    },
  }
}

export function voucherPdf(voucher: GiftVoucherRow): Buffer {
  const expires = new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", day: "numeric", month: "numeric", year: "numeric" }).format(new Date(voucher.expires_at))
  const lines: PdfLine[] = [
    { text: "ANASTASIA", size: 14 },
    { text: "Darčekový poukaz", size: 28, gap: 48 },
    { text: formatEur(voucher.initial_amount), size: 36, gap: 60 },
  ]
  if (voucher.recipient_name) lines.push({ text: `Pre: ${voucher.recipient_name}`, size: 14, gap: 36 })
  if (voucher.message) for (const [index, line] of wrap(voucher.message, 70).entries()) lines.push({ text: line, size: 11, gap: index ? 16 : 28 })
  lines.push(
    { text: "Kód poukazu", size: 11, gap: 44 },
    { text: voucher.code, size: 20, gap: 28 },
    { text: `Platnosť do ${expires}`, size: 11, gap: 28 },
    { text: "Kód zadajte v košíku e-shopu. Poukaz nie je možné vymeniť za hotovosť.", size: 9, gap: 36 },
  )
  return renderPdf(lines, "Darcekovy poukaz ANASTASIA")
}

function baseData(voucher: GiftVoucherRow) {
  return {
    masked_code: maskVoucherCode(voucher.code),
    code: voucher.code,
    amount: formatEur(voucher.initial_amount),
    expires_at: new Date(voucher.expires_at).toISOString(),
    recipient_name: voucher.recipient_name,
    message: voucher.message,
  }
}

function recipientMessage(voucher: GiftVoucherRow): DeliveryMessage {
  return { kind: "recipient_email", to: voucher.recipient_email!, template: "gift-voucher-recipient-sk",
    data: { ...baseData(voucher), subject: "Dostali ste darčekový poukaz ANASTASIA" } }
}

function buyerMessage(voucher: GiftVoucherRow): DeliveryMessage {
  return { kind: "buyer_pdf", to: voucher.purchaser_email!, template: "gift-voucher-buyer-sk",
    data: { ...baseData(voucher), subject: "Váš darčekový poukaz ANASTASIA (PDF)" },
    attachments: [{ content: voucherPdf(voucher).toString("base64"), filename: `poukaz-${voucher.code_last4}.pdf`, content_type: "application/pdf" }] }
}

export type DeliveryResult = { recipient: "sent" | "scheduled" | "skipped" | "failed" | "disabled"; buyer: "sent" | "skipped" | "failed" | "disabled" }

/**
 * Doručí poukaz podle snapshotu způsobu doručení. Obdarovaný dostane e-mail v den doručení
 * (dřív zůstane „scheduled“ a pošle ho job), PDF kupujícímu odchází hned. Obě větve mají
 * atomický „claim“, takže souběžný subscriber a job nepošlou e-mail dvakrát.
 */
export async function deliverGiftVoucher(container: Container, voucherId: string, channel = resolveDeliveryChannel(container), now = new Date()): Promise<DeliveryResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  const vouchers = container.resolve(GIFT_VOUCHER_MODULE) as GiftVoucherModuleService
  const result: DeliveryResult = { recipient: "skipped", buyer: "skipped" }
  const voucher = await vouchers.getVoucher(voucherId)
  if (!voucher || voucher.status === "void") return result
  const masked = maskVoucherCode(voucher.code)
  if (!channel.live) {
    await channel.send({ kind: requiresRecipient(voucher.delivery_method) ? "recipient_email" : "buyer_pdf", to: "", template: "", data: { masked_code: masked } })
    return { recipient: "disabled", buyer: "disabled" }
  }
  const today = isoDateInZone(now)
  const wantsRecipient = requiresRecipient(voucher.delivery_method)
  const wantsBuyer = voucher.delivery_method !== "recipient_email"

  if (wantsBuyer && voucher.purchaser_email) {
    // U „buyer_pdf“ je PDF hlavním doručením (delivery_status), u „both“ vedlejší kopií.
    const claimed = wantsRecipient ? await vouchers.claimBuyerCopy(voucher.id) : await vouchers.claimDelivery(voucher.id, today)
    if (claimed) {
      try {
        await channel.send(buyerMessage(claimed))
        result.buyer = "sent"
      } catch (error) {
        result.buyer = "failed"
        if (wantsRecipient) await vouchers.releaseBuyerCopy(voucher.id)
        else await vouchers.markDeliveryFailed(voucher.id)
        logger.error(`[gift-voucher] PDF kupujícímu pro ${masked} selhalo`, error as Error)
      }
    }
  } else if (wantsBuyer) {
    logger.warn(`[gift-voucher] poukaz ${masked} nemá e-mail kupujícího, PDF nelze odeslat`)
    result.buyer = "failed"
  }

  if (wantsRecipient) {
    if (!voucher.recipient_email) {
      logger.warn(`[gift-voucher] poukaz ${masked} nemá e-mail obdarovaného`)
      result.recipient = "failed"
    } else if (voucher.delivery_date && voucher.delivery_date > today) {
      result.recipient = "scheduled"
    } else {
      const claimed = await vouchers.claimDelivery(voucher.id, today)
      if (claimed) {
        try {
          await channel.send(recipientMessage(claimed))
          result.recipient = "sent"
        } catch (error) {
          result.recipient = "failed"
          await vouchers.markDeliveryFailed(voucher.id)
          logger.error(`[gift-voucher] e-mail obdarovanému pro ${masked} selhal`, error as Error)
        }
      }
    }
  }
  return result
}

/** Job: pošle poukazy, jejichž den doručení nastal (a zopakuje neúspěšné, max. 5 pokusů). */
export async function deliverDueGiftVouchers(container: Container, channel = resolveDeliveryChannel(container), now = new Date()): Promise<number> {
  const vouchers = container.resolve(GIFT_VOUCHER_MODULE) as GiftVoucherModuleService
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  const due = await vouchers.listDueDeliveries(isoDateInZone(now))
  if (!channel.live) {
    if (due.length) logger.info(`[gift-voucher] doručení vypnuto (GIFT_VOUCHER_DELIVERY), čeká ${due.length} poukazů`)
    return 0
  }
  let sent = 0
  for (const voucher of due) {
    try {
      const result = await deliverGiftVoucher(container, voucher.id, channel, now)
      if (result.recipient === "sent" || result.buyer === "sent") sent++
    } catch (error) {
      logger.error(`[gift-voucher] doručení ${maskVoucherCode(voucher.code)} selhalo`, error as Error)
    }
  }
  return sent
}
