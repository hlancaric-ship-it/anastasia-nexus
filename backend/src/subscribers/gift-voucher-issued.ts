import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { deliverGiftVoucher } from "../modules/gift-voucher/delivery"
import { GIFT_VOUCHER_ISSUED_EVENT } from "../modules/gift-voucher/policy"
import { recordEvent } from "../lib/observability/events"

/**
 * voucher.issued: doručenie podľa snapshotu poukazu. Bez GIFT_VOUCHER_DELIVERY=notification
 * len maskovaný log (žiadny kód ani e-mail v logu). Chyba doručenia sa neopakuje cez event bus –
 * stav „failed“ zopakuje hodinový job (max. 5 pokusov).
 */
export default async function giftVoucherIssuedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    await deliverGiftVoucher(container, event.data.id)
  } catch (error) {
    await recordEvent(container, "error", "gift_voucher", "delivery_failed", { entity_id: event.data.id, error })
  }
}

export const config: SubscriberConfig = { event: GIFT_VOUCHER_ISSUED_EVENT }
