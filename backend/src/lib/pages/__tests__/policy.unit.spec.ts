import { isPageSlug, pageDefinitions, sanitizePageHtml, validatePageHtml } from '../policy'
import { readMedia, readPages, writeMedia, writePages } from '../store'

describe('Texty stránok – sanitizácia', () => {
  it('nechá povolené značky a odstráni zvyšok', () => {
    expect(sanitizePageHtml('<p>Text <strong>tučne</strong></p>')).toBe('<p>Text <strong>tučne</strong></p>')
    expect(sanitizePageHtml('<script>alert(1)</script><p>ok</p>')).toBe('<p>ok</p>')
    expect(sanitizePageHtml('<p onclick="x()">ok</p>')).toBe('<p>ok</p>')
    expect(sanitizePageHtml('<iframe src="http://evil"></iframe>')).toBe('')
  })

  it('pri odkazoch nechá len bezpečné schémy', () => {
    expect(sanitizePageHtml('<a href="https://anastasiaoz.eu">web</a>')).toContain('href="https://anastasiaoz.eu"')
    expect(sanitizePageHtml('<a href="javascript:alert(1)">web</a>')).toBe('<a>web</a>')
    expect(sanitizePageHtml('<a href="/vop">vop</a>')).toContain('href="/vop"')
  })

  it('odmietne prázdny alebo príliš dlhý text', () => {
    expect(validatePageHtml('').ok).toBe(false)
    expect(validatePageHtml('<p>ok</p>').ok).toBe(true)
    const long = `<p>${'a'.repeat(30000)}</p>`
    expect(validatePageHtml(long).ok).toBe(false)
  })

  it('pozná len existujúce stránky', () => {
    expect(isPageSlug('vop')).toBe(true)
    expect(isPageSlug('kontakt')).toBe(true)
    expect(isPageSlug('nezmysel')).toBe(false)
    expect(isPageSlug(null)).toBe(false)
  })

  it('ponúka zoznam stránok s predvoleným znením', () => {
    const defs = pageDefinitions()
    expect(defs.length).toBeGreaterThanOrEqual(6)
    expect(defs.map((d) => d.slug)).toEqual(expect.arrayContaining(['vop', 'reklamacie', 'kontakt', 'o-lucii', 'paticka', 'doprava-a-platba']))
    expect(defs.every((d) => d.default_html.length > 20)).toBe(true)
  })
})

describe('Ukladanie textov a knihovne v metadátach obchodu', () => {
  it('uloží a prečíta texty stránok bez toho, aby prepísal ostatné kľúče', () => {
    const metadata = writePages({ iny: 'hodnota' }, { vop: { html: '<p>Nové znenie</p>', updated_at: '2026-10-21T00:00:00.000Z', updated_by: 'admin_1' } })
    expect(metadata.iny).toBe('hodnota')
    const pages = readPages(metadata)
    expect(pages.vop.html).toBe('<p>Nové znenie</p>')
    expect(pages.vop.updated_by).toBe('admin_1')
  })

  it('ignoruje cudzie slugs a poškodené hodnoty', () => {
    const pages = readPages({ anastasia_pages: { vop: { html: '<p>ok</p>' }, cudzi: { html: '<p>x</p>' }, zle: 'nie-json' } })
    expect(Object.keys(pages)).toEqual(['vop'])
    expect(readPages(null)).toEqual({})
  })

  it('uloží a prečíta knihovnu obrázkov', () => {
    const item = { key: 'a.jpg', url: 'https://media.test/a.jpg', name: 'a.jpg', size: 100, content_type: 'image/jpeg', uploaded_at: '2026-10-21T00:00:00.000Z', uploaded_by: 'admin_1' }
    const metadata = writeMedia({ iny: 1 }, [item])
    expect(metadata.iny).toBe(1)
    const files = readMedia(metadata)
    expect(files).toHaveLength(1)
    expect(files[0].url).toBe('https://media.test/a.jpg')
  })

  it('vyhodí poškodené záznamy knihovne', () => {
    expect(readMedia({ anastasia_media: [{ key: 'a', url: 'https://x/a.jpg' }, { key: '', url: '' }, 'nezmysel'] })).toHaveLength(1)
    expect(readMedia(null)).toEqual([])
  })
})
