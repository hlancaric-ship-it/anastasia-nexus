import { verifyBookingInboxHttp } from "./booking-inbox-http-checks"
import { ContainerRegistrationKeys, generateJwtToken, Modules } from "@medusajs/framework/utils"
import { capturePaymentWorkflow, cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import { confirmBookingForOrder } from "../../src/modules/booking/order-sync"
import { mondayOf, weekDates } from "../../src/modules/booking/availability"
import { verifyChatHttp } from "./chat-http-checks"

/** Called only by the guarded synthetic Medusa/Postgres runner. JWTs are local fixtures. */
export async function verifyBookingHttp({ api, container, options, newCart, product, countOrders, evidence }: any) {
  const bookings = container.resolve("booking")
  const customers = container.resolve(Modules.CUSTOMER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const actors = await customers.createCustomers([{ email: "booking-a@example.test" }, { email: "booking-b@example.test" }])
  const auth = actors.map((customer: any) => ({ Authorization: `Bearer ${generateJwtToken({ actor_id: customer.id, actor_type: "customer", auth_identity_id: `synthetic-${customer.id}` }, { secret: process.env.JWT_SECRET!, expiresIn: "1h" })}` }))
  const opts = auth.map((headers: any) => ({ ...options, headers: { ...options.headers, ...headers } }))
  await container.resolve(Modules.PRODUCT).updateProducts(product.id, { metadata: { booking: {
    durationMinutes: 60, bufferMinutes: 15, stepMinutes: 30,
  } } })
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  // Volné úseky zadává Lucia po týdnech; bez nich se nic nenabízí (fail-closed).
  const weekStart = mondayOf(date)
  await bookings.replaceWeekAvailability({ week_start: weekStart, days: Object.fromEntries(weekDates(weekStart).map(d => [d, [{ start_time: "09:00", end_time: "18:00" }]])) })
  const slots = await api.get(`/store/booking-slots?product_id=${product.id}&from=${date}&to=${date}`, options)
  expect(slots.status).toBe(200)
  const start = slots.data.slots[0].start
  const body = { product_id: product.id, starts_at: start }
  expect((await api.post("/store/bookings", body, options)).status).toBe(401)

  // Both requests must pass availability checking before either inserts a hold.
  const raceHolds = async (bodies: any[]) => {
    const original = bookings.holdSlot.bind(bookings)
    let arrivals = 0
    let release!: () => void
    const ready = new Promise<void>(resolve => { release = resolve })
    const barrier = jest.spyOn(bookings, "holdSlot").mockImplementation(async (input: any) => {
      if (++arrivals === 2) release()
      let timer: ReturnType<typeof setTimeout> | undefined
      try { await Promise.race([ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("BOOKING_BARRIER_TIMEOUT")), 15000) })]) }
      finally { clearTimeout(timer) }
      return original(input)
    })
    let responses: any[]
    try { responses = await Promise.all(opts.map((o: any, i: number) => api.post("/store/bookings", bodies[i], o))) }
    finally { barrier.mockRestore() }
    expect(responses!.map(r => r.status).sort()).toEqual([201, 409])
    expect(arrivals).toBe(2)
    return responses!
  }
  const responses = await raceHolds([body, body])
  const winner = responses!.findIndex(r => r.status === 201)
  const other = 1 - winner
  const booking = responses![winner].data.booking
  expect(await bookings.listBookings({ product_id: product.id, status: "held" })).toHaveLength(1)
  expect((await api.get("/store/bookings", opts[other])).data.bookings).toHaveLength(0)
  expect((await api.post(`/store/bookings/${booking.id}/cancel`, {}, opts[other])).status).toBe(404)
  evidence.push({ scenario: "K9_HTTP_HOLD_RACE_AND_ISOLATION", statuses: responses!.map(r => r.status), activeHolds: 1 })
  const overlaps = await raceHolds([4, 5].map(i => ({ ...body, starts_at: slots.data.slots[i].start })))
  evidence.push({ scenario: "K9_OVERLAPPING_STARTS", statuses: overlaps.map(r => r.status), activeHolds: 1 })
  const buffered = await raceHolds([10, 12].map(i => ({ ...body, starts_at: slots.data.slots[i].start })))
  evidence.push({ scenario: "K9_BUFFER_OVERLAP", statuses: buffered.map(r => r.status), activeHolds: 1 })

  // Missing and foreign booking must block both standard and custom checkout paths.
  for (const endpoint of ["standard", "custom"]) {
    for (const mode of ["missing", "foreign"]) {
      const id = await newCart(50, false, undefined, auth[other])
      if (mode === "foreign") expect((await api.post(`/store/carts/${id}`, { metadata: { booking_id: booking.id } }, opts[other])).status).toBe(200)
      const before = await countOrders()
      const response = await api.post(endpoint === "standard" ? `/store/carts/${id}/complete` : "/store/nexus-checkout", endpoint === "standard" ? {} : { cart_id: id }, opts[other])
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(await countOrders()).toBe(before)
      evidence.push({ scenario: `K9_${mode.toUpperCase()}_BOOKING`, endpoint, status: response.status, orderDelta: 0 })
    }
  }

  // One hold cannot back two different orders, even across the two completion APIs.
  const carts = await Promise.all([0, 1].map(() => newCart(50, false, undefined, auth[winner])))
  for (const id of carts) expect((await api.post(`/store/carts/${id}`, { metadata: { booking_id: booking.id } }, opts[winner])).status).toBe(200)
  expect((await api.post(`/store/bookings/${booking.id}/cart`, { cart_id: carts[0] }, options)).status).toBe(401)
  expect((await api.post(`/store/bookings/${booking.id}/cart`, { cart_id: carts[0] }, opts[other])).status).toBe(404)
  expect((await api.post(`/store/bookings/${booking.id}/cart`, { cart_id: carts[0] }, opts[winner])).status).toBe(200)
  const before = await countOrders()
  // Fail after validate, exercising the real workflow compensation of a held term.
  const authorization = jest.spyOn(container.resolve(Modules.PAYMENT), "authorizePaymentSession").mockRejectedValueOnce(new Error("SYNTHETIC_PAYMENT_FAILURE"))
  let failed: any
  try { failed = await api.post("/store/nexus-checkout", { cart_id: carts[0] }, opts[winner]) }
  finally { authorization.mockRestore() }
  expect(failed.status).toBeGreaterThanOrEqual(400)
  expect(await countOrders()).toBe(before)
  const released = await bookings.retrieveBooking(booking.id)
  expect(released.metadata.checkout_cart_id).toBeNull()
  expect(released.held_until).not.toBeNull()
  evidence.push({ scenario: "K9_PAYMENT_FAILURE_COMPENSATES", status: failed.status, orderDelta: 0, released: true })
  const completed = await Promise.all([
    api.post(`/store/carts/${carts[0]}/complete`, {}, opts[winner]),
    api.post("/store/nexus-checkout", { cart_id: carts[1] }, opts[winner]),
  ])
  expect(completed.filter(r => r.status === 200)).toHaveLength(1)
  expect(completed.filter(r => r.status >= 400)).toHaveLength(1)
  expect(await countOrders()).toBe(before + 1)
  const orderId = completed.find(r => r.status === 200)!.data.order.id
  const waitFor = async (predicate: (b: any) => boolean) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const current = await bookings.retrieveBooking(booking.id)
      if (predicate(current)) return current
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error("BOOKING_SUBSCRIBER_TIMEOUT")
  }
  const pending = await waitFor(b => b.order_id === orderId)
  expect(pending.status).toBe("held")
  expect(pending.held_until).toBeNull()
  await verifyBookingInboxHttp({ api, options, container, orderId, bookingId: booking.id, stage: "unpaid", evidence })
  expect((await api.post(`/store/bookings/${booking.id}/cancel`, {}, opts[winner])).status).toBe(409)
  const { data } = await query.graph({ entity: "order", fields: ["id", "metadata", "payment_collections.payments.id"], filters: { id: orderId } })
  expect(data[0].metadata.booking_id).toBe(booking.id)
  await capturePaymentWorkflow(container).run({ input: { payment_id: data[0].payment_collections[0].payments[0].id } })
  await waitFor(b => b.status === "confirmed")
  expect((await confirmBookingForOrder(container, orderId)).confirmed).toBe(true)
  await verifyBookingInboxHttp({ api, options, container, orderId, bookingId: booking.id, stage: "paid", evidence })
  await cancelOrderWorkflow(container).run({ input: { order_id: orderId } })
  await waitFor(b => b.status === "canceled")
  await verifyBookingInboxHttp({ api, options, container, orderId, bookingId: booking.id, stage: "canceled", evidence })
  const notificationEvidence = await verifyBookingNotifications(container, booking.id)
  evidence.push({ scenario: "K9_BOOKING_NOTIFICATIONS", ...notificationEvidence })
  expect((await api.post("/store/bookings", body, opts[other])).status).toBe(201)
  evidence.push({ scenario: "K9_CHECKOUT_RACE_CAPTURE_CANCEL_REBOOK", statuses: completed.map(r => r.status), orderDelta: 1, captured: true, canceled: true, rebooked: true })

  const expiredResponse = await api.post("/store/bookings", { ...body, starts_at: slots.data.slots[slots.data.slots.length - 1].start }, opts[winner])
  expect(expiredResponse.status).toBe(201)
  const expired = expiredResponse.data.booking
  const expiredCart = await newCart(50, false, undefined, auth[winner])
  expect((await api.post(`/store/bookings/${expired.id}/cart`, { cart_id: expiredCart }, opts[winner])).status).toBe(200)
  await bookings.updateBookings({ id: expired.id, held_until: new Date(0) })
  const expiredBefore = await countOrders()
  for (const endpoint of ["standard", "custom"]) {
    const response = await api.post(endpoint === "standard" ? `/store/carts/${expiredCart}/complete` : "/store/nexus-checkout", endpoint === "standard" ? {} : { cart_id: expiredCart }, opts[winner])
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(response.data)).toContain("BOOKING_NOT_AVAILABLE")
    expect(await countOrders()).toBe(expiredBefore)
    evidence.push({ scenario: "K9_EXPIRED_HOLD", endpoint, status: response.status, orderDelta: 0 })
  }

  const { admin } = await verifySharedCalendarAdmin({ api, container, options, opts, product, raceHolds, evidence })
  await verifyChatHttp({ api, container, options, admin, evidence })
}

/**
 * Společný kalendář přes skutečné admin API: nový typ konzultace, týden volných úseků,
 * souběh dvou různých typů přes sebe a odmítnutí zkrácení úseku s rezervací.
 */
async function verifySharedCalendarAdmin({ api, container, options, opts, product, raceHolds, evidence }: any) {
  const [user] = await container.resolve(Modules.USER).createUsers([{ email: "lucia-admin@example.test" }])
  const adminToken = generateJwtToken({ actor_id: user.id, actor_type: "user", auth_identity_id: `synthetic-${user.id}`, app_metadata: { user_id: user.id } }, { secret: process.env.JWT_SECRET!, expiresIn: "1h" })
  const admin = { ...options, headers: { Authorization: `Bearer ${adminToken}` } }
  // Admin API nepřijme zákaznický token ani anonymní volání.
  expect((await api.get("/admin/booking/types", opts[0])).status).toBe(401)
  expect((await api.get("/admin/booking/types", options)).status).toBe(401)

  const invalid = await api.post("/admin/booking/types", { title: "X", duration_minutes: "šedesát", buffer_minutes: 0, price_eur: -1, form: "online", active: true }, admin)
  expect(invalid.status).toBe(400)
  const created = await api.post("/admin/booking/types", { title: "Krátká konzultace", duration_minutes: 30, buffer_minutes: 0, price_eur: 20, form: "online", active: true, description: "Syntetický typ" }, admin)
  expect(created.status).toBe(201)
  const short = created.data.type
  expect(short).toMatchObject({ duration_minutes: 30, buffer_minutes: 0, price_eur: 20, active: true, archived: false })
  const listed = await api.get("/admin/booking/types", admin)
  expect(listed.status).toBe(200)
  expect(listed.data.types.map((t: any) => t.id)).toContain(short.id)
  evidence.push({ scenario: "K9_ADMIN_TYPE_CREATE", invalidStatus: invalid.status, createdStatus: created.status })

  // Samostatný týden (o 2 týdny dál), aby se nemíchal s předchozími scénáři.
  const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const weekStart = mondayOf(date)
  const week = (ranges: Record<string, { start_time: string; end_time: string }[]>) => ({
    week_start: weekStart, days: weekDates(weekStart).map(d => ({ date: d, ranges: ranges[d] ?? [] })),
  })
  const overlapping = await api.post("/admin/booking/availability", week({ [date]: [{ start_time: "10:00", end_time: "13:00" }, { start_time: "12:00", end_time: "14:00" }] }), admin)
  expect(overlapping.status).toBe(400)
  const saved = await api.post("/admin/booking/availability", week({ [date]: [{ start_time: "10:00", end_time: "14:00" }] }), admin)
  expect(saved.status).toBe(200)
  expect(saved.data.days.find((d: any) => d.date === date).ranges).toEqual([{ start_time: "10:00", end_time: "14:00" }])

  const slotsOf = async (productId: string) => {
    const response = await api.get(`/store/booking-slots?product_id=${productId}&from=${date}&to=${date}`, options)
    expect(response.status).toBe(200)
    return response.data.slots as { start: string; end: string }[]
  }
  const hhmm = (iso: string) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Bratislava", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
  const at = (slots: { start: string }[], time: string) => {
    const slot = slots.find(s => hhmm(s.start) === time)
    if (!slot) throw new Error(`SYNTHETIC_SLOT_MISSING_${time}`)
    return slot.start
  }
  const longSlots = await slotsOf(product.id)
  const shortSlots = await slotsOf(short.id)
  // 60 min + 15 min pauza od 10:00 vs. 30 min od 10:30: různé typy, stejný kalendář → jen jeden projde.
  const crossType = await raceHolds([
    { product_id: product.id, starts_at: at(longSlots, "10:00") },
    { product_id: short.id, starts_at: at(shortSlots, "10:30") },
  ])
  const crossWinner = crossType.find((r: any) => r.status === 201).data.booking
  const longWon = crossWinner.product_id === product.id
  evidence.push({ scenario: "K9_CROSS_TYPE_OVERLAP_RACE", statuses: crossType.map((r: any) => r.status), winner: longWon ? "60+15" : "30+0", activeHolds: 1 })

  // Pauza jednoho typu blokuje i jiný typ; nejbližší volný začátek v rastru 30 min po konci (vč. pauzy) projde.
  const follow = longWon
    ? [{ product_id: short.id, starts_at: at(shortSlots, "11:00"), expected: 409 }, { product_id: short.id, starts_at: at(shortSlots, "11:30"), expected: 201 }]
    : [{ product_id: product.id, starts_at: at(longSlots, "10:30"), expected: 409 }, { product_id: product.id, starts_at: at(longSlots, "11:00"), expected: 201 }]
  const followStatuses: number[] = []
  for (const { expected, ...body } of follow) {
    const response = await api.post("/store/bookings", body, opts[0])
    expect(response.status).toBe(expected)
    followStatuses.push(response.status)
  }
  evidence.push({ scenario: "K9_CROSS_TYPE_BUFFER", statuses: followStatuses })

  // Admin vidí obsazené termíny se jménem zákaznice a typem.
  const view = await api.get(`/admin/booking/availability?week_start=${date}`, admin)
  expect(view.status).toBe(200)
  expect(view.data.week_start).toBe(weekStart)
  expect(view.data.bookings.find((b: any) => b.id === crossWinner.id)).toMatchObject({
    status: "held", customer: expect.objectContaining({ name: expect.any(String) }), product: expect.objectContaining({ title: expect.any(String) }),
  })

  // Zkrácení / smazání úseku, ze kterého by rezervace vypadla → 409 availability_conflict, úseky beze změny.
  const shortened = await api.post("/admin/booking/availability", week({ [date]: [{ start_time: "11:30", end_time: "14:00" }] }), admin)
  expect(shortened.status).toBe(409)
  expect(shortened.data.type).toBe("availability_conflict")
  expect(shortened.data.conflicts.map((b: any) => b.id)).toContain(crossWinner.id)
  const removed = await api.post("/admin/booking/availability", week({}), admin)
  expect(removed.status).toBe(409)
  const unchanged = await api.get(`/admin/booking/availability?week_start=${weekStart}`, admin)
  expect(unchanged.data.days.find((d: any) => d.date === date).ranges).toEqual([{ start_time: "10:00", end_time: "14:00" }])
  // Zkrácení mimo rezervace projde.
  const trimmed = await api.post("/admin/booking/availability", week({ [date]: [{ start_time: "10:00", end_time: "12:30" }] }), admin)
  expect(trimmed.status).toBe(200)
  evidence.push({ scenario: "K9_ADMIN_SHORTEN_WITH_BOOKING", statuses: [shortened.status, removed.status, trimmed.status], conflicts: shortened.data.conflicts.length })

  // Archivovaný typ se přestane nabízet.
  expect((await api.post(`/admin/booking/types/${short.id}`, { archived: true }, admin)).status).toBe(200)
  expect((await api.get(`/store/booking-slots?product_id=${short.id}&from=${date}&to=${date}`, options)).status).toBe(404)
  evidence.push({ scenario: "K9_ADMIN_TYPE_ARCHIVE", storeStatus: 404 })
  return { admin, date }
}

/**
 * notify(): potvrzení i zrušení dorazí právě jednou (order.placed + payment.captured + ruční confirm = 1 e-mail),
 * adresát je e-mail vlastníka rezervace a data šablony nenesou osobní údaje.
 */
async function verifyBookingNotifications(container: any, bookingId: string) {
  const notifications = container.resolve(Modules.NOTIFICATION)
  const owner = (await container.resolve("booking").retrieveBooking(bookingId)).customer_id
  const [customer] = await container.resolve(Modules.CUSTOMER).listCustomers({ id: owner })
  const byKey = async (key: string) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = await notifications.listNotifications({ idempotency_key: key }, { take: 5 })
      if (rows.length) return rows
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`NOTIFICATION_TIMEOUT ${key}`)
  }
  const confirmed = await byKey(`booking.confirmed:${bookingId}`)
  const canceled = await byKey(`booking.canceled:${bookingId}`)
  for (const [rows, template] of [[confirmed, "booking-confirmed-sk"], [canceled, "booking-canceled-sk"]] as const) {
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ to: customer.email, channel: "email", template, resource_id: bookingId, resource_type: "booking" })
    expect(JSON.stringify(rows[0].data)).not.toContain("@")
  }
  expect(canceled[0].data.cancel_kind).toBe("order_canceled")
  return { confirmed: confirmed.length, canceled: canceled.length, cancel_kind: canceled[0].data.cancel_kind }
}
