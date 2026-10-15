/** @jest-environment node */
import BookingModuleService, { AvailabilityConflictError, SlotNotAvailableError, SlotTakenError } from "../service"

type Row = Record<string, any>

/** Minimální knex nad pamětí pro dotazy z assertSlotAvailable/replaceWeekAvailability. */
function fakeKnex(db: { booking: Row[]; booking_availability: Row[] }) {
  const raw: Array<[string, unknown[] | undefined]> = []
  const ms = (v: unknown) => new Date(v as any).getTime()
  const knex: any = (table: "booking" | "booking_availability") => {
    const filters: Array<(r: Row) => boolean> = []
    const rows = () => db[table].filter((r) => filters.every((f) => f(r)))
    const qb: any = {
      where(a: any, op?: string, v?: unknown) {
        if (typeof a === "object") filters.push((r) => Object.entries(a).every(([k, val]) => r[k] === val))
        else filters.push((r) => ({ "<": ms(r[a]) < ms(v), "<=": ms(r[a]) <= ms(v), ">": ms(r[a]) > ms(v) } as any)[op!])
        return qb
      },
      whereNull(k: string) { filters.push((r) => r[k] == null); return qb },
      whereIn(k: string, vals: unknown[]) { filters.push((r) => vals.includes(r[k])); return qb },
      whereRaw(sql: string, params?: unknown[]) {
        if (sql.includes("checkout_cart_id' IS NULL")) filters.push((r) => r.metadata?.checkout_cart_id == null)
        else if (sql.includes("ends_at + COALESCE")) filters.push((r) => ms(r.ends_at) + (r.metadata?.buffer_minutes ?? 0) * 60000 > ms(params![0]))
        else throw new Error(`UNSUPPORTED_RAW:${sql}`)
        return qb
      },
      async update(patch: Row) { const hit = rows(); hit.forEach((r) => Object.assign(r, patch)); return hit.length },
      async first() { return rows()[0] },
      async select() { return rows() },
      async del() { const hit = new Set(rows()); db[table] = db[table].filter((r) => !hit.has(r)); return hit.size },
    }
    return qb
  }
  knex.raw = async (sql: string, params?: unknown[]) => { raw.push([sql, params]) }
  return { knex, raw }
}

function makeCalendar(windows: Row[] = [{ date: "2026-10-12", start_time: "09:00", end_time: "18:00" }]) {
  const db: { booking: Row[]; booking_availability: Row[] } = { booking: [], booking_availability: windows.map((w, i) => ({ id: `bkav_${i}`, calendar_id: "lucia", deleted_at: null, ...w })) }
  const { knex, raw } = fakeKnex(db)
  const svc = Object.create(BookingModuleService.prototype) as any
  svc.baseRepository_ = { transaction: async (cb: any) => cb({ getTransactionContext: () => knex }) }
  svc.createBookings = jest.fn(async (input: Row) => {
    const row = { id: `bkg_${db.booking.length + 1}`, deleted_at: null, ...input }
    db.booking.push(row)
    return row
  })
  svc.listBookings = jest.fn(async (filters: Row) => db.booking.filter((b) =>
    b.calendar_id === filters.calendar_id && filters.status.includes(b.status) &&
    b.starts_at.getTime() < filters.starts_at.$lt.getTime() && b.ends_at.getTime() > filters.ends_at.$gt.getTime()))
  svc.createBookingAvailabilities = jest.fn(async (rows: Row[]) => { db.booking_availability.push(...rows.map((r) => ({ deleted_at: null, ...r }))) })
  return { svc: svc as BookingModuleService & Record<string, any>, db, raw }
}

// 2026-10-12 je pondělí, CEST (UTC+2): 09:00 místního času = 07:00Z.
const at = (hhmm: string) => new Date(`2026-10-12T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00Z`)
const hold = (product_id: string, start: string, end: string, bufferMinutes = 15, customer_id = "cus_1") =>
  ({ customer_id, product_id, starts_at: at(start), ends_at: at(end), bufferMinutes })

describe("společný kalendář Lucie (zámek a překryv napříč typy)", () => {
  it("zámek je jeden pro celý kalendář, ne per produkt", async () => {
    const { svc, raw, db } = makeCalendar()
    await svc.holdSlot(hold("prod_A", "09:00", "10:00"))
    await svc.holdSlot(hold("prod_B", "12:00", "12:30"))
    const locks = raw.filter(([sql]) => sql.includes("pg_advisory_xact_lock")).map(([, p]) => p![0])
    expect(locks).toEqual(["booking:calendar:lucia", "booking:calendar:lucia"])
    expect(db.booking.map((b) => b.calendar_id)).toEqual(["lucia", "lucia"])
  })

  it("dva různé typy se nesmí překrýt (ani přes pauzu předchozí rezervace)", async () => {
    const { svc } = makeCalendar()
    await svc.holdSlot(hold("prod_A", "09:00", "10:00", 15))
    await expect(svc.holdSlot(hold("prod_B", "09:30", "10:00", 0, "cus_2"))).rejects.toBeInstanceOf(SlotTakenError)
    await expect(svc.holdSlot(hold("prod_B", "10:00", "10:30", 0, "cus_2"))).rejects.toBeInstanceOf(SlotTakenError)
    await expect(svc.holdSlot(hold("prod_B", "10:15", "10:45", 0, "cus_2"))).resolves.toMatchObject({ product_id: "prod_B" })
  })

  it("pauza nové rezervace nesmí zasáhnout do následující rezervace jiného typu", async () => {
    const { svc } = makeCalendar()
    await svc.holdSlot(hold("prod_A", "11:00", "12:00", 0))
    await expect(svc.holdSlot(hold("prod_B", "10:00", "10:45", 30, "cus_2"))).rejects.toBeInstanceOf(SlotTakenError)
    await expect(svc.holdSlot(hold("prod_B", "10:00", "10:30", 30, "cus_2"))).resolves.toBeTruthy()
  })

  it("prošlý hold jiného typu termín neblokuje", async () => {
    const { svc, db } = makeCalendar()
    await svc.holdSlot(hold("prod_A", "09:00", "10:00"))
    db.booking[0].held_until = new Date(Date.now() - 1000)
    await expect(svc.holdSlot(hold("prod_B", "09:00", "09:30", 0, "cus_2"))).resolves.toBeTruthy()
    expect(db.booking[0]).toMatchObject({ status: "canceled", cancel_reason: "hold_expired" })
  })

  it("hold mimo volný úsek nebo v nevyplněném dni je odmítnut (fail-closed)", async () => {
    const { svc } = makeCalendar()
    await expect(svc.holdSlot(hold("prod_A", "17:30", "18:30"))).rejects.toBeInstanceOf(SlotNotAvailableError)
    await expect(svc.holdSlot(hold("prod_A", "08:00", "09:00"))).rejects.toBeInstanceOf(SlotNotAvailableError)
    const empty = makeCalendar([])
    await expect(empty.svc.holdSlot(hold("prod_A", "09:00", "10:00"))).rejects.toBeInstanceOf(SlotNotAvailableError)
    expect(empty.svc.createBookings).not.toHaveBeenCalled()
  })
})

describe("replaceWeekAvailability", () => {
  const week = (ranges: Array<[string, string]>) => ({
    week_start: "2026-10-12",
    days: { "2026-10-12": ranges.map(([start_time, end_time]) => ({ start_time, end_time })) },
  })

  it("nahradí úseky týdne a drží zámek kalendáře", async () => {
    const { svc, db, raw } = makeCalendar([{ date: "2026-10-12", start_time: "09:00", end_time: "18:00" }, { date: "2026-10-20", start_time: "09:00", end_time: "10:00" }])
    await svc.replaceWeekAvailability(week([["10:00", "12:00"], ["13:00", "15:00"]]))
    expect(raw.some(([sql, p]) => sql.includes("pg_advisory_xact_lock") && p![0] === "booking:calendar:lucia")).toBe(true)
    expect(db.booking_availability.filter((r) => r.date === "2026-10-12").map((r) => `${r.start_time}-${r.end_time}`)).toEqual(["10:00-12:00", "13:00-15:00"])
    // jiný týden zůstal beze změny
    expect(db.booking_availability.some((r) => r.date === "2026-10-20")).toBe(true)
  })

  it("úsek s aktivní rezervací nejde smazat ani zkrátit (409), smí se ale rozšířit", async () => {
    const { svc, db } = makeCalendar()
    await svc.holdSlot(hold("prod_A", "10:00", "11:00"))
    const before = [...db.booking_availability]
    for (const ranges of [[], [["09:00", "10:30"]], [["10:30", "18:00"]]] as Array<Array<[string, string]>>) {
      const error = await svc.replaceWeekAvailability(week(ranges)).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(AvailabilityConflictError)
      expect((error as AvailabilityConflictError).bookings.map((b) => b.product_id)).toEqual(["prod_A"])
    }
    expect(db.booking_availability).toEqual(before)
    await expect(svc.replaceWeekAvailability(week([["08:00", "11:00"]]))).resolves.toHaveLength(1)
  })

  it("zrušená nebo prošlá rezervace úpravu neblokuje, rozpracovaný checkout ano", async () => {
    const { svc, db } = makeCalendar()
    await svc.holdSlot(hold("prod_A", "10:00", "11:00"))
    db.booking[0].held_until = new Date(Date.now() - 1000)
    await expect(svc.replaceWeekAvailability(week([]))).resolves.toEqual([])
    db.booking_availability.push({ calendar_id: "lucia", date: "2026-10-12", start_time: "09:00", end_time: "18:00", deleted_at: null })
    await svc.holdSlot(hold("prod_B", "12:00", "13:00"))
    Object.assign(db.booking[1], { held_until: null, metadata: { checkout_cart_id: "cart_1" } })
    await expect(svc.replaceWeekAvailability(week([]))).rejects.toBeInstanceOf(AvailabilityConflictError)
  })
})
