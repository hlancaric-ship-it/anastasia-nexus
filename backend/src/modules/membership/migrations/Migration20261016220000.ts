import { Migration } from '@medusajs/framework/mikro-orm/migrations'
export class Migration20261016220000 extends Migration {
 override async up():Promise<void>{
  this.addSql(`create table if not exists "membership" (
   "id" text primary key, "customer_id" text not null, "first_order_id" text not null,
   "status" text not null check ("status" in ('active','renewing','unknown','needs_review')),
   "period_end" timestamptz not null, "snapshot" jsonb not null,
   "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null
  );`)
  this.addSql(`create unique index if not exists "membership_first_order_unique" on "membership" ("first_order_id");`)
  this.addSql(`create index if not exists "membership_customer_period" on "membership" ("customer_id","period_end");`)
  this.addSql(`create index if not exists "membership_status_period" on "membership" ("status","period_end");`)
  this.addSql(`create index if not exists "membership_deleted" on "membership" ("deleted_at") where "deleted_at" is null;`)
  this.addSql(`create table if not exists "membership_receipt" (
   "id" text primary key, "membership_id" text not null, "order_id" text not null, "checkout_key" text not null,
   "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null
  );`)
  this.addSql(`create unique index if not exists "membership_receipt_order_unique" on "membership_receipt" ("order_id");`)
  this.addSql(`create unique index if not exists "membership_receipt_checkout_unique" on "membership_receipt" ("membership_id","checkout_key");`)
  this.addSql(`create index if not exists "membership_receipt_deleted" on "membership_receipt" ("deleted_at") where "deleted_at" is null;`)
 }
 override async down():Promise<void>{this.addSql('drop table if exists "membership_receipt";');this.addSql('drop table if exists "membership";')}
}
