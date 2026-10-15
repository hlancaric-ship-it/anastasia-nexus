import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261015040000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "email_template_override" ("id" text not null, "template" text not null, "texts" jsonb null, "enabled" boolean not null default true, "updated_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "email_template_override_pkey" primary key ("id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_email_template_override_deleted_at" ON "email_template_override" ("deleted_at") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_template_override_template_unique" ON "email_template_override" ("template") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "email_template_override" cascade;`)
  }
}
