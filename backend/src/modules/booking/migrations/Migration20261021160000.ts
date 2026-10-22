import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * booking.tenant_id – stĺpec, ktorý model aj služba používajú (izolácia rezervácií),
 * ale tabuľka vytvorená migráciou Migration20261009130000 ho nemala.
 *
 * SQL súbory `0001_booking_exclusion_*.sql` a `0002_booking_tenant_id_*.sql` v tomto
 * priečinku sa NESPÚŠŤAJÚ – Medusa beží len MikroORM migrácie (`Migration*.ts`), .sql
 * súbory nikde neodkazuje. Bez stĺpca zlyhalo každé vytvorenie rezervácie
 * („column \"tenant_id\" of relation \"booking\" does not exist“) a rezervácie na webe
 * ne fungovali vôbec.
 *
 * Migrácia je idempotentná a bezpečná pre existujúce tabuľky aj dáta.
 */
export class Migration20261021160000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking" add column if not exists "tenant_id" text not null default 'default';`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_calendar_id_tenant_id_starts_at_unique" ON "booking" ("calendar_id", "tenant_id", "starts_at") WHERE deleted_at IS NULL AND status IN ('held','confirmed');`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_customer_id_tenant_id_status" ON "booking" ("customer_id", "tenant_id", "status") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_tenant_id_status" ON "booking" ("tenant_id", "status") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_booking_tenant_id_status";`)
    this.addSql(`DROP INDEX IF EXISTS "IDX_booking_customer_id_tenant_id_status";`)
    this.addSql(`DROP INDEX IF EXISTS "IDX_booking_calendar_id_tenant_id_starts_at_unique";`)
    this.addSql(`alter table if exists "booking" drop column if exists "tenant_id";`)
  }
}
