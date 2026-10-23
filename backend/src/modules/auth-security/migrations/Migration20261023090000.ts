import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261023090000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table if not exists auth_registration_state (id text primary key, payload jsonb not null, expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());`)
  }
  async down(): Promise<void> {
    this.addSql(`drop table if exists auth_registration_state;`)
  }
}
