import { Migration } from '@medusajs/framework/mikro-orm/migrations'
export class Migration20261017120000 extends Migration {
 override async up():Promise<void>{
  this.addSql(`create table if not exists membership_mandate (id text primary key,membership_id text not null,customer_id text not null,checkout_id text not null,provider_id text not null,account_holder_id text not null,provider_customer_id text not null,payment_method_id text not null,payment_id text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz null);`)
  this.addSql(`create unique index if not exists membership_mandate_member_unique on membership_mandate(membership_id);`)
  this.addSql(`create index if not exists membership_mandate_customer on membership_mandate(customer_id);`)
  this.addSql(`create table if not exists membership_billing_attempt(id text primary key,membership_id text not null,renewal_key text not null,cart_id text null,stage text not null check(stage in ('planned','cart_requested','cart_ready','payment_requested','payment_ready','completing','settled','needs_action','unknown','review')),collection_id text null,session_id text null,order_id text null,snapshot jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz null);`)
  this.addSql(`create unique index if not exists membership_billing_key_unique on membership_billing_attempt(renewal_key);`)
  this.addSql(`create unique index if not exists membership_billing_cart_unique on membership_billing_attempt(cart_id);`)
  this.addSql(`create index if not exists membership_billing_member_stage on membership_billing_attempt(membership_id,stage);`)
  this.addSql(`create table if not exists membership_initial_payment(id text primary key,checkout_id text not null,collection_id text not null,session_id text null,status text not null check(status in ('requested','ready','unknown')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz null);`)
  this.addSql(`create unique index if not exists membership_initial_checkout_unique on membership_initial_payment(checkout_id);`)
  this.addSql(`create unique index if not exists membership_initial_session_unique on membership_initial_payment(session_id);`)
 }
 override async down():Promise<void>{this.addSql('drop table if exists membership_initial_payment;');this.addSql('drop table if exists membership_billing_attempt;');this.addSql('drop table if exists membership_mandate;')}
}
