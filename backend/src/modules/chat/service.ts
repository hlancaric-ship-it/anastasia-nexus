import { InjectTransactionManager, MedusaContext, MedusaError, MedusaService } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import ChatConversation from "./models/chat-conversation"
import ChatMessage from "./models/chat-message"
import ChatCustomerBlock from "./models/chat-customer-block"
import ChatNotificationState from "./models/chat-notification-state"
import { redactClosedChatContent } from "./retention"
import {
  ChatPolicyError, evaluateCustomerSend, isDigestDue, localDayStart, MAX_ADMIN_MESSAGE_LENGTH,
  normalizeMessageBody, normalizeSubject, shouldNotifyCustomer, type SendCounters,
} from "./policy"

export type ChatConversationRow = {
  id: string
  customer_id: string
  subject: string | null
  order_id: string | null
  booking_id: string | null
  status: "open" | "closed"
  muted: boolean
  closed_at: Date | null
  last_message_at: Date | null
  last_customer_message_at: Date | null
  last_admin_message_at: Date | null
  admin_last_read_at: Date | null
  customer_last_read_at: Date | null
  customer_notified_at: Date | null
  created_at: Date
}

export type ChatMessageRow = {
  id: string
  conversation_id: string
  customer_id: string
  author_type: "customer" | "admin"
  author_id: string
  body: string
  created_at: Date
}

export type SendCustomerMessageInput = {
  customer_id: string
  body: unknown
  /** Existující konverzace; bez ní se založí nová (s volitelným předmětem a vazbou). */
  conversation_id?: string
  subject?: unknown
  /** Vazby musí route předem ověřit proti vlastnictví zákazník. */
  order_id?: string | null
  booking_id?: string | null
}

export type ConversationAction = "close" | "reopen" | "mute" | "unmute"

export const ADMIN_DIGEST_KEY = "admin_digest"

/** Konverzace neexistuje nebo nepatří zákazníci (obojí navenek 404). */
export class ConversationNotFoundError extends Error {
  constructor() { super("CHAT_CONVERSATION_NOT_FOUND") }
}

class ChatModuleService extends MedusaService({ ChatConversation, ChatMessage, ChatCustomerBlock, ChatNotificationState }) {
  /** Erase expired closed content while retaining message counters and financial associations. */
  @InjectTransactionManager()
  async redactExpiredContent(cutoff: Date, @MedusaContext() context: Context = {}) {
    return redactClosedChatContent(this.transactionKnex(context), cutoff)
  }

  protected transactionKnex(context: Context) {
    const knex = (context.transactionManager as any)?.getTransactionContext?.()
    if (!knex) throw new Error("CHAT_TRANSACTION_REQUIRED")
    return knex
  }

  /**
   * Transakční zámek na zákazníci: serializuje všechny zápisy jejích zpráv (i Luciiny odpovědi a blokaci),
   * takže souběžné požadavky nemohou přečíst stejné počty a obejít limity.
   */
  protected async lockCustomer(knex: any, customerId: string) {
    await knex.raw("SET LOCAL lock_timeout = '5s'")
    await knex.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`chat:customer:${customerId}`])
  }

  protected async conversationForUpdate(knex: any, id: string): Promise<ChatConversationRow | null> {
    return (await knex("chat_conversation").where({ id }).whereNull("deleted_at").forUpdate().first()) ?? null
  }

  protected async conversationCustomerId(knex: any, id: string): Promise<string | null> {
    const row = await knex("chat_conversation").where({ id }).whereNull("deleted_at").first("customer_id")
    return row?.customer_id ?? null
  }

  protected async isBlockedTx(knex: any, customerId: string): Promise<boolean> {
    const row = await knex("chat_customer_block").where({ customer_id: customerId }).whereNull("deleted_at").first("blocked")
    return Boolean(row?.blocked)
  }

  /** Počty pro limity, čtené pod zámkem zákazník. */
  protected async countersTx(knex: any, customerId: string, now: Date): Promise<SendCounters> {
    const lastAdmin = knex("chat_message").where({ customer_id: customerId, author_type: "admin" }).whereNull("deleted_at").max("created_at")
    const [today, consecutive] = await Promise.all([
      knex("chat_message").where({ customer_id: customerId, author_type: "customer" }).whereNull("deleted_at")
        .where("created_at", ">=", localDayStart(now)).count({ n: "*" }).first(),
      knex("chat_message").where({ customer_id: customerId, author_type: "customer" }).whereNull("deleted_at")
        .where("created_at", ">", knex.raw("COALESCE((?), '-infinity'::timestamptz)", [lastAdmin])).count({ n: "*" }).first(),
    ])
    return { sentToday: Number(today?.n ?? 0), consecutive: Number(consecutive?.n ?? 0) }
  }

  /**
   * Zpráva zákazník (nová konverzace nebo odpověď do existující). Ověření a zápis běží v jedné
   * transakci pod zámkem zákazník: blokace, stav konverzace, max zpráv po sobě, denní strop.
   * Oprávnění psát (objednávka/rezervace/předplatné) a vlastnictví vazeb ověřuje route předem.
   */
  @InjectTransactionManager()
  async sendCustomerMessage(input: SendCustomerMessageInput, @MedusaContext() context: Context = {}): Promise<{ conversation: ChatConversationRow; message: ChatMessageRow }> {
    if (!input.customer_id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "customer_id je povinné")
    const body = normalizeMessageBody(input.body)
    if (!body.ok) throw body.error
    const subject = input.conversation_id ? { ok: true as const, value: null } : normalizeSubject(input.subject)
    if (!subject.ok) throw subject.error

    const knex = this.transactionKnex(context)
    await this.lockCustomer(knex, input.customer_id)
    // Čas až po získání zámku (ne DB now() = začátek transakce): pořadí zpráv odpovídá pořadí zápisů pod zámkem.
    const now = new Date()
    let conversation: ChatConversationRow | null = null
    if (input.conversation_id) {
      conversation = await this.conversationForUpdate(knex, input.conversation_id)
      if (!conversation || conversation.customer_id !== input.customer_id) throw new ConversationNotFoundError()
    }
    const [blocked, counters] = await Promise.all([this.isBlockedTx(knex, input.customer_id), this.countersTx(knex, input.customer_id, now)])
    const violation = evaluateCustomerSend({ blocked, conversation, ...counters })
    if (violation) throw violation

    if (!conversation) {
      conversation = (await this.createChatConversations({
        customer_id: input.customer_id,
        subject: subject.value,
        order_id: input.order_id ?? null,
        booking_id: input.booking_id ?? null,
        status: "open",
        muted: false,
        last_message_at: now,
        last_customer_message_at: now,
        customer_last_read_at: now,
        created_at: now,
      } as any, context)) as unknown as ChatConversationRow
    } else {
      conversation = (await this.updateChatConversations({
        id: conversation.id, last_message_at: now, last_customer_message_at: now, customer_last_read_at: now,
      }, context)) as unknown as ChatConversationRow
    }
    const message = (await this.createChatMessages({
      conversation_id: conversation.id,
      customer_id: input.customer_id,
      author_type: "customer",
      author_id: input.customer_id,
      body: body.value,
      created_at: now,
    } as any, context)) as unknown as ChatMessageRow
    return { conversation, message }
  }

  /** Luciina odpověď. Bez limitů, ale pod stejným zámkem, aby počítání „zpráv po sobě“ bylo konzistentní. */
  @InjectTransactionManager()
  async sendAdminReply(input: { conversation_id: string; admin_id: string; body: unknown }, @MedusaContext() context: Context = {}): Promise<{ conversation: ChatConversationRow; message: ChatMessageRow }> {
    const body = normalizeMessageBody(input.body, MAX_ADMIN_MESSAGE_LENGTH)
    if (!body.ok) throw body.error
    const knex = this.transactionKnex(context)
    const customerId = await this.conversationCustomerId(knex, input.conversation_id)
    if (!customerId) throw new ConversationNotFoundError()
    await this.lockCustomer(knex, customerId)
    const locked = await this.conversationForUpdate(knex, input.conversation_id)
    if (!locked) throw new ConversationNotFoundError()
    const now = new Date()
    const conversation = (await this.updateChatConversations({
      id: locked.id, last_message_at: now, last_admin_message_at: now, admin_last_read_at: now,
    }, context)) as unknown as ChatConversationRow
    const message = (await this.createChatMessages({
      conversation_id: locked.id,
      customer_id: locked.customer_id,
      author_type: "admin",
      author_id: input.admin_id,
      body: body.value,
      created_at: now,
    } as any, context)) as unknown as ChatMessageRow
    return { conversation, message }
  }

  /** Uzavřít / znovu otevřít / ztlumit / zrušit ztlumení. Vše vratné. */
  @InjectTransactionManager()
  async applyConversationAction(id: string, action: ConversationAction, @MedusaContext() context: Context = {}): Promise<ChatConversationRow> {
    const knex = this.transactionKnex(context)
    const current = await this.conversationForUpdate(knex, id)
    if (!current) throw new ConversationNotFoundError()
    const now = new Date()
    const patch =
      action === "close" ? { status: "closed" as const, closed_at: now }
      : action === "reopen" ? { status: "open" as const, closed_at: null }
      : action === "mute" ? { muted: true }
      : { muted: false }
    return (await this.updateChatConversations({ id, ...patch }, context)) as unknown as ChatConversationRow
  }

  /** Zablokovat / odblokovat chat zákazník (jeden řádek na zákazníci, přepíná se). */
  @InjectTransactionManager()
  async setCustomerBlocked(input: { customer_id: string; blocked: boolean; admin_id: string; reason?: string | null }, @MedusaContext() context: Context = {}) {
    const knex = this.transactionKnex(context)
    await this.lockCustomer(knex, input.customer_id)
    const existing = await knex("chat_customer_block").where({ customer_id: input.customer_id }).whereNull("deleted_at").first("id")
    const data = { blocked: input.blocked, reason: input.reason ?? null, changed_by: input.admin_id, changed_at: new Date() }
    if (existing) return await this.updateChatCustomerBlocks({ id: existing.id, ...data }, context)
    return await this.createChatCustomerBlocks({ customer_id: input.customer_id, ...data }, context)
  }

  async isCustomerBlocked(customerId: string): Promise<boolean> {
    const [row] = (await this.listChatCustomerBlocks({ customer_id: customerId }, { take: 1 })) as any[]
    return Boolean(row?.blocked)
  }

  async blockedCustomerIds(customerIds: string[]): Promise<Set<string>> {
    if (!customerIds.length) return new Set()
    const rows = (await this.listChatCustomerBlocks({ customer_id: customerIds, blocked: true }, { take: customerIds.length })) as any[]
    return new Set(rows.map((r) => r.customer_id))
  }

  /** Aktuální počty pro zobrazení zákazníci (informativní; závazná kontrola je v sendCustomerMessage). */
  @InjectTransactionManager()
  async customerCounters(customerId: string, @MedusaContext() context: Context = {}): Promise<SendCounters & { blocked: boolean }> {
    const knex = this.transactionKnex(context)
    const [blocked, counters] = await Promise.all([this.isBlockedTx(knex, customerId), this.countersTx(knex, customerId, new Date())])
    return { blocked, ...counters }
  }

  async markReadByAdmin(id: string): Promise<void> {
    await this.updateChatConversations({ id, admin_last_read_at: new Date() })
  }

  async markReadByCustomer(id: string): Promise<void> {
    await this.updateChatConversations({ id, customer_last_read_at: new Date() })
  }

  /**
   * Souhrnný e-mail Lucii max 1×/h: pod zámkem zjistí, zda od posledního souhrnu přibyly nepřečtené
   * zprávy v neztlumených konverzacích, a pokud ano a hodina uplynula, „zabere“ odeslání.
   * Vrací souhrn k odeslání, nebo null.
   */
  @InjectTransactionManager()
  async claimAdminDigest(now: Date = new Date(), @MedusaContext() context: Context = {}): Promise<{ conversations: number; messages: number } | null> {
    const knex = this.transactionKnex(context)
    await knex.raw("SET LOCAL lock_timeout = '5s'")
    await knex.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`chat:notify:${ADMIN_DIGEST_KEY}`])
    const state = await knex("chat_notification_state").where({ key: ADMIN_DIGEST_KEY }).whereNull("deleted_at").first("id", "last_sent_at")
    if (!isDigestDue(state?.last_sent_at, now)) return null
    const pending = await knex("chat_message as m")
      .join("chat_conversation as c", "c.id", "m.conversation_id")
      .where("m.author_type", "customer").whereNull("m.deleted_at").whereNull("c.deleted_at")
      .where("c.muted", false).where("c.status", "open")
      .where("m.created_at", ">", state?.last_sent_at ?? new Date(0))
      .where((q: any) => q.whereNull("c.admin_last_read_at").orWhereRaw("m.created_at > c.admin_last_read_at"))
      .select(knex.raw("count(*) AS messages, count(DISTINCT m.conversation_id) AS conversations"))
      .first()
    const messages = Number(pending?.messages ?? 0)
    if (!messages) return null
    if (state) await this.updateChatNotificationStates({ id: state.id, last_sent_at: now }, context)
    else await this.createChatNotificationStates({ key: ADMIN_DIGEST_KEY, last_sent_at: now }, context)
    return { conversations: Number(pending?.conversations ?? 0), messages }
  }

  /** E-mail zákazníci o odpovědi: jen pokud si předchozí upozornění už přečetla (nezahlcovat). */
  @InjectTransactionManager()
  async claimCustomerReplyNotification(conversationId: string, @MedusaContext() context: Context = {}): Promise<ChatConversationRow | null> {
    const knex = this.transactionKnex(context)
    const conv = await this.conversationForUpdate(knex, conversationId)
    if (!conv || !shouldNotifyCustomer(conv)) return null
    return (await this.updateChatConversations({ id: conv.id, customer_notified_at: new Date() }, context)) as unknown as ChatConversationRow
  }

  async retrieveConversationOf(id: string, customerId: string): Promise<ChatConversationRow> {
    const [conv] = (await this.listChatConversations({ id, customer_id: customerId }, { take: 1 })) as unknown as ChatConversationRow[]
    if (!conv) throw new ConversationNotFoundError()
    return conv
  }

  /** Posledních `limit` zpráv konverzace ve chronologickém pořadí. */
  async listConversationMessages(conversationId: string, limit = 200): Promise<ChatMessageRow[]> {
    const rows = (await this.listChatMessages({ conversation_id: conversationId }, { take: Math.min(Math.max(limit, 1), 500), order: { created_at: "DESC" } })) as unknown as ChatMessageRow[]
    return rows.reverse()
  }
}

export default ChatModuleService
