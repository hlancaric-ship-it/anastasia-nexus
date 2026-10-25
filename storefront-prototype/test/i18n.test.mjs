import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DICT, LANGS, SK_ONLY_NOTE, browserLang, countryLang, detectLang, storedLang} from '../public/i18n.mjs';

const dist = new URL('../dist/', import.meta.url);
const routes = JSON.parse(await readFile(new URL('routes.json', dist), 'utf8'));
const htmlFor = path => readFile(new URL((path === '/' ? '' : path.slice(1) + '/') + 'index.html', dist), 'utf8');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// Texty mimo hlavičku dokumentu; bloky `data-sk-only` se v EN/RU nechávají ve slovenštině
// a musí být opatřeny poznámkou v jazyce stránky.
function visibleChunks(html) {
  const body = html.replace(/<!doctype[^>]*>/i, '').replace(/<head[\s\S]*?<\/head>/i, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const chunks = [];
  const stack = [];
  const re = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[4] !== undefined) {
      const value = m[4].replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&');
      if (value.trim()) chunks.push({text: value, skOnly: stack.some(s => s.sk)});
      continue;
    }
    const [, close, tag, attrs] = m;
    if (close) {
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      continue;
    }
    const selfClosing = /\/>$/.test(attrs) || VOID.has(tag.toLowerCase());
    stack.push({tag, sk: /\bdata-sk-only\b|\btranslate="no"/.test(attrs)});
    if (selfClosing) stack.pop();
  }
  return chunks;
}

// Stejné pravidlo jako v prohlížeči: přesná shoda po trimu, jinak zůstane zdroj.
function translate(text, lang) {
  const trimmed = text.trim();
  const entry = DICT[trimmed];
  if (!entry) return text;
  const value = lang === 'en' ? entry[0] : entry[1];
  return value ? text.replace(trimmed, value) : text;
}

// Značky a názvy značek smí zůstat latinkou i v RU verzi.
const ALLOWED_LATIN = /\b(ANASTASIA|ACADEMY|RESET|LIGHT|FOR|THE|FUTURE|OZ|Facebook|YouTube|Pharmanews|GDPR|EMA|AI|SK|EN|RU|Cookies?|cookie)\b|[\w.+-]+@[\w-]+\.[\w.]+/gi;
const SK_DIACRITICS = /[ľĺŕňťďľĺŕňťďšžýáíéúóäôč]/i;
const UNTRANSLATED_NAMES = new Set([
  'RESET 40+', 'AI ANASTASIA', 'Pharmanews', 'AI ANASTASIA Academy',
  'AI ANASTASIA Longevity Academy', 'AI ANASTASIA RESET 40+',
  'AI ANASTASIA ACADEMY', 'ACADEMY', 'ANASTASIA OZ', 'ANASTASIA.ACADEMY',
  'ANASTASIA OZ — Light for the Future', 'ANASTASIA — Light for the Future',
  'ANASTASIA ACADEMY', 'Facebook', 'YouTube', 'Lucia', 'Cookies', '© 2026 ANASTASIA · Light for the Future',
]);

test('dictionary is complete for all three languages', () => {
  for (const [key, value] of Object.entries(DICT)) {
    assert.ok(Array.isArray(value) && value.length === 2, `${key}: needs [en, ru]`);
    assert.ok(value[0] && value[0].trim(), `${key}: missing English`);
    assert.ok(value[1] && value[1].trim(), `${key}: missing Russian`);
    if (!UNTRANSLATED_NAMES.has(key)) {
      assert.notEqual(value[0].trim(), key.trim(), `${key}: English is still Slovak`);
      assert.notEqual(value[1].trim(), key.trim(), `${key}: Russian is still Slovak`);
    }
    assert.ok(!SK_DIACRITICS.test(value[0]), `${key}: English keeps Slovak diacritics`);
  }
  for (const lang of LANGS) assert.ok(SK_ONLY_NOTE[lang], `missing note for ${lang}`);
});

test('the language is picked in the agreed order', () => {
  const globals = globalThis;
  const original = {localStorage: globals.localStorage, navigator: globals.navigator, document: globals.document};
  const withEnv = ({stored = null, languages = [], country = null}, fn) => {
    const define = (key, value) => Object.defineProperty(globals, key, {value, configurable: true, writable: true});
    define('localStorage', {getItem: key => (key === 'ana-lang-manual' ? stored : null)});
    define('navigator', {languages, language: languages[0] || ''});
    define('document', {querySelector: () => (country ? {getAttribute: () => country} : null)});
    try { return fn(); } finally {
      globals.localStorage = original.localStorage;
      globals.navigator = original.navigator;
      globals.document = original.document;
    }
  };
  // 1) ruční volba má vždy přednost
  withEnv({stored: 'ru', languages: ['sk-SK'], country: 'SK'}, () => assert.equal(detectLang(), 'ru'));
  // 2) jazyk prohlížeče
  withEnv({languages: ['sk-SK', 'en'], country: 'RU'}, () => assert.equal(detectLang(), 'sk'));
  withEnv({languages: ['cs'], country: 'RU'}, () => assert.equal(detectLang(), 'sk'));
  withEnv({languages: ['ru-RU'], country: 'SK'}, () => assert.equal(detectLang(), 'ru'));
  withEnv({languages: ['uk-UA'], country: 'SK'}, () => assert.equal(detectLang(), 'ru'));
  // 3) poloha, když prohlížeč neurčí sk/cs ani ru/uk/be
  withEnv({languages: ['de-DE'], country: 'SK'}, () => assert.equal(detectLang(), 'sk'));
  withEnv({languages: ['de-DE'], country: 'CZ'}, () => assert.equal(detectLang(), 'sk'));
  withEnv({languages: ['de-DE'], country: 'RU'}, () => assert.equal(detectLang(), 'ru'));
  withEnv({languages: ['de-DE'], country: 'KZ'}, () => assert.equal(detectLang(), 'ru'));
  withEnv({languages: ['de-DE'], country: 'DE'}, () => assert.equal(detectLang(), 'en'));
  // 4) fallback
  withEnv({languages: [], country: null}, () => assert.equal(detectLang(), 'sk'));
  // Pomocné funkce
  withEnv({languages: ['fr'], country: null}, () => assert.equal(browserLang(), null));
  withEnv({languages: [], country: 'BY'}, () => assert.equal(countryLang(), 'ru'));
  withEnv({languages: [], country: null}, () => assert.equal(countryLang(), null));
  withEnv({stored: 'en', languages: [], country: null}, () => assert.equal(storedLang(), 'en'));
});

test('every page speaks one language only', async () => {
  const problems = [];
  for (const path of routes) {
    const html = await htmlFor(path);
    const chunks = visibleChunks(html);
    for (const chunk of chunks) {
      if (chunk.skOnly) continue; // slovenský obsah s poznámkou v jazyce stránky
      const english = translate(chunk.text, 'en');
      if (SK_DIACRITICS.test(english)) problems.push(`${path} EN: ${JSON.stringify(english.trim())}`);
      const russian = translate(chunk.text, 'ru').replace(ALLOWED_LATIN, '');
      if (/[A-Za-z]/.test(russian)) problems.push(`${path} RU: ${JSON.stringify(russian.trim())}`);
    }
  }
  assert.deepEqual(problems.slice(0, 40), [], `mixed languages:\n${problems.slice(0, 40).join('\n')}`);
});

test('the Slovak-only blocks are marked and the note exists in every language', async () => {
  // Nový úvod je preložený celý, nepreložené bloky má pôvodný úvod.
  const html = await htmlFor('/povodny-uvod');
  assert.ok(/data-sk-only/.test(html), 'homepage marks the untranslated blocks');
  const legacy = await htmlFor('/zdravy-svet');
  assert.ok(/data-sk-only/.test(legacy), 'content pages mark their body');
  for (const lang of ['en', 'ru']) assert.ok(SK_ONLY_NOTE[lang] && SK_DIACRITICS.test(SK_ONLY_NOTE[lang]) === false);
});
