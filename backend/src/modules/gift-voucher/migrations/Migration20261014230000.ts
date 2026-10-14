import { Migration } from "@mikro-orm/migrations"

export class Migration20261014230000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS gift_voucher_rate_limit (
      subject text PRIMARY KEY, attempts integer NOT NULL CHECK (attempts > 0), expires_at timestamptz NOT NULL
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS gift_voucher_rate_limit_expiry ON gift_voucher_rate_limit (expires_at);`)
  }
  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS gift_voucher_rate_limit;`)
  }
}
