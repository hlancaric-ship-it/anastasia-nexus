import {
  batchSize, dailyLimit, listUnsubscribeHeaders, newsletterSecret, NewsletterError,
  remainingDailyBudget, renderCampaignEmail, unsubscribeSignature, unsubscribeUrl, verifyUnsubscribeSignature,
} from "../policy"

const SECRET = "testovaci-secret-pre-newsletter-32-znakov"

describe("podpísaný odhlasovací odkaz", () => {
  it("podpis je deterministický HMAC-SHA256 v hex tvare", () => {
    const signature = unsubscribeSignature("lgl_123", SECRET)
    expect(signature).toMatch(/^[a-f0-9]{64}$/)
    expect(unsubscribeSignature("lgl_123", SECRET)).toBe(signature)
    expect(unsubscribeSignature("lgl_124", SECRET)).not.toBe(signature)
  })

  it("overí správny podpis a odmietne zmenené ID, podpis aj cudzí secret", () => {
    const signature = unsubscribeSignature("lgl_123", SECRET)
    expect(verifyUnsubscribeSignature("lgl_123", signature, SECRET)).toBe(true)
    expect(verifyUnsubscribeSignature("lgl_999", signature, SECRET)).toBe(false)
    expect(verifyUnsubscribeSignature("lgl_123", signature.slice(0, -1) + "0", SECRET)).toBe(false)
    expect(verifyUnsubscribeSignature("lgl_123", signature, SECRET + "x")).toBe(false)
    expect(verifyUnsubscribeSignature("lgl_123", "nie-hex", SECRET)).toBe(false)
    expect(verifyUnsubscribeSignature(undefined, signature, SECRET)).toBe(false)
  })

  it("bez dostatočne dlhého secretu odosielanie odmietne", () => {
    expect(() => newsletterSecret({} as any)).toThrow(NewsletterError)
    expect(() => newsletterSecret({ NEWSLETTER_UNSUBSCRIBE_SECRET: "kratke" } as any)).toThrow("NEWSLETTER_NOT_CONFIGURED")
    expect(newsletterSecret({ NEWSLETTER_UNSUBSCRIBE_SECRET: SECRET } as any)).toBe(SECRET)
  })

  it("vytvorí URL na stránku potvrdenia a hlavičky pre jednoklikové odhlásenie", () => {
    const url = unsubscribeUrl("lgl_123", SECRET, "https://api.example.test/")
    expect(url).toBe(`https://api.example.test/store/newsletter/unsubscribe/link?c=lgl_123&s=${unsubscribeSignature("lgl_123", SECRET)}`)
    expect(listUnsubscribeHeaders(url)).toEqual([
      { name: "List-Unsubscribe", value: `<${url}>` },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ])
  })
})

describe("limity dávky", () => {
  it("predvolene 40 na beh a 90 za 24 hodín, hodnoty z prostredia sa orezú", () => {
    expect(batchSize({} as any)).toBe(40)
    expect(dailyLimit({} as any)).toBe(90)
    expect(batchSize({ NEWSLETTER_BATCH: "7" } as any)).toBe(7)
    expect(batchSize({ NEWSLETTER_BATCH: "0" } as any)).toBe(1)
    expect(batchSize({ NEWSLETTER_BATCH: "9999" } as any)).toBe(200)
    expect(dailyLimit({ NEWSLETTER_DAILY_LIMIT: "90" } as any)).toBe(90)
    expect(dailyLimit({ NEWSLETTER_DAILY_LIMIT: "-4" } as any)).toBe(1)
  })

  it("denný rozpočet rešpektuje oba limity", () => {
    expect(remainingDailyBudget(0, 90, 40)).toBe(40)
    expect(remainingDailyBudget(70, 90, 40)).toBe(20)
    expect(remainingDailyBudget(89, 90, 40)).toBe(1)
    expect(remainingDailyBudget(90, 90, 40)).toBe(0)
    expect(remainingDailyBudget(120, 90, 40)).toBe(0)
    expect(remainingDailyBudget(Number.NaN, 90, 40)).toBe(40)
  })
})

describe("šablóna e-mailu", () => {
  it("použije levanduľovú paletu a odkaz na odhlásenie", () => {
    const link = "https://api.example.test/store/newsletter/unsubscribe/link?c=lgl_1&s=abc"
    const { html, text } = renderCampaignEmail({ subject: "Novinky", preheader: "Krátky úvod", bodyHtml: "<p>Dobrý deň</p>", unsubscribeUrl: link })
    expect(html).toContain("background:#e9e9f2")
    expect(html).toContain("#a7a5cf")
    expect(html).toContain("#73729c")
    expect(html).toContain("#2b2a3a")
    expect(html).not.toContain("#5f7a5a")
    expect(html).toContain("ANASTASIA")
    expect(html).toContain("Light for the future")
    expect(html).toContain('href="https://api.example.test/store/newsletter/unsubscribe/link?c=lgl_1&amp;s=abc"')
    expect(html).toContain("Odhlásiť sa z odberu")
    expect(text).toContain("Dobrý deň")
    expect(text).toContain(link)
  })

  it("vykreslí nadpisy obsahu v kontrastnej levanduľovej", () => {
    const { html } = renderCampaignEmail({ subject: "Novinky", bodyHtml: "<h2>Nový článok</h2><p>Text</p>" })
    expect(html).toContain('<h2 style="color:#73729c">Nový článok</h2>')
  })

  it("testovací e-mail bez súhlasu nemá vymyslený odkaz", () => {
    const { html } = renderCampaignEmail({ subject: "Test", bodyHtml: "<p>Test</p>", unsubscribeUrl: null })
    expect(html).not.toContain("unsubscribe/link")
    expect(html).toContain("testovacia správa")
  })

  it("texty neobsahujú bodkočiarku", () => {
    const { html } = renderCampaignEmail({ subject: "Novinky", bodyHtml: "<p>Text</p>", unsubscribeUrl: "https://example.test/u" })
    const visible = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/style="[^"]*"/gi, "")
    expect(visible.includes(";")).toBe(false)
  })
})
