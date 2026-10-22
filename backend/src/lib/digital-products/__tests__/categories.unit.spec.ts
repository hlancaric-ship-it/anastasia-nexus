import {
  DIGITAL_CATEGORY_NAMES,
  DIGITAL_PRODUCT_GROUPS,
  digitalGroupFor,
  digitalGroupLabel,
  isDigitalProduct,
} from '../categories'

describe('Skupiny digitálnych produktov', () => {
  it('navrhuje skupiny podľa existujúcich kategórií', () => {
    const labels = DIGITAL_PRODUCT_GROUPS.map((group) => group.label)
    expect(labels).toContain('ACADEMY kurzy')
    expect(labels).toContain('Audio a meditácie')
    expect(labels).toContain('E-knihy a dokumenty')
    // Existujúca kategória v katalógu ostáva v návrhu.
    expect(DIGITAL_PRODUCT_GROUPS[0].categories).toContain('AI ANASTASIA ACADEMY')
    expect(DIGITAL_CATEGORY_NAMES).toContain('Konzultácie')
  })

  it('priradí produkt ku skupine podľa jeho kategórií', () => {
    expect(digitalGroupFor(['AI ANASTASIA ACADEMY'])?.handle).toBe('academy-kurzy')
    expect(digitalGroupFor(['Konzultácie'])?.label).toBe('Konzultácie')
    expect(digitalGroupFor(['AI ANASTASIA ACADEMY', 'Konzultácie'])?.handle).toBe('academy-kurzy')
    expect(digitalGroupFor(['BIOKOZMETIKA'])).toBeNull()
    expect(digitalGroupFor([])).toBeNull()
    expect(digitalGroupFor([null, undefined])).toBeNull()
  })

  it('keď produkt do skupiny nepatrí, použije jeho vlastnú kategóriu', () => {
    expect(digitalGroupLabel(['BIOKOZMETIKA'])).toBe('BIOKOZMETIKA')
    expect(digitalGroupLabel([])).toBe('Digitálne produkty')
    expect(digitalGroupLabel(['AI ANASTASIA ACADEMY'])).toBe('ACADEMY kurzy')
  })

  it('digitálny produkt určuje dopravný profil, nie kategória', () => {
    expect(isDigitalProduct('digital')).toBe(true)
    expect(isDigitalProduct('default')).toBe(false)
    expect(isDigitalProduct(null)).toBe(false)
  })
})
