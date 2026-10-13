import { model } from "@medusajs/framework/utils"

export const BOOKING_STATUSES = ["held", "confirmed", "canceled", "completed"] as const

/**
 * Rezervace termínu konzultace. Všechny typy (produkty) sdílí jeden kalendář `calendar_id`:
 * překryv i zámek se kontrolují nad kalendářem v `BookingModuleService.assertSlotAvailable`,
 * částečný unikátní index (calendar_id, starts_at) nad held/confirmed je poslední pojistka.
 */
const Booking = model
  .define("booking", {
    id: model.id({ prefix: "bkg" }).primaryKey(),
    customer_id: model.text(),
    product_id: model.text(),
    calendar_id: model.text().default("lucia"),
    order_id: model.text().nullable(),
    status: model.enum([...BOOKING_STATUSES]).default("held"),
    starts_at: model.dateTime(),
    ends_at: model.dateTime(),
    held_until: model.dateTime().nullable(),
    canceled_at: model.dateTime().nullable(),
    cancel_reason: model.text().nullable(),
    notes: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["calendar_id", "starts_at"], unique: true, where: "deleted_at IS NULL AND status IN ('held','confirmed')" },
    { on: ["customer_id", "status"] },
    { on: ["order_id"] },
  ])

export default Booking
