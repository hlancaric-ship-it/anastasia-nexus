/**
 * Čistenie rich textu (HTML) pri zápise – vlastná malá funkcia, bez novej závislosti.
 *
 * Pravidlá (rovnaké pre texty stránok aj pre polia v obsahu webu):
 *   • povolené značky: p, br, strong, em, u, a[href, rel], ul, ol, li, h2, h3, blockquote,
 *   • nebezpečné prvky (script, style, iframe, object, embed, form, svg …) sa odstránia aj s obsahom,
 *   • všetky ostatné značky sa odstránia (text v nich zostane),
 *   • atribúty sa nechávajú len u `a` (href a rel) – všetky `on*` obsluhy zmiznú,
 *   • odkaz smie byť len http, https, mailto alebo cesta na vlastnú stránku (/kontakt);
 *     dvojité lomítko (//host) by ukazovalo na cudzí server a je zakázané.
 *
 * Odkaz na vlastnú stránku je povolený, pretože východiskové znenie právnych stránok
 * naň odkazuje (napr. /vop, /kontakt) a nie je to skriptová adresa.
 */

/** Prvky, ktoré sa odstránia celé (aj s obsahom). */
const DANGEROUS_ELEMENTS = [
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'template', 'svg', 'math',
  'noscript', 'applet', 'base', 'meta', 'link', 'frame', 'frameset', 'title', 'xmp',
]

/** Povolené značky a povolené atribúty. */
export const RICH_TEXT_ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote']
const ALLOWED_TAGS = new Set(RICH_TEXT_ALLOWED_TAGS)
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = { a: new Set(['href', 'rel']) }
const SAFE_SCHEME = /^(https?:|mailto:)/i
const SAFE_REL = new Set(['noopener', 'noreferrer', 'nofollow', 'external'])

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const attributeValue = (attributes: string, name: string): string => {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attributes)
  if (!match) return ''
  return match[1] ?? match[2] ?? match[3] ?? ''
}

/** Je adresa v bezpečnej podobe? (http, https, mailto alebo cesta na vlastnú stránku) */
export function isSafeHref(href: unknown): boolean {
  // Prehliadač z adresy vypúšťa tabulátory a konce riadkov a `\` číta ako `/`:
  // `/\evil.sk` aj `/\t/evil.sk` by inak viedli na cudziu doménu (`//evil.sk`).
  const value = String(href ?? '').replace(/[\t\n\r]/g, '').trim()
  if (!value) return false
  if (SAFE_SCHEME.test(value)) return true
  return value.startsWith('/') && !/^\/[\/\\]/.test(value)
}

const safeRel = (attributes: string): string => {
  const tokens = attributeValue(attributes, 'rel')
    .split(/[\s,]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => SAFE_REL.has(token))
  if (!tokens.includes('noopener')) tokens.unshift('noopener')
  return tokens.join(' ')
}

/**
 * Vyčistí HTML z rich textu. Vracia bezpečné HTML (bez skriptov, obsluh udalostí
 * a cudzích schém v odkazoch).
 */
export function sanitizeRichText(value: unknown): string {
  let html = String(value ?? '')
  // 1) HTML komentáre
  html = html.replace(/<!--[\s\S]*?-->/g, '')
  // 2) Nebezpečné prvky aj s ich obsahom
  const dangerous = DANGEROUS_ELEMENTS.join('|')
  html = html.replace(new RegExp(`<\\s*(?:${dangerous})\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*(?:${dangerous})\\s*>`, 'gi'), '')
  html = html.replace(new RegExp(`<\\s*\\/?\\s*(?:${dangerous})\\b[^>]*>`, 'gi'), '')
  // 3) Zvyšné značky: povolené prejdú (len s povolenými atribútmi), ostatné sa odstránia
  //    Text medzi značkami sa escapuje, nech v ňom nespustil nič vlastné.
  const parts = html.split(/(<\s*\/?\s*[a-zA-Z][a-zA-Z0-9]*\b[^>]*>)/g)
  html = parts.map((part) => {
    if (!part.startsWith('<')) return part.replace(/</g, '&lt;')
    const match = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>$/.exec(part)
    if (!match) return part.replace(/</g, '&lt;')
    const closing = match[1]
    const name = match[2].toLowerCase()
    const attributes = match[3]
    if (!ALLOWED_TAGS.has(name)) return ''
    if (closing) return `</${name}>`
    if (name === 'a') {
      const href = attributeValue(attributes, 'href')
      if (!isSafeHref(href)) return '<a>'
      const allowed = ALLOWED_ATTRIBUTES.a ?? new Set<string>()
      const rel = allowed.has('rel') ? safeRel(attributes) : ''
      return `<a href="${escapeAttribute(href.trim())}" rel="${rel}">`
    }
    return `<${name}>`
  }).join('')
  return html.trim()
}
