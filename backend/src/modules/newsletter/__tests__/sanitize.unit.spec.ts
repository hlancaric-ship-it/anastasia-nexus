import { campaignFields, sanitizeCampaignHtml } from "../policy"

describe("sanitizácia obsahu kampane", () => {
  it("pustí len povolené značky a doplní bezpečné atribúty", () => {
    const html = sanitizeCampaignHtml('<p>Ahoj <strong>svet</strong> a <em>ty</em></p><h2>Nadpis</h2><h3>Menší</h3><ul><li>prvé</li></ul><ol><li>druhé</li></ol><p><br></p><img src="https://cdn.example.test/a.png" alt="Obrázok"><a href="https://example.test/clanok">odkaz</a>')
    expect(html).toContain("<p>Ahoj <strong>svet</strong> a <em>ty</em></p>")
    expect(html).toContain("<h2>Nadpis</h2><h3>Menší</h3>")
    expect(html).toContain("<ul><li>prvé</li></ul><ol><li>druhé</li></ol>")
    expect(html).toContain('<img src="https://cdn.example.test/a.png" alt="Obrázok">')
    expect(html).toContain('<a href="https://example.test/clanok" rel="noopener noreferrer">odkaz</a>')
  })

  it("zahodí script a style vrátane obsahu", () => {
    expect(sanitizeCampaignHtml('<p>Pred</p><script>alert("x")</script><style>body{display:none}</style><p>Po</p>'))
      .toBe("<p>Pred</p><p>Po</p>")
  })

  it("nepustí style, class ani obsluhy udalostí", () => {
    const html = sanitizeCampaignHtml('<p style="color:red" class="x" onclick="alert(1)">Text</p><div data-x="1">Blok</div>')
    expect(html).toBe("<p>Text</p>Blok")
  })

  it("odmietne nebezpečné adresy, povie len https", () => {
    expect(sanitizeCampaignHtml('<a href="javascript:alert(1)">klik</a>')).toBe("<a>klik</a>")
    expect(sanitizeCampaignHtml('<a href="http://example.test">klik</a>')).toBe("<a>klik</a>")
    expect(sanitizeCampaignHtml('<img src="data:image/png;base64,AAAA">')).toBe("")
  })

  it("vyváži neuzavreté značky a escapuje text", () => {
    expect(sanitizeCampaignHtml("<p>a & b <strong>c")).toBe("<p>a &amp; b <strong>c</strong></p>")
  })

  it("validácia kampane vyžaduje predmet aj obsah", () => {
    expect(() => campaignFields({ subject: "", body_html: "<p>x</p>" })).toThrow("INVALID_CAMPAIGN_SUBJECT")
    expect(() => campaignFields({ subject: "Téma", body_html: "   " })).toThrow("INVALID_CAMPAIGN_BODY")
    expect(() => campaignFields({ subject: "x".repeat(201), body_html: "<p>x</p>" })).toThrow("INVALID_CAMPAIGN_SUBJECT")
    expect(campaignFields({ subject: "Téma\nskryté", preheader: "Úvod", body_html: "<p>x</p>" }))
      .toEqual({ subject: "Téma skryté", preheader: "Úvod", body_html: "<p>x</p>" })
  })

  it("prenáša len roly šablóny data-nl a oddeľovač hr", () => {
    expect(sanitizeCampaignHtml('<p data-nl="eyebrow">Nadtitulok</p><hr data-nl="dark"><p data-nl="quote">Citát</p><hr data-nl="olive"><p data-nl="sign">S láskou,</p><p data-nl="link">L</p>'))
      .toBe('<p data-nl="eyebrow">Nadtitulok</p><hr data-nl="dark"><p data-nl="quote">Citát</p><hr data-nl="olive"><p data-nl="sign">S láskou,</p><p data-nl="link">L</p>')
    expect(sanitizeCampaignHtml('<img data-nl="hero" src="https://cdn.example.test/a.jpg" alt=""><hr data-nl="sign"><h2 data-nl="eyebrow">T</h2><p data-nl="x&quot; onclick=&quot;1">y</p>'))
      .toBe('<img src="https://cdn.example.test/a.jpg" alt=""><hr><h2>T</h2><p>y</p>')
    expect(sanitizeCampaignHtml('<hr style="border:5px solid red" onclick="x">')).toBe("<hr>")
  })
})
