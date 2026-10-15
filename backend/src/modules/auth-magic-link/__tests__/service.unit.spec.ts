import { MedusaError, ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import MagicLinkAuthService, { MAGIC_LINK_REQUESTED_EVENT } from "../service"
import { sha256Hex, stateKey } from "../policy"
import { storeLink, consumeLink } from "../state"
jest.mock("../state")

function makeProvider(overrides: { pgRows?: Record<string, any[][]>; emit?: jest.Mock } = {}) {
  const emit = overrides.emit ?? jest.fn(async () => undefined)
  const calls: Array<{ sql: string; bindings: unknown[] }> = []
  const pg = {
    raw: jest.fn(async (sql: string, bindings: unknown[] = []) => {
      calls.push({ sql, bindings })
      const key = sql.trim().slice(0, 6).toLowerCase()
      const planned = overrides.pgRows?.[key]
      const rows = planned ? planned.shift() ?? [] : []
      return { rows }
    }),
  }
  const cradle = { logger: { warn: jest.fn(), error: jest.fn() }, [ContainerRegistrationKeys.PG_CONNECTION]: pg, [Modules.EVENT_BUS]: { emit } }
  const svc = new (MagicLinkAuthService as any)(cradle, { linkBaseUrl: "https://app.example.sk/prihlasenie" })
  return { svc, pg, emit, calls }
}

function makeAuthIdentityProviderService(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const store = new Map<string, any>()
  jest.mocked(storeLink).mockImplementation(async (_db, email, token) => { store.set(stateKey(email), { email, tokenHash: sha256Hex(token) }) })
  jest.mocked(consumeLink).mockImplementation(async (_db, email, token) => {
    const value = store.get(stateKey(email))
    if (!value || value.tokenHash !== sha256Hex(token)) return false
    store.delete(stateKey(email)); return true
  })
  return {
    setState: jest.fn(async (key: string, value: any) => { store.set(key, value) }),
    getState: jest.fn(async (key: string) => { const v = store.get(key) ?? null; store.delete(key); return v }),
    retrieve: jest.fn(async () => { throw new MedusaError(MedusaError.Types.NOT_FOUND, "not found") }),
    create: jest.fn(async (data: any) => ({ id: "authid_1", entity_id: data.entity_id, app_metadata: {} })),
    update: jest.fn(async () => { throw new Error("not used") }),
    ...overrides,
    __store: store,
  } as any
}

describe("MagicLinkAuthService.authenticate", () => {
  it("fáze 1: uloží jen hash tokenu a vyžádá odeslání eventem; link v URL nese syrový token, ne hash", async () => {
    const { svc, emit } = makeProvider()
    const auth = makeAuthIdentityProviderService()
    const result = await svc.authenticate({ body: { email: "A@B.sk" } }, auth)
    expect(result).toEqual({ success: false, error: "LINK_SENT" })

    const value = auth.__store.get(stateKey("a@b.sk"))
    expect(value.email).toBe("a@b.sk")
    expect(value.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(auth.setState).not.toHaveBeenCalled()

    expect(emit).toHaveBeenCalledTimes(1)
    const emitted = emit.mock.calls[0][0] as { name: string; data: { email: string; url: string } }
    expect(emitted.name).toBe(MAGIC_LINK_REQUESTED_EVENT)
    expect(emitted.data.email).toBe("a@b.sk")
    expect(emitted.data.url).not.toContain(value.tokenHash) // odkaz nese syrový token, ne jeho hash
  })

  it("neplatný e-mail se odmítne bez volání setState", async () => {
    const { svc } = makeProvider()
    const auth = makeAuthIdentityProviderService()
    expect(await svc.authenticate({ body: { email: "neplatny" } }, auth)).toEqual({ success: false, error: "INVALID_EMAIL" })
    expect(auth.setState).not.toHaveBeenCalled()
  })

  it("fáze 2: správný token přihlásí (bez existujícího migrovaného zákazníka)", async () => {
    const { svc } = makeProvider()
    const auth = makeAuthIdentityProviderService()
    const email = "a@b.sk"
    auth.__store.set(stateKey(email), { email, tokenHash: sha256Hex("tok-123") })
    const result: any = await svc.authenticate({ body: { email, token: "tok-123" } }, auth)
    expect(result.success).toBe(true)
    expect(result.authIdentity.entity_id).toBe(email)
    expect(result.authIdentity.app_metadata).toEqual({})
  })

  it("fáze 2: vypršelý/neexistující/cizí e-mail/špatný token se odmítne", async () => {
    const { svc } = makeProvider()
    const auth = makeAuthIdentityProviderService()
    expect(await svc.authenticate({ body: { email: "a@b.sk", token: "x" } }, auth)).toEqual({ success: false, error: "INVALID_OR_EXPIRED_TOKEN" })
    auth.__store.set(stateKey("a@b.sk"), { email: "a@b.sk", tokenHash: sha256Hex("tok") })
    expect(await svc.authenticate({ body: { email: "a@b.sk", token: "spatny" } }, auth)).toEqual({ success: false, error: "INVALID_OR_EXPIRED_TOKEN" })
  })

  it("propojí existující migrovaný účet zákaznice přes SQL (CTE), jen pokud ještě není propojen", async () => {
    const { svc, calls } = makeProvider({
      pgRows: { "with c": [[{ app_metadata: { customer_id: "cus_1" }, customer_id: "cus_1" }]] },
    })
    const auth = makeAuthIdentityProviderService()
    const email = "zakaznice@b.sk"
    auth.__store.set(stateKey(email), { email, tokenHash: sha256Hex("tok") })
    const result: any = await svc.authenticate({ body: { email, token: "tok" } }, auth)
    expect(result.success).toBe(true)
    expect(result.authIdentity.app_metadata).toEqual({ customer_id: "cus_1" })
    expect(calls.some((c) => c.sql.includes("with candidate_customers"))).toBe(true)
  })

  it("žádný migrovaný zákazník (nebo nejednoznačný duplicitní e-mail): CTE nic nevrátí, přihlásí bez propojení", async () => {
    // Stejná odpověď pro „žádný zákazník" i pro „víc zákaznic se stejným e-mailem" (HAVING count(*)=1
    // v reálné CTE obě situace sbalí na 0 řádků) — skutečnou SQL logiku ověřuje live e2e test, ne mock.
    const { svc, calls } = makeProvider({ pgRows: { "with c": [[]], "select": [[]] } })
    const auth = makeAuthIdentityProviderService()
    const email = "neznama@b.sk"
    auth.__store.set(stateKey(email), { email, tokenHash: sha256Hex("tok") })
    const result: any = await svc.authenticate({ body: { email, token: "tok" } }, auth)
    expect(result.success).toBe(true)
    expect(result.authIdentity.app_metadata).toEqual({})
    // jediný CTE pokus (bez rozlišení "neexistuje" vs. "duplicitní") + jeden zpětný select, nic víc
    expect(calls).toHaveLength(2)
  })

  it("již propojená identita: jen obnoví has_account, žádný další SQL update identity", async () => {
    const { svc, calls } = makeProvider({ pgRows: { "update": [[{ id: "cus_1" }]] } })
    const auth = makeAuthIdentityProviderService({
      retrieve: jest.fn(async () => ({ id: "authid_1", entity_id: "a@b.sk", app_metadata: { customer_id: "cus_1" } })),
    })
    auth.__store.set(stateKey("a@b.sk"), { email: "a@b.sk", tokenHash: sha256Hex("tok") })
    const result: any = await svc.authenticate({ body: { email: "a@b.sk", token: "tok" } }, auth)
    expect(result.authIdentity.app_metadata).toEqual({ customer_id: "cus_1" })
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain("update customer")
  })

  it("propojená identita s nesouhlasícím e-mailem (manipulovaný stav) se odmítne", async () => {
    const { svc } = makeProvider({ pgRows: { "update": [[]] } }) // 0 řádků: email/id neodpovídají
    const auth = makeAuthIdentityProviderService({
      retrieve: jest.fn(async () => ({ id: "authid_1", entity_id: "a@b.sk", app_metadata: { customer_id: "cus_1" } })),
    })
    auth.__store.set(stateKey("a@b.sk"), { email: "a@b.sk", tokenHash: sha256Hex("tok") })
    await expect(svc.authenticate({ body: { email: "a@b.sk", token: "tok" } }, auth)).rejects.toMatchObject({ type: "unauthorized" })
  })

  it("chyba při vyžádání odeslání (event bus) se spolkne a fáze 1 stejně vrátí LINK_SENT", async () => {
    const { svc } = makeProvider({ emit: jest.fn(async () => { throw new Error("broker down") }) })
    const auth = makeAuthIdentityProviderService()
    expect(await svc.authenticate({ body: { email: "a@b.sk" } }, auth)).toEqual({ success: false, error: "LINK_SENT" })
  })
})

describe("regression: prázdný MAGIC_LINK_BASE_URL (env vrací '', ne undefined)", () => {
  it("prázdný řetězec v options nesmí obejít výchozí URL", async () => {
    const { svc, emit } = (function () {
      const emit = jest.fn(async () => undefined)
      const pg = { raw: jest.fn(async () => ({ rows: [] })) }
      const cradle = { logger: { warn: jest.fn(), error: jest.fn() }, [ContainerRegistrationKeys.PG_CONNECTION]: pg, [Modules.EVENT_BUS]: { emit } }
      return { svc: new (MagicLinkAuthService as any)(cradle, { linkBaseUrl: "" }), emit }
    })()
    const auth = makeAuthIdentityProviderService()
    await svc.authenticate({ body: { email: "a@b.sk" } }, auth)
    const emitCalls = emit.mock.calls as unknown as Array<[{ data: { url: string } }]>
    expect(emitCalls[0][0].data.url.startsWith("http")).toBe(true)
  })
})
