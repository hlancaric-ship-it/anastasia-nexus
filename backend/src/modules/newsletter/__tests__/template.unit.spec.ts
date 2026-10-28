import { campaignLayout, ctaButtons, newsletterSocialLinks, renderCampaignEmail, sanitizeCampaignHtml } from "../policy"

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

describe("šablóna newslettera podľa návrhu", () => {
  it("odsek s jediným odkazom sa zmení na tlačidlo, odkaz v texte zostane odkazom", () => {
    const out = ctaButtons(BODY)
    expect(out).toContain("Pozrieť konzultácie<span style=\"padding-left:16px\">→</span></a></td></tr></table>")
    expect(out).toContain("border-radius:999px")
    expect(out.match(/<table role="presentation"/g)).toHaveLength(1)
    expect(ctaButtons("<p><a href=\"https://e.test/x\">Tlačidlo</a></p>", "olive")).toContain("background:#f8f3ea")
    expect(out).toContain('<a href="https://example.test/clanok"')
  })

  it("e-mail má nové logo, mesiac vydania, stálu fotografiu, podpis, tlačidlo, odhlásenie a pätičku", () => {
    const { html, text } = renderCampaignEmail({ subject: "Jeseň", preheader: "Krátky úvod", bodyHtml: BODY, unsubscribeUrl: "https://api.example.test/u?c=1&s=ab", issuedAt: new Date(2026, 9, 28) })
    expect(html).toContain("/assets/newsletter-logo-ring.png")
    expect(html).toContain("/assets/newsletter-logo-word.png")
    expect(html).toContain("/assets/newsletter-hero.jpg")
    expect(html).toContain("Október 2026")
    expect(html).toContain('href="https://www.facebook.com/profile.php?id=100063901301928"')
    expect(html).toContain('href="https://www.youtube.com/@luciarogozanova544"')
    expect(html).toContain("Lucia Rogožanová")
    expect(html).toContain("Dobré ráno, priatelia")
    expect(html).toContain("Pozrieť konzultácie")
    expect(html).toContain("Odhlásiť sa</a>")
    expect(html).toContain("LUCRAT spol. s r.o.")
    expect(html).not.toContain("logo-mark.png")
    expect(text).toContain("Pozrieť konzultácie")
    expect(text).toContain("Október 2026")
    if (process.env.NEWSLETTER_DUMP) require("fs").writeFileSync(process.env.NEWSLETTER_DUMP, html)
  })

  it("sekcie v troch štýloch: tmavý panel s citátom, krémová s fotografiou, olivový pás", () => {
    const body = sanitizeCampaignHtml([
      '<p data-nl="eyebrow">Milá priateľka,</p><h2>Teším sa, <em>že si tu.</em></h2><p>Úvod.</p>',
      '<hr data-nl="dark">',
      '<p data-nl="eyebrow">Tip pre vás</p><h2>Malý rituál pre <em>viac pokoja</em></h2><p>Text.</p><p><a href="https://example.test/tip">Prečítať tip</a></p><p data-nl="quote">Pokoj začína v malých okamihoch.</p>',
      '<hr data-nl="light">',
      '<p data-nl="eyebrow">Novinka</p><h2>Kráľovna svojho <em>života</em></h2><img src="https://cdn.example.test/voda.jpg" alt="Pleťová voda"><p>Text.</p><p><a href="https://example.test/p">Viac o produkte</a></p>',
      '<hr data-nl="olive">',
      '<p data-nl="eyebrow">Pozvánka</p><h2>Online <em>konzultácie</em></h2><p>Text.</p><p><a href="https://example.test/k">Rezervovať termín</a></p>',
      '<p data-nl="sign">S láskou,</p>',
    ].join(""))
    const layout = campaignLayout(body)
    expect(layout.intro).toContain("Teším sa")
    expect(layout.sections.map(s => s.variant)).toEqual(["dark", "light", "olive"])
    expect(layout.signature).toBe("S láskou,")
    const { html, text } = renderCampaignEmail({ subject: "Jeseň", bodyHtml: body, unsubscribeUrl: "https://api.example.test/u?c=1&s=ab" })
    expect(html).toContain("Pokoj začína v malých okamihoch.</div>")
    expect(html).toContain("/assets/newsletter-leaf.png")
    expect(html).toContain("/assets/newsletter-leaf-olive.png")
    expect(html).toContain('src="https://cdn.example.test/voda.jpg"')
    expect(html).toContain("border-radius:150px 150px 14px 14px")
    expect(html).toContain(`bgcolor="#2f3424"`)
    expect(html).toContain("Rezervovať termín<span style=\"padding-left:16px\">→</span>")
    expect(html).toMatch(/<em style="display:block;margin-top:-.16em;font-size:1.18em;line-height:.84;word-spacing:-.02em;font-style:italic;color:#8f86c4">že si tu.<\/em>/)
    expect(html).not.toContain("data-nl")
    expect(html.match(/border-radius:999px;background/g)).toHaveLength(3)
    expect(text).toContain("Teším sa")
    expect(text).toContain("Lucia Rogožanová")
    if (process.env.NEWSLETTER_DUMP_PHOTO) require("fs").writeFileSync(process.env.NEWSLETTER_DUMP_PHOTO, html)
  })

  it("odkaz označený ako textový zostane odkazom, ostatné sú tlačidlá", () => {
    const body = sanitizeCampaignHtml('<p>Úvod</p><hr data-nl="light"><h2>A</h2><p>Text</p><p><a href="https://e.test/b">Tlačidlo</a></p><p data-nl="link"><a href="https://e.test/l">Čítať ďalej</a></p><p><a href="https://e.test/c">Druhé tlačidlo</a></p>')
    const { html } = renderCampaignEmail({ subject: "S", bodyHtml: body, unsubscribeUrl: "https://e.test/u" })
    expect(html).toContain("Tlačidlo<span style=\"padding-left:16px\">→</span>")
    expect(html).toContain("Druhé tlačidlo<span style=\"padding-left:16px\">→</span>")
    expect(html).toMatch(/<p style="[^"]*font-weight:600[^"]*"><a style="[^"]*text-decoration:underline" href="https:\/\/e.test\/l"[^>]*>Čítať ďalej<\/a><\/p>/)
    expect(html).not.toContain("Čítať ďalej<span")
  })

  it("sekcie bez štýlu sa striedajú, staršia kampaň sa delí podľa nadpisov", () => {
    expect(campaignLayout("<p>Ú</p><hr><h2>A</h2><hr><h2>B</h2><hr><h2>C</h2><hr><h2>D</h2>").sections.map(s => s.variant))
      .toEqual(["dark", "light", "olive", "dark"])
    const layout = campaignLayout(BODY)
    expect(layout.intro).toContain("Dobré ráno, priatelia")
    expect(layout.sections).toHaveLength(3)
  })

  it("sociálne siete sa zobrazia len s platnou https adresou, Facebook a YouTube majú predvolený profil", () => {
    expect(newsletterSocialLinks({} as NodeJS.ProcessEnv).map(l => l.icon)).toEqual(["fb", "yt", "web"])
    expect(newsletterSocialLinks({ NEWSLETTER_INSTAGRAM_URL: "https://instagram.com/x", NEWSLETTER_YOUTUBE_URL: "javascript:alert(1)" } as unknown as NodeJS.ProcessEnv).map(l => l.icon)).toEqual(["ig", "fb", "web"])
  })
})
