import { model } from "@medusajs/framework/utils"

export const BOOKING_STATUSES = ["held", "confirmed", "canceled", "completed"] as const

/**
 * Rezervace termínu konzultace. Dvojitou rezervaci téhož termínu brání částečný
 * unikátní index na (product_id, starts_at) nad aktivními stavy (held/confirmed).
 */
const Booking = model
  .define("booking", {
    id: model.id({ prefix: "bkg" }).primaryKey(),
    customer_id: model.text(),
    product_id: model.text(),
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
    { on: ["product_id", "starts_at"], unique: true, where: "deleted_at IS NULL AND status IN ('held','confirmed')" },
    { on: ["customer_id", "status"] },
    { on: ["order_id"] },
  ])

export default Booking
