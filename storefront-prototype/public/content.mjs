// Obsah webu z administrácie (Medusa): GET /store/content/:page
//
// Backend vracia stránky → sekcie → polia. Kľúč poľa je stabilný
// (napr. `kontakt__kontakt-1__0-text`) a v HTML mu zodpovedá atribút
// `data-content`. Ak API nevráti dáta (offline, chyba, 404), stránka si ponechá
// svoj zabudovaný obsah – nikdy nesmie zostať prázdna.
const config = () => (typeof globalThis !== 'undefined' && globalThis.__ANASTASIA_CONFIG__) || {};

// Kľúč stránky z adresy: '/kontakt' → 'kontakt', '/' → 'home'.
export function pageKeyOf(pathname) {
  const raw = String(pathname || '/').replace(/^\/+|\/+$/g, '');
  return raw.replace(/\//g, '-').replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'home';
}

// Predpony klúčov, ktoré stránka naozaj používa ('global', 'eshop', 'kontakt', …).
// Stránka, ktorá nemá žiadny vlastný kľúč, sa na server neopýta – žiadny 404
// v konzole a zabudovaný obsah stránky ostáva v platnosti.
export function contentPageKeys(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  const keys = [];
  for (const el of root.querySelectorAll('[data-content]')) {
    const key = String((el.dataset && el.dataset.content) || '');
    const prefix = key.split('__')[0];
    if (prefix && !keys.includes(prefix)) keys.push(prefix);
  }
  return keys;
}

export async function loadContent(pageKey, {timeout = 5000} = {}) {
  const base = config().apiBaseUrl;
  if (!base || !pageKey) return null;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  try {
    const response = await fetch(`${base}/store/content/${encodeURIComponent(pageKey)}`, {
      signal: controller ? controller.signal : undefined,
      // Store API Medusy bez publishable key odpovedá 400 – texty z administrácie by sa nikdy nenačítali.
      headers: {accept: 'application/json', ...(config().publishableKey ? {'x-publishable-api-key': config().publishableKey} : {})},
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data && Array.isArray(data.sections) ? data : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const setValue = (el, field, value) => {
  if (field.type === 'image' || field.type === 'video') {
    const media = el.tagName === 'IMG' || el.tagName === 'SOURCE' || el.tagName === 'VIDEO' ? el : el.querySelector('img,source,video');
    if (!media) return false;
    media.setAttribute('src', value);
    if (field.type === 'image' && field.alt && media.tagName === 'IMG') media.setAttribute('alt', field.alt);
    if (field.type === 'video'){
      const video = media.tagName === 'VIDEO' ? media : media.closest('video');
      if (video && typeof video.load === 'function') video.load();
    }
    return true;
  }
  if (field.type === 'link') {
    el.setAttribute('href', value);
    if (field.label_text) el.textContent = field.label_text;
    return true;
  }
  if (field.type === 'rich') {
    // Server obsah čistí (povolené sú len bezpečné značky).
    el.innerHTML = value;
    return true;
  }
  el.textContent = value;
  return true;
};

// Vloží hodnoty do existujúcich miest. Prázdna hodnota nič nemení (fallback).
export function applyContent(root, payload) {
  if (!payload || !root) return 0;
  const targets = new Map();
  for (const el of root.querySelectorAll('[data-content]')) targets.set(el.dataset.content, el);
  let applied = 0;
  for (const section of payload.sections || []) {
    for (const field of section.fields || []) {
      const el = targets.get(field.key);
      if (!el) continue;
      const value = String(field.value ?? field.fallback ?? '').trim();
      if (!value) continue; // nikdy neprázdno – zostane pôvodný obsah
      if (setValue(el, field, value)) applied++;
    }
  }
  return applied;
}
