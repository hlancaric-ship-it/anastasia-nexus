import { MedusaService } from "@medusajs/framework/utils"
import EmailTemplateOverride from "./models/email-template-override"

export type EmailTemplateOverrideRow = {
  id: string
  template: string
  texts: Record<string, string> | null
  enabled: boolean
  updated_by: string | null
  updated_at?: Date | string
}

class EmailTemplateModuleService extends MedusaService({ EmailTemplateOverride }) {}

export default EmailTemplateModuleService
