import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export type GuestCart = { id: string; completed_at?: string | null; customer_id?: string | null; items: Array<{ product_id?: string | null; quantity?: number | null }> }

const isId = (v: unknown): v is string => typeof v === "string" && /^cart_[A-Za-z0-9]{10,40}$/.test(v)

/**
 * Košík hosťa: id košíka je jediný doklad vlastníctva (rovnako ako v Medusa store API pre hostí).
 * Košík s prihláseným zákazníkom (has_account) cez túto cestu neprejde, ten používa /store/bookings.
 */
export async function loadGuestCart(req: MedusaRequest, cartId: unknown): Promise<GuestCart | null> {
  if (!isId(cartId)) return null
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "cart", fields: ["id", "completed_at", "customer_id", "customer.has_account", "items.product_id", "items.quantity"], filters: { id: cartId } })
  const cart = data?.[0] as (GuestCart & { customer?: { has_account?: boolean | null } | null }) | undefined
  if (!cart || cart.completed_at || cart.customer?.has_account) return null
  return { ...cart, items: (cart.items || []).filter(Boolean) as GuestCart["items"] }
}

export const productQuantity = (cart: GuestCart, productId: string) =>
  cart.items.filter((item) => item.product_id === productId).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
