import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { GIFT_VOUCHER_MODULE } from "../modules/gift-voucher"
import { deliverDueGiftVouchers } from "../modules/gift-voucher/delivery"
import type GiftVoucherModuleService from "../modules/gift-voucher/service"

/** Každú hodinu: odošle poukazy s dnešným dátumom doručenia (a zopakuje neúspešné), označí expirované. */
export default async function giftVoucherMaintenanceJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const sent = await deliverDueGiftVouchers(container)
    const expired = await (container.resolve(GIFT_VOUCHER_MODULE) as GiftVoucherModuleService).expireDue(new Date())
    if (sent || expired) logger.info(`[gift-voucher] job: doručené ${sent}, expirované ${expired}`)
  } catch (error) {
    logger.error("[gift-voucher] job selhal", error as Error)
  }
}

export const config = { name: "gift-voucher-maintenance", schedule: "17 * * * *" }
