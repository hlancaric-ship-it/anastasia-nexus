import ResetJournalModuleService from "../service"
import { RESET_JOURNAL_METRICS } from "../../../lib/reset-program/config"

jest.mock("@medusajs/framework/utils", () => {
  const original = jest.requireActual("@medusajs/framework/utils")
  return {
    ...original,
    MedusaService: (model: any) => {
      class MockService {
        protected modelDefinition = model
        async listResetJournalEntries() { return [] }
        async listAndCountResetJournalEntries() { return [[], 0] }
        async createResetJournalEntries(data: any) { return data }
        async updateResetJournalEntries(data: any) { return data }
        async deleteResetJournalEntries(ids: any) { return ids }
      }
      return MockService
    },
  }
})

const config = RESET_JOURNAL_METRICS.map((metric) => ({ ...metric }))

/** Jednoduchá kocka knex: zaznamenáva dotazy a vráti pripravené výsledky. */
function fakeKnex(options: { count?: number; deleted?: number } = {}) {
  const calls: any[] = []
  const builder: any = {
    where: jest.fn((arg: any) => { calls.push(["where", arg]); return builder }),
    whereNull: jest.fn((column: string) => { calls.push(["whereNull", column]); return builder }),
    whereNot: jest.fn((...args: any[]) => { calls.push(["whereNot", ...args]); return builder }),
    count: jest.fn(() => builder),
    first: jest.fn(async () => ({ count: String(options.count ?? 0) })),
    delete: jest.fn(async () => options.deleted ?? 0),
  }
  const knex: any = jest.fn((table: string) => { calls.push(["table", table]); return builder })
  knex.raw = jest.fn(async () => undefined)
  knex.calls = calls
  return knex
}

const contextWith = (knex: any): any => ({ transactionManager: { getTransactionContext: () => knex } })

describe("Zrkadielko – modul služby", () => {
  let service: ResetJournalModuleService

  beforeEach(() => {
    // @ts-ignore – mocknutá implementácia MedusaService
    service = new ResetJournalModuleService()
  })

  it("listuje len záznamy zákazníčky a programu", async () => {
    const list = jest.spyOn(service as any, "listAndCountResetJournalEntries").mockResolvedValue([[{ id: "rje_1" }], 1])
    const result = await service.listEntries("cus_a", "reset-40-plus", { limit: 10, offset: 0 })
    expect(list.mock.calls[0][0]).toEqual({ customer_id: "cus_a", program: "reset-40-plus" })
    expect(result.count).toBe(1)
  })

  it("vytvorí záznam s overenými hodnotami a dátumom", async () => {
    const created = jest.spyOn(service as any, "createResetJournalEntries").mockImplementation(async (data: any) => ({ id: "rje_1", ...data }))
    const knex = fakeKnex({ count: 0 })
    const entry = await service.createEntry(
      { customer_id: "cus_a", program: "reset-40-plus", week: 3, entry_date: "2026-08-14", metrics: { energia: 7, spanok: 5, stres: 4 } },
      config,
      contextWith(knex),
    )
    const data = created.mock.calls[0][0] as any
    expect(data.customer_id).toBe("cus_a")
    expect(data.week).toBe(3)
    expect(data.entry_date.toISOString()).toBe("2026-08-14T00:00:00.000Z")
    expect(data.metrics).toEqual({ energia: 7, spanok: 5, stres: 4 })
    expect(entry.id).toBe("rje_1")
  })

  it("odmietne dátum v budúcnosti", async () => {
    const knex = fakeKnex()
    const tomorrow = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    await expect(
      service.createEntry({ customer_id: "cus_a", program: "reset-40-plus", entry_date: tomorrow, metrics: { energia: 7 } }, config, contextWith(knex)),
    ).rejects.toMatchObject({ code: "JOURNAL_DATE_IN_FUTURE" })
  })

  it("odmietne hodnotu mimo rozsahu a neznámy kľúč metriky", async () => {
    const knex = fakeKnex()
    await expect(
      service.createEntry({ customer_id: "cus_a", program: "reset-40-plus", entry_date: "2026-08-14", metrics: { energia: 11 } }, config, contextWith(knex)),
    ).rejects.toMatchObject({ code: "JOURNAL_METRIC_OUT_OF_RANGE" })
    await expect(
      service.createEntry({ customer_id: "cus_a", program: "reset-40-plus", entry_date: "2026-08-14", metrics: { cudzi: 5 } }, config, contextWith(knex)),
    ).rejects.toMatchObject({ code: "JOURNAL_METRIC_UNKNOWN" })
  })

  it("dodrží denný limit záznamov", async () => {
    const knex = fakeKnex({ count: 10 })
    await expect(
      service.createEntry({ customer_id: "cus_a", program: "reset-40-plus", entry_date: "2026-08-14", metrics: { energia: 7 } }, config, contextWith(knex)),
    ).rejects.toMatchObject({ code: "JOURNAL_DAILY_LIMIT" })
  })

  it("cudzí záznam sa nedá upraviť (vráti null)", async () => {
    jest.spyOn(service as any, "listResetJournalEntries").mockResolvedValue([])
    const knex = fakeKnex()
    const updated = await service.updateEntry("rje_other", "cus_a", "reset-40-plus", { metrics: { energia: 3 } }, config, contextWith(knex))
    expect(updated).toBeNull()
  })

  it("úprava vlastného záznamu prebehne a uloží nové hodnoty", async () => {
    jest.spyOn(service as any, "listResetJournalEntries").mockResolvedValue([{ id: "rje_1", customer_id: "cus_a", entry_date: new Date("2026-08-14T00:00:00.000Z") }])
    const update = jest.spyOn(service as any, "updateResetJournalEntries").mockImplementation(async (data: any) => ({ ...data }))
    const knex = fakeKnex({ count: 0 })
    const updated = await service.updateEntry("rje_1", "cus_a", "reset-40-plus", { metrics: { energia: 2 } }, config, contextWith(knex))
    expect(update.mock.calls[0][0]).toMatchObject({ id: "rje_1", metrics: { energia: 2 } })
    expect(updated?.id).toBe("rje_1")
  })

  it("zmazanie prejde cez filter zákazníčky (SQL, nie iba kontrola v kóde)", async () => {
    const knex = fakeKnex({ deleted: 1 })
    const deleted = await service.deleteEntry("rje_1", "cus_a", "reset-40-plus", contextWith(knex))
    expect(deleted).toBe(true)
    const whereArg = knex.calls.find((call: any[]) => call[0] === "where")?.[1]
    expect(whereArg).toEqual({ id: "rje_1", customer_id: "cus_a", program: "reset-40-plus" })
  })

  it("zmazanie cudzieho záznamu nič nezmaze", async () => {
    const knex = fakeKnex({ deleted: 0 })
    const deleted = await service.deleteEntry("rje_other", "cus_a", "reset-40-plus", contextWith(knex))
    expect(deleted).toBe(false)
  })
})
