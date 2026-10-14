import { Module } from "@medusajs/framework/utils"
import GiftVoucherModuleService from "./service"

export const GIFT_VOUCHER_MODULE = "gift_voucher"

export default Module(GIFT_VOUCHER_MODULE, {
  service: GiftVoucherModuleService,
})
