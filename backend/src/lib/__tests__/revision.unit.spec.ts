import { REVISION_CONFLICT_MESSAGE, isRevisionConflict, revisionOf } from '../revision'

describe('Revízia obsahu (ochrana proti súbežnému ukladaniu)', () => {
  it('revízia je čas zmeny alebo značka pôvodného znenia', () => {
    expect(revisionOf('2026-10-21T10:00:00.000Z')).toBe('2026-10-21T10:00:00.000Z')
    expect(revisionOf(null)).toBe('default')
    expect(revisionOf('')).toBe('default')
    expect(revisionOf(undefined, 'seed')).toBe('seed')
  })

  it('nesúlad sa zistí, keď sa revízia líši', () => {
    expect(isRevisionConflict('2026-10-21T10:00:00.000Z', '2026-10-21T11:00:00.000Z')).toBe(true)
    expect(isRevisionConflict('seed', 'seed')).toBe(false)
    expect(isRevisionConflict('2026-10-21T10:00:00.000Z', '2026-10-21T10:00:00.000Z')).toBe(false)
  })

  it('bez revízie sa to nekontroluje (staršia administrácia)', () => {
    expect(isRevisionConflict(undefined, 'seed')).toBe(false)
    expect(isRevisionConflict(null, 'seed')).toBe(false)
    expect(isRevisionConflict('', 'seed')).toBe(false)
    expect(isRevisionConflict(123, 'seed')).toBe(false)
  })

  it('hláška o konflikte je v slovenčine', () => {
    expect(REVISION_CONFLICT_MESSAGE).toBe('Obsah medzitým zmenil niekto iný, obnovte stránku.')
  })
})
