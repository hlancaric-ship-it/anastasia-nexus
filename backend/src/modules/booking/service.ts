import { InjectTransactionManager, MedusaContext, MedusaError, MedusaService } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import Booking from "./models/booking"
import { clampHoldMinutes, isHoldExpired, UNIQUE_VIOLATION } from "./policy"
import type { BookingDTO, ConfirmBookingInput, HoldSlotInput } from "./types"

export class SlotTakenError extends Error {
  constructor() {
    super("SLOT_ALREADY_TAKEN")
  }
}

class BookingModuleService extends MedusaService({ Booking }) {
  private async assertSlotAvailable(input: HoldSlotInput, context: Context) {
    const knex = (context.transactionManager as any)?.getTransactionContext()
    if (!knex) throw new Error("BOOKING_TRANSACTION_REQUIRED")
    await knex.raw("SET LOCAL lock_timeout = '3s'")
    // A slot may not have a row yet. Serialize inserts per product, including
    // different start times whose consultation/buffer intervals overlap.
    await knex.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`booking:${input.product_id}`])
    const now = new Date()
    await knex("booking").where({ product_id: input.product_id, status: "held" }).whereNull("deleted_at")
      .where("held_until", "<=", now).whereRaw("metadata->>'checkout_cart_id' IS NULL")
      .update({ status: "canceled", canceled_at: now, cancel_reason: "hold_expired", updated_at: now })
    const busy = await knex("booking").where({ product_id: input.product_id }).whereNull("deleted_at")
      .whereIn("status", ["held", "confirmed"])
      .where("starts_at", "<", new Date(input.ends_at.getTime() + (input.bufferMinutes ?? 0) * 60000))
      .whereRaw("ends_at + COALESCE((metadata->>'buffer_minutes')::integer, 0) * interval '1 minute' > ?", [input.starts_at])
      .first("id")
    if (busy) throw new SlotTakenError()
  }

  private async lockedBooking(id: string, context: Context): Promise<BookingDTO> {
    const knex = (context.transactionManager as any)?.getTransactionContext()
    if (!knex) throw new Error("BOOKING_TRANSACTION_REQUIRED")
    await knex.raw("SET LOCAL lock_timeout = '3s'")
    const booking = await knex("booking").where({ id }).whereNull("deleted_at").forUpdate().first()
    if (!booking) throw new MedusaError(MedusaError.Types.NOT_FOUND, "BOOKING_NOT_FOUND")
    return booking
  }

  /** Authenticated API binds a hold to a cart before checkout may claim it. */
  @InjectTransactionManager()
  async authorizeCart(input: { id: string; customer_id: string; cart_id: string }, @MedusaContext() context: Context = {}) {
    const booking = await this.lockedBooking(input.id, context)
    if (booking.customer_id !== input.customer_id) throw new MedusaError(MedusaError.Types.NOT_FOUND, "BOOKING_NOT_FOUND")
    if (booking.status !== "held" || isHoldExpired(booking) || booking.metadata?.checkout_cart_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "BOOKING_NOT_AVAILABLE")
    await this.updateBookings({ id: booking.id, metadata: { ...booking.metadata, authorized_cart_id: input.cart_id } }, context)
  }

  /** Persist a claim under a row lock, so different carts cannot buy the same hold. */
  @InjectTransactionManager()
  async claimForCheckout(input: { id: string; cart_id: string; customer_id: string; product_id: string }, @MedusaContext() context: Context = {}) {
    const booking = await this.lockedBooking(input.id, context)
    if (booking.customer_id !== input.customer_id || booking.product_id !== input.product_id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_OWNER_OR_PRODUCT_MISMATCH")
    if (booking.status !== "held" || isHoldExpired(booking)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_NOT_AVAILABLE")
    if (booking.metadata?.authorized_cart_id !== input.cart_id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_CART_NOT_AUTHORIZED")
    if (booking.metadata?.checkout_cart_id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_ALREADY_IN_CHECKOUT")
    const claim = { id: booking.id, cart_id: input.cart_id, held_until: booking.held_until }
    await this.updateBookings({ id: booking.id, held_until: null, metadata: { ...booking.metadata, checkout_cart_id: input.cart_id } }, context)
    return claim
  }

  @InjectTransactionManager()
  async releaseCheckoutClaim(claim: { id: string; cart_id: string; held_until: Date | string | null }, @MedusaContext() context: Context = {}) {
    const booking = await this.lockedBooking(claim.id, context)
    if (booking.order_id || booking.metadata?.checkout_cart_id !== claim.cart_id) return
    await this.updateBookings({ id: booking.id, held_until: claim.held_until ? new Date(claim.held_until) : null,
      metadata: { ...booking.metadata, checkout_cart_id: null } }, context)
  }

  /** An unpaid order keeps its term; only a captured payment confirms it. */
  @InjectTransactionManager()
  async attachCheckoutOrder(input: { id: string; cart_id: string; order_id: string; customer_id: string; product_ids: string[]; paid: boolean; canceled?: boolean }, @MedusaContext() context: Context = {}) {
    const booking = await this.lockedBooking(input.id, context)
    if (booking.metadata?.checkout_cart_id !== input.cart_id || booking.customer_id !== input.customer_id || !input.product_ids.includes(booking.product_id)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_ORDER_MISMATCH")
    if (booking.order_id && booking.order_id !== input.order_id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_ORDER_MISMATCH")
    if (booking.status === "canceled" && booking.order_id === input.order_id) return booking
    if (!["held", "confirmed"].includes(booking.status)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_NOT_AVAILABLE")
    return await this.updateBookings({ id: booking.id, order_id: input.order_id,
      status: input.canceled ? "canceled" : input.paid ? "confirmed" : booking.status, held_until: null,
      ...(input.canceled ? { canceled_at: new Date(), cancel_reason: "order_canceled" } : {}) }, context)
  }
  /**
   * Zarezervuje termín na dobu holdu (výchozí 15 min, max 60), dokud zákaznice nezaplatí.
   * Transakční zámek produktu chrání i překrývající se začátky a pauzy; unikátní
   * index (product_id, starts_at) zůstává další ochranou shodného termínu.
   */
  @InjectTransactionManager()
  async holdSlot(input: HoldSlotInput, @MedusaContext() context: Context = {}): Promise<BookingDTO> {
    if (!input.customer_id || !input.product_id) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "customer_id a product_id jsou povinné")
    }
    if (!(input.ends_at.getTime() > input.starts_at.getTime())) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "ends_at musí být po starts_at")
    }
    if (input.bufferMinutes !== undefined && (!Number.isInteger(input.bufferMinutes) || input.bufferMinutes < 0)) throw new Error("INVALID_BOOKING_BUFFER")
    const heldUntil = new Date(Date.now() + clampHoldMinutes(input.holdMinutes) * 60_000)
    try {
      await this.assertSlotAvailable(input, context)
      return (await this.createBookings({
        customer_id: input.customer_id,
        product_id: input.product_id,
        status: "held",
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        held_until: heldUntil,
        metadata: { buffer_minutes: input.bufferMinutes ?? 0 },
      }, context)) as unknown as BookingDTO
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (UNIQUE_VIOLATION.test(message)) throw new SlotTakenError()
      throw error
    }
  }

  /** Potvrzení po zaplacení objednávky. Idempotentní: již potvrzená stejná objednávka se vrátí beze změny. */
  async confirm(input: ConfirmBookingInput): Promise<BookingDTO> {
    const current = (await this.retrieveBooking(input.id)) as unknown as BookingDTO
    if (current.status === "confirmed" && current.order_id === input.order_id) return current
    if (current.status !== "held") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Rezervaci ve stavu ${current.status} nelze potvrdit`)
    }
    if (isHoldExpired(current)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Podržení termínu vypršelo")
    return (await this.updateBookings({ id: input.id, status: "confirmed", order_id: input.order_id, held_until: null })) as unknown as BookingDTO
  }

  /** Zrušení (zákaznicí, adminem nebo zrušením objednávky). Idempotentní. */
  @InjectTransactionManager()
  async cancel(id: string, reason: string, @MedusaContext() context: Context = {}): Promise<BookingDTO> {
    const current = await this.lockedBooking(id, context)
    if (current.status === "canceled") return current
    if (current.metadata?.checkout_cart_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "BOOKING_CANCEL_ORDER_FIRST")
    return (await this.updateBookings({ id, status: "canceled", canceled_at: new Date(), cancel_reason: reason }, context)) as unknown as BookingDTO
  }

  async cancelByOrder(orderId: string, reason: string): Promise<number> {
    if (!orderId) return 0
    const active = (await this.listBookings({ order_id: orderId, status: ["held", "confirmed"] }, { take: 50 })) as unknown as BookingDTO[]
    if (!active.length) return 0
    const now = new Date()
    await this.updateBookings(active.map((b) => ({ id: b.id, status: "canceled" as const, canceled_at: now, cancel_reason: reason })))
    return active.length
  }

  /** Uvolní prošlé holdy, aby znovu vstoupily do nabídky volných termínů. Volá cron/subscriber. */
  @InjectTransactionManager()
  async expireHold(id: string, at: Date, @MedusaContext() context: Context = {}): Promise<boolean> {
    const booking = await this.lockedBooking(id, context)
    if (!isHoldExpired(booking, at) || booking.metadata?.checkout_cart_id) return false
    await this.updateBookings({ id, status: "canceled", canceled_at: at, cancel_reason: "hold_expired" }, context)
    return true
  }

  async expireStaleHolds(at: Date = new Date()): Promise<number> {
    const stale = (await this.listBookings({ status: "held" }, { take: 500 })) as unknown as BookingDTO[]
    const expired = stale.filter((b) => isHoldExpired(b, at))
    if (!expired.length) return 0
    let count = 0
    for (const booking of expired) if (await this.expireHold(booking.id, at)) count++
    return count
  }

  /** Aktivní (held nevypršelé + confirmed) rezervace v okně, pro generateSlots (parametr `busy`). */
  async listActiveInRange(productId: string, fromDate: Date, toDate: Date): Promise<Array<{ start: Date; end: Date }>> {
    const rows = (await this.listBookings(
      { product_id: productId, status: ["held", "confirmed"], starts_at: { $gte: fromDate, $lte: toDate } },
      { take: 500 }
    )) as unknown as BookingDTO[]
    const now = new Date()
    return rows.filter((b) => b.status === "confirmed" || !isHoldExpired(b, now)).map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }))
  }
}

export default BookingModuleService
