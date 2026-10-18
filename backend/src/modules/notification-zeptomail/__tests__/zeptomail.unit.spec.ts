import ZeptoMailNotificationService, { recipientAllowed } from "../service"
import { TEMPLATE_NAMES, UnknownTemplateError, escapeHtml, formatDate, formatTime, renderTemplate, safeUrl } from "../templates"

const RECIPIENT = "zakaznicka@example.test"
const API_KEY = "test-key-not-real"

function makeLogger() {
  const lines: string[] = []
  const push = (msg: string) => { lines.push(msg) }
  return { lines, logger: { info: push, warn: push, error: push, debug: push } as any }
}

function makeFetch(status = 201, body: unknown = { request_id: "req_123", data: [{ code: "EM_104" }] }) {
  return jest.fn(async (_url: string, _init?: RequestInit) => ({
    status,
    json: async () => body,
  })) as unknown as jest.Mock & typeof fetch
}

function makeService(opts: Partial<ConstructorParameters<typeof ZeptoMailNotificationService>[1]> = {}, fetchImpl = makeFetch()) {
  const { lines, logger } = makeLogger()
  const service = new ZeptoMailNotificationService({ logger }, {
    apiKey: API_KEY,
    fromEmail: "noreply@anastasiaoz.eu",
    fromName: "ANASTASIA",
    replyTo: "info@anastasiaoz.eu",
    ...opts,
  }, fetchImpl)
  return { service, lines, fetchImpl }
}

const sentPayload = (fetchImpl: jest.Mock) => JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string)

describe("ZeptoMail – validateOptions", () => {
  it("vyžaduje apiKey a platný fromEmail", () => {
    expect(() => ZeptoMailNotificationService.validateOptions({ fromEmail: "a@b.sk" })).toThrow(/apiKey/)
    expect(() => ZeptoMailNotificationService.validateOptions({ apiKey: "k", fromEmail: "nope" })).toThrow(/fromEmail/)
    expect(() => ZeptoMailNotificationService.validateOptions({ apiKey: "k", fromEmail: "a@b.sk", replyTo: "x" })).toThrow(/replyTo/)
    expect(() => ZeptoMailNotificationService.validateOptions({ apiKey: "k", fromEmail: "a@b.sk", apiUrl: "http://api.zeptomail.eu" })).toThrow(/https/)
    expect(() => ZeptoMailNotificationService.validateOptions({ apiKey: "k", fromEmail: "a@b.sk", replyTo: "" })).not.toThrow()
  })
})

describe("ZeptoMail – send", () => {
  it("pošle magic link na EU API se správnou hlavičkou a bez sledování", async () => {
    const { service, fetchImpl } = makeService()
    const result = await service.send({
      to: RECIPIENT, channel: "email", template: "magic-link-sk",
      data: { url: "https://anastasiaoz.eu/ucet/prihlasenie?token=abc", ttl_minutes: 15 },
    } as any)

    expect(result).toEqual({ id: "req_123" })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://cpaas.zoho.eu/v1.1/email")
    expect((init.headers as Record<string, string>).Authorization).toBe(`Zoho-enczapikey ${API_KEY}`)
    const payload = sentPayload(fetchImpl)
    expect(payload.from).toEqual({ address: "noreply@anastasiaoz.eu", name: "ANASTASIA" })
    expect(payload.to).toEqual([{ email_address: { address: RECIPIENT } }])
    expect(payload.reply_to).toEqual([{ address: "info@anastasiaoz.eu" }])
    expect(payload.subject).toBe("Prihlasovací odkaz k vášmu účtu ANASTASIA")
    expect(payload.htmlbody).toContain('href="https://anastasiaoz.eu/ucet/prihlasenie?token=abc"')
    expect(payload.textbody).toContain("Odkaz platí 15 minút")
    expect(payload.track_clicks).toBe(false)
    expect(payload.track_opens).toBe(false)
    expect(payload.client_reference).toBe("magic-link-sk")
  })

  it("kontaktní formulář odpovídá odesílatelce, jinde zůstává globální reply-to", async () => {
    const { service, fetchImpl } = makeService()
    await service.send({ to: RECIPIENT, channel: "email", template: "contact-form-admin", data: { name: "Jana", email: "jana@example.com", topic: "Konzultácia", message: "Dobrý deň, otázka." } } as any)
    expect(sentPayload(fetchImpl).reply_to).toEqual([{ address: "jana@example.com" }])
    const other = makeService()
    await other.service.send({ to: RECIPIENT, channel: "email", template: "chat-admin-digest", data: { email: "jana@example.com", messages: 1, conversations: 1 } } as any)
    expect(sentPayload(other.fetchImpl).reply_to).toEqual([{ address: "info@anastasiaoz.eu" }])
  })

  it("nepřidá prefix, pokud ho klíč už má", async () => {
    const { service, fetchImpl } = makeService({ apiKey: `Zoho-enczapikey ${API_KEY}` })
    await service.send({ to: RECIPIENT, channel: "email", template: "chat-admin-digest", data: { messages: 2, conversations: 1 } } as any)
    expect(((fetchImpl.mock.calls[0][1] as RequestInit).headers as Record<string, string>).Authorization).toBe(`Zoho-enczapikey ${API_KEY}`)
  })

  it("předá PDF přílohu poukazu", async () => {
    const { service, fetchImpl } = makeService()
    await service.send({
      to: RECIPIENT, channel: "email", template: "gift-voucher-buyer-sk",
      data: { masked_code: "****-WXYZ", amount: "50,00 €", expires_at: "2027-10-15T10:00:00Z" },
      attachments: [{ content: "JVBERi0xLjQ=", filename: "poukaz.pdf", content_type: "application/pdf" }],
    } as any)
    const payload = sentPayload(fetchImpl)
    expect(payload.attachments).toEqual([{ content: "JVBERi0xLjQ=", name: "poukaz.pdf", mime_type: "application/pdf" }])
    expect(payload.textbody).toContain("Poukaz platí do 15. 10. 2027")
  })

  it("použije notification.content, pokud ho volající dodal", async () => {
    const { service, fetchImpl } = makeService()
    await service.send({
      to: RECIPIENT, channel: "email", template: "custom",
      content: { subject: "Predmet\r\nBcc: x@y.z", html: "<p>Ahoj</p>", text: "Ahoj" },
    } as any)
    const payload = sentPayload(fetchImpl)
    expect(payload.subject).toBe("Predmet Bcc: x@y.z")
    expect(payload.htmlbody).toBe("<p>Ahoj</p>")
  })

  it("odmítne neznámou šablonu, jiný kanál a neplatného adresáta bez volání API", async () => {
    const { service, fetchImpl, lines } = makeService()
    await expect(service.send({ to: RECIPIENT, channel: "email", template: "neexistuje", data: {} } as any)).rejects.toBeInstanceOf(UnknownTemplateError)
    await expect(service.send({ to: RECIPIENT, channel: "feed", template: "magic-link-sk", data: {} } as any)).rejects.toThrow(/kanál email/)
    await expect(service.send({ to: "bez-zavinace", channel: "email", template: "chat-admin-digest", data: {} } as any)).rejects.toThrow(/adresát/)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(lines.join("\n")).not.toContain(RECIPIENT)
  })

  it("při odmítnutí vyhodí chybu s HTTP stavem a kódem, bez adresáta a obsahu", async () => {
    const fetchImpl = makeFetch(400, { error: { code: "TM_3201", details: [{ code: "SERR_157", message: `Invalid ${RECIPIENT}` }] }, request_id: "req_err" })
    const { service, lines } = makeService({}, fetchImpl)
    const err = await service.send({ to: RECIPIENT, channel: "email", template: "magic-link-sk", data: { url: "https://anastasiaoz.eu/x?token=secret" } } as any).catch(e => e)
    expect(err.message).toBe("ZeptoMail: odeslání odmítnuto (HTTP 400, TM_3201,SERR_157)")
    const log = lines.join("\n")
    expect(log).toContain('"error_code":"TM_3201,SERR_157"')
    expect(log).toContain('"provider_message_id":"req_err"')
    expect(log).not.toContain(RECIPIENT)
    expect(log).not.toContain("token=secret")
    expect(log).not.toContain(API_KEY)
  })

  it("přečte kód chyby i ve formátu Zoho CPaaS (data.error_code)", async () => {
    const fetchImpl = makeFetch(400, { message: "error", data: { error_code: "TM_3004", message: `Invalid request for ${RECIPIENT}` } })
    const { service, lines } = makeService({}, fetchImpl)
    await expect(service.send({ to: RECIPIENT, channel: "email", template: "chat-admin-digest", data: {} } as any))
      .rejects.toThrow("ZeptoMail: odeslání odmítnuto (HTTP 400, TM_3004)")
    expect(lines.join("\n")).not.toContain(RECIPIENT)
  })

  it("síťová chyba i timeout končí chybou bez opakování", async () => {
    const network = jest.fn(async () => { throw new TypeError("fetch failed") }) as unknown as jest.Mock & typeof fetch
    const { service } = makeService({}, network)
    await expect(service.send({ to: RECIPIENT, channel: "email", template: "chat-admin-digest", data: {} } as any)).rejects.toThrow("(network)")
    expect(network).toHaveBeenCalledTimes(1)

    const hanging = jest.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
    })) as unknown as jest.Mock & typeof fetch
    const { service: slow } = makeService({ timeoutMs: 20 }, hanging)
    await expect(slow.send({ to: RECIPIENT, channel: "email", template: "chat-admin-digest", data: {} } as any)).rejects.toThrow("(timeout)")
    expect(hanging).toHaveBeenCalledTimes(1)
  })

  it("úspěšný log nese jen šablonu a ID požadavku", async () => {
    const { service, lines } = makeService()
    await service.send({ to: RECIPIENT, channel: "email", template: "gift-voucher-recipient-sk", data: { code: "ABCD-EFGH-IJKL", recipient_name: "Jana", message: "Všetko najlepšie" } } as any)
    const log = lines.join("\n")
    expect(log).toContain('"event":"provider_send"')
    expect(log).toContain('"template":"gift-voucher-recipient-sk"')
    expect(log).not.toContain(RECIPIENT)
    expect(log).not.toContain("ABCD-EFGH-IJKL")
    expect(log).not.toContain("Jana")
  })
})

describe("ZeptoMail – šablony", () => {
  it("vykreslí všechny šablony s minimálními daty", () => {
    const minimal: Record<string, Record<string, unknown>> = {
      "magic-link-sk": { url: "https://anastasiaoz.eu/x" },
      "gift-voucher-recipient-sk": { code: "ABCD-EFGH" },
    }
    for (const name of TEMPLATE_NAMES) {
      const out = renderTemplate(name, minimal[name] ?? {})
      expect(out.subject).toBeTruthy()
      expect(out.html).toContain("<!doctype html>")
      expect(out.text).toContain("ANASTASIA")
    }
  })

  it("escapuje data a nepustí nebezpečné odkazy", () => {
    const out = renderTemplate("gift-voucher-recipient-sk", { code: "ABCD-EFGH", recipient_name: "<script>alert(1)</script>", message: `"><img src=x onerror=alert(1)>` })
    expect(out.html).not.toContain("<script>")
    expect(out.html).not.toContain("<img")
    expect(out.html).toContain("&lt;script&gt;")
    expect(() => renderTemplate("magic-link-sk", { url: "javascript:alert(1)" })).toThrow(/missing url/)
    expect(renderTemplate("chat-admin-reply", { url: "data:text/html,x" }).html).not.toContain("data:text/html")
    expect(safeUrl("https://anastasiaoz.eu/a?b=1")).toBe("https://anastasiaoz.eu/a?b=1")
    expect(safeUrl("ftp://x")).toBeNull()
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;")
  })

  it("předmět z dat má přednost a nepustí nový řádek", () => {
    expect(renderTemplate("booking-confirmed-sk", { subject: "Potvrdenie\nBcc: x@y.z" }).subject).toBe("Potvrdenie Bcc: x@y.z")
    expect(renderTemplate("booking-confirmed-sk", {}).subject).toBe("Vaša konzultácia je potvrdená")
  })

  it("termín konzultace je v čase Bratislavy", () => {
    expect(formatDate("2026-10-20T08:00:00Z")).toBe("20. 10. 2026")
    expect(formatTime("2026-10-20T08:00:00Z")).toBe("10:00")
    const out = renderTemplate("booking-canceled-sk", { starts_at: "2026-10-20T08:00:00Z", ends_at: "2026-10-20T09:00:00Z", cancel_kind: "customer_request" })
    expect(out.text).toContain("Termín 20. 10. 2026 od 10:00 do 11:00 je zrušený.")
    expect(out.text).toContain("na Vašu žiadosť")
  })
})

describe("ZeptoMail – pojistka adresátů v testovacím provozu", () => {
  const send = (service: ZeptoMailNotificationService, to: string) => service.send({
    to, channel: "email", template: "magic-link-sk",
    data: { url: "https://anastasia-test.l-code-dynamics.com/ucet/prihlasenie?token=abc", ttl_minutes: 15 },
  } as any)

  it("recipientAllowed: přesná adresa, celá doména, bez subdomén, bez ohledu na velikost písmen", () => {
    const list = ["tester@example.test", "@l-code-dynamics.com"]
    expect(recipientAllowed("Tester@Example.TEST", list)).toBe(true)
    expect(recipientAllowed("kdokoli@l-code-dynamics.com", list)).toBe(true)
    expect(recipientAllowed("x@mail.l-code-dynamics.com", list)).toBe(false)
    expect(recipientAllowed("x@l-code-dynamics.com.evil.test", list)).toBe(false)
    expect(recipientAllowed("jina@example.test", list)).toBe(false)
    expect(recipientAllowed("kdokoli@example.test", [])).toBe(false)
    expect(recipientAllowed("kdokoli@example.test", undefined)).toBe(true)
  })

  it("mimo seznam se nic neodešle a log neobsahuje adresu", async () => {
    const { service, fetchImpl, lines } = makeService({ recipientAllowlist: ["@l-code-dynamics.com"] })
    await expect(send(service, RECIPIENT)).resolves.toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(lines.join("\n")).toMatch(/send_suppressed/)
    expect(lines.join("\n")).not.toContain(RECIPIENT)
  })

  it("prázdný seznam blokuje vše, povolená adresa projde", async () => {
    const blocked = makeService({ recipientAllowlist: [] })
    await send(blocked.service, "tester@l-code-dynamics.com")
    expect(blocked.fetchImpl).not.toHaveBeenCalled()
    const allowed = makeService({ recipientAllowlist: [" Tester@L-Code-Dynamics.com "] })
    await expect(send(allowed.service, "tester@l-code-dynamics.com")).resolves.toEqual({ id: "req_123" })
    expect(allowed.fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("validateOptions odmítne neplatnou položku seznamu", () => {
    const base = { apiKey: "k", fromEmail: "a@b.sk" }
    expect(() => ZeptoMailNotificationService.validateOptions({ ...base, recipientAllowlist: ["@l-code-dynamics.com", "x@y.sk"] })).not.toThrow()
    expect(() => ZeptoMailNotificationService.validateOptions({ ...base, recipientAllowlist: [] })).not.toThrow()
    expect(() => ZeptoMailNotificationService.validateOptions({ ...base, recipientAllowlist: ["l-code-dynamics.com"] })).toThrow(/EMAIL_RECIPIENT_ALLOWLIST/)
    expect(() => ZeptoMailNotificationService.validateOptions({ ...base, recipientAllowlist: "x@y.sk" })).toThrow(/EMAIL_RECIPIENT_ALLOWLIST/)
  })
})
