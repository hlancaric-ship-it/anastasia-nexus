import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** booking_request – žiadosti klientov o vlastný termín konzultácie (schvaľuje Lucia v adminu). Idempotentná. */
export class Migration20261025180000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "booking_request" (
      "id" text not null,
      "product_id" text not null,
      "calendar_id" text not null default 'lucia',
      "starts_at" timestamptz not null,
      "ends_at" timestamptz not null,
      "name" text not null,
      "email" text not null,
      "phone" text null,
      "note" text null,
      "status" text check ("status" in ('pending', 'approved', 'declined')) not null default 'pending',
      "booking_id" text null,
      "token_hash" text null,
      "decided_at" timestamptz null,
      "decline_reason" text null,
      "metadata" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "booking_request_pkey" primary key ("id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_request_status_starts_at" ON "booking_request" ("status", "starts_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_request_email" ON "booking_request" ("email") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_request_deleted_at" ON "booking_request" ("deleted_at") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "booking_request" cascade;`)
  }
}
