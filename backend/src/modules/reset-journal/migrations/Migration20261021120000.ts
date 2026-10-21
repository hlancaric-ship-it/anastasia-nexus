import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Zrkadielko – tabuľka záznamov zákazníka (členská zóna RESET 40+).
 * Údaje o energii, spánku a strese sú osobné údaje o zdraví/pohodě:
 * patria zákazníkovi, preto idú do exportu osobných údajov aj do výmazu.
 */
export class Migration20261021120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "reset_journal_entry" (
      "id" text not null,
      "tenant_id" text not null default 'default',
      "customer_id" text not null,
      "entitlement_id" text null,
      "program" text not null,
      "week" integer null,
      "entry_date" timestamptz not null,
      "metrics" jsonb not null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "reset_journal_entry_pkey" primary key ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_reset_journal_entry_deleted_at" ON "reset_journal_entry" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_reset_journal_entry_customer_id_program" ON "reset_journal_entry" ("customer_id", "program") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_reset_journal_entry_customer_id_program_entry_date" ON "reset_journal_entry" ("customer_id", "program", "entry_date") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_reset_journal_entry_entitlement_id" ON "reset_journal_entry" ("entitlement_id") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "reset_journal_entry" cascade;`)
  }
}
