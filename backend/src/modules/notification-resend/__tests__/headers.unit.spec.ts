import ResendNotificationService from "../service"
import ZeptoMailNotificationService, { providerHeaders } from "../../notification-zeptomail/service"

const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as any
const base = { apiKey: "re_test", fromEmail: "noreply@example.com", fromName: "ANASTASIA" }
const url = "https://api.example.test/store/newsletter/unsubscribe/link?c=lgl_1&s=abc"

const mail = (provider_data: Record<string, unknown>) =>
  ({ to: "ceo@l-code-dynamics.com", channel: "email", template: "newsletter-campaign", content: { subject: "Novinky", html: "<p>x</p>" }, provider_data }) as any

describe("hlavičky e-mailu pre newsletter", () => {
  it("pustí len List-Unsubscribe hlavičky bez CR/LF", () => {
    expect(providerHeaders({ headers: [
      { name: "List-Unsubscribe", value: `<${url}>` },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
      { name: "X-Custom", value: "nie" },
      { name: "List-Unsubscribe", value: "a\r\nBcc: x@example.test" },
      { name: "List-Unsubscribe" },
    ] })).toEqual([
      { name: "List-Unsubscribe", value: `<${url}>` },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ])
    expect(providerHeaders(undefined)).toEqual([])
  })

  it("Resend pošle hlavičky v poli headers", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200, json: async () => ({ id: "msg_1" }) })
    const service = new ResendNotificationService({ logger }, base, fetchImpl as any)
    await service.send(mail({ headers: [{ name: "List-Unsubscribe", value: `<${url}>` }, { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" }] }))
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.headers).toEqual({ "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" })
  })

  it("ZeptoMail získa hlavičky v payloade", () => {
    const service: any = new ZeptoMailNotificationService({ logger }, { apiKey: "z", fromEmail: "noreply@example.com" } as any, jest.fn() as any)
    const payload = service.buildPayload(mail({ headers: [{ name: "List-Unsubscribe", value: `<${url}>` }] }))
    expect(payload.headers).toEqual([{ name: "List-Unsubscribe", value: `<${url}>` }])
  })
})
