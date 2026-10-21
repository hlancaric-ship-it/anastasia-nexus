import { GET, POST } from "../route"
import { PATCH, DELETE } from "../[id]/route"

const metrics = [{ key: "energia", label: "Energia", min: 1, max: 10, order: 10 }]

type Fixture = {
  req: any
  res: any
  journal: any
  entitlements: any
  graph: any
}

function fixture(options: { customer?: string | null; entitled?: boolean } = {}): Fixture {
  const customer = options.customer === undefined ? "cus_a" : options.customer
  const entitlements = {
    listActiveForCustomer: jest.fn(async () =>
      options.entitled === false ? { data: [], count: 0 } : { data: [{ id: "ent_1", product_id: "prod_1" }], count: 1 },
    ),
  }
  const graph = jest.fn(async () => ({
    data: [{ id: "prod_1", title: "RESET 40+", handle: "reset-40-plus", metadata: { reset_journal_metrics: metrics } }],
  }))
  const journal = {
    listEntries: jest.fn(async () => ({
      data: [{ id: "rje_1", week: 3, entry_date: new Date("2026-08-14T00:00:00.000Z"), metrics: { energia: 7 } }],
      count: 1,
    })),
    createEntry: jest.fn(async (input: any) => ({
      id: "rje_new",
      week: input.week ?? null,
      entry_date: new Date("2026-08-14T00:00:00.000Z"),
      metrics: input.metrics,
    })),
    updateEntry: jest.fn(async () => ({ id: "rje_1", week: 3, entry_date: new Date("2026-08-14T00:00:00.000Z"), metrics: { energia: 3 } })),
    deleteEntry: jest.fn(async () => true),
  }
  const scope = {
    resolve: (key: string) => {
      if (key === "entitlement") return entitlements
      if (key === "query") return { graph }
      if (key === "resetJournal") return journal
      return { error: jest.fn() }
    },
  }
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() }
  const req: any = {
    scope,
    query: {},
    body: {},
    params: {},
    auth_context: customer ? { actor_type: "customer", actor_id: customer } : undefined,
  }
  return { req, res, journal, entitlements, graph }
}

describe("Zrkadielko – store API", () => {
  it("bez prihláseného zákazníka nič neprečíta", async () => {
    const f = fixture({ customer: null })
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(f.journal.listEntries).not.toHaveBeenCalled()
  })

  it("zákazníčka bez prístupu k programu dostane 403", async () => {
    const f = fixture({ entitled: false })
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(403)
    expect(f.journal.listEntries).not.toHaveBeenCalled()
  })

  it("vráti len vlastné záznamy a konfiguráciu hodnotení", async () => {
    const f = fixture()
    await GET(f.req, f.res)
    expect(f.journal.listEntries).toHaveBeenCalledWith("cus_a", "reset-40-plus", { limit: 50, offset: 0 })
    expect(f.res.status).toHaveBeenCalledWith(200)
    const body = f.res.json.mock.calls[0][0]
    expect(body.entries[0].id).toBe("rje_1")
    expect(body.entries[0].date).toBe("2026-08-14")
    expect(body.metrics[0].key).toBe("energia")
    expect(f.res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store")
  })

  it("nový záznam sa uloží s identitou zákazníčky (nie z požiadavky)", async () => {
    const f = fixture()
    f.req.body = { date: "2026-08-14", week: 3, metrics: { energia: 7 }, customer_id: "cus_other" }
    await POST(f.req, f.res)
    expect(f.journal.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: "cus_a", program: "reset-40-plus", week: 3, entry_date: "2026-08-14" }),
      expect.any(Array),
    )
    expect(f.res.status).toHaveBeenCalledWith(201)
  })

  it("záznam bez dátumu alebo bez hodnotení sa neuloží", async () => {
    const f = fixture()
    f.req.body = { metrics: { energia: 7 } }
    await POST(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    const g = fixture()
    g.req.body = { date: "2026-08-14" }
    await POST(g.req, g.res)
    expect(g.res.status).toHaveBeenCalledWith(400)
    expect(g.journal.createEntry).not.toHaveBeenCalled()
  })

  it("cudzí záznam sa nedá upraviť ani zmazať (404)", async () => {
    const f = fixture()
    f.journal.updateEntry.mockResolvedValue(null)
    f.journal.deleteEntry.mockResolvedValue(false)
    f.req.params = { id: "rje_other" }
    f.req.body = { metrics: { energia: 1 } }
    await PATCH(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(404)
    const g = fixture()
    g.journal.deleteEntry.mockResolvedValue(false)
    g.req.params = { id: "rje_other" }
    await DELETE(g.req, g.res)
    expect(g.res.status).toHaveBeenCalledWith(404)
  })

  it("vlastný záznam sa dá upraviť a zmazať", async () => {
    const f = fixture()
    f.req.params = { id: "rje_1" }
    f.req.body = { metrics: { energia: 3 } }
    await PATCH(f.req, f.res)
    expect(f.journal.updateEntry).toHaveBeenCalledWith("rje_1", "cus_a", "reset-40-plus", { metrics: { energia: 3 } }, expect.any(Array))
    expect(f.res.status).toHaveBeenCalledWith(200)
    const g = fixture()
    g.req.params = { id: "rje_1" }
    await DELETE(g.req, g.res)
    expect(g.journal.deleteEntry).toHaveBeenCalledWith("rje_1", "cus_a", "reset-40-plus")
    expect(g.res.status).toHaveBeenCalledWith(200)
  })
})
