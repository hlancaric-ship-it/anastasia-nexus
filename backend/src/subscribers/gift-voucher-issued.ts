import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { deliverGiftVoucher } from "../modules/gift-voucher/delivery"
import { GIFT_VOUCHER_ISSUED_EVENT } from "../modules/gift-voucher/policy"

/**
 * voucher.issued: doručenie podľa snapshotu poukazu. Bez GIFT_VOUCHER_DELIVERY=notification
 * len maskovaný log (žiadny kód ani e-mail v logu). Chyba doručenia sa neopakuje cez event bus –
 * stav „failed“ zopakuje hodinový job (max. 5 pokusov).
 */
export default async function giftVoucherIssuedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    await deliverGiftVoucher(container, event.data.id)
  } catch (error) {
    logger.error(`[gift-voucher] doručenie po vystavení selhalo`, error as Error)
  }
}

export const config: SubscriberConfig = { event: GIFT_VOUCHER_ISSUED_EVENT }
