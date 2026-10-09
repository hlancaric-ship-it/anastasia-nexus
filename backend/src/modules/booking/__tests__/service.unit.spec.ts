/** @jest-environment node */
import BookingModuleService, { SlotTakenError } from "../service"

function makeService(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const svc = Object.create(BookingModuleService.prototype) as any
  svc.retrieveBooking = jest.fn()
  svc.createBookings = jest.fn()
  svc.updateBookings = jest.fn()
  svc.listBookings = jest.fn(async () => [])
  Object.assign(svc, overrides)
  return svc as BookingModuleService
}

const slot = { customer_id: "cus_1", product_id: "p_l005", starts_at: new Date("2026-10-12T07:00:00Z"), ends_at: new Date("2026-10-12T08:00:00Z") }

describe("BookingModuleService", () => {
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
    })
    expect(await svc.expireStaleHolds(now)).toBe(1)
    expect(svc.updateBookings).toHaveBeenCalledWith([expect.objectContaining({ id: "bkg_1", status: "canceled" })])
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
    const r = await svc.listActiveInRange("p_l005", new Date(), new Date())
    expect(r).toHaveLength(2)
  })
})
