import { bookingConfigFromMetadata } from "../../modules/booking/availability"

type Product = { metadata?: Record<string, unknown> | null; shipping_profile?: { id?: string | null; type?: string | null } | null } | null | undefined

/** Only validated booking metadata from the catalog exempts a service from delivery. */
export function isBookingService(product: Product): boolean {
  return bookingConfigFromMetadata(product?.metadata?.booking) !== null
}

/** Unknown or missing catalog classification remains physical (fail closed). */
export function productRequiresShipping(product: Product): boolean {
  return !isBookingService(product) && product?.shipping_profile?.type !== "digital"
}
