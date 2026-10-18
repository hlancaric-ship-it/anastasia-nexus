import { parseContact } from "../policy"
import { renderTemplate } from "../../../../modules/notification-zeptomail/templates"

const valid = { name: " Jana  Nováková ", email: "Jana@Example.com", subject: "Konzultácia", message: "Dobrý deň, mám otázku k termínu.", consent: true, website: "" }

describe("kontaktný formulár", () => {
  it("prijme platnú správu a znormalizuje meno a e-mail", () => {
    expect(parseContact(valid)).toEqual({ ok: true, value: { name: "Jana Nováková", email: "jana@example.com", topic: "Konzultácia", message: "Dobrý deň, mám otázku k termínu." } })
  })
  it("odmietne neúplnú správu, neznámu tému a chýbajúci súhlas", () => {
    expect(parseContact({ ...valid, name: "", email: "x", subject: "Iné", message: "krátka", consent: "true" })).toEqual({ ok: false, errors: ["name", "email", "subject", "message", "consent"] })
    expect(parseContact({ ...valid, message: "a".repeat(2001) })).toEqual({ ok: false, errors: ["message"] })
    expect(parseContact(null)).toMatchObject({ ok: false })
  })
  it("vyplnená pasca = robot", () => {
    expect(parseContact({ ...valid, website: "http://spam" })).toEqual({ ok: "spam" })
  })
  it("e-mail správkyni escapuje obsah a drží riadky správy", () => {
    const out = renderTemplate("contact-form-admin", { email: valid.email, topic: valid.subject, name: "<b>Jana</b>", message: "Riadok 1\n<script>x</script>" })
    expect(out.subject).toBe("Nová správa z webu: <b>Jana</b>")
    expect(out.html).toContain("&lt;b&gt;Jana&lt;/b&gt;")
    expect(out.html).not.toContain("<script>")
    expect(out.text).toContain("> Riadok 1")
    expect(out.text).toContain("Téma: Konzultácia")
  })
})
