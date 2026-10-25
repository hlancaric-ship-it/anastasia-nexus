import { InjectTransactionManager, MedusaContext, MedusaError, MedusaService } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import Booking from "./models/booking"
import BookingAvailability from "./models/booking-availability"
import BookingRequest from "./models/booking-request"
import { BOOKING_TIMEZONE, CALENDAR_ID, weekDates, weekWindows, type WeekInput } from "./availability"
import { clampHoldMinutes, isHoldExpired, UNIQUE_VIOLATION } from "./policy"
import { addDays, isWithinWindows, utcToLocalDate, zonedToUtc, type AvailabilityWindow, type BusyInterval } from "./slots"
import type { BookingDTO, ConfirmBookingInput, HoldSlotInput } from "./types"

export class SlotTakenError extends Error {
  constructor() {
    super("SLOT_ALREADY_TAKEN")
  }
}

/** Požadovaný čas neleží v žádném volném úseku kalendáře (např. úsek mezitím odebrán). */
export class SlotNotAvailableError extends Error {
  constructor() {
    super("SLOT_NOT_AVAILABLE")
  }
}

export type CalendarBookingRow = {
  id: string
  product_id: string
  customer_id: string
  order_id: string | null
  status: "held" | "confirmed"
  starts_at: Date
  ends_at: Date
  held_until: Date | null
  buffer_minutes: number
  in_checkout: boolean
}

/** Uložení týdne by vyřadilo aktivní rezervace z volných úseků. */
export class AvailabilityConflictError extends Error {
  constructor(public readonly bookings: CalendarBookingRow[]) {
    super("AVAILABILITY_CONFLICTS_WITH_BOOKINGS")
  }
}

const ACTIVE = ["held", "confirmed"] as const
/** Hold hosťa nemá zákazníka, vlastníkom je košík; pri objednávke sa prepíše na zákazníka objednávky. */
export const guestOwner = (cartId: string) => `guest:${cartId}`
/** Schválený termín zo žiadosti patrí žiadosti, kým si ho klient z odkazu v e-maile nevezme do košíka. */
export const requestOwner = (requestId: string) => `request:${requestId}`
export class RequestStateError extends Error {
  constructor(readonly code: string) { super(code); this.name = "RequestStateError" }
}
const ownedBy = (booking: { customer_id: string }, customerId: string, cartId: string) =>
  booking.customer_id === customerId || booking.customer_id === guestOwner(cartId)
const bufferOf = (metadata: unknown): number => {
  const n = Number((metadata as Record<string, unknown> | null)?.buffer_minutes ?? 0)
  return Number.isInteger(n) && n >= 0 ? n : 0
}

class BookingModuleService extends MedusaService({ Booking, BookingAvailability, BookingRequest }) {
  private transactionKnex(context: Context) {
    const knex = (context.transactionManager as any)?.getTransactionContext()
    if (!knex) throw new Error("BOOKING_TRANSACTION_REQUIRED")
    return knex
  }

  /**
   * Jeden zámek na celý kalendář: serializuje holdy všech typů konzultací i úpravy volných úseků,
   * takže se nepotkají ani různé produkty s překrývajícími se časy, ani hold s odebraným úsekem.
   */
  private async lockCalendar(knex: any, calendarId: string) {
    await knex.raw("SET LOCAL lock_timeout = '3s'")
    await knex.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`booking:calendar:${calendarId}`])
  }

  private async assertSlotAvailable(input: HoldSlotInput, context: Context) {
    const knex = this.transactionKnex(context)
    const calendarId = input.calendar_id ?? CALENDAR_ID
    const timezone = input.timezone ?? BOOKING_TIMEZONE
    await this.lockCalendar(knex, calendarId)
    const now = new Date()
    await knex("booking").where({ calendar_id: calendarId, status: "held" }).whereNull("deleted_at")
      .where("held_until", "<=", now).whereRaw("metadata->>'checkout_cart_id' IS NULL")
      .update({ status: "canceled", canceled_at: now, cancel_reason: "hold_expired", updated_at: now })
    // Okna se čtou až pod zámkem: úsek odebraný adminem mezitím nesmí projít (fail-closed).
    const windows: AvailabilityWindow[] = await knex("booking_availability")
      .where({ calendar_id: calendarId, date: utcToLocalDate(input.starts_at, timezone) }).whereNull("deleted_at")
      .select("date", "start_time", "end_time")
    if (!isWithinWindows(input.starts_at, input.ends_at, windows, timezone)) throw new SlotNotAvailableError()
    const busy = await knex("booking").where({ calendar_id: calendarId }).whereNull("deleted_at")
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

  /** Hosť: nový hold rovno patrí košíku, predchádzajúci nezaplatený hold toho istého košíka sa uvoľní. */
  @InjectTransactionManager()
  async holdGuestSlot(input: HoldSlotInput & { cart_id: string }, @MedusaContext() context: Context = {}): Promise<BookingDTO> {
    if (!input.cart_id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "cart_id je povinné")
    const owner = guestOwner(input.cart_id)
    const knex = this.transactionKnex(context)
    const now = new Date()
    await knex("booking").where({ customer_id: owner, status: "held" }).whereNull("deleted_at")
      .whereRaw("metadata->>'checkout_cart_id' IS NULL").whereRaw("metadata->>'request_id' IS NULL")
      .update({ status: "canceled", canceled_at: now, cancel_reason: "replaced", updated_at: now })
    const booking = await this.holdSlot({ ...input, customer_id: owner }, context)
    return (await this.updateBookings({ id: booking.id, metadata: { ...booking.metadata, authorized_cart_id: input.cart_id } }, context)) as unknown as BookingDTO
  }

  /** Persist a claim under a row lock, so different carts cannot buy the same hold. */
  @InjectTransactionManager()
  async claimForCheckout(input: { id: string; cart_id: string; customer_id: string; product_id: string }, @MedusaContext() context: Context = {}) {
    const booking = await this.lockedBooking(input.id, context)
    if (!ownedBy(booking, input.customer_id, input.cart_id) || booking.product_id !== input.product_id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_OWNER_OR_PRODUCT_MISMATCH")
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
    if (booking.metadata?.checkout_cart_id !== input.cart_id || !ownedBy(booking, input.customer_id, input.cart_id) || !input.product_ids.includes(booking.product_id)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_ORDER_MISMATCH")
    if (booking.order_id && booking.order_id !== input.order_id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_ORDER_MISMATCH")
    if (booking.status === "canceled" && booking.order_id === input.order_id) return booking
    if (!["held", "confirmed"].includes(booking.status)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_NOT_AVAILABLE")
    return await this.updateBookings({ id: booking.id, order_id: input.order_id, customer_id: input.customer_id,
      status: input.canceled ? "canceled" : input.paid ? "confirmed" : booking.status, held_until: null,
      ...(input.canceled ? { canceled_at: new Date(), cancel_reason: "order_canceled" } : {}) }, context)
  }
  /**
   * Zarezervuje termín na dobu holdu (výchozí 15 min, max 60), dokud zákazník nezaplatí.
   * Transakční zámek kalendáře chrání překrývající se začátky a pauzy napříč všemi typy;
   * unikátní index (calendar_id, starts_at) zůstává další ochranou shodného termínu.
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
    const tenant_id = input.tenant_id ?? "default"
    const heldUntil = new Date(Date.now() + clampHoldMinutes(input.holdMinutes) * 60_000)
    try {
      await this.assertSlotAvailable(input, context)
      return (await this.createBookings({
        customer_id: input.customer_id,
        product_id: input.product_id,
        calendar_id: input.calendar_id ?? CALENDAR_ID,
        status: "held",
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        held_until: heldUntil,
        tenant_id,
        metadata: { buffer_minutes: input.bufferMinutes ?? 0 },
      }, context)) as unknown as BookingDTO
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (UNIQUE_VIOLATION.test(message)) throw new SlotTakenError()
      throw error
    }
  }

  private async lockedRequest(id: string, context: Context) {
    const knex = this.transactionKnex(context)
    await knex.raw("SET LOCAL lock_timeout = '3s'")
    const request = await knex("booking_request").where({ id }).whereNull("deleted_at").forUpdate().first()
    if (!request) throw new MedusaError(MedusaError.Types.NOT_FOUND, "BOOKING_REQUEST_NOT_FOUND")
    return request
  }

  /**
   * Lucia schváli žiadosť: termín sa podrží na `holdHours` (mimo bežných okien dostupnosti, rozhodla o ňom ona),
   * kontroluje sa len prekryv s inými aktívnymi termínmi pod zámkom kalendára.
   */
  @InjectTransactionManager()
  async approveRequest(input: { id: string; token_hash: string; bufferMinutes: number; holdHours?: number }, @MedusaContext() context: Context = {}) {
    const request = await this.lockedRequest(input.id, context)
    if (request.status !== "pending") throw new RequestStateError("REQUEST_NOT_PENDING")
    const knex = this.transactionKnex(context)
    await this.lockCalendar(knex, request.calendar_id)
    const now = new Date()
    await knex("booking").where({ calendar_id: request.calendar_id, status: "held" }).whereNull("deleted_at")
      .where("held_until", "<=", now).whereRaw("metadata->>'checkout_cart_id' IS NULL")
      .update({ status: "canceled", canceled_at: now, cancel_reason: "hold_expired", updated_at: now })
    const startsAt = new Date(request.starts_at)
    const endsAt = new Date(request.ends_at)
    const busy = await knex("booking").where({ calendar_id: request.calendar_id }).whereNull("deleted_at")
      .whereIn("status", ["held", "confirmed"])
      .where("starts_at", "<", new Date(endsAt.getTime() + input.bufferMinutes * 60000))
      .whereRaw("ends_at + COALESCE((metadata->>'buffer_minutes')::integer, 0) * interval '1 minute' > ?", [startsAt])
      .first("id")
    if (busy) throw new SlotTakenError()
    const hours = Math.min(Math.max(Math.trunc(input.holdHours ?? 72), 1), 24 * 14)
    let booking: BookingDTO
    try {
      booking = (await this.createBookings({
        customer_id: requestOwner(request.id), product_id: request.product_id, calendar_id: request.calendar_id,
        status: "held", starts_at: startsAt, ends_at: endsAt, held_until: new Date(now.getTime() + hours * 3_600_000),
        tenant_id: "default", metadata: { buffer_minutes: input.bufferMinutes, request_id: request.id },
      }, context)) as unknown as BookingDTO
    } catch (error) {
      if (UNIQUE_VIOLATION.test(error instanceof Error ? error.message : String(error))) throw new SlotTakenError()
      throw error
    }
    await this.updateBookingRequests({ id: request.id, status: "approved", booking_id: booking.id, token_hash: input.token_hash, decided_at: now }, context)
    return { request: { ...request, status: "approved", booking_id: booking.id, decided_at: now }, booking }
  }

  @InjectTransactionManager()
  async declineRequest(input: { id: string; reason?: string | null }, @MedusaContext() context: Context = {}) {
    const request = await this.lockedRequest(input.id, context)
    if (request.status !== "pending") throw new RequestStateError("REQUEST_NOT_PENDING")
    const now = new Date()
    await this.updateBookingRequests({ id: request.id, status: "declined", decline_reason: input.reason ?? null, decided_at: now }, context)
    return { ...request, status: "declined", decline_reason: input.reason ?? null, decided_at: now }
  }

  /**
   * Klient z odkazu v e-maile si schválený termín vezme do košíka. Vlastníkom sa stane prihlásený zákazník
   * alebo hosťovský košík. Opakované otvorenie odkazu (iné zariadenie) termín presunie, kým nie je v pokladni.
   */
  @InjectTransactionManager()
  async claimApprovedRequest(input: { id: string; token_hash: string; cart_id: string; owner: string }, @MedusaContext() context: Context = {}) {
    const request = await this.lockedRequest(input.id, context)
    if (request.status !== "approved" || !request.booking_id || !request.token_hash || request.token_hash !== input.token_hash) throw new RequestStateError("REQUEST_NOT_APPROVED")
    const booking = await this.lockedBooking(request.booking_id, context)
    if (booking.status !== "held" || isHoldExpired(booking)) throw new RequestStateError("REQUEST_EXPIRED")
    if (booking.metadata?.checkout_cart_id && booking.metadata.checkout_cart_id !== input.cart_id) throw new RequestStateError("REQUEST_IN_CHECKOUT")
    return (await this.updateBookings({ id: booking.id, customer_id: input.owner, metadata: { ...booking.metadata, authorized_cart_id: input.cart_id } }, context)) as unknown as BookingDTO
  }

  /** Hosť uvoľní termín zo žiadosti: nevracia sa do ponuky, len späť žiadosti (odkaz v e-maile ostáva platný). */
  @InjectTransactionManager()
  async releaseRequestBooking(id: string, @MedusaContext() context: Context = {}) {
    const booking = await this.lockedBooking(id, context)
    if (!booking.metadata?.request_id || booking.metadata?.checkout_cart_id) return false
    await this.updateBookings({ id, customer_id: requestOwner(String(booking.metadata.request_id)), metadata: { ...booking.metadata, authorized_cart_id: null } }, context)
    return true
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

  /** Zrušenie (zákazníkom, adminom alebo zrušením objednávky). Idempotentné. */
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

  /** Aktivní (held nevypršelé nebo v checkoutu + confirmed) rezervace kalendáře, které zasahují do [from, to). */
  async listCalendarBookings(fromDate: Date, toDate: Date, calendarId: string = CALENDAR_ID, context: Context = {}): Promise<CalendarBookingRow[]> {
    const rows = (await this.listBookings(
      { calendar_id: calendarId, status: [...ACTIVE], starts_at: { $lt: toDate }, ends_at: { $gt: fromDate } },
      { take: 2000, order: { starts_at: "ASC" } },
      context
    )) as unknown as BookingDTO[]
    const now = new Date()
    return rows.filter((b) => b.status === "confirmed" || !isHoldExpired(b, now)).map((b) => ({
      id: b.id, product_id: b.product_id, customer_id: b.customer_id, order_id: b.order_id,
      status: b.status as "held" | "confirmed", starts_at: new Date(b.starts_at), ends_at: new Date(b.ends_at),
      held_until: b.held_until ? new Date(b.held_until) : null, buffer_minutes: bufferOf(b.metadata),
      in_checkout: Boolean(b.metadata?.checkout_cart_id),
    }))
  }

  /** Obsazené úseky celého kalendáře (všechny typy) pro generateSlots, včetně pauzy každé rezervace. */
  async listActiveInRange(fromDate: Date, toDate: Date, calendarId: string = CALENDAR_ID): Promise<BusyInterval[]> {
    return (await this.listCalendarBookings(fromDate, toDate, calendarId))
      .map((b) => ({ start: b.starts_at, end: b.ends_at, bufferMinutes: b.buffer_minutes }))
  }

  /** Volné úseky kalendáře pro lokální dny [fromDate, toDate] (včetně). */
  async listAvailability(fromDate: string, toDate: string, calendarId: string = CALENDAR_ID): Promise<AvailabilityWindow[]> {
    const rows = (await this.listBookingAvailabilities(
      { calendar_id: calendarId, date: { $gte: fromDate, $lte: toDate } },
      { take: 2000, order: { date: "ASC", start_time: "ASC" } }
    )) as unknown as AvailabilityWindow[]
    return rows.map((r) => ({ date: r.date, start_time: r.start_time, end_time: r.end_time }))
  }

  /**
   * Nahradí volné úseky celého týdne (validovaný vstup). Pod zámkem kalendáře odmítne uložení,
   * pokud by některá aktivní rezervace (held/confirmed, včetně rozpracovaného checkoutu)
   * přestala ležet celá v některém úseku – obsazený čas nejde smazat ani zkrátit.
   */
  @InjectTransactionManager()
  async replaceWeekAvailability(
    input: WeekInput & { calendar_id?: string; timezone?: string },
    @MedusaContext() context: Context = {}
  ): Promise<AvailabilityWindow[]> {
    const knex = this.transactionKnex(context)
    const calendarId = input.calendar_id ?? CALENDAR_ID
    const timezone = input.timezone ?? BOOKING_TIMEZONE
    const dates = weekDates(input.week_start)
    await this.lockCalendar(knex, calendarId)
    const from = zonedToUtc(dates[0], 0, timezone) ?? new Date(`${dates[0]}T00:00:00Z`)
    const end = addDays(dates[6], 1)
    const to = zonedToUtc(end, 0, timezone) ?? new Date(`${end}T00:00:00Z`)
    const windows = weekWindows(input)
    const active = await this.listCalendarBookings(from, to, calendarId, context)
    const conflicts = active.filter((b) => !isWithinWindows(b.starts_at, b.ends_at, windows, timezone))
    if (conflicts.length) throw new AvailabilityConflictError(conflicts)
    await knex("booking_availability").where({ calendar_id: calendarId }).whereIn("date", dates).whereNull("deleted_at").del()
    if (windows.length) {
      await this.createBookingAvailabilities(windows.map((w) => ({ calendar_id: calendarId, ...w })), context)
    }
    return windows
  }
}

export default BookingModuleService
