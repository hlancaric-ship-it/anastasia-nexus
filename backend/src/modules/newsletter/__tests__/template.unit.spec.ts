import { ctaButtons, renderCampaignEmail } from "../policy"

const BODY = [
  "<h2>Dobré ráno, priatelia</h2>",
  "<p>Pár riadkov o tom, čo nové prináša jeseň.</p>",
  "<p>Viac o tom nájdete <a href=\"https://example.test/clanok\" rel=\"noopener noreferrer\">v texte</a> priamo na webe.</p>",
  "<h2>Pokoj v tmavších dňoch</h2>",
  "<p>Dni sa krátia a príroda sa sťahuje do koreňov. Je to dobrý čas na zastavenie.</p>",
  "<h2>Jeden malý rituál</h2>",
  "<p>Pred spaním si dajte teplý nápoj, zhasnite a päť minút len dýchajte.</p>",
  "<h2>Pozvánka</h2>",
  "<p>V novembri otvárame nové termíny konzultácií. Vyberte si ten svoj.</p>",
  "<p><a href=\"https://anastasia-test.l-code-dynamics.com/konzultacie\" rel=\"noopener noreferrer\">Pozrieť konzultácie</a></p>",
  "<p><em>S láskou, Lucia</em></p>",
].join("")

describe("šablóna newslettera Dopis", () => {
  it("odsek s jediným odkazom sa zmení na tlačidlo, odkaz v texte zostane odkazom", () => {
    const out = ctaButtons(BODY)
    expect(out).toContain("Pozrieť konzultácie</a></td></tr></table>")
    expect(out).toContain("border-radius:999px")
    expect(out.match(/<table role="presentation"/g)).toHaveLength(1)
    expect(ctaButtons("<p><a href=\"https://e.test/x\">Tlačidlo</a></p>", true)).toContain("background:#f7f4ec")
    expect(out).toContain('<a href="https://example.test/clanok"')
  })
  it("e-mail má logo, nadpis, tlačidlo, odhlásenie a pätičku", () => {
    const { html, text } = renderCampaignEmail({ subject: "Jeseň", preheader: "Krátky úvod", bodyHtml: BODY, unsubscribeUrl: "https://api.example.test/u?c=1&s=ab" })
    expect(html).toContain("/assets/lucia-koule.png")
    expect(html).toContain("/assets/email-lines.png")
    for (const c of ["#e9e9f2", "#e4e6d6", "#2f3424", "#f3e9d0"]) expect(html).toContain(`bgcolor="${c}"`)
    expect(html).toContain("Dobré ráno, priatelia")
    expect(html).toContain("Pozrieť konzultácie")
    expect(html).toContain("Odhlásiť sa z odberu")
    expect(html).toContain("LUCRAT spol. s r.o.")
    expect(text).toContain("Pozrieť konzultácie")
    if (process.env.NEWSLETTER_DUMP) require("fs").writeFileSync(process.env.NEWSLETTER_DUMP, html)
  })
})
