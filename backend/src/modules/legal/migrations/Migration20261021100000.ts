import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261021100000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table if not exists "legal_contract_withdrawal" (id text primary key, order_number text not null, email text not null, items jsonb not null, order_date timestamptz null, customer_id text null, name text null, reason text null, status text not null default 'received' check (status in ('received','processed','closed')), source text not null default 'web', fingerprint text not null, changed_by text null, received_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null);`);
    this.addSql(`create unique index if not exists "legal_contract_withdrawal_fingerprint_unique" on "legal_contract_withdrawal" (fingerprint) where deleted_at is null;`);
    this.addSql(`create index if not exists legal_contract_withdrawal_status on "legal_contract_withdrawal" (status);`);
    this.addSql(`create index if not exists legal_contract_withdrawal_order on "legal_contract_withdrawal" (order_number);`);
  }
  async down(): Promise<void> {
    this.addSql(`drop table if exists "legal_contract_withdrawal";`);
  }
}
