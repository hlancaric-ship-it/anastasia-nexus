import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261009120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "entitlement" (
      "id" text not null,
      "tenant_id" text not null default 'default',
      "customer_id" text not null,
      "product_id" text not null,
      "variant_id" text null,
      "order_id" text null,
      "status" text check ("status" in ('active', 'revoked')) not null default 'active',
      "source" text check ("source" in ('order', 'admin', 'migration')) not null default 'order',
      "granted_at" timestamptz not null,
      "expires_at" timestamptz null,
      "revoked_at" timestamptz null,
      "revoke_reason" text null,
      "granted_by" text null,
      "dedupe_key" text not null,
      "metadata" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "entitlement_pkey" primary key ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_entitlement_deleted_at" ON "entitlement" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_entitlement_tenant_dedupe_unique" ON "entitlement" ("tenant_id", "dedupe_key") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_entitlement_customer_id_status" ON "entitlement" ("customer_id", "status") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_entitlement_order_id" ON "entitlement" ("order_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_entitlement_product_id" ON "entitlement" ("product_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_entitlement_tenant_id" ON "entitlement" ("tenant_id") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "entitlement" cascade;`)
  }
}
