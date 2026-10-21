import { model } from "@medusajs/framework/utils"

/**
 * Online odstúpenie od zmluvy (časť C právnych textov klientky).
 * Záznam z webu pre správcu + podklad pre potvrdzovací e-mail zákazníkovi.
 * `fingerprint` zabezpečí, že opakované odoslanie toho istého oznámenia nevytvorí druhý záznam.
 */
const LegalContractWithdrawal = model
  .define("legal_contract_withdrawal", {
    id: model.id({ prefix: "lcw" }).primaryKey(),
    order_number: model.text(),
    email: model.text(),
    items: model.json(),
    order_date: model.dateTime().nullable(),
    customer_id: model.text().nullable(),
    name: model.text().nullable(),
    reason: model.text().nullable(),
    status: model.enum(["received", "processed", "closed"]).default("received"),
    source: model.text().default("web"),
    fingerprint: model.text(),
    changed_by: model.text().nullable(),
    received_at: model.dateTime(),
  })
  .indexes([
    { on: ["fingerprint"], unique: true, where: "deleted_at IS NULL" },
    { on: ["status"] },
    { on: ["order_number"] },
  ])

export default LegalContractWithdrawal
