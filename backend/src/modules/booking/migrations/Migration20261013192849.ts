import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * K9 společný kalendář: booking.calendar_id + unikát (calendar_id, starts_at) místo (product_id, starts_at),
 * nová tabulka booking_availability (ručně zadané úseky po dnech).
 * Základ vygenerován `medusa db:generate booking`; modul nemá snapshot, proto booking ručně přes ALTER.
 */
export class Migration20261013192849 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking" add column if not exists "calendar_id" text not null default 'lucia';`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_calendar_id_starts_at_unique" ON "booking" ("calendar_id", "starts_at") WHERE deleted_at IS NULL AND status IN ('held','confirmed');`)
    this.addSql(`DROP INDEX IF EXISTS "IDX_booking_product_starts_active_unique";`)
    this.addSql(`create table if not exists "booking_availability" ("id" text not null, "calendar_id" text not null default 'lucia', "date" text not null, "start_time" text not null, "end_time" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_availability_pkey" primary key ("id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_availability_deleted_at" ON "booking_availability" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_availability_calendar_id_date" ON "booking_availability" ("calendar_id", "date") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "booking_availability" cascade;`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_product_starts_active_unique" ON "booking" ("product_id", "starts_at") WHERE deleted_at IS NULL AND status IN ('held','confirmed');`)
    this.addSql(`DROP INDEX IF EXISTS "IDX_booking_calendar_id_starts_at_unique";`)
    this.addSql(`alter table if exists "booking" drop column if exists "calendar_id";`)
  }
}
