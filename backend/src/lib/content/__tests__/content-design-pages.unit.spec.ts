import { seedPage, seedPages } from '../policy'

describe('Obsah webu – návrhové stránky v semene', () => {
  it('seed obsahuje stránky home a eshop s textami a dĺžkami', () => {
    const pages = seedPages()
    for (const key of ['home', 'eshop']) {
      expect(pages.some((p: { key: string }) => p.key === key)).toBe(true)
      const page = seedPage(key)!
      const fields = page.sections.flatMap((s: { fields: unknown[] }) => s.fields)
      expect(fields.length).toBeGreaterThan(0)
      for (const field of fields as Array<{ key: string; max_length: number; value: string }>) {
        expect(field.key.startsWith(`${key}__`)).toBe(true)
        expect(field.max_length).toBeGreaterThan(0)
        expect(field.value.length).toBeLessThanOrEqual(field.max_length)
      }
    }
  })
})
