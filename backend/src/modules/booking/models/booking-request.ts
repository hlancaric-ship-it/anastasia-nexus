import { model } from "@medusajs/framework/utils"

export const BOOKING_REQUEST_STATUSES = ["pending", "approved", "declined"] as const

/**
 * Žiadosť klienta o vlastný termín, keď v kalendári nie je voľný úsek, ktorý mu vyhovuje.
 * Lucia ju v adminu schváli (vznikne podržaný termín pre klienta a e-mail s odkazom na platbu) alebo zamietne.
 * `token_hash` je SHA-256 tokenu z e-mailu so schválením, samotný token sa neukladá.
 */
const BookingRequest = model
  .define("booking_request", {
    id: model.id({ prefix: "bkrq" }).primaryKey(),
    product_id: model.text(),
    calendar_id: model.text().default("lucia"),
    starts_at: model.dateTime(),
    ends_at: model.dateTime(),
    name: model.text(),
    email: model.text(),
    phone: model.text().nullable(),
    note: model.text().nullable(),
    status: model.enum([...BOOKING_REQUEST_STATUSES]).default("pending"),
    booking_id: model.text().nullable(),
    token_hash: model.text().nullable(),
    decided_at: model.dateTime().nullable(),
    decline_reason: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["status", "starts_at"] },
    { on: ["email"] },
  ])

export default BookingRequest
