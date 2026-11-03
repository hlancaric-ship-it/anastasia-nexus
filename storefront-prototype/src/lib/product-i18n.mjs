// Překlady produktů (EN/RU) z Medusa `product.metadata.translations = { en:{title,subtitle,description}, ru:{…} }`.
// Společné pro build (Node) i prohlížeč. Chybějící překlad = slovenský text (fallback).

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** HTML popisu → prostý text s odstavci oddělenými prázdným řádkem (vstup pro descriptionHtml). */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|h[1-6]|li|div|tr|blockquote)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      try {
        if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      } catch { return m; }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const text = v => (typeof v === 'string' ? v.trim() : '');

/** Z metadat vybere jen platné řetězce: { en:{title,subtitle,description}, ru:{…} } (prázdné jazyky vynechá). */
export function normalizeTranslations(meta) {
  const src = meta && typeof meta === 'object' ? meta.translations : null;
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const lang of ['en', 'ru']) {
    const t = src[lang];
    if (!t || typeof t !== 'object') continue;
    const item = { title: text(t.title), subtitle: text(t.subtitle), description: text(t.description) };
    if (item.title || item.subtitle || item.description) out[lang] = item;
  }
  return out;
}

/** Text pro kartu/popisek: podtitulek, jinak prostý text popisu. */
export const cardText = t => (t ? (t.subtitle || htmlToText(t.description)) : '');

/**
 * Položky slovníku pro i18n: slovenský text → [EN, RU]. Klíč je přesně text, který se objeví v DOM
 * (název, popis karty). Prázdný překlad se nepřidá, takže zůstane slovensky.
 */
export function dictEntries(product) {
  const tr = product?.translations || {};
  const pair = (fn) => [fn(tr.en), fn(tr.ru)];
  const entries = {};
  const add = (key, [en, ru]) => {
    key = text(key);
    if (!key || (!en && !ru)) return;
    entries[key] = [en || '', ru || ''];
  };
  add(product?.name, pair(t => t?.title || ''));
  add(product?.description, pair(t => cardText(t)));
  return entries;
}

/** Dlouhý popis produktu pro daný jazyk (plain text pro descriptionHtml); SK/chybějící překlad → null. */
export function longTextFor(product, lang) {
  const t = product?.translations?.[lang];
  const body = t?.description ? htmlToText(t.description) : '';
  return body || null;
}

/** Zapíše položky do sdíleného registru, který čte public/i18n.mjs, a upozorní stránku. */
export function registerProducts(products) {
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  if (!g || typeof g.document === 'undefined') return;
  let changed = false;
  const reg = (g.__anaProductTr ||= {});
  for (const p of products) {
    for (const [key, value] of Object.entries(dictEntries(p))) {
      const old = reg[key];
      if (!old || old[0] !== value[0] || old[1] !== value[1]) { reg[key] = value; changed = true; }
    }
  }
  if (changed) { try { g.document.dispatchEvent(new CustomEvent('anastasia:product-tr')); } catch { /* bez DOM */ } }
}
