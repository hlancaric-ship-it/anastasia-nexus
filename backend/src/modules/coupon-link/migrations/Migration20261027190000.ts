import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Additive ledger for coupon checkout reservations and order confirmations. */
export class Migration20261027190000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "coupon_usage_reservation" (
      "id" text primary key,
      "promotion_id" text not null,
      "coupon_code" text not null,
      "cart_id" text not null,
      "order_id" text null,
      "status" text not null check ("status" in ('reserved', 'confirmed', 'released')),
      "counted" boolean not null default false,
      "reserved_at" timestamptz not null default now(),
      "confirmed_at" timestamptz null,
      "released_at" timestamptz null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "coupon_usage_reservation_cart_id_unique" unique ("cart_id"),
      constraint "coupon_usage_reservation_order_id_unique" unique ("order_id"));
      create index if not exists "IDX_coupon_usage_reservation_promotion_status"
        on "coupon_usage_reservation" ("promotion_id", "status") where "deleted_at" is null;`)
  }

  // Deliberately irreversible: rolling back code must not erase coupon usage history.
  override async down(): Promise<void> {}
}
