import { InjectTransactionManager, MedusaContext, MedusaService, generateEntityId } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import CouponLinkRecord from "./models/coupon-link-record"
import CouponUsageReservation from "./models/coupon-usage-reservation"

export type CouponReservation = {
  id: string
  promotion_id: string
  coupon_code: string
  cart_id: string
  order_id: string | null
  status: "reserved" | "confirmed" | "released"
  counted: boolean
}

function transactionKnex(context: Context) {
  const knex = (context.transactionManager as any)?.getTransactionContext?.()
  if (!knex) throw new Error("COUPON_USAGE_TRANSACTION_REQUIRED")
  return knex
}

async function adjustPromotionUsage(knex: any, promotionId: string, delta: 1 | -1): Promise<boolean> {
  let query = knex("promotion").where({ id: promotionId }).whereNull("deleted_at")
  if (delta < 0) query = query.where("used", ">", 0)
  const value = delta > 0
    ? knex.raw("COALESCE(??, 0) + 1", ["used"])
    : knex.raw("?? - 1", ["used"])
  const rows = await query.update({ used: value, updated_at: new Date() }).returning("id")
  return rows.length > 0
}

export default class CouponLinkModuleService extends MedusaService({ CouponLinkRecord, CouponUsageReservation }) {
  /**
   * Atomically reserves one promotion use for a cart. Promotion-row locking
   * serializes distinct carts; the unique cart index makes retries idempotent.
   */
  @InjectTransactionManager()
  async reserveUsage(input: { promotion_id: string; coupon_code: string; cart_id: string }, @MedusaContext() context: Context = {}): Promise<CouponReservation> {
    if (!input.promotion_id || !input.coupon_code.trim() || !input.cart_id) throw new Error("COUPON_USAGE_RESERVATION_INVALID")
    const knex = transactionKnex(context)
    await knex.raw("SET LOCAL lock_timeout = '3s'")
    const promotion = await knex("promotion").where({ id: input.promotion_id }).whereNull("deleted_at").forUpdate().first("id", "limit", "used")
    if (!promotion) throw new Error("COUPON_INVALID")

    let reservation = await knex("coupon_usage_reservation").where({ cart_id: input.cart_id }).forUpdate().first()
    if (reservation && (reservation.promotion_id !== input.promotion_id || reservation.coupon_code !== input.coupon_code)) {
      throw new Error("COUPON_USAGE_RESERVATION_CONFLICT")
    }
    if (reservation?.status === "reserved" || reservation?.status === "confirmed") return reservation

    const used = Number(promotion.used ?? 0)
    const hasLimit = promotion.limit !== null && promotion.limit !== undefined
    const limit = hasLimit ? Number(promotion.limit) : null
    if (!Number.isFinite(used) || (hasLimit && (!Number.isFinite(limit) || used >= (limit as number)))) {
      throw new Error("COUPON_LIMIT_EXHAUSTED")
    }
    const counted = hasLimit
    if (counted && !(await adjustPromotionUsage(knex, input.promotion_id, 1))) throw new Error("COUPON_INVALID")

    const now = new Date()
    if (reservation) {
      await knex("coupon_usage_reservation").where({ id: reservation.id }).update({
        status: "reserved", counted, order_id: null, reserved_at: now, confirmed_at: null, released_at: null, updated_at: now,
      })
      reservation = await knex("coupon_usage_reservation").where({ id: reservation.id }).first()
    } else {
      const id = generateEntityId(undefined, "cur")
      await knex("coupon_usage_reservation").insert({
        id, promotion_id: input.promotion_id, coupon_code: input.coupon_code, cart_id: input.cart_id,
        order_id: null, status: "reserved", counted, reserved_at: now, confirmed_at: null, released_at: null,
        created_at: now, updated_at: now,
      }).onConflict("cart_id").ignore()
      reservation = await knex("coupon_usage_reservation").where({ cart_id: input.cart_id }).forUpdate().first()
      if (!reservation || reservation.promotion_id !== input.promotion_id || reservation.coupon_code !== input.coupon_code) {
        throw new Error("COUPON_USAGE_RESERVATION_CONFLICT")
      }
    }
    return reservation
  }

  /** Confirms a reservation when its order is placed; repeated events are safe. */
  @InjectTransactionManager()
  async confirmUsage(input: { cart_id: string; order_id: string; coupon_code: string }, @MedusaContext() context: Context = {}): Promise<CouponReservation | null> {
    if (!input.cart_id || !input.order_id || !input.coupon_code) throw new Error("COUPON_USAGE_RESERVATION_INVALID")
    const knex = transactionKnex(context)
    const initial = await knex("coupon_usage_reservation").where({ cart_id: input.cart_id }).first()
    if (!initial) return null
    await knex.raw("SET LOCAL lock_timeout = '3s'")
    await knex("promotion").where({ id: initial.promotion_id }).whereNull("deleted_at").forUpdate().select("id")
    const reservation = await knex("coupon_usage_reservation").where({ id: initial.id }).forUpdate().first()
    if (!reservation) throw new Error("COUPON_USAGE_RESERVATION_MISSING")
    if (reservation.coupon_code !== input.coupon_code) throw new Error("COUPON_USAGE_RESERVATION_CONFLICT")
    if (reservation.status === "confirmed" && reservation.order_id === input.order_id) return reservation
    if (reservation.status === "released" && reservation.order_id === input.order_id) return reservation
    if (reservation.status !== "reserved" || (reservation.order_id && reservation.order_id !== input.order_id)) {
      throw new Error("COUPON_USAGE_RESERVATION_STATE_INVALID")
    }
    const existingOrder = await knex("coupon_usage_reservation").where({ order_id: input.order_id }).whereNot({ id: reservation.id }).first("id")
    if (existingOrder) throw new Error("COUPON_USAGE_RESERVATION_CONFLICT")
    const now = new Date()
    await knex("coupon_usage_reservation").where({ id: reservation.id }).update({ status: "confirmed", order_id: input.order_id, confirmed_at: now, updated_at: now })
    return { ...reservation, status: "confirmed", order_id: input.order_id }
  }

  /** Releases an unconfirmed reservation after a failed checkout; never undoes a placed order. */
  @InjectTransactionManager()
  async releaseReservation(input: { cart_id: string }, @MedusaContext() context: Context = {}): Promise<void> {
    if (!input.cart_id) return
    const initial = await transactionKnex(context)("coupon_usage_reservation").where({ cart_id: input.cart_id }).first()
    if (!initial || initial.status !== "reserved") return
    const knex = transactionKnex(context)
    await knex.raw("SET LOCAL lock_timeout = '3s'")
    await knex("promotion").where({ id: initial.promotion_id }).whereNull("deleted_at").forUpdate().select("id")
    const reservation = await knex("coupon_usage_reservation").where({ id: initial.id }).forUpdate().first()
    if (!reservation || reservation.status !== "reserved") return
    // A workflow can compensate after order creation if a later step failed.
    // Preserve the use when the cart already has a persisted order.
    const orderLink = await knex("order_cart").where({ cart_id: input.cart_id }).first("order_id")
    if (orderLink?.order_id) {
      const existingOrder = await knex("coupon_usage_reservation").where({ order_id: orderLink.order_id }).whereNot({ id: reservation.id }).first("id")
      if (existingOrder) throw new Error("COUPON_USAGE_RESERVATION_CONFLICT")
      const now = new Date()
      await knex("coupon_usage_reservation").where({ id: reservation.id }).update({ status: "confirmed", order_id: orderLink.order_id, confirmed_at: now, updated_at: now })
      return
    }
    if (reservation.counted) await adjustPromotionUsage(knex, reservation.promotion_id, -1)
    await knex("coupon_usage_reservation").where({ id: reservation.id }).update({ status: "released", released_at: new Date(), updated_at: new Date() })
  }

  /** Releases a confirmed use when its order is canceled; retries do not decrement twice. */
  @InjectTransactionManager()
  async cancelUsage(input: { cart_id: string; order_id: string }, @MedusaContext() context: Context = {}): Promise<boolean> {
    if (!input.cart_id || !input.order_id) return false
    const knex = transactionKnex(context)
    const initial = await knex("coupon_usage_reservation").where({ cart_id: input.cart_id }).first()
    if (!initial) return false
    await knex.raw("SET LOCAL lock_timeout = '3s'")
    await knex("promotion").where({ id: initial.promotion_id }).whereNull("deleted_at").forUpdate().select("id")
    const reservation = await knex("coupon_usage_reservation").where({ id: initial.id }).forUpdate().first()
    if (!reservation || (reservation.status === "released" && reservation.order_id === input.order_id)) return false
    if (reservation.status === "confirmed") {
      if (reservation.order_id !== input.order_id) throw new Error("COUPON_USAGE_RESERVATION_CONFLICT")
    } else if (reservation.status !== "reserved" || reservation.order_id) {
      throw new Error("COUPON_USAGE_RESERVATION_STATE_INVALID")
    }
    if (reservation.counted) await adjustPromotionUsage(knex, reservation.promotion_id, -1)
    await knex("coupon_usage_reservation").where({ id: reservation.id }).update({ status: "released", order_id: input.order_id, released_at: new Date(), updated_at: new Date() })
    return true
  }
}
