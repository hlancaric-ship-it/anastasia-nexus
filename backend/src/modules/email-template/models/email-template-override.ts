import { model } from "@medusajs/framework/utils"

/**
 * Přepis textů jedné e-mailové šablony z adminu. Výchozí texty jsou v kódu
 * (`notification-zeptomail/templates.ts`); tady jsou jen změněné sloty a vypínač.
 */
const EmailTemplateOverride = model
  .define("email_template_override", {
    id: model.id({ prefix: "etpl" }).primaryKey(),
    template: model.text(),
    texts: model.json().nullable(),
    enabled: model.boolean().default(true),
    updated_by: model.text().nullable(),
  })
  .indexes([{ on: ["template"], unique: true, where: "deleted_at IS NULL" }])

export default EmailTemplateOverride
