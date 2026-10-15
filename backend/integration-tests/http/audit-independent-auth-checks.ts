import { Modules } from "@medusajs/framework/utils"

/**
 * Only registered by safeorder-persistence.spec.ts after its synthetic-cluster
 * guard. Every case is its own Jest test: failures cannot skip later cases.
 * All email delivery events are intercepted. No real mail or external requests.
 */
export function registerIndependentAuthChecks({ api, getContainer }: {
  api: any
  getContainer: () => any
}) {
  const opts = { validateStatus: () => true }

  const captureLinks = async (email: string, run: (links: string[]) => Promise<void>) => {
    const container = getContainer()
    await container.resolve(Modules.CUSTOMER).createCustomers({ email })
    const events = container.resolve(Modules.EVENT_BUS)
    const emit = events.emit.bind(events)
    const links: string[] = []
    const spy = jest.spyOn(events, "emit").mockImplementation(async (...args: any[]) => {
      const event = args[0]
      if (event?.name === "auth-magic-link.requested" && event.data?.email === email) {
        links.push(String(event.data.url))
        return
      }
      return emit(...args)
    })
    try { await run(links) } finally { spy.mockRestore() }
  }

  it("AUD-AUTH-01 invalid token must not destroy a waiting valid link", async () => {
    await captureLinks("synthetic-auth01@example.test", async links => {
      const endpoint = "/auth/customer/magic-link"
      await api.post(endpoint, { email: "synthetic-auth01@example.test" }, opts)
      expect(links).toHaveLength(1)
      const validToken = new URL(links[0]).searchParams.get("token")
      expect(validToken).toBeTruthy()
      const invalid = await api.post(endpoint, { email: "synthetic-auth01@example.test", token: "synthetic-invalid" }, opts)
      const valid = await api.post(endpoint, { email: "synthetic-auth01@example.test", token: validToken }, opts)
      // Do not disclose tokens or personal data; only statuses.
      if (invalid.status !== 401 || valid.status !== 200) {
        throw new Error(`AUD-AUTH-01: invalidStatus=${invalid.status} legitimateStatus=${valid.status}`)
      }
    })
  })

  it("AUD-AUTH-02 concurrent one-time token confirmation yields at most one success", async () => {
    await captureLinks("synthetic-auth02@example.test", async links => {
      const endpoint = "/auth/customer/magic-link"
      await api.post(endpoint, { email: "synthetic-auth02@example.test" }, opts)
      expect(links).toHaveLength(1)
      const token = new URL(links[0]).searchParams.get("token")
      expect(token).toBeTruthy()
      const pair = await Promise.all([0, 1].map(() => api.post(endpoint, {
        email: "synthetic-auth02@example.test", token
      }, opts)))
      const successes = pair.filter((item: any) => item.status === 200).length
      if (successes > 1) throw new Error(`AUD-AUTH-02: duplicateSuccess=${successes}`)
      expect(successes).toBe(1)
    })
  })

  it("AUD-AUTH-03 bounded six-request concurrent magic-link burst enforces abuse control", async () => {
    await captureLinks("synthetic-auth03@example.test", async links => {
      const endpoint = "/auth/customer/magic-link"
      const attempts = await Promise.all(Array.from({ length: 6 }, () =>
        api.post(endpoint, { email: "synthetic-auth03@example.test" }, opts)
      ))
      const statuses = attempts.map((item: any) => item.status)
      const rateLimited = statuses.filter((status: number) => status === 429).length
      // A bounded, same-recipient offline probe. No external emails are sent.
      // If all six generate deliveries without a rate-limit response, fail clearly.
      if (links.length === 6 && rateLimited === 0) {
        throw new Error("AUD-AUTH-03: sixOfSixEvents=true rateLimited=0")
      }
    })
  })
}
