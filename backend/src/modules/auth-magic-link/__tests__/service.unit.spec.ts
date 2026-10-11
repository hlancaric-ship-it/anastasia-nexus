import { MedusaError, ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import MagicLinkAuthService, { MAGIC_LINK_REQUESTED_EVENT } from "../service"
import { sha256Hex, stateKey } from "../policy"

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

    const [key, value, ttl] = auth.setState.mock.calls[0] as [string, { tokenHash: string }, number]
    expect(key).toBe(stateKey("a@b.sk"))
    expect(ttl).toBe(900)

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

  it("propojí existující migrovaný účet zákaznice přes SQL, jen pokud ještě není propojen", async () => {
    const { svc, calls } = makeProvider({
      pgRows: {
        "select": [[{ id: "cus_1" }], [{ app_metadata: { customer_id: "cus_1" } }]],
      },
    })
    const auth = makeAuthIdentityProviderService()
    const email = "zakaznice@b.sk"
    auth.__store.set(stateKey(email), { email, tokenHash: sha256Hex("tok") })
    const result: any = await svc.authenticate({ body: { email, token: "tok" } }, auth)
    expect(result.success).toBe(true)
    expect(result.authIdentity.app_metadata).toEqual({ customer_id: "cus_1" })
    expect(calls.some((c) => c.sql.includes("update auth_identity"))).toBe(true)
  })

  it("žádný migrovaný zákazník s tímto e-mailem: přihlásí bez propojení, bez pokusu o update", async () => {
    const { svc, calls } = makeProvider({ pgRows: { "select": [[]] } })
    const auth = makeAuthIdentityProviderService()
    const email = "neznama@b.sk"
    auth.__store.set(stateKey(email), { email, tokenHash: sha256Hex("tok") })
    const result: any = await svc.authenticate({ body: { email, token: "tok" } }, auth)
    expect(result.success).toBe(true)
    expect(result.authIdentity.app_metadata).toEqual({})
    expect(calls.some((c) => c.sql.includes("update auth_identity"))).toBe(false)
  })

  it("již propojená identita se znovu nepokouší o SQL update", async () => {
    const { svc, calls } = makeProvider()
    const auth = makeAuthIdentityProviderService({
      retrieve: jest.fn(async () => ({ id: "authid_1", entity_id: "a@b.sk", app_metadata: { customer_id: "cus_1" } })),
    })
    auth.__store.set(stateKey("a@b.sk"), { email: "a@b.sk", tokenHash: sha256Hex("tok") })
    const result: any = await svc.authenticate({ body: { email: "a@b.sk", token: "tok" } }, auth)
    expect(result.authIdentity.app_metadata).toEqual({ customer_id: "cus_1" })
    expect(calls).toHaveLength(0)
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
