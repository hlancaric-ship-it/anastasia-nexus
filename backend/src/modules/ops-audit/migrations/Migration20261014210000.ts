import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261014210000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "ops_event" ("id" text not null, "level" text check ("level" in ('info', 'warn', 'error')) not null, "domain" text not null, "event" text not null, "request_id" text null, "order_id" text null, "cart_id" text null, "customer_id" text null, "entity_id" text null, "fields" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ops_event_pkey" primary key ("id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_event_deleted_at" ON "ops_event" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_event_created_at" ON "ops_event" ("created_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_event_domain_created_at" ON "ops_event" ("domain", "created_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_event_request_id" ON "ops_event" ("request_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_event_order_id" ON "ops_event" ("order_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_event_cart_id" ON "ops_event" ("cart_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_event_customer_id" ON "ops_event" ("customer_id") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ops_event" cascade;`)
  }
}
