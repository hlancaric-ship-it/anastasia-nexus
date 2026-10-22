import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Serverová revokácia JWT zákazníka: Medusa tokeny sú bezstavové, preto odhlásenie
 * zapíše hash tokenu do tabuľky a globálny middleware odmietne revokovaný token.
 * V tabuľke sa nikdy neukladá surový token, iba jeho SHA-256 hash.
 */
export class Migration20261022120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table if not exists auth_token_revocation (id text primary key, expires_at timestamptz not null, created_at timestamptz not null default now());`)
    this.addSql(`create index if not exists auth_token_revocation_expiry on auth_token_revocation(expires_at);`)
  }
  async down(): Promise<void> {
    this.addSql(`drop table if exists auth_token_revocation;`)
  }
}
