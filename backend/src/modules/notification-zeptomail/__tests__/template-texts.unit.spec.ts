import { SLOT_MAX_LENGTH, TEMPLATE_NAMES, getTemplateDef, listTemplateDefs, renderPreview, renderTemplate, validateTexts } from "../templates"

const ORDER = {
  order_display_id: "1042",
  first_name: "Jana",
  items: [{ title: "Kurz <b>RESET</b>", quantity: 2, total: "118,00 €" }],
  subtotal: "118,00 €",
  shipping_total: "3,50 €",
  discount_total: "10,00 €",
  total: "111,50 €",
  paid: true,
  url: "https://anastasiaoz.eu/ucet/objednavky/order_1",
}

describe("šablony – katalóg pre admin", () => {
  it("každá šablóna má popis, sloty s predmetom a ukážkový náhľad", () => {
    const defs = listTemplateDefs()
    expect(defs.map(d => d.name)).toEqual([...TEMPLATE_NAMES])
    for (const def of defs) {
      expect(def.label).toBeTruthy()
      expect(def.slots.find(s => s.key === "subject")).toBeTruthy()
      expect((def as any).build).toBeUndefined()
      const preview = renderPreview(def.name)
      expect(preview.subject).toBeTruthy()
      expect(preview.html).not.toMatch(/\{[a-z_]+\}/)
      expect(preview.text).not.toMatch(/\{[a-z_]+\}/)
      // predvolené texty používajú len povolené premenné
      expect(validateTexts(def.name, Object.fromEntries(def.slots.map(s => [s.key, s.default + " "]))).ok).toBe(true)
    }
  })

  it("povinné sú len prihlásenie, poukazy a kontaktný formulár", () => {
    expect(listTemplateDefs().filter(d => d.required).map(d => d.name).sort()).toEqual(["contact-form-admin", "gift-voucher-buyer-sk", "gift-voucher-recipient-sk", "magic-link-sk"])
    expect(getTemplateDef("neexistuje")).toBeNull()
  })
})

describe("šablony – objednávka", () => {
  it("vykreslí položky, dopravu, zľavu a súčet a escapuje názvy", () => {
    const out = renderTemplate("order-placed-sk", ORDER)
    expect(out.subject).toBe("Potvrdenie objednávky č. 1042")
    expect(out.html).toContain("Kurz &lt;b&gt;RESET&lt;/b&gt; × 2")
    expect(out.html).not.toContain("<b>RESET")
    expect(out.text).toContain("Medzisúčet: 118,00 €")
    expect(out.text).toContain("Doprava: 3,50 €")
    expect(out.text).toContain("Zľava: −10,00 €")
    expect(out.text).toContain("Spolu: 111,50 €")
    expect(out.text).toContain("Platbu vo výške 111,50 € sme prijali")
    expect(renderTemplate("order-placed-sk", { ...ORDER, paid: false }).text).toContain("Objednávku vybavíme hneď po prijatí platby")
  })

  it("bez čísla objednávky nevznikne prázdna premenná v predmete", () => {
    const out = renderTemplate("order-placed-sk", { total: "10 €" })
    expect(out.subject).toBe("Potvrdenie objednávky č.")
    expect(out.text).toContain("Vašu objednávku sme prijali.")
  })

  it("zásielka: sledovanie má prednosť pred odkazom do účtu", () => {
    const out = renderTemplate("order-shipped-sk", { order_display_id: "7", tracking_number: "SK1", tracking_url: "https://track.example.test/SK1", url: ORDER.url })
    expect(out.text).toContain("Číslo zásielky: SK1")
    expect(out.text).toContain("Sledovať zásielku: https://track.example.test/SK1")
    const noTracking = renderTemplate("order-shipped-sk", { order_display_id: "7", url: ORDER.url })
    expect(noTracking.text).not.toContain("Číslo zásielky")
    expect(noTracking.text).toContain("Moja objednávka: https://anastasiaoz.eu/ucet/objednavky/order_1")
  })

  it("zrušenie: veta o vrátení peňazí len pri zaplatenej objednávke", () => {
    expect(renderTemplate("order-canceled-sk", { order_display_id: "7", paid: true }).text).toContain("Peniaze Vám vrátime")
    expect(renderTemplate("order-canceled-sk", { order_display_id: "7", paid: false }).text).not.toContain("Peniaze Vám vrátime")
  })

  it("odstúpenie: dátum prijatia v čase Bratislavy", () => {
    const out = renderTemplate("withdrawal-received-sk", { order_display_id: "7", received_at: "2026-10-15T22:30:00Z" })
    expect(out.text).toContain("Dňa 16. 10. 2026 sme prijali Vaše odstúpenie od zmluvy k objednávke č. 7.")
  })
})

describe("šablony – prepisy textov z adminu", () => {
  it("prepis nahradí text, doplní premenné a escapuje", () => {
    const out = renderTemplate("order-placed-sk", { ...ORDER, texts: { heading: "Ďakujeme, {meno} <3", subject: "Objednávka {cislo_objednavky} ✓" } })
    expect(out.subject).toBe("Objednávka 1042 ✓")
    expect(out.html).toContain("Ďakujeme, Jana &lt;3")
  })

  it("prepis predmetu má prednosť pred predmetom od volajúceho", () => {
    expect(renderTemplate("booking-confirmed-sk", { subject: "Starý", texts: { subject: "Nový" } }).subject).toBe("Nový")
  })

  it("prázdny voliteľný text odstavec vypne, chýbajúca premenná použije náhradu", () => {
    const out = renderTemplate("customer-welcome-sk", { texts: { outro: "" } })
    expect(out.text).not.toContain("odpovedať na tento e-mail")
    expect(out.text.split("\n")[0]).toBe("Vitajte")
  })

  it("neplatný prepis pri odoslaní sa ticho ignoruje", () => {
    const out = renderTemplate("order-placed-sk", { ...ORDER, texts: { heading: "A {neznama}", subject: 42, nesmysel: "x" } })
    expect(out.subject).toBe("Potvrdenie objednávky č. 1042")
    expect(out.text).toContain("Ďakujeme za objednávku")
  })

  it("predmet ani nadpis nepustí nový riadok", () => {
    const out = renderTemplate("order-placed-sk", { ...ORDER, subject: "A\r\nBcc: x@y.z" })
    expect(out.subject).toBe("A Bcc: x@y.z")
  })

  it("povinné šablóny vždy obsahujú kód alebo odkaz", () => {
    const out = renderTemplate("gift-voucher-recipient-sk", { code: "ABCD-EFGH", texts: { intro: "Darček", instructions: "" } })
    expect(out.text).toContain("Kód poukazu: ABCD-EFGH")
    expect(() => renderTemplate("magic-link-sk", { texts: { intro: "x" } })).toThrow(/missing url/)
  })
})

describe("šablony – validácia uloženia", () => {
  it("prijme platné texty, zahodí predvolené a null", () => {
    const def = getTemplateDef("order-placed-sk")!
    const res = validateTexts("order-placed-sk", { heading: "  Vďaka!  ", intro: def.slots.find(s => s.key === "intro")!.default, outro: null, paid: "" })
    expect(res).toEqual({ ok: true, texts: { heading: "Vďaka!", paid: "" } })
  })

  it("odmietne neznámy slot, premennú, prázdny povinný text, nový riadok a dĺžku", () => {
    const res = validateTexts("order-placed-sk", {
      nesmysel: "x",
      heading: "a\nb",
      intro: "Objednávka {heslo}",
      subject: "",
      outro: "x".repeat(SLOT_MAX_LENGTH.text + 1),
      button: 5,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors).toHaveLength(6)
    expect(res.errors.join("\n")).toMatch(/neznáma premenná \{heslo\}/)
  })

  it("normalizuje konce riadkov a odstráni riadiace znaky", () => {
    const res = validateTexts("order-placed-sk", { outro: "Riadok 1\r\nRiadok\u0007 2" })
    expect(res).toEqual({ ok: true, texts: { outro: "Riadok 1\nRiadok 2" } })
    expect(validateTexts("neznama", {})).toEqual({ ok: false, errors: ["UNKNOWN_TEMPLATE"] })
    expect(validateTexts("order-placed-sk", ["x"]).ok).toBe(false)
  })
})
