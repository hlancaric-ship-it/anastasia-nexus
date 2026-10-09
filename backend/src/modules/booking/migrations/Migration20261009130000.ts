import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261009130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "booking" (
      "id" text not null,
      "customer_id" text not null,
      "product_id" text not null,
      "order_id" text null,
      "status" text check ("status" in ('held', 'confirmed', 'canceled', 'completed')) not null default 'held',
      "starts_at" timestamptz not null,
      "ends_at" timestamptz not null,
      "held_until" timestamptz null,
      "canceled_at" timestamptz null,
      "cancel_reason" text null,
      "notes" text null,
      "metadata" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "booking_pkey" primary key ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_deleted_at" ON "booking" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_product_starts_active_unique" ON "booking" ("product_id", "starts_at") WHERE deleted_at IS NULL AND status IN ('held','confirmed');`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_customer_id_status" ON "booking" ("customer_id", "status") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_order_id" ON "booking" ("order_id") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "booking" cascade;`)
  }
}
