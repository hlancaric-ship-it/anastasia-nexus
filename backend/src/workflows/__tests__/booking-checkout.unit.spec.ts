import { claimCartBooking } from "../booking-checkout"

describe("booking checkout snapshot validation", () => {
  const claim = jest.fn(async () => ({ id: "b1", cart_id: "cart1", held_until: null }))
  const graph = jest.fn(async () => ({ data: [{ id: "p1", metadata: { booking: {} } }] }))
  const container: any = { resolve: (key: string) => key === "query" ? { graph } : { claimForCheckout: claim } }
  const cart = () => ({ id: "cart1", customer_id: "c1", metadata: { booking_id: "b1" }, items: [{ product_id: "p1", quantity: 1 }] })
  beforeEach(() => { claim.mockClear(); graph.mockClear() })
  it("claims only the server snapshot's customer and product", async () => {
    await claimCartBooking(cart(), container)
    expect(claim).toHaveBeenCalledWith({ id: "b1", cart_id: "cart1", customer_id: "c1", product_id: "p1" })
  })
  it.each(["booking", "customer", "quantity"])("rejects invalid %s before claiming", async field => {
    const value = cart()
    if (field === "booking") value.metadata.booking_id = ""
    if (field === "customer") value.customer_id = ""
    if (field === "quantity") value.items[0].quantity = 2
    await expect(claimCartBooking(value, container)).rejects.toThrow("BOOKING_")
    expect(claim).not.toHaveBeenCalled()
  })
  it("does not reclaim a completed cart", async () => {
    await claimCartBooking({ ...cart(), completed_at: new Date() }, container)
    expect(graph).not.toHaveBeenCalled()
    expect(claim).not.toHaveBeenCalled()
  })
})
