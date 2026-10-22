import { Module } from "@medusajs/framework/utils"
import service from "./service"
export const COUPON_LINK_MODULE = "coupon_link"
export default Module(COUPON_LINK_MODULE, { service })
