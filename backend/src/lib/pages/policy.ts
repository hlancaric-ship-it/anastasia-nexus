/**
 * Texty stránok webu – politika a bezpečnosť.
 *
 * Znenie je v jednom HTML fragmente (rich text z Word editoru v admine). Na serveri sa
 * sanitizuje: povolené sú len tagy, ktoré editor podporuje, a pri odkazoch len bezpečné schémy.
 */
import { PAGE_DEFAULTS } from './defaults'
import { sanitizeRichText } from '../html/sanitize'

export const PAGE_SLUGS = Object.keys(PAGE_DEFAULTS)

export type PageDefinition = {
  slug: string
  label: string
  description: string
  default_html: string
}

export type StoredPage = {
  html: string
  updated_at: string
  updated_by: string
}

export const PAGE_MAX_HTML = 60000
// VOP klientky (znenie účinné od 21. 10. 2026) má ~21 000 znakov textu – limit je nad to.
export const PAGE_MAX_TEXT = 25000

const DESCRIPTIONS: Record<string, string> = {
  vop: 'Podmienky, ktorými sa riadi predaj v obchode. Znenie schvaľuje majiteľ obchodu.',
  reklamacie: 'Reklamačné pravidlá: ako uplatniť reklamáciu, vrátenie peňazí a záruka.',
  odstupenie: 'Poučenie o odstúpení od zmluvy a vzorový formulár na odstúpenie.',
  kontakt: 'Prevádzkovateľ, adresa, IČO, e-mail a telefón. Údaje z tu sa zobrazujú v patičke aj na kontaktnej stránke.',
  gdpr: 'Ako spracúvame osobné údaje zákazníčiek a aké práva máte.',
  cookies: 'Informácia o cookies a podobných technológiách a o vašich voľbách.',
  'o-lucii': 'Predstavenie Lucii a príbeh značky ANASTASIA.',
  paticka: 'Spodná lišta webu: odkazy, copyright a základné údaje.',
  'doprava-a-platba': 'Spôsoby dopravy, dobierka, osobný odber a spôsoby platby.',
}

/** Zoznam stránok s predvoleným znením (pre administráciu aj pre verejné API). */
export function pageDefinitions(): PageDefinition[] {
  return PAGE_SLUGS.map((slug) => ({
    slug,
    label: PAGE_DEFAULTS[slug]?.label ?? slug,
    description: DESCRIPTIONS[slug] ?? '',
    default_html: PAGE_DEFAULTS[slug]?.html ?? '',
  }))
}

export function isPageSlug(value: unknown): value is string {
  return typeof value === 'string' && PAGE_SLUGS.includes(value)
}

export function pageDefault(slug: string): { label: string; html: string } | null {
  const found = PAGE_DEFAULTS[slug]
  return found ? { label: found.label, html: found.html } : null
}

/**
 * Vyčistí HTML: odstráni skripty, nedovolené značky, obsluhy udalostí a nebezpečné schémy
 * v odkazoch. Zdieľaná sanitizácia (aj pre polia v obsahu webu) je v `lib/html/sanitize`.
 */
export function sanitizePageHtml(value: unknown): string {
  return sanitizeRichText(value)
}

/** Validácia zadania: vracia chybu alebo očistené HTML. */
export function validatePageHtml(value: unknown): { ok: true; html: string } | { ok: false; message: string } {
  const html = sanitizePageHtml(value)
  if (!html) return { ok: false, message: 'Text stránky je prázdny. Napíšte aspoň jednu vetu.' }
  if (html.length > PAGE_MAX_HTML) return { ok: false, message: `Text stránky je príliš dlhý (maximálne ${PAGE_MAX_HTML} znakov).` }
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length > PAGE_MAX_TEXT) return { ok: false, message: 'Text stránky je príliš dlhý. Skráťte ho.' }
  return { ok: true, html }
}
