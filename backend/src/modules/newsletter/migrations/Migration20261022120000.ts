import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261022120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table if not exists "newsletter_campaign" (
      id text primary key,
      subject text not null,
      preheader text null,
      body_html text not null,
      status text not null default 'draft' check (status in ('draft','queued','sending','sent','cancelled')),
      queued_at timestamptz null,
      sent_at timestamptz null,
      recipients_count integer not null default 0,
      sent_count integer not null default 0,
      failed_count integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz null
    );`)
    this.addSql(`create index if not exists newsletter_campaign_status on "newsletter_campaign" (status);`)
    this.addSql(`create index if not exists newsletter_campaign_created on "newsletter_campaign" (created_at);`)

    this.addSql(`create table if not exists "newsletter_delivery" (
      id text primary key,
      campaign_id text not null,
      consent_id text not null,
      email text not null,
      status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
      error text null,
      sent_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz null
    );`)
    this.addSql(`create unique index if not exists newsletter_delivery_campaign_consent_unique on "newsletter_delivery" (campaign_id, consent_id);`)
    this.addSql(`create index if not exists newsletter_delivery_status on "newsletter_delivery" (status, created_at);`)
    this.addSql(`create index if not exists newsletter_delivery_campaign on "newsletter_delivery" (campaign_id);`)
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "newsletter_delivery";`)
    this.addSql(`drop table if exists "newsletter_campaign";`)
  }
}
