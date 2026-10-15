import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261015050000 extends Migration {
 async up():Promise<void> {
  this.addSql(`create table if not exists customer_erasure (id text primary key,customer_id text not null,status text not null default 'requested' check(status in ('requested','processing','completed')), email_hash text null,blocked_until timestamptz null,confirmed_by text null,completed_at timestamptz null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz null);`)
  this.addSql(`create unique index if not exists customer_erasure_unique on customer_erasure(customer_id) where deleted_at is null;`)
  this.addSql(`create index if not exists customer_erasure_email on customer_erasure(email_hash);`)
  this.addSql(`create table if not exists customer_note (id text primary key,customer_id text not null,body text not null,created_by text not null,changed_by text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz null);`)
  this.addSql(`create index if not exists customer_note_customer on customer_note(customer_id);`)
 }
 async down():Promise<void>{this.addSql(`drop table if exists customer_note;`);this.addSql(`drop table if exists customer_erasure;`)}
}
