import { randomBytes } from "node:crypto"
import { generateEntityId, InjectTransactionManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import GiftVoucher from "./models/gift-voucher"
import GiftVoucherTransaction from "./models/gift-voucher-transaction"
import GiftVoucherSettings from "./models/gift-voucher-settings"
import {
  addMonths, assertUsable, computeRedemption, generateVoucherCode, GiftVoucherError, GIFT_VOUCHER_CURRENCY, isExpired,
  maskVoucherCode, normalizeVoucherCode, settingsFromRow, statusAfterCredit,
  type DeliveryMethod, type GiftVoucherSettings as Settings, type Recipient, type VoucherScope,
} from "./policy"

export type GiftVoucherRow = {
  id: string
  code: string
  code_last4: string
  currency_code: string
  initial_amount: number
  balance: number
  status: "active" | "depleted" | "expired" | "void"
  issued_at: Date
  expires_at: Date
  issue_key: string
  source_order_id: string | null
  source_variant_id: string | null
  scope: VoucherScope
  partial_redemption: boolean
  delivery_method: DeliveryMethod
  delivery_status: "pending" | "scheduled" | "sent" | "failed"
  delivered_at: Date | null
  delivery_attempts: number
  recipient_name: string | null
  recipient_email: string | null
  message: string | null
  delivery_date: string | null
  purchaser_email: string | null
  voided_at: Date | null
  void_reason: string | null
  metadata: Record<string, unknown> | null
}

export type IssueVoucherInput = {
  issue_key: string
  amount_minor: number
  order_id: string
  variant_id: string
  settings: Settings
  recipient: Recipient | null
  purchaser_email: string | null
  issued_at?: Date
}

export type RedeemInput = { voucher_id: string; cart_id: string; amount_minor: number; eligible_minor: number }
export type Redemption = { transaction_id: string; voucher_id: string; cart_id: string; amount_minor: number; forfeited_minor: number }

const SETTINGS_KEY = "default"
const UNIQUE_VIOLATION = /duplicate key|unique constraint|23505/i
const MAX_CODE_ATTEMPTS = 5

function trx(context: Context): any {
  const knex = (context.transactionManager as any)?.getTransactionContext?.()
  if (!knex) throw new Error("GIFT_VOUCHER_TRANSACTION_REQUIRED")
  return knex
}

function normalizeRow(row: any): GiftVoucherRow {
  return { ...row, initial_amount: Number(row.initial_amount), balance: Number(row.balance), delivery_attempts: Number(row.delivery_attempts ?? 0) }
}

/** Veřejný (maskovaný) pohled pro admin a API – nikdy neobsahuje celý kód. */
export function maskedVoucher(row: GiftVoucherRow) {
  return {
    id: row.id,
    code: maskVoucherCode(row.code),
    currency_code: row.currency_code,
    initial_amount: row.initial_amount / 100,
    balance: row.balance / 100,
    status: row.status !== "void" && row.status !== "expired" && isExpired(row) ? "expired" : row.status,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    source_order_id: row.source_order_id,
    delivery_method: row.delivery_method,
    delivery_status: row.delivery_status,
    delivery_date: row.delivery_date,
    voided_at: row.voided_at,
    void_reason: row.void_reason,
  }
}

class GiftVoucherModuleService extends MedusaService({ GiftVoucher, GiftVoucherTransaction, GiftVoucherSettings }) {
  private async insertTransaction(knex: any, input: {
    voucher_id: string; type: string; amount: number; balance_after: number; idempotency_key: string
    cart_id?: string | null; order_id?: string | null; reference_id?: string | null; actor_id?: string | null; note?: string | null
  }): Promise<string> {
    const id = generateEntityId(undefined, "gvtx")
    const now = new Date()
    await knex("gift_voucher_transaction").insert({
      id, voucher_id: input.voucher_id, type: input.type, amount: input.amount, balance_after: input.balance_after,
      cart_id: input.cart_id ?? null, order_id: input.order_id ?? null, reference_id: input.reference_id ?? null,
      idempotency_key: input.idempotency_key, actor_id: input.actor_id ?? null, note: input.note ?? null, created_at: now, updated_at: now,
    })
    return id
  }

  private async lockVoucher(knex: any, id: string): Promise<GiftVoucherRow> {
    await knex.raw("SET LOCAL lock_timeout = '5s'")
    const row = await knex("gift_voucher").where({ id }).whereNull("deleted_at").forUpdate().first()
    if (!row) throw new GiftVoucherError("GIFT_VOUCHER_INVALID")
    return normalizeRow(row)
  }

  // --- Nastavení -----------------------------------------------------------

  async getSettings(): Promise<Settings> {
    const rows = await this.listGiftVoucherSettings({ key: SETTINGS_KEY }, { take: 1 })
    return settingsFromRow(rows[0] as any)
  }

  @InjectTransactionManager()
  async saveSettings(settings: Settings, actorId: string | null, @MedusaContext() context: Context = {}): Promise<Settings> {
    const knex = trx(context)
    const now = new Date()
    await knex("gift_voucher_settings")
      .insert({
        id: generateEntityId(undefined, "gvset"), key: SETTINGS_KEY, enabled: settings.enabled,
        values_minor: JSON.stringify(settings.values_minor), validity_months: settings.validity_months,
        scope_type: settings.scope_type, category_ids: JSON.stringify(settings.category_ids),
        partial_redemption: settings.partial_redemption, delivery_method: settings.delivery_method,
        updated_by: actorId, created_at: now, updated_at: now,
      })
      .onConflict("key")
      .merge(["enabled", "values_minor", "validity_months", "scope_type", "category_ids", "partial_redemption", "delivery_method", "updated_by", "updated_at"])
    return settings
  }

  // --- Vystavení -----------------------------------------------------------

  /**
   * Idempotentní vystavení: unikátní issue_key (objednávka + varianta + pořadí kusu).
   * Opakovaná událost vrátí existující poukaz s `created: false`.
   */
  @InjectTransactionManager()
  async issueVoucher(input: IssueVoucherInput, @MedusaContext() context: Context = {}): Promise<{ voucher: GiftVoucherRow; created: boolean }> {
    if (!Number.isInteger(input.amount_minor) || input.amount_minor <= 0) throw new GiftVoucherError("GIFT_VOUCHER_AMOUNT_INVALID")
    if (!input.issue_key || !input.order_id) throw new GiftVoucherError("GIFT_VOUCHER_ISSUE_KEY_REQUIRED")
    const knex = trx(context)
    await knex.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`gift_voucher_issue:${input.issue_key}`])
    const existing = await knex("gift_voucher").where({ issue_key: input.issue_key }).first()
    if (existing) return { voucher: normalizeRow(existing), created: false }
    const issuedAt = input.issued_at ?? new Date()
    const scheduled = input.recipient && input.recipient.delivery_date
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateVoucherCode((size) => randomBytes(size))
      const id = generateEntityId(undefined, "gv")
      try {
        // Savepoint: kolize kódu nesmí shodit celou transakci.
        const inserted = await knex.transaction(async (nested: any) => {
          const [row] = await nested("gift_voucher").insert({
            id, code, code_last4: code.slice(-4), currency_code: GIFT_VOUCHER_CURRENCY,
            initial_amount: input.amount_minor, balance: input.amount_minor, status: "active",
            issued_at: issuedAt, expires_at: addMonths(issuedAt, input.settings.validity_months),
            issue_key: input.issue_key, source_order_id: input.order_id, source_variant_id: input.variant_id,
            scope: JSON.stringify({ type: input.settings.scope_type, category_ids: input.settings.category_ids }),
            partial_redemption: input.settings.partial_redemption, delivery_method: input.settings.delivery_method,
            delivery_status: scheduled ? "scheduled" : "pending",
            recipient_name: input.recipient?.name ?? null, recipient_email: input.recipient?.email ?? null,
            message: input.recipient?.message ?? null, delivery_date: input.recipient?.delivery_date ?? null,
            purchaser_email: input.purchaser_email, created_at: issuedAt, updated_at: issuedAt,
          }).returning("*")
          return row
        })
        await this.insertTransaction(knex, { voucher_id: id, type: "issued", amount: input.amount_minor, balance_after: input.amount_minor,
          order_id: input.order_id, idempotency_key: `issue:${input.issue_key}` })
        return { voucher: normalizeRow(inserted), created: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!UNIQUE_VIOLATION.test(message)) throw error
        const raced = await knex("gift_voucher").where({ issue_key: input.issue_key }).first()
        if (raced) return { voucher: normalizeRow(raced), created: false }
        // Jinak kolize náhodného kódu: zkusit nový.
      }
    }
    throw new Error("GIFT_VOUCHER_CODE_GENERATION_FAILED")
  }

  // --- Vyhledání -----------------------------------------------------------

  async findByCode(input: unknown): Promise<GiftVoucherRow | null> {
    const code = normalizeVoucherCode(input)
    if (!code) return null
    const rows = await this.listGiftVouchers({ code }, { take: 1 })
    return rows[0] ? normalizeRow(rows[0]) : null
  }

  async getVoucher(id: string): Promise<GiftVoucherRow | null> {
    if (!id) return null
    const rows = await this.listGiftVouchers({ id }, { take: 1 })
    return rows[0] ? normalizeRow(rows[0]) : null
  }

  // --- Čerpání -------------------------------------------------------------

  /**
   * Atomické čerpání v jedné DB transakci: zámek řádku poukazu, kontrola stavu, platnosti
   * a zůstatku, podmíněný UPDATE a zápis transakce. Souběžné čerpání téhož poukazu se
   * serializuje na zámku; druhé uvidí už snížený zůstatek. Unikátní index brání dvojímu
   * čerpání jedním košíkem.
   */
  @InjectTransactionManager()
  async redeem(input: RedeemInput, @MedusaContext() context: Context = {}): Promise<Redemption> {
    if (!input.cart_id) throw new GiftVoucherError("GIFT_VOUCHER_CART_INVALID")
    const knex = trx(context)
    const voucher = await this.lockVoucher(knex, input.voucher_id)
    assertUsable(voucher)
    const result = computeRedemption({ balance: voucher.balance, requested: input.amount_minor, eligible: input.eligible_minor, partial: voucher.partial_redemption })
    const now = new Date()
    const updated = await knex("gift_voucher")
      .where({ id: voucher.id, status: "active" })
      .where("balance", ">=", result.amount + result.forfeited)
      .where("expires_at", ">", now)
      .update({ balance: result.balance_after, status: result.balance_after > 0 ? "active" : "depleted", updated_at: now })
    if (updated !== 1) throw new GiftVoucherError("GIFT_VOUCHER_BALANCE_INSUFFICIENT")
    let transactionId: string
    try {
      transactionId = await this.insertTransaction(knex, { voucher_id: voucher.id, type: "redeemed", amount: result.amount,
        balance_after: result.balance_after + result.forfeited, cart_id: input.cart_id, idempotency_key: `redeem:${input.cart_id}:${generateEntityId(undefined, "r")}` })
    } catch (error) {
      if (UNIQUE_VIOLATION.test(error instanceof Error ? error.message : String(error))) throw new GiftVoucherError("GIFT_VOUCHER_ALREADY_REDEEMED")
      throw error
    }
    if (result.forfeited > 0) {
      await this.insertTransaction(knex, { voucher_id: voucher.id, type: "forfeited", amount: result.forfeited, balance_after: 0,
        cart_id: input.cart_id, reference_id: transactionId, idempotency_key: `forfeit:${transactionId}`, note: "single_use_remainder" })
    }
    return { transaction_id: transactionId, voucher_id: voucher.id, cart_id: input.cart_id, amount_minor: result.amount, forfeited_minor: result.forfeited }
  }

  /** Kompenzace neúspěšného checkoutu: vrátí čerpání i propadlý zbytek. Idempotentní. */
  @InjectTransactionManager()
  async reverseRedemption(transactionId: string, @MedusaContext() context: Context = {}): Promise<boolean> {
    const knex = trx(context)
    const tx = await knex("gift_voucher_transaction").where({ id: transactionId, type: "redeemed" }).first()
    if (!tx) return false
    const voucher = await this.lockVoucher(knex, tx.voucher_id)
    const locked = await knex("gift_voucher_transaction").where({ id: transactionId }).forUpdate().first()
    if (locked.reversed_at) return false
    const forfeited = await knex("gift_voucher_transaction").where({ reference_id: transactionId, type: "forfeited" }).sum({ total: "amount" }).first()
    const restore = Number(locked.amount) + Number(forfeited?.total ?? 0)
    const balanceAfter = Math.min(voucher.initial_amount, voucher.balance + restore)
    const now = new Date()
    await knex("gift_voucher").where({ id: voucher.id }).update({ balance: balanceAfter, status: statusAfterCredit(voucher, balanceAfter, now), updated_at: now })
    await knex("gift_voucher_transaction").where({ id: transactionId }).update({ reversed_at: now, updated_at: now })
    await this.insertTransaction(knex, { voucher_id: voucher.id, type: "reversed", amount: restore, balance_after: balanceAfter,
      cart_id: locked.cart_id, reference_id: transactionId, idempotency_key: `reverse:${transactionId}` })
    return true
  }

  /** order.placed: přiřadí čerpání košíku k objednávce (pro vratky a audit). */
  @InjectTransactionManager()
  async attachOrder(cartId: string, orderId: string, @MedusaContext() context: Context = {}): Promise<number> {
    if (!cartId || !orderId) return 0
    const knex = trx(context)
    return await knex("gift_voucher_transaction").where({ cart_id: cartId }).whereIn("type", ["redeemed", "forfeited"])
      .whereNull("reversed_at").whereNull("order_id").update({ order_id: orderId, updated_at: new Date() })
  }

  // --- Vratky --------------------------------------------------------------

  /**
   * Vrátí částku zaplacenou poukazem zpět na poukaz. `includeForfeited` (storno celé
   * objednávky) vrátí i propadlý zbytek jednorázového poukazu. Strop = čerpáno − už vráceno,
   * idempotence přes `idempotencyKey`.
   */
  @InjectTransactionManager()
  async refundOrderToVoucher(input: { order_id: string; amount_minor?: number; includeForfeited?: boolean; idempotency_key: string; actor_id?: string | null; note?: string | null },
    @MedusaContext() context: Context = {}): Promise<Array<{ voucher_id: string; amount_minor: number; balance_after: number }>> {
    const knex = trx(context)
    if (await knex("gift_voucher_transaction").where("idempotency_key", "like", `${input.idempotency_key}:%`).first()) return []
    const redemptions = await knex("gift_voucher_transaction").where({ order_id: input.order_id, type: "redeemed" }).whereNull("reversed_at").orderBy("created_at", "asc")
    if (!redemptions.length) {
      if (input.amount_minor !== undefined) throw new GiftVoucherError("GIFT_VOUCHER_NO_REDEMPTION")
      return []
    }
    let remaining = input.amount_minor
    if (remaining !== undefined && (!Number.isInteger(remaining) || remaining <= 0)) throw new GiftVoucherError("GIFT_VOUCHER_AMOUNT_INVALID")
    const results: Array<{ voucher_id: string; amount_minor: number; balance_after: number }> = []
    const plan: Array<{ redemption: any; voucher: GiftVoucherRow; amount: number }> = []
    for (const redemption of redemptions) {
      const voucher = await this.lockVoucher(knex, redemption.voucher_id)
      const refunded = await knex("gift_voucher_transaction").where({ reference_id: redemption.id, type: "refunded" }).sum({ total: "amount" }).first()
      const forfeited = input.includeForfeited
        ? await knex("gift_voucher_transaction").where({ reference_id: redemption.id, type: "forfeited" }).sum({ total: "amount" }).first()
        : { total: 0 }
      const cap = Math.max(0, Number(redemption.amount) + Number(forfeited?.total ?? 0) - Number(refunded?.total ?? 0))
      const amount = remaining === undefined ? cap : Math.min(cap, remaining)
      if (amount <= 0) continue
      if (voucher.status === "void") throw new GiftVoucherError("GIFT_VOUCHER_VOID")
      plan.push({ redemption, voucher, amount })
      if (remaining !== undefined) remaining -= amount
    }
    if (remaining !== undefined && remaining > 0) throw new GiftVoucherError("GIFT_VOUCHER_REFUND_EXCEEDS_REDEEMED")
    const now = new Date()
    for (const { redemption, voucher, amount } of plan) {
      const current = await this.lockVoucher(knex, voucher.id)
      const balanceAfter = current.balance + amount
      if (balanceAfter > current.initial_amount) throw new GiftVoucherError("GIFT_VOUCHER_REFUND_EXCEEDS_REDEEMED")
      await knex("gift_voucher").where({ id: current.id }).update({ balance: balanceAfter, status: statusAfterCredit(current, balanceAfter, now), updated_at: now })
      await this.insertTransaction(knex, { voucher_id: current.id, type: "refunded", amount, balance_after: balanceAfter, order_id: input.order_id,
        reference_id: redemption.id, idempotency_key: `${input.idempotency_key}:${redemption.id}`, actor_id: input.actor_id, note: input.note })
      results.push({ voucher_id: current.id, amount_minor: amount, balance_after: balanceAfter })
    }
    return results
  }

  // --- Zneplatnění a expirace ----------------------------------------------

  @InjectTransactionManager()
  async voidVoucher(input: { id: string; reason: string; actor_id?: string | null }, @MedusaContext() context: Context = {}): Promise<GiftVoucherRow> {
    const knex = trx(context)
    const voucher = await this.lockVoucher(knex, input.id)
    if (voucher.status === "void") return voucher
    const now = new Date()
    const [row] = await knex("gift_voucher").where({ id: voucher.id })
      .update({ status: "void", balance: 0, voided_at: now, void_reason: input.reason, updated_at: now }).returning("*")
    await this.insertTransaction(knex, { voucher_id: voucher.id, type: "voided", amount: voucher.balance, balance_after: 0,
      idempotency_key: `void:${voucher.id}`, actor_id: input.actor_id, note: input.reason })
    return normalizeRow(row)
  }

  /** Storno objednávky, která poukaz koupila: nevyčerpaný poukaz se zneplatní, načatý se jen nahlásí. */
  async voidIssuedForCanceledOrder(orderId: string, reason: "order_canceled" | "order_refunded" = "order_canceled"): Promise<{ voided: string[]; used: string[] }> {
    const vouchers = (await this.listGiftVouchers({ source_order_id: orderId }, { take: 500 })).map(normalizeRow)
    const voided: string[] = []
    const used: string[] = []
    for (const voucher of vouchers) {
      if (voucher.status === "void") continue
      if (voucher.balance !== voucher.initial_amount) { used.push(voucher.id); continue }
      await this.voidVoucher({ id: voucher.id, reason })
      voided.push(voucher.id)
    }
    return { voided, used }
  }

  @InjectTransactionManager()
  async expireDue(at: Date = new Date(), @MedusaContext() context: Context = {}): Promise<number> {
    const knex = trx(context)
    const rows = await knex("gift_voucher").whereIn("status", ["active", "depleted"]).where("expires_at", "<=", at).whereNull("deleted_at")
      .forUpdate().skipLocked().limit(500)
    for (const row of rows) {
      await knex("gift_voucher").where({ id: row.id }).update({ status: "expired", updated_at: at })
      await this.insertTransaction(knex, { voucher_id: row.id, type: "expired", amount: Number(row.balance), balance_after: Number(row.balance),
        idempotency_key: `expire:${row.id}` })
    }
    return rows.length
  }

  // --- Doručení ------------------------------------------------------------

  async listDueDeliveries(today: string, limit = 100): Promise<GiftVoucherRow[]> {
    const pending = await this.listGiftVouchers({ delivery_status: ["pending", "scheduled", "failed"] }, { take: limit * 3, order: { created_at: "ASC" } })
    return pending.map(normalizeRow)
      .filter((v) => v.status !== "void" && v.delivery_attempts < 5 && (!v.delivery_date || v.delivery_date <= today))
      .slice(0, limit)
  }

  /** Atomicky „zabere“ doručení, aby dva běhy (subscriber + job) neposlaly e-mail dvakrát. */
  @InjectTransactionManager()
  async claimDelivery(id: string, today: string, @MedusaContext() context: Context = {}): Promise<GiftVoucherRow | null> {
    const knex = trx(context)
    const now = new Date()
    const [row] = await knex("gift_voucher").where({ id }).whereIn("delivery_status", ["pending", "scheduled", "failed"]).whereNot({ status: "void" })
      .where("delivery_attempts", "<", 5)
      .where((q: any) => q.whereNull("delivery_date").orWhere("delivery_date", "<=", today))
      .update({ delivery_status: "sent", delivered_at: now, delivery_attempts: knex.raw("delivery_attempts + 1"), updated_at: now }).returning("*")
    return row ? normalizeRow(row) : null
  }

  async markDeliveryFailed(id: string): Promise<void> {
    await this.updateGiftVouchers({ id, delivery_status: "failed", delivered_at: null })
  }

  /** Způsob „both“: PDF kupujícímu jde hned, nezávisle na datu doručení obdarovanému. Nejvýš jednou. */
  @InjectTransactionManager()
  async claimBuyerCopy(id: string, @MedusaContext() context: Context = {}): Promise<GiftVoucherRow | null> {
    const knex = trx(context)
    const [row] = await knex("gift_voucher").where({ id }).whereNot({ status: "void" })
      .whereRaw("(metadata->>'buyer_copy_sent_at') IS NULL")
      .update({ metadata: knex.raw("COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('buyer_copy_sent_at', to_jsonb(now()))"), updated_at: new Date() })
      .returning("*")
    return row ? normalizeRow(row) : null
  }

  async releaseBuyerCopy(id: string): Promise<void> {
    const voucher = await this.getVoucher(id)
    if (!voucher) return
    const { buyer_copy_sent_at: _sent, ...metadata } = voucher.metadata ?? {}
    await this.updateGiftVouchers({ id, metadata })
  }

  // --- Admin přehled ---------------------------------------------------------

  async listForAdmin(input: { status?: string; order_id?: string; limit: number; offset: number }) {
    const filters: Record<string, unknown> = {}
    if (input.status) filters.status = input.status
    if (input.order_id) filters.source_order_id = input.order_id
    const [rows, count] = await this.listAndCountGiftVouchers(filters, { take: input.limit, skip: input.offset, order: { created_at: "DESC" } })
    return { vouchers: rows.map((row) => maskedVoucher(normalizeRow(row))), count }
  }
}

export default GiftVoucherModuleService
