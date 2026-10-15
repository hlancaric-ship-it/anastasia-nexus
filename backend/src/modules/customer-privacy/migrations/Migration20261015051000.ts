import { Migration } from "@medusajs/framework/mikro-orm/migrations"
export class Migration20261015051000 extends Migration {
 async up():Promise<void>{this.addSql(`alter table customer_erasure add column if not exists email_hashes jsonb null;`)}
 async down():Promise<void>{this.addSql(`alter table customer_erasure drop column if exists email_hashes;`)}
}
