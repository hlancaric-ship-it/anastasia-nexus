import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261014002633 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "chat_notification_state" drop constraint if exists "chat_notification_state_key_unique";`);
    this.addSql(`alter table if exists "chat_customer_block" drop constraint if exists "chat_customer_block_customer_id_unique";`);
    this.addSql(`create table if not exists "chat_conversation" ("id" text not null, "customer_id" text not null, "subject" text null, "order_id" text null, "booking_id" text null, "status" text check ("status" in ('open', 'closed')) not null default 'open', "muted" boolean not null default false, "closed_at" timestamptz null, "last_message_at" timestamptz null, "last_customer_message_at" timestamptz null, "last_admin_message_at" timestamptz null, "admin_last_read_at" timestamptz null, "customer_last_read_at" timestamptz null, "customer_notified_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "chat_conversation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_chat_conversation_deleted_at" ON "chat_conversation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_chat_conversation_customer_id_status" ON "chat_conversation" ("customer_id", "status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_chat_conversation_status_last_message_at" ON "chat_conversation" ("status", "last_message_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "chat_customer_block" ("id" text not null, "customer_id" text not null, "blocked" boolean not null default true, "reason" text null, "changed_by" text null, "changed_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "chat_customer_block_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_chat_customer_block_deleted_at" ON "chat_customer_block" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_chat_customer_block_customer_id_unique" ON "chat_customer_block" ("customer_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "chat_message" ("id" text not null, "conversation_id" text not null, "customer_id" text not null, "author_type" text check ("author_type" in ('customer', 'admin')) not null, "author_id" text not null, "body" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "chat_message_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_chat_message_deleted_at" ON "chat_message" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_chat_message_conversation_id_created_at" ON "chat_message" ("conversation_id", "created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_chat_message_customer_id_author_type_created_at" ON "chat_message" ("customer_id", "author_type", "created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "chat_notification_state" ("id" text not null, "key" text not null, "last_sent_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "chat_notification_state_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_chat_notification_state_deleted_at" ON "chat_notification_state" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_chat_notification_state_key_unique" ON "chat_notification_state" ("key") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "chat_conversation" cascade;`);

    this.addSql(`drop table if exists "chat_customer_block" cascade;`);

    this.addSql(`drop table if exists "chat_message" cascade;`);

    this.addSql(`drop table if exists "chat_notification_state" cascade;`);
  }

}
