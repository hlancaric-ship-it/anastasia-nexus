export const DEFAULT_CHAT_RETENTION_DAYS = 365
export const REMOVED_CHAT_BODY = "[Správa odstránená po uplynutí doby uchovávania.]"

export function chatRetentionCutoff(raw: string | undefined, now = new Date()): Date {
  const days = raw === undefined ? DEFAULT_CHAT_RETENTION_DAYS : Number(raw)
  if (!Number.isInteger(days) || days < 30 || days > 3650 || !Number.isFinite(now.getTime())) {
    throw new Error("CHAT_RETENTION_CONFIGURATION_INVALID")
  }
  return new Date(now.getTime() - days * 86_400_000)
}

/** Called inside the module transaction. Lock the same conversation row as close/reopen/send. */
export async function redactClosedChatContent(knex: any, cutoff: Date) {
  const conversations = await knex("chat_conversation")
    .where({ status: "closed" }).whereNotNull("closed_at").where("closed_at", "<", cutoff)
    .where(function(this: any) {
      this.whereNotNull("subject").orWhereExists(
        knex("chat_message").select(knex.raw("1")).whereRaw("chat_message.conversation_id = chat_conversation.id").whereNot("body", REMOVED_CHAT_BODY)
      )
    })
    .orderBy("id", "asc").limit(100).forUpdate().skipLocked().select("id")
  const ids = conversations.map((row: { id: string }) => row.id)
  if (!ids.length) return { conversations: 0, messages: 0 }
  const messages = await knex("chat_message").whereIn("conversation_id", ids).whereNot("body", REMOVED_CHAT_BODY)
    .update({ body: REMOVED_CHAT_BODY, updated_at: new Date() })
  await knex("chat_conversation").whereIn("id", ids).update({ subject: null, updated_at: new Date() })
  return { conversations: ids.length, messages: Number(messages) }
}
