import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261015080000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table if not exists auth_link_state (id text primary key, token_hash text not null, expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null);`)
    this.addSql(`create table if not exists auth_link_rate (id text primary key, attempts integer not null, expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null);`)
    this.addSql(`create index if not exists auth_link_state_expiry on auth_link_state(expires_at);`)
    this.addSql(`create index if not exists auth_link_rate_expiry on auth_link_rate(expires_at);`)
  }
  async down(): Promise<void> {
    this.addSql(`drop table if exists auth_link_state; drop table if exists auth_link_rate;`)
  }
}
