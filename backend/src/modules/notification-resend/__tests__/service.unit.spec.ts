import ResendNotificationService from "../service"

const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as any
const base = { apiKey: "re_test", fromEmail: "noreply@example.com", fromName: "ANASTASIA" }
const mail = (to = "ceo@l-code-dynamics.com") =>
  ({ to, channel: "email", template: "order-placed-sk", content: { subject: "Objednávka", html: "<p>x</p>", text: "x" } }) as any

describe("ResendNotificationService", () => {
  it("posiela v tvare Resend API s Bearer autorizáciou a vracia id", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200, json: async () => ({ id: "msg_1" }) })
    const svc = new ResendNotificationService({ logger }, { ...base, replyTo: "info@example.com" }, fetchImpl as any)
    await expect(svc.send(mail())).resolves.toEqual({ id: "msg_1" })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe("https://api.resend.com/emails")
    expect(init.headers.Authorization).toBe("Bearer re_test")
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ from: "ANASTASIA <noreply@example.com>", to: ["ceo@l-code-dynamics.com"], subject: "Objednávka", html: "<p>x</p>", text: "x", reply_to: ["info@example.com"] })
    expect(body.htmlbody).toBeUndefined()
  })

  it("rešpektuje allowlist adresátov", async () => {
    const fetchImpl = jest.fn()
    const svc = new ResendNotificationService({ logger }, { ...base, recipientAllowlist: ["@l-code-dynamics.com"] }, fetchImpl as any)
    await expect(svc.send(mail("zakaznik@gmail.com"))).resolves.toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("odmietnutie vráti chybu s kódom, bez textu odpovede", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 403, json: async () => ({ name: "validation_error", message: "domain not verified for x@y" }) })
    const svc = new ResendNotificationService({ logger }, base, fetchImpl as any)
    await expect(svc.send(mail())).rejects.toThrow("Resend: odeslání odmítnuto (HTTP 403, validation_error)")
  })

  it("validácia vyžaduje kľúč a odosielateľa", () => {
    expect(() => ResendNotificationService.validateOptions({ fromEmail: "a@b.cz" })).toThrow("RESEND_API_KEY")
    expect(() => ResendNotificationService.validateOptions({ apiKey: "re_x", fromEmail: "zle" })).toThrow("RESEND_FROM_EMAIL")
  })
})
