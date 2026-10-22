import { CONTENT_MAX_HISTORY, contentRevision, findSeedField, mergeContent, seedPage, seedPages, validateFieldValue } from '../policy'
import { applyFieldChange, readContentOverrides, writeContentOverrides } from '../store'

describe('Obsah webu – seed a model', () => {
  it('seed obsahuje stránky, sekcie a polia s typmi a dĺžkami', () => {
    const pages = seedPages()
    expect(pages.length).toBeGreaterThan(10)
    const kontakt = pages.find((p) => p.key === 'kontakt')
    expect(kontakt).toBeTruthy()
    expect(kontakt!.sections.length).toBeGreaterThan(0)
    const field = kontakt!.sections[0].fields[0]
    expect(field.type).toBe('text')
    expect(field.max_length).toBeGreaterThan(0)
    expect(field.lang).toBe('sk')
    expect(field.value).toBe(field.fallback)
  })

  it('seed obsahuje aj obrázky, odkazy a video', () => {
    const all = seedPages().flatMap((p) => p.sections.flatMap((s) => s.fields))
    expect(all.some((f) => f.type === 'image')).toBe(true)
    expect(all.some((f) => f.type === 'link')).toBe(true)
    expect(all.some((f) => f.type === 'video')).toBe(true)
  })

  it('najde pole aj jeho stránku', () => {
    const page = seedPage('kontakt')!
    const field = page.sections[0].fields[0]
    const found = findSeedField('kontakt', field.key)
    expect(found?.field.key).toBe(field.key)
    expect(findSeedField('kontakt', 'neexistuje')).toBeNull()
    expect(findSeedField('neexistuje-stranka', field.key)).toBeNull()
  })
})

describe('Obsah webu – validácia hodnôt', () => {
  const field = { key: 'k', type: 'text' as const, label: 'l', value: '', fallback: '', max_length: 10, lang: 'sk' as const }
  const long = { ...field, max_length: 500 }

  it('odmietne príliš dlhý text', () => {
    expect(validateFieldValue(field, '12345').ok).toBe(true)
    expect(validateFieldValue(field, '12345678901').ok).toBe(false)
  })

  it('odmietne nebezpečné odkazy a adresy', () => {
    const link = { ...long, type: 'link' as const }
    expect(validateFieldValue(link, 'https://anastasiaoz.eu').ok).toBe(true)
    expect(validateFieldValue(link, '/kontakt').ok).toBe(true)
    expect(validateFieldValue(link, 'javascript:alert(1)').ok).toBe(false)
    const image = { ...long, type: 'image' as const }
    expect(validateFieldValue(image, '/media/a.jpg').ok).toBe(true)
    expect(validateFieldValue(image, 'data:image/svg+xml;base64,xxx').ok).toBe(false)
  })

  it('vyčistí rich text pri validácii', () => {
    const rich = { ...long, type: 'rich' as const }
    const result = validateFieldValue(rich, '<p onclick="x()">ok</p><script>alert(1)</script><a href="javascript:alert(1)">odkaz</a>')
    expect(result.ok).toBe(true)
    expect(result.ok && result.value).toBe('<p>ok</p><a>odkaz</a>')
    const plain = validateFieldValue(rich, 'Obyčajný text')
    expect(plain.ok && plain.value).toBe('Obyčajný text')
  })
})

describe('Obsah webu – revízia bloku', () => {
  it('pôvodný obsah má značku revízie, zmenený obsah čas zmeny', () => {
    expect(contentRevision(null)).toBe('seed')
    expect(contentRevision('')).toBe('seed')
    expect(contentRevision('2026-10-21T10:00:00.000Z')).toBe('2026-10-21T10:00:00.000Z')
  })
})

describe('Obsah webu – zmeny a verzie', () => {
  it('zmena prebije pôvodný text, bez zmeny sa použije fallback', () => {
    const page = seedPage('kontakt')!
    const field = page.sections[0].fields[0]
    const changed = mergeContent({ fields: { [field.key]: { value: 'Nový text', updated_at: '2026-10-21T10:00:00.000Z', updated_by: 'admin_1', history: [] } } })
      .find((p) => p.key === 'kontakt')!.sections[0].fields[0]
    expect(changed.value).toBe('Nový text')
    expect(changed.changed).toBe(true)
    const untouched = mergeContent({ fields: {} }).find((p) => p.key === 'kontakt')!.sections[0].fields[0]
    expect(untouched.value).toBe(untouched.fallback)
    expect(untouched.changed).toBe(false)
  })

  it('uchová aj staršiu hodnotu, keď sa poľo zmení', () => {
    const key = 'kontakt__kontakt-1__0-text'
    let overrides = applyFieldChange({ fields: {} }, key, 'Prvá verzia', 'admin_1')
    overrides = applyFieldChange(overrides, key, 'Druhá verzia', 'admin_2')
    expect(overrides.fields[key].value).toBe('Druhá verzia')
    expect(overrides.fields[key].history.map((h) => h.value)).toEqual(['Prvá verzia'])
  })

  it('oreže príliš dlhú historiu', () => {
    let overrides = { fields: {} as Record<string, { value: string; updated_at: string; updated_by: string; history: any[] }> }
    for (let i = 0; i < CONTENT_MAX_HISTORY + 5; i++) overrides = applyFieldChange(overrides, 'k', `v${i}`, 'admin_1')
    expect(overrides.fields.k.history.length).toBeLessThanOrEqual(CONTENT_MAX_HISTORY)
  })

  it('prečíta a zapíše zmeny v metadátach obchodu bez toho, aby prepísal ostatné kľúče', () => {
    const metadata = writeContentOverrides({ iny: 'hodnota' }, { fields: { k: { value: 'x', updated_at: '', updated_by: '', history: [] } } })
    expect(metadata.iny).toBe('hodnota')
    const read = readContentOverrides(metadata)
    expect(read.fields.k.value).toBe('x')
    expect(readContentOverrides(null).fields).toEqual({})
  })
})
