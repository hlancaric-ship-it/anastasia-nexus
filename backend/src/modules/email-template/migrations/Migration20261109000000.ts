import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261109000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "email_historical_baseline" ("email" text not null, "customer_id" text null, "cutoff" timestamptz not null, "created_at" timestamptz not null default now(), constraint "email_historical_baseline_pkey" primary key ("email"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_email_historical_baseline_email" ON "email_historical_baseline" (lower("email"));`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "email_historical_baseline" cascade;`)
  }
}
