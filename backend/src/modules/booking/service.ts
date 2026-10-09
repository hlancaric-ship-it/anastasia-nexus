import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Booking from "./models/booking"
import { clampHoldMinutes, isHoldExpired, UNIQUE_VIOLATION } from "./policy"
import type { BookingDTO, ConfirmBookingInput, HoldSlotInput } from "./types"

export class SlotTakenError extends Error {
  constructor() {
    super("SLOT_ALREADY_TAKEN")
  }
}

class BookingModuleService extends MedusaService({ Booking }) {
  /**
   * Zarezervuje termín na dobu holdu (výchozí 15 min, max 60), dokud zákaznice nezaplatí.
   * Spoléhá na DB unikátní index (product_id, starts_at) nad aktivními stavy: souběžný
   * pokus o STEJNÝ termín skončí SlotTakenError, nikdy dvěma aktivními rezervacemi.
   */
  async holdSlot(input: HoldSlotInput): Promise<BookingDTO> {
    if (!input.customer_id || !input.product_id) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "customer_id a product_id jsou povinné")
    }
    if (!(input.ends_at.getTime() > input.starts_at.getTime())) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "ends_at musí být po starts_at")
    }
    const heldUntil = new Date(Date.now() + clampHoldMinutes(input.holdMinutes) * 60_000)
    try {
      return (await this.createBookings({
        customer_id: input.customer_id,
        product_id: input.product_id,
        status: "held",
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        held_until: heldUntil,
      })) as unknown as BookingDTO
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
  async cancel(id: string, reason: string): Promise<BookingDTO> {
    const current = (await this.retrieveBooking(id)) as unknown as BookingDTO
    if (current.status === "canceled") return current
    return (await this.updateBookings({ id, status: "canceled", canceled_at: new Date(), cancel_reason: reason })) as unknown as BookingDTO
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
  async expireStaleHolds(at: Date = new Date()): Promise<number> {
    const stale = (await this.listBookings({ status: "held" }, { take: 500 })) as unknown as BookingDTO[]
    const expired = stale.filter((b) => isHoldExpired(b, at))
    if (!expired.length) return 0
    await this.updateBookings(expired.map((b) => ({ id: b.id, status: "canceled" as const, canceled_at: at, cancel_reason: "hold_expired" })))
    return expired.length
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
