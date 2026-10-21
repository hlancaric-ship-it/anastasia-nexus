import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../booking"
import { ENTITLEMENT_MODULE } from "../entitlement"
import { isChatEligible, type EligibilitySignals } from "./policy"

/** Objednávky, které zakládají právo psát (koncept ani zrušená objednávka ne). */
const ORDER_EXCLUDED_STATUSES = ["draft", "canceled"]
/** Rezervace, které zakládají právo psát: potvrzené, proběhlé, nebo držené s vytvořenou objednávkou. */
const BOOKING_ELIGIBLE_STATUSES = ["confirmed", "completed"]

async function hasOrder(container: MedusaContainer, customerId: string): Promise<boolean> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { customer_id: customerId, status: { $nin: ORDER_EXCLUDED_STATUSES } } as any,
    pagination: { take: 1 },
  })
  return data.length > 0
}

async function hasBooking(container: MedusaContainer, customerId: string): Promise<boolean> {
  const bookings = container.resolve(BOOKING_MODULE) as any
  const [confirmed] = await bookings.listBookings({ customer_id: customerId, status: BOOKING_ELIGIBLE_STATUSES }, { take: 1, select: ["id"] })
  if (confirmed) return true
  const [heldWithOrder] = await bookings.listBookings({ customer_id: customerId, status: "held", order_id: { $ne: null } }, { take: 1, select: ["id"] })
  return Boolean(heldWithOrder)
}

async function hasEntitlement(container: MedusaContainer, customerId: string): Promise<boolean> {
  const entitlements = container.resolve(ENTITLEMENT_MODULE) as any
  const { count } = await entitlements.listActiveForCustomer(customerId, { limit: 1 })
  return count > 0
}

/** Signály způsobilosti psát (čte server, klient je nikdy neposílá). Při chybě zdroje platí „ne“ (fail-closed). */
export async function chatEligibilitySignals(container: MedusaContainer, customerId: string): Promise<EligibilitySignals> {
  const settle = async (check: Promise<boolean>) => check.catch(() => false)
  const [order, booking, entitlement] = await Promise.all([
    settle(hasOrder(container, customerId)),
    settle(hasBooking(container, customerId)),
    settle(hasEntitlement(container, customerId)),
  ])
  return { hasOrder: order, hasBooking: booking, hasEntitlement: entitlement }
}

export async function isCustomerChatEligible(container: MedusaContainer, customerId: string): Promise<boolean> {
  return isChatEligible(await chatEligibilitySignals(container, customerId))
}

/** Vazba konverzace na objednávku: objednávka musí patřit zákazníkovi. */
export async function customerOwnsOrder(container: MedusaContainer, customerId: string, orderId: string): Promise<boolean> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: ["id", "customer_id"], filters: { id: orderId } })
  return data[0]?.customer_id === customerId
}

/** Vazba konverzace na rezervaci: rezervace musí patřit zákazníkovi. */
export async function customerOwnsBooking(container: MedusaContainer, customerId: string, bookingId: string): Promise<boolean> {
  const bookings = container.resolve(BOOKING_MODULE) as any
  const [row] = await bookings.listBookings({ id: bookingId }, { take: 1, select: ["id", "customer_id"] })
  return row?.customer_id === customerId
}
