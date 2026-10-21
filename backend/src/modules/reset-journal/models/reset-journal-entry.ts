import { model } from "@medusajs/framework/utils"

/**
 * Záznam zákazníčky v Zrkadielku (členská zóna RESET 40+).
 *
 * Údaje o energii, spánku a strese sú osobné údaje o zdraví/pohodě –
 * patria zákazníčke, preto sú v tabuľke viazané na `customer_id` a idú do
 * exportu osobných údajov aj do výmazu (viz customer-privacy).
 */
const ResetJournalEntry = model
  .define("reset_journal_entry", {
    id: model.id({ prefix: "rje" }).primaryKey(),
    tenant_id: model.text().default("default"),
    customer_id: model.text(),
    /** Prístup, ktorým si zákazníčka program otvorila (nullable – prístup mohol vypršieť). */
    entitlement_id: model.text().nullable(),
    /** Program, ku ktorému záznam patrí (napr. `reset-40-plus`). */
    program: model.text(),
    /** Týždeň programu 1–16 (nullable – záznam nemusí byť viazaný na týždeň). */
    week: model.number().nullable(),
    /** Kalendárny deň záznamu (UTC polnoc daného dňa). */
    entry_date: model.dateTime(),
    /** Hodnoty metrik: `{ "<key>": 1..10 }`. */
    metrics: model.json(),
  })
  .indexes([
    { on: ["customer_id", "program"] },
    { on: ["customer_id", "program", "entry_date"] },
    { on: ["entitlement_id"] },
  ])

export default ResetJournalEntry
