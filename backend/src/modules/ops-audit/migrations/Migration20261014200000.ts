import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261014200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "ops_audit_entry" ("id" text not null, "actor_type" text check ("actor_type" in ('user', 'system')) not null, "actor_id" text not null, "action" text not null, "entity_type" text not null, "entity_id" text null, "changes" jsonb null, "request_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ops_audit_entry_pkey" primary key ("id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_audit_entry_deleted_at" ON "ops_audit_entry" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_audit_entry_entity_type_entity_id" ON "ops_audit_entry" ("entity_type", "entity_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_audit_entry_actor_id" ON "ops_audit_entry" ("actor_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_audit_entry_created_at" ON "ops_audit_entry" ("created_at") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ops_audit_entry" cascade;`)
  }
}
