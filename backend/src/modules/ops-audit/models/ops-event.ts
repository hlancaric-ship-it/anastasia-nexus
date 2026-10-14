import { model } from "@medusajs/framework/utils"

/**
 * Trvalý provozní event (checkout/SafeOrder, platby, webhooky, poukazy, rezervace, přístupy, chat, úlohy, mail).
 * Doplňuje stdout logy: admin z něj filtruje podle request_id / objednávky / domény / času.
 * `fields` jsou už zredigované; promazává je retenční úloha `ops-retention`.
 */
const OpsEvent = model
  .define("ops_event", {
    id: model.id({ prefix: "oevt" }).primaryKey(),
    level: model.enum(["info", "warn", "error"]),
    domain: model.text(),
    event: model.text(),
    request_id: model.text().nullable(),
    order_id: model.text().nullable(),
    cart_id: model.text().nullable(),
    customer_id: model.text().nullable(),
    entity_id: model.text().nullable(),
    fields: model.json().nullable(),
  })
  .indexes([
    { on: ["created_at"] },
    { on: ["domain", "created_at"] },
    { on: ["request_id"] },
    { on: ["order_id"] },
    { on: ["cart_id"] },
    { on: ["customer_id"] },
  ])

export default OpsEvent
