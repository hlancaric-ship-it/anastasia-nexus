import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Account-wide JWT invalidation. The table intentionally survives code rollback. */
export class Migration20261027210000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "auth_session_epoch" (
      "id" text primary key,
      "actor_type" text not null check ("actor_type" in ('customer', 'user')),
      "actor_id" text not null,
      "epoch" integer not null default 0 check ("epoch" >= 0),
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "auth_session_epoch_actor_unique" unique ("actor_type", "actor_id")
    );`)
  }

  // A code rollback must not restore sessions that an owner already revoked.
  override async down(): Promise<void> {}
}
