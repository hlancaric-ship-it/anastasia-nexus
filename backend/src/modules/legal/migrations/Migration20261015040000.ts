import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261015040000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table if not exists legal_rate_limit (subject text primary key, attempts integer not null, expires_at timestamptz not null);`);
    this.addSql(`create table if not exists "legal_consent" (id text primary key, cart_id text not null, customer_id text null, order_id text null, terms_version text not null, privacy_version text not null, accepted_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null);`);
    this.addSql(`create unique index if not exists "legal_consent_cart_id_unique" on "legal_consent" (cart_id) where deleted_at is null;`);
    this.addSql(`create table if not exists "newsletter_consent" (id text primary key, email text not null, source text not null, text_version text not null, status text not null check (status in ('subscribed','unsubscribed')), token_hash text not null, consented_at timestamptz not null, unsubscribed_at timestamptz null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null);`);
    this.addSql(`create unique index if not exists "newsletter_consent_email_unique" on "newsletter_consent" (email) where deleted_at is null;`);
    this.addSql(`create table if not exists "legal_withdrawal" (id text primary key, order_id text not null, customer_id text not null, items jsonb not null, reason text null, status text not null default 'received' check (status in ('received','accepted','rejected','refunded')), changed_by text null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null);`);
    this.addSql(`create unique index if not exists "legal_withdrawal_order_id_unique" on "legal_withdrawal" (order_id) where deleted_at is null;`);
    this.addSql(`create index if not exists legal_consent_customer on legal_consent (customer_id);`);
    this.addSql(`create table if not exists newsletter_consent_event (id text primary key, consent_id text not null, status text not null check (status in ('subscribed','unsubscribed')), source text not null, text_version text not null, occurred_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null);`);
    this.addSql(`create index if not exists newsletter_token on newsletter_consent (token_hash);`);
  }
  async down(): Promise<void> {
    this.addSql(`drop table if exists legal_rate_limit;`);
    this.addSql(`drop table if exists newsletter_consent_event;`);
    this.addSql(`drop table if exists "legal_consent";`);
    this.addSql(`drop table if exists "newsletter_consent";`);
    this.addSql(`drop table if exists "legal_withdrawal";`);
  }
}
