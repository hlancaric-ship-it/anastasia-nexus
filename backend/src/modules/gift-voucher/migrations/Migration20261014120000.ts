import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261014120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "gift_voucher" (
      "id" text not null,
      "code" text not null,
      "code_last4" text not null,
      "currency_code" text not null default 'eur',
      "initial_amount" integer not null,
      "balance" integer not null,
      "status" text check ("status" in ('active', 'depleted', 'expired', 'void')) not null default 'active',
      "issued_at" timestamptz not null,
      "expires_at" timestamptz not null,
      "issue_key" text not null,
      "source_order_id" text null,
      "source_variant_id" text null,
      "scope" jsonb not null,
      "partial_redemption" boolean not null,
      "delivery_method" text check ("delivery_method" in ('recipient_email', 'buyer_pdf', 'both')) not null,
      "delivery_status" text check ("delivery_status" in ('pending', 'scheduled', 'sent', 'failed')) not null default 'pending',
      "delivered_at" timestamptz null,
      "delivery_attempts" integer not null default 0,
      "recipient_name" text null,
      "recipient_email" text null,
      "message" text null check ("message" is null or char_length("message") <= 300),
      "delivery_date" text null,
      "purchaser_email" text null,
      "voided_at" timestamptz null,
      "void_reason" text null,
      "metadata" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "gift_voucher_pkey" primary key ("id"),
      constraint "gift_voucher_initial_positive" check ("initial_amount" > 0),
      constraint "gift_voucher_balance_range" check ("balance" >= 0 and "balance" <= "initial_amount"),
      constraint "gift_voucher_expiry_after_issue" check ("expires_at" > "issued_at")
    );`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_gift_voucher_code_unique" ON "gift_voucher" ("code");`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_gift_voucher_issue_key_unique" ON "gift_voucher" ("issue_key");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_gift_voucher_source_order_id" ON "gift_voucher" ("source_order_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_gift_voucher_status_expires_at" ON "gift_voucher" ("status", "expires_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_gift_voucher_delivery_due" ON "gift_voucher" ("delivery_status", "delivery_date") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_gift_voucher_deleted_at" ON "gift_voucher" ("deleted_at") WHERE deleted_at IS NULL;`)

    this.addSql(`create table if not exists "gift_voucher_transaction" (
      "id" text not null,
      "voucher_id" text not null,
      "type" text check ("type" in ('issued', 'redeemed', 'forfeited', 'reversed', 'refunded', 'voided', 'expired')) not null,
      "amount" integer not null,
      "balance_after" integer not null,
      "cart_id" text null,
      "order_id" text null,
      "reference_id" text null,
      "reversed_at" timestamptz null,
      "idempotency_key" text not null,
      "actor_id" text null,
      "note" text null,
      "metadata" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "gift_voucher_transaction_pkey" primary key ("id"),
      constraint "gift_voucher_transaction_amount_non_negative" check ("amount" >= 0 and "balance_after" >= 0),
      constraint "gift_voucher_transaction_voucher_fk" foreign key ("voucher_id") references "gift_voucher" ("id") on delete restrict
    );`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_gift_voucher_transaction_idempotency_unique" ON "gift_voucher_transaction" ("idempotency_key");`)
    // Jeden košík smí mít na jednom poukazu nejvýš jedno nevrácené čerpání.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_gift_voucher_transaction_active_redemption" ON "gift_voucher_transaction" ("voucher_id", "cart_id") WHERE type = 'redeemed' AND reversed_at IS NULL AND deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_gift_voucher_transaction_voucher_type" ON "gift_voucher_transaction" ("voucher_id", "type") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_gift_voucher_transaction_cart_id" ON "gift_voucher_transaction" ("cart_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_gift_voucher_transaction_order_id" ON "gift_voucher_transaction" ("order_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_gift_voucher_transaction_deleted_at" ON "gift_voucher_transaction" ("deleted_at") WHERE deleted_at IS NULL;`)

    this.addSql(`create table if not exists "gift_voucher_settings" (
      "id" text not null,
      "key" text not null,
      "enabled" boolean not null default true,
      "values_minor" jsonb not null,
      "validity_months" integer not null check ("validity_months" between 1 and 60),
      "scope_type" text check ("scope_type" in ('all', 'categories')) not null,
      "category_ids" jsonb not null,
      "partial_redemption" boolean not null,
      "delivery_method" text check ("delivery_method" in ('recipient_email', 'buyer_pdf', 'both')) not null,
      "updated_by" text null,
      "metadata" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "gift_voucher_settings_pkey" primary key ("id")
    );`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_gift_voucher_settings_key_unique" ON "gift_voucher_settings" ("key");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_gift_voucher_settings_deleted_at" ON "gift_voucher_settings" ("deleted_at") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "gift_voucher_transaction" cascade;`)
    this.addSql(`drop table if exists "gift_voucher" cascade;`)
    this.addSql(`drop table if exists "gift_voucher_settings" cascade;`)
  }
}
