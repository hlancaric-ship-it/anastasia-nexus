/** @jest-environment node */
import BookingModuleService, { SlotTakenError } from "../service"

function makeService(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const svc = Object.create(BookingModuleService.prototype) as any
  svc.retrieveBooking = jest.fn()
  svc.createBookings = jest.fn()
  svc.updateBookings = jest.fn()
  svc.listBookings = jest.fn(async () => [])
  svc.baseRepository_ = { transaction: async (callback: any) => callback({}) }
  svc.lockedBooking = jest.fn((id: string) => svc.retrieveBooking(id))
  svc.assertSlotAvailable = jest.fn()
  Object.assign(svc, overrides)
  return svc as BookingModuleService
}

const slot = { customer_id: "cus_1", product_id: "p_l005", starts_at: new Date("2026-10-12T07:00:00Z"), ends_at: new Date("2026-10-12T08:00:00Z") }

describe("BookingModuleService", () => {
  const held = () => ({ id: "b1", customer_id: "c1", product_id: "p1", status: "held", held_until: new Date(Date.now() + 60000), metadata: { authorized_cart_id: "cart1" } })
  const claimInput = { id: "b1", customer_id: "c1", product_id: "p1", cart_id: "cart1" }
  it.each(["foreign", "product", "expired", "claimed", "canceled"])("checkout rejects %s hold", async mode => {
    const booking: any = held()
    if (mode === "foreign") booking.customer_id = "other"
    if (mode === "product") booking.product_id = "other"
    if (mode === "expired") booking.held_until = new Date(0)
    if (mode === "claimed") booking.metadata = { checkout_cart_id: "other" }
    if (mode === "canceled") booking.status = "canceled"
    const svc: any = makeService({ retrieveBooking: jest.fn(async () => booking) })
    await expect(svc.claimForCheckout(claimInput)).rejects.toThrow("BOOKING_")
    expect(svc.updateBookings).not.toHaveBeenCalled()
  })
  it("claim removes the unpaid hold timeout and compensation restores it", async () => {
    const booking: any = held()
    const svc: any = makeService({ retrieveBooking: jest.fn(async () => booking) })
    const claim = await svc.claimForCheckout(claimInput)
    expect(svc.updateBookings).toHaveBeenCalledWith(expect.objectContaining({ held_until: null, metadata: { authorized_cart_id: "cart1", checkout_cart_id: "cart1" } }), expect.anything())
    booking.metadata = { checkout_cart_id: "cart1" }
    await svc.releaseCheckoutClaim(claim)
    expect(svc.updateBookings).toHaveBeenLastCalledWith(expect.objectContaining({ held_until: claim.held_until, metadata: { checkout_cart_id: null } }), expect.anything())
    svc.updateBookings.mockClear()
    booking.order_id = "o1"
    await svc.releaseCheckoutClaim(claim)
    expect(svc.updateBookings).not.toHaveBeenCalled()
  })
  it("expiry and direct cancellation cannot remove a checkout claim", async () => {
    const svc: any = makeService({ retrieveBooking: jest.fn(async () => ({ ...held(), held_until: new Date(0), metadata: { checkout_cart_id: "cart1" } })) })
    expect(await svc.expireHold("b1", new Date())).toBe(false)
    await expect(svc.cancel("b1", "customer_request")).rejects.toThrow("BOOKING_CANCEL_ORDER_FIRST")
    expect(svc.updateBookings).not.toHaveBeenCalled()
  })
  it("order attachment rejects a different cart, owner, product or order", async () => {
    const booking: any = { ...held(), metadata: { checkout_cart_id: "cart1" } }
    const svc: any = makeService({ retrieveBooking: jest.fn(async () => booking) })
    const input = { ...claimInput, order_id: "o1", product_ids: ["p1"], paid: true }
    for (const patch of [{ cart_id: "other" }, { customer_id: "other" }, { product_ids: ["other"] }]) {
      await expect(svc.attachCheckoutOrder({ ...input, ...patch })).rejects.toThrow("BOOKING_ORDER_MISMATCH")
    }
    booking.order_id = "other"
    await expect(svc.attachCheckoutOrder(input)).rejects.toThrow("BOOKING_ORDER_MISMATCH")
    expect(svc.updateBookings).not.toHaveBeenCalled()
  })
  it("holdSlot vytvoří held rezervaci s omezeným held_until", async () => {
    const svc: any = makeService({ createBookings: jest.fn(async (i: any) => ({ id: "bkg_1", ...i })) })
    const r: any = await svc.holdSlot(slot)
    expect(r.status).toBe("held")
    expect(r.held_until.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000 + 50)
  })
  it("konflikt termínu (unique violation) vyhodí SlotTakenError", async () => {
    const svc: any = makeService({ createBookings: jest.fn(async () => { throw new Error('duplicate key value violates unique constraint "IDX_booking_product_starts_active_unique"') }) })
    await expect(svc.holdSlot(slot)).rejects.toBeInstanceOf(SlotTakenError)
  })
  it("ends_at musí být po starts_at", async () => {
    const svc: any = makeService()
    await expect(svc.holdSlot({ ...slot, ends_at: slot.starts_at })).rejects.toThrow()
  })
  it("confirm potvrdí platný held, je idempotentní pro stejnou objednávku, odmítne cizí nebo prošlý", async () => {
    const now = new Date()
    const svc: any = makeService({
      retrieveBooking: jest.fn(async () => ({ id: "bkg_1", status: "held", held_until: new Date(now.getTime() + 60_000) })),
      updateBookings: jest.fn(async (i: any) => ({ ...i })),
    })
    const r: any = await svc.confirm({ id: "bkg_1", order_id: "order_1" })
    expect(r.status).toBe("confirmed")

    const already: any = makeService({ retrieveBooking: jest.fn(async () => ({ id: "bkg_1", status: "confirmed", order_id: "order_1" })) })
    expect((await already.confirm({ id: "bkg_1", order_id: "order_1" })).status).toBe("confirmed")

    const expired: any = makeService({ retrieveBooking: jest.fn(async () => ({ id: "bkg_1", status: "held", held_until: new Date(now.getTime() - 1000) })) })
    await expect(expired.confirm({ id: "bkg_1", order_id: "order_1" })).rejects.toThrow()

    const canceled: any = makeService({ retrieveBooking: jest.fn(async () => ({ id: "bkg_1", status: "canceled" })) })
    await expect(canceled.confirm({ id: "bkg_1", order_id: "order_1" })).rejects.toThrow()
  })
  it("cancel je idempotentní", async () => {
    const svc: any = makeService({
      retrieveBooking: jest.fn(async () => ({ id: "bkg_1", status: "held" })),
      updateBookings: jest.fn(async (i: any) => ({ ...i })),
    })
    expect((await svc.cancel("bkg_1", "customer_request")).status).toBe("canceled")
    const already: any = makeService({ retrieveBooking: jest.fn(async () => ({ id: "bkg_1", status: "canceled" })) })
    expect((await already.cancel("bkg_1", "x")).status).toBe("canceled")
  })
  it("cancelByOrder zruší jen aktivní rezervace objednávky", async () => {
    const svc: any = makeService({
      listBookings: jest.fn(async () => [{ id: "bkg_1", order_id: "o1" }, { id: "bkg_2", order_id: "o1" }]),
      updateBookings: jest.fn(async () => undefined),
    })
    expect(await svc.cancelByOrder("o1", "order_canceled")).toBe(2)
    expect(await svc.cancelByOrder("", "x")).toBe(0)
  })
  it("expireStaleHolds zruší jen prošlé held", async () => {
    const now = new Date("2026-10-09T12:00:00Z")
    const svc: any = makeService({
      listBookings: jest.fn(async () => [
        { id: "bkg_1", status: "held", held_until: new Date(now.getTime() - 1000) },
        { id: "bkg_2", status: "held", held_until: new Date(now.getTime() + 60_000) },
      ]),
      updateBookings: jest.fn(async () => undefined),
      expireHold: jest.fn(async () => true),
    })
    expect(await svc.expireStaleHolds(now)).toBe(1)
    expect(svc.expireHold).toHaveBeenCalledWith("bkg_1", now)
  })
  it("listActiveInRange vrací confirmed i nevypršelé held, ne prošlé held", async () => {
    const now = new Date()
    const svc: any = makeService({
      listBookings: jest.fn(async () => [
        { status: "confirmed", starts_at: "2026-10-12T07:00:00Z", ends_at: "2026-10-12T08:00:00Z" },
        { status: "held", held_until: new Date(now.getTime() + 60_000), starts_at: "2026-10-12T09:00:00Z", ends_at: "2026-10-12T10:00:00Z" },
        { status: "held", held_until: new Date(now.getTime() - 1000), starts_at: "2026-10-12T11:00:00Z", ends_at: "2026-10-12T12:00:00Z" },
      ]),
    })
    const r = await svc.listActiveInRange(new Date(), new Date())
    expect(r).toHaveLength(2)
    // Obsazenost se čte nad celým kalendářem, ne nad jedním produktem.
    expect(svc.listBookings.mock.calls[0][0]).toMatchObject({ calendar_id: "lucia" })
    expect(svc.listBookings.mock.calls[0][0]).not.toHaveProperty("product_id")
  })
})
