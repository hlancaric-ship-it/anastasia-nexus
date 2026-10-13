import { model } from "@medusajs/framework/utils"

/**
 * Volný časový úsek kalendáře pro konkrétní lokální den (Europe/Bratislava), zadaný ručně v adminu.
 * Žádná opakující se pravidla: den bez řádku = nic se nenabízí. Okna jsou společná pro všechny typy konzultací.
 */
const BookingAvailability = model
  .define("booking_availability", {
    id: model.id({ prefix: "bkav" }).primaryKey(),
    calendar_id: model.text().default("lucia"),
    date: model.text(), // YYYY-MM-DD, lokální den
    start_time: model.text(), // HH:MM
    end_time: model.text(), // HH:MM
  })
  .indexes([{ on: ["calendar_id", "date"] }])

export default BookingAvailability
