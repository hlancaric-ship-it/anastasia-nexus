import { model } from "@medusajs/framework/utils"

/**
 * Trvalý audit změn admin nastavení a zásahů správce (kdo, co, kdy, které pole, z jakého požadavku).
 * `changes` je už zredigovaný diff `{ pole: { from, to } }` – žádné osobní údaje ani tajemství.
 * Záznamy se nemění ani nemažou přes API; mazání jen retenční úlohou.
 */
const OpsAuditEntry = model
  .define("ops_audit_entry", {
    id: model.id({ prefix: "oaud" }).primaryKey(),
    actor_type: model.enum(["user", "system"]),
    actor_id: model.text(),
    action: model.text(),
    entity_type: model.text(),
    entity_id: model.text().nullable(),
    changes: model.json().nullable(),
    request_id: model.text().nullable(),
  })
  .indexes([
    { on: ["entity_type", "entity_id"] },
    { on: ["actor_id"] },
    { on: ["created_at"] },
  ])

export default OpsAuditEntry
