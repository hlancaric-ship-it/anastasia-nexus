import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261018190000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "coupon_link_record" (
      "id" text primary key, "tenant_id" text not null, "url" text not null,
      "sku" text not null, "coupon_code" text not null,
      "quantity" integer not null check ("quantity" between 1 and 999),
      "source" text not null check ("source" in ('generated', 'legacy')),
      "issued_at" timestamptz null, "created_by" text not null,
      "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null);
      create index if not exists "IDX_coupon_link_record_tenant_created" on "coupon_link_record" ("tenant_id", "created_at", "id");`)
  }
  override async down(): Promise<void> { this.addSql(`drop table if exists "coupon_link_record";`) }
}
