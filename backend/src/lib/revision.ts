/**
 * Revízia (verzia) obsahu – ochrana proti súbežnému ukladaniu.
 *
 * Každý blok (pole v obsahu webu) a každá stránka má revíziu: čas poslednej zmeny
 * (ISO dátum) alebo značku pôvodného znenia, ak ho ešte nikto nemenil.
 * Administrácia posiela revíziu, ktorú videla; ak sa medzitým zmenilo niečo iné,
 * server odmietne uloženie a vráti hlášku, aby si používateľ stránku obnovil.
 */
export const REVISION_CONFLICT_MESSAGE = 'Obsah medzitým zmenil niekto iný, obnovte stránku.'

/** Revízia z času poslednej zmeny (alebo značka pôvodného znenia). */
export function revisionOf(updatedAt?: string | null, fallbackMarker = 'default'): string {
  const value = String(updatedAt ?? '').trim()
  return value.length ? value : fallbackMarker
}

/**
 * Je požadovaná revízia v rozpore s aktuálnou?
 * Bez revízie (staršia administrácia) sa to nekontroluje.
 */
export function isRevisionConflict(sent: unknown, current: string): boolean {
  if (typeof sent !== 'string') return false
  const value = sent.trim()
  if (!value.length) return false
  return value !== current
}
