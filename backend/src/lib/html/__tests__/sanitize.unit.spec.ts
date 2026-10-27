import { RICH_TEXT_ALLOWED_TAGS, isSafeHref, sanitizeRichText } from '../sanitize'

describe('Čistenie rich textu pri zápise', () => {
  it('nechá povolené značky', () => {
    const html = '<p>Text <strong>tučne</strong> <em>šikmo</em> <u>podčiarknuté</u></p><ul><li>prvá</li></ul><ol><li>druhá</li></ol><h2>Nadpis</h2><h3>Podnadpis</h3><blockquote>Citát</blockquote><br>'
    expect(sanitizeRichText(html)).toBe(html)
    expect(RICH_TEXT_ALLOWED_TAGS).toEqual(['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote'])
  })

  it('odstráni skripty a štýly aj s ich obsahom', () => {
    expect(sanitizeRichText('<script>alert(1)</script><p>ok</p>')).toBe('<p>ok</p>')
    expect(sanitizeRichText('<style>body{display:none}</style><p>ok</p>')).toBe('<p>ok</p>')
    expect(sanitizeRichText('<SCRIPT>alert(1)</SCRIPT>ok')).toBe('ok')
    expect(sanitizeRichText('<iframe src="http://evil.test"></iframe>')).toBe('')
    expect(sanitizeRichText('<svg><script>alert(1)</script></svg>text')).toBe('text')
  })

  it('odstráni obsluhy udalostí a ostatné atribúty', () => {
    expect(sanitizeRichText('<p onclick="x()">ok</p>')).toBe('<p>ok</p>')
    expect(sanitizeRichText('<p onmouseover="x()" style="color:red" class="a">ok</p>')).toBe('<p>ok</p>')
    expect(sanitizeRichText('<p ONERROR="x()">ok</p>')).toBe('<p>ok</p>')
  })

  it('odstráni nedovolené značky, text v nich zostane', () => {
    expect(sanitizeRichText('<div><span>text</span></div>')).toBe('text')
    expect(sanitizeRichText('<img src="x" onerror="alert(1)">')).toBe('')
    expect(sanitizeRichText('<h1>Nadpis</h1>')).toBe('Nadpis')
  })

  it('pustí len bezpečné odkazy', () => {
    expect(sanitizeRichText('<a href="https://anastasiaoz.eu">web</a>')).toContain('href="https://anastasiaoz.eu"')
    expect(sanitizeRichText('<a href="http://anastasiaoz.eu">web</a>')).toContain('href="http://anastasiaoz.eu"')
    expect(sanitizeRichText('<a href="mailto:info@anastasiaoz.eu">mail</a>')).toContain('href="mailto:info@anastasiaoz.eu"')
    expect(sanitizeRichText('<a href="/vop">vop</a>')).toContain('href="/vop"')
    expect(sanitizeRichText('<a href="javascript:alert(1)">web</a>')).toBe('<a>web</a>')
    expect(sanitizeRichText('<a href="JaVaScRiPt:alert(1)">web</a>')).toBe('<a>web</a>')
    expect(sanitizeRichText('<a href=" javascript:alert(1)">web</a>')).toBe('<a>web</a>')
    expect(sanitizeRichText('<a href="//cudzi-host.test">web</a>')).toBe('<a>web</a>')
    expect(sanitizeRichText('<a href="data:text/html,<script>alert(1)</script>">web</a>')).toBe('<a>web</a>')
  })

  it('pri bezpečnom odkaze vždy pridá rel noopener', () => {
    expect(sanitizeRichText('<a href="https://anastasiaoz.eu">web</a>')).toContain('rel="noopener"')
    expect(sanitizeRichText('<a href="https://anastasiaoz.eu" rel="nofollow noopener">web</a>')).toContain('rel="nofollow noopener"')
    expect(sanitizeRichText('<a href="https://anastasiaoz.eu" rel="opener">web</a>')).toBe('<a href="https://anastasiaoz.eu" rel="noopener">web</a>')
  })

  it('nechá obyčajný text a schráni lonej lomítka', () => {
    expect(sanitizeRichText('Obyčajný text bez značiek')).toBe('Obyčajný text bez značiek')
    expect(sanitizeRichText('3 < 5 a 5 > 3')).toBe('3 &lt; 5 a 5 > 3')
    expect(sanitizeRichText('')).toBe('')
  })

  it('rozpozná bezpečné adresy', () => {
    expect(isSafeHref('https://a.test')).toBe(true)
    expect(isSafeHref('mailto:a@b.test')).toBe(true)
    expect(isSafeHref('/kontakt')).toBe(true)
    expect(isSafeHref('//a.test')).toBe(false)
    // Prehliadač číta `\` ako `/` a vypúšťa tabulátory/konce riadkov → cudzia doména.
    expect(isSafeHref('/\\evil.test')).toBe(false)
    expect(isSafeHref('/\t/evil.test')).toBe(false)
    expect(isSafeHref('/\n\\evil.test')).toBe(false)
    expect(isSafeHref('java\tscript:alert(1)')).toBe(false)
    expect(sanitizeRichText('<a href="/\\evil.test">x</a>')).not.toContain('evil.test')
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeHref('')).toBe(false)
    expect(isSafeHref(null)).toBe(false)
  })
})
