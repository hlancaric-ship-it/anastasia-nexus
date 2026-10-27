import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { COUPON_LINK_MODULE } from ".."
import type CouponLinkModuleService from "../service"

const dbName = "anastasia_coupon_c3"

// This suite uses a disposable local PostgreSQL database. The integration runner
// drops that database after the suite, so never point it at a shared dev database.
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(process.env.DB_HOST || "")) {
  throw new Error("Coupon C3 integration test requires disposable local PostgreSQL on loopback")
}

jest.setTimeout(180_000)

medusaIntegrationTestRunner({ dbName, testSuite: ({ getContainer }) => {
  const service = () => getContainer().resolve<CouponLinkModuleService>(COUPON_LINK_MODULE)
  const db = () => getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

  async function createPromotion(id: string, code: string, limit: number) {
    await db()("promotion").insert({
      id,
      code,
      is_automatic: false,
      type: "standard",
      status: "active",
      is_tax_inclusive: false,
      limit,
      used: 0,
    })
  }

  it("runs the reservation migration and atomically enforces a limit through the real Medusa container", async () => {
    const migrationTable = await db().raw("select to_regclass('public.coupon_usage_reservation') as table_name")
    expect(migrationTable.rows[0].table_name).toBe("coupon_usage_reservation")

    await createPromotion("promo_c3_race", "C3-RACE", 1)
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, (_, index) =>
      service().reserveUsage({ promotion_id: "promo_c3_race", coupon_code: "C3-RACE", cart_id: `cart_c3_race_${index}` }),
    ))
    const successes = attempts.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<CouponLinkModuleService["reserveUsage"]>>> => result.status === "fulfilled")
    const failures = attempts.filter((result): result is PromiseRejectedResult => result.status === "rejected")
    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(9)
    expect(failures.every((failure) => (failure.reason as Error).message === "COUPON_LIMIT_EXHAUSTED")).toBe(true)
    expect(await db()("promotion").where({ id: "promo_c3_race" }).first("used")).toMatchObject({ used: 1 })

    const winner = successes[0].value
    const replay = await service().reserveUsage({ promotion_id: "promo_c3_race", coupon_code: "C3-RACE", cart_id: winner.cart_id })
    expect(replay.id).toBe(winner.id)
    expect(await db()("promotion").where({ id: "promo_c3_race" }).first("used")).toMatchObject({ used: 1 })

    await service().releaseReservation({ cart_id: winner.cart_id })
    await service().releaseReservation({ cart_id: winner.cart_id })
    expect(await db()("promotion").where({ id: "promo_c3_race" }).first("used")).toMatchObject({ used: 0 })

    await createPromotion("promo_c3_cancel", "C3-CANCEL", 2)
    const reserved = await service().reserveUsage({ promotion_id: "promo_c3_cancel", coupon_code: "C3-CANCEL", cart_id: "cart_c3_cancel" })
    const confirmed = await service().confirmUsage({ cart_id: reserved.cart_id, order_id: "order_c3_cancel", coupon_code: "C3-CANCEL" })
    expect(confirmed?.status).toBe("confirmed")
    expect((await service().confirmUsage({ cart_id: reserved.cart_id, order_id: "order_c3_cancel", coupon_code: "C3-CANCEL" }))?.status).toBe("confirmed")
    expect(await service().cancelUsage({ cart_id: reserved.cart_id, order_id: "order_c3_cancel" })).toBe(true)
    expect(await service().cancelUsage({ cart_id: reserved.cart_id, order_id: "order_c3_cancel" })).toBe(false)
    expect(await db()("promotion").where({ id: "promo_c3_cancel" }).first("used")).toMatchObject({ used: 0 })
  })
}})
