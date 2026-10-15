import { Module } from "@medusajs/framework/utils"
import EmailTemplateModuleService from "./service"

export const EMAIL_TEMPLATE_MODULE = "email_template"

export default Module(EMAIL_TEMPLATE_MODULE, {
  service: EmailTemplateModuleService,
})
