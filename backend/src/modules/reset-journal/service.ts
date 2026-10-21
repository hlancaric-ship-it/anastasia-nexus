import { InjectTransactionManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import ResetJournalEntry from "./models/reset-journal-entry"
import {
  JournalError,
  MAX_JOURNAL_ENTRIES_PER_DAY,
  dayRange,
  normalizeMetrics,
  normalizeWeek,
  parseCalendarDate,
  todayInZone,
} from "./policy"
import type { CreateJournalEntryInput, ResetJournalEntryDTO, UpdateJournalEntryInput } from "./types"
import type { JournalMetric } from "../../lib/reset-program/config"

const TABLE = "reset_journal_entry"

/**
 * Zrkadielko – záznamy zákazníčky (členská zóna RESET 40+).
 *
 * Bezpečnostná pravidlo: KAŽDÝ dotaz je ohraničený `customer_id` (a programom),
 * takže cudzí záznam sa nedá prečítať ani upraviť ani zmazať – ani cez ID z=requestu.
 * Zápis, úprava a zmazanie prebiehajú v transakcii s Advisory zámkom zákazníčky,
 * aby sa denný limit záznamov dal dodržať aj pri súbežných požiadavkách.
 */
class ResetJournalModuleService extends MedusaService({ ResetJournalEntry }) {
  private transactionKnex(context: Context): any {
    const knex = (context.transactionManager as any)?.getTransactionContext()
    if (!knex) throw new Error("RESET_JOURNAL_TRANSACTION_REQUIRED")
    return knex
  }

  /** Vlastné záznamy zákazníčky (iba jej vlastné). */
  async listEntries(
    customerId: string,
    program: string,
    pagination: { limit?: number; offset?: number } = {},
    context: Context = {},
  ): Promise<{ data: ResetJournalEntryDTO[]; count: number }> {
    const limit = Math.min(Math.max(Math.trunc(pagination.limit ?? 50), 1), 200)
    const offset = Math.max(Math.trunc(pagination.offset ?? 0), 0)
    const [data, count] = (await this.listAndCountResetJournalEntries(
      { customer_id: customerId, program },
      { take: limit, skip: offset, order: { entry_date: "DESC", created_at: "DESC" } },
      context,
    )) as unknown as [ResetJournalEntryDTO[], number]
    return { data, count }
  }

  /** Koľko záznamov má zákazníčka v danom kalendárnom dni (bez započítania `excludeId`). */
  private async countEntriesForDate(
    customerId: string,
    program: string,
    iso: string,
    context: Context,
    excludeId?: string | null,
  ): Promise<number> {
    const knex = this.transactionKnex(context)
    const { from, to } = dayRange(iso)
    const query = knex(TABLE)
      .where({ customer_id: customerId, program })
      .whereNull("deleted_at")
      .where("entry_date", ">=", from)
      .where("entry_date", "<", to)
    if (excludeId) query.whereNot("id", excludeId)
    const row = await query.count("* as count").first()
    return Number(row?.count ?? 0)
  }

  /** Nový záznam. Den spadá do minulosti a do dneška, hodnoty sú 1–10 podľa konfigurácie metrik. */
  @InjectTransactionManager()
  async createEntry(
    input: CreateJournalEntryInput,
    config: readonly JournalMetric[],
    @MedusaContext() context: Context = {},
  ): Promise<ResetJournalEntryDTO> {
    if (!input.customer_id || !input.program) throw new JournalError("JOURNAL_ENTRY_INVALID")
    const metrics = normalizeMetrics(input.metrics, config)
    const day = parseCalendarDate(input.entry_date)
    if (!day) throw new JournalError("JOURNAL_DATE_INVALID")
    if (day.iso > todayInZone()) throw new JournalError("JOURNAL_DATE_IN_FUTURE")
    const week = normalizeWeek(input.week)

    const knex = this.transactionKnex(context)
    await knex.raw("SET LOCAL lock_timeout = '3s'")
    await knex.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`reset-journal:${input.customer_id}`])
    const sameDay = await this.countEntriesForDate(input.customer_id, input.program, day.iso, context)
    if (sameDay >= MAX_JOURNAL_ENTRIES_PER_DAY) throw new JournalError("JOURNAL_DAILY_LIMIT", 429)

    const created = await this.createResetJournalEntries({
      customer_id: input.customer_id,
      program: input.program,
      entitlement_id: input.entitlement_id ?? null,
      week,
      entry_date: day.date,
      metrics,
    }, context)
    return created as unknown as ResetJournalEntryDTO
  }

  /**
   * Úprava vlastného záznamu. Vráti `null`, keď záznam neexistuje alebo patrí inej zákazníčke
   * (klient dostane 404 – cudzí záznam sa nijak nerozlišuje od neexistujúceho).
   */
  @InjectTransactionManager()
  async updateEntry(
    id: string,
    customerId: string,
    program: string,
    patch: UpdateJournalEntryInput,
    config: readonly JournalMetric[],
    @MedusaContext() context: Context = {},
  ): Promise<ResetJournalEntryDTO | null> {
    const [current] = (await this.listResetJournalEntries(
      { id, customer_id: customerId, program },
      { take: 1 },
      context,
    )) as unknown as ResetJournalEntryDTO[]
    if (!current) return null

    const data: Record<string, unknown> = {}
    if (patch.metrics !== undefined) data.metrics = normalizeMetrics(patch.metrics, config)
    if (patch.week !== undefined) data.week = normalizeWeek(patch.week)
    let targetIso = parseCalendarDate(current.entry_date)?.iso ?? null
    if (patch.entry_date !== undefined) {
      const day = parseCalendarDate(patch.entry_date)
      if (!day) throw new JournalError("JOURNAL_DATE_INVALID")
      if (day.iso > todayInZone()) throw new JournalError("JOURNAL_DATE_IN_FUTURE")
      data.entry_date = day.date
      targetIso = day.iso
    }
    if (!Object.keys(data).length) return current

    const knex = this.transactionKnex(context)
    await knex.raw("SET LOCAL lock_timeout = '3s'")
    await knex.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`reset-journal:${customerId}`])
    if (targetIso && targetIso !== parseCalendarDate(current.entry_date)?.iso) {
      const sameDay = await this.countEntriesForDate(customerId, program, targetIso, context, id)
      if (sameDay >= MAX_JOURNAL_ENTRIES_PER_DAY) throw new JournalError("JOURNAL_DAILY_LIMIT", 429)
    }

    const updated = await this.updateResetJournalEntries({ id, ...data }, context)
    return updated as unknown as ResetJournalEntryDTO
  }

  /**
   * Zmazanie vlastného záznamu. Záznam sa odstráni natvrdo (soft delete by nechal
   * údaje o zdraví v databáze) a len vtedy, keď patrí zákazníčke.
   */
  @InjectTransactionManager()
  async deleteEntry(
    id: string,
    customerId: string,
    program: string,
    @MedusaContext() context: Context = {},
  ): Promise<boolean> {
    const knex = this.transactionKnex(context)
    const deleted = await knex(TABLE)
      .where({ id, customer_id: customerId, program })
      .whereNull("deleted_at")
      .delete()
    return Number(deleted) > 0
  }
}

export default ResetJournalModuleService
