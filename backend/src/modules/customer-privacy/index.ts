import { Module } from "@medusajs/framework/utils"
import CustomerPrivacyModuleService from "./service"
export const CUSTOMER_PRIVACY_MODULE="customerPrivacy"
export default Module(CUSTOMER_PRIVACY_MODULE,{service:CustomerPrivacyModuleService})
