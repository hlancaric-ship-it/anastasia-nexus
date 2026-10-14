/** Nabídka volných termínů pro konkrétní typ konzultace: okna kalendáře + obsazenost celého kalendáře. */
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { BOOKING_MODULE } from "./index"
import { bookingConfigFromMetadata, isArchivedBookingMeta } from "./availability"
import type BookingModuleService from "./service"
import { addDays, generateSlotsFromWindows, zonedToUtc, type BookingConfig, type Slot } from "./slots"

export type BookableProduct = { id: string; config: BookingConfig }

/**
 * Typ konzultace, který lze rezervovat: existující, publikovaný, nearchivovaný produkt
 * s platnou `metadata.booking`. Jinak null (route vrátí 404).
 */
export async function loadBookableProduct(scope: Pick<MedusaContainer, "resolve">, productId: string): Promise<BookableProduct | null> {
  const query: any = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: ["id", "status", "metadata"], filters: { id: productId } })
  const product = data?.[0]
  const meta = product?.metadata?.booking
  if (!product || product.status !== "published" || isArchivedBookingMeta(meta)) return null
  const config = bookingConfigFromMetadata(meta)
  return config ? { id: product.id, config } : null
}

/** Volné sloty pro lokální dny [from, to] podle délky a pauzy typu, z oken a obsazenosti celého kalendáře. */
export async function offeredSlots(scope: Pick<MedusaContainer, "resolve">, config: BookingConfig, from: string, to: string, now = new Date()): Promise<Slot[]> {
  const service = scope.resolve(BOOKING_MODULE) as BookingModuleService
  const windows = await service.listAvailability(from, to)
  if (!windows.length) return []
  // Rezervace z předchozího dne může pauzou zasahovat do prvního dne rozsahu.
  const busyFrom = zonedToUtc(addDays(from, -1), 0, config.timezone) ?? new Date(`${addDays(from, -1)}T00:00:00Z`)
  const busyTo = zonedToUtc(addDays(to, 2), 0, config.timezone) ?? new Date(`${addDays(to, 2)}T00:00:00Z`)
  const busy = await service.listActiveInRange(busyFrom, busyTo)
  return generateSlotsFromWindows({ config, windows, busy, fromDate: from, toDate: to, now })
}
