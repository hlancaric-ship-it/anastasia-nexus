import { Migration } from '@medusajs/framework/mikro-orm/migrations'
export class Migration20261017090000 extends Migration {
 override async up():Promise<void>{
  this.addSql(`create table if not exists "membership_checkout" (
   "id" text primary key, "cart_id" text not null, "customer_id" text not null,
   "status" text not null check ("status" in ('prepared','settled')), "order_id" text null, "membership_id" text null,
   "snapshot" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null,
   constraint "membership_checkout_settlement" check (("status"='prepared' and "order_id" is null and "membership_id" is null) or ("status"='settled' and "order_id" is not null and "membership_id" is not null))
  );`)
  this.addSql(`create unique index if not exists "membership_checkout_cart_unique" on "membership_checkout" ("cart_id");`)
  this.addSql(`create unique index if not exists "membership_checkout_order_unique" on "membership_checkout" ("order_id");`)
  this.addSql(`create index if not exists "membership_checkout_customer_status" on "membership_checkout" ("customer_id","status");`)
  this.addSql(`create index if not exists "membership_checkout_deleted" on "membership_checkout" ("deleted_at") where "deleted_at" is null;`)
 }
 override async down():Promise<void>{this.addSql('drop table if exists "membership_checkout";')}
}
