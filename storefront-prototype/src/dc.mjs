// Převod handoff návrhů (design/*.dc.html) na statické HTML 1:1.
// Inline styly, texty a struktura se přebírají doslova; mění se jen to, co je v návrhu
// vázané na React stav (šířka okna, otevřené menu, košík) — to přebírají CSS proměnné a app.mjs.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {escape} from './components.mjs';

const read = name => readFileSync(fileURLToPath(new URL(`../design/${name}`, import.meta.url)), 'utf8');
const SOURCES = {home: read('homepage-v2.dc.html'), about: read('o-lucii.dc.html')};

export const PHONE = 'tel:+421905363778';
const EXTERNAL = {
  Facebook: 'https://www.facebook.com/Anastasia-OZ-102480594468471/',
  YouTube: 'https://youtube.com/channel/UCUbv5uZqcyFb7kplgF2xljw',
};
// Cílové routy podle textu odkazu (návrh má většinou href="#").
const ROUTES = {
  'ANASTASIA': '/', 'SK': '/', 'LIGHT FOR THE FUTURE': '/', '← Na úvod': '/',
  'Všetky produkty': '/eshop', 'Kategórie': '/eshop/kategorie', 'Novinky': '/eshop?filter=novinky', 'Bestsellery': '/eshop?filter=bestsellery',
  'Celý obchod': '/eshop', 'Obchod': '/eshop',
  'RESET 40+': '/reset-40', 'Objaviť RESET 40+': '/reset-40', 'Všetky programy': '/programy', 'Programy': '/programy',
  'Pre firmy': '/programy/pre-firmy', 'Individuálne programy': '/programy/individualne',
  'Konzultácie': '/konzultacie', 'Všetky konzultácie': '/konzultacie', 'Služby': '/konzultacie',
  'Online konzultácia': '/konzultacie/online-zdravotna-konzultacia', 'Supervízia': '/konzultacie/supervizia',
  'Astrologický profil': '/konzultacie/astrologicky-profil-zdravia-a-vitality',
  'AI ANASTASIA': '/ai-anastasia', 'AI ANASTASIA ACADEMY': '/ai-anastasia-academy', 'Pre odborníkov': '/pre-odbornikov',
  'Zdravý svet': '/zdravy-svet', 'O Lucii': '/o-lucii', 'Príbeh Lucie': '/o-lucii', 'Kontakt': '/kontakt',
  'Pharmanews': '/ai-anastasia/pharmanews-novinky-zo-sveta-farmacie-zdravia-mediciny', 'Zdravé lekárne': '/zdrava-lekaren',
  'Obchodné podmienky': '/vop', 'Súkromie a GDPR': '/gdpr', 'Reklamácie': '/reklamacie',
  'Môj účet': '/prihlasenie', 'Košík': '/kosik', 'Napíšte nám': '/kontakt',
};
// Kotvy, které v návrhu vedou na sekce stránky a zůstávají kotvami (nadpisy menu, hlavička, hero).
const KEEP_ANCHOR = new Set(['Obchod', 'Programy', 'Služby', 'Konzultácie', 'Objavte svet ANASTASIA', 'Kolekcia']);
const CONSULT_ROUTES = {
  '01': '/konzultacie/online-zdravotna-konzultacia', '02': '/konzultacie/supervizia', '03': '/konzultacie/astrologicky-profil-zdravia-a-vitality',
};

// style-hover → generovaná třída; inline styl má přednost, proto !important.
const hoverRules = new Map();
const hoverClass = decl => {
  if (!hoverRules.has(decl)) hoverRules.set(decl, `dch${hoverRules.size}`);
  return hoverRules.get(decl);
};
export const dcCss = () => [...hoverRules].map(([decl, cls]) =>
  `.${cls}:hover{${decl.split(';').filter(Boolean).map(d => d.trim() + '!important').join(';')}}`).join('\n');

const textOf = html => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[↗↓✕]/g, '').replace(/\s+/g, ' ').trim();
const attr = (attrs, name) => attrs.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

function rewriteLinks(html, {page, region}) {
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (whole, attrs, inner) => {
    const href = attr(attrs, 'href') ?? '';
    const label = attr(attrs, 'aria-label');
    const text = textOf(inner).replace(/Už čoskoro$/, '').trim();
    let target;
    if (href.startsWith('/')) target = href; // už přeložená routa (iterace)
    else if (href.startsWith('tel:')) target = PHONE;
    else if (label && EXTERNAL[label]) target = EXTERNAL[label];
    else if (label === 'EN' || label === 'RU') target = null; // jazykové mutace zatím nejsou
    else if (/\.dc\.html/.test(href)) {
      const hash = href.split('#')[1];
      target = /O Lucii/.test(href) ? '/o-lucii' : hash && (region === 'header' || KEEP_ANCHOR.has(text)) ? `/#${hash}` : ROUTES[label] ?? ROUTES[text] ?? '/';
    } else if (href.startsWith('#') && href.length > 1 && region !== 'footer' && (region === 'header' || KEEP_ANCHOR.has(text))) {
      target = page === 'home' || (page === 'about' && href === '#pomoc') ? href : href === '#pomoc' ? '/konzultacie' : `/${href}`;
    } else target = ROUTES[label] ?? ROUTES[text] ?? (href.startsWith('#') && href.length > 1 && page === 'home' ? href : '/');
    let out = attrs.replace(/\shref="[^"]*"/, target === null ? ' href="#" aria-disabled="true" data-soon' : ` href="${target}"`);
    if (/^https:/.test(target || '')) out += ' target="_blank" rel="noopener noreferrer"';
    return `<a${out}>${inner}</a>`;
  });
}

const VIDEO_SOURCES = {
  hero: '<source src="/media/hero-480p.mp4" media="(max-width: 600px)" type="video/mp4"><source src="/media/hero-720p.mp4" media="(max-width: 1024px)" type="video/mp4"><source src="/media/hero-1080p.webm" type="video/webm"><source src="/media/hero-1080p.mp4" type="video/mp4">',
  sky: '<source src="/media/night-sky.mp4" type="video/mp4">',
};

function convert(src, {page, region = 'body', data = {}}) {
  let h = src;
  // Iterace (produkty, konzultace, služby).
  h = h.replace(/<sc-for list="\{\{ (\w+) \}\}" as="(\w+)"[^>]*>([\s\S]*?)<\/sc-for>/g, (_, list, as, tpl) =>
    (data[list] || []).map(item => {
      let t = tpl;
      if (item.href) t = t.replace('<a href="#"', `<a href="${item.href}"`);
      t = t.replace(`onClick="{{ ${as}.add }}"`, `type="button" data-add="{{ ${as}.add }}"`);
      const val = new RegExp(`\\{\\{ ${as}\\.(\\w+) \\}\\}`, 'g');
      t = t.replace(/>([^<]*)</g, (whole, text) => '>' + text.replace(val, (__, key) => `<span class="sc-interp">${item[key] ?? ''}</span>`) + '<');
      return t.replace(val, (__, key) => item[key] ?? '');
    }).join(''));
  // Podmínky: šířka okna přes CSS, video jen tam, kde máme vlastní záznam.
  h = h.replace(/<sc-if value="\{\{ (\w+) \}\}"[^>]*>([\s\S]*?)<\/sc-if>/g, (_, cond, inner) => {
    if (cond === 'wide') return `<dc-wide>${inner}</dc-wide>`;
    if (cond === 'narrow') return `<dc-narrow>${inner}</dc-narrow>`;
    if (cond === 'hasProgramVideo') return '';
    return inner; // hasHeroVideo, hasSkyVideo, showPreviewNotice
  });
  // Video atributy React → HTML.
  h = h.replace(/<video ref="\{\{ (\w+) \}\}" data-v="\w+" poster="([^"]*)" autoPlay="\{\{ true \}\}" muted="\{\{ true \}\}" loop="\{\{ true \}\}" playsInline="\{\{ true \}\}" preload="auto"([^>]*)><\/video>/g,
    (_, ref, poster, rest) => {
      const kind = ref === 'heroRef' ? 'hero' : 'sky';
      const p = kind === 'hero' ? '/media/poster.jpg' : poster;
      return `<video data-video="${kind}" poster="${p}" autoplay muted loop playsinline preload="${kind === 'hero' ? 'auto' : 'metadata'}"${rest}>${VIDEO_SOURCES[kind]}</video>`;
    });
  // Události.
  const events = {openMenu: 'data-menu-open="top" aria-controls="dc-top-menu" aria-expanded="false"', openSide: 'data-menu-open="side" aria-controls="dc-side-menu" aria-expanded="false"', closeMenu: 'data-menu-close', togglePlay: 'data-video-toggle', toggleSound: 'data-sound-toggle', subscribe: 'data-newsletter'};
  h = h.replace(/\son(?:Click|Submit)="\{\{ (\w+) \}\}"/g, (_, fn) => events[fn] ? ' ' + events[fn] : '');
  h = h.replace(/ value="\{\{ email \}\}" onChange="\{\{ setEmail \}\}"/g, ' name="email" autocomplete="email" aria-label="Váš e-mail" required');
  // Hodnoty.
  const values = {
    railPad: 'var(--rail-pad)', railNeg: 'var(--rail-neg)', heroHeight: '100vh', captionLeft: 'var(--cap-left)', menuRight: 'var(--menu-right)',
    overlayOpacity: 'var(--ov-o)', overlayPointer: 'var(--ov-p)',
    menuOpacity: 'var(--top-o)', menuPointer: 'var(--top-p)', menuTransform: 'var(--top-t)',
    sideOpacity: 'var(--side-o)', sidePointer: 'var(--side-p)', sideTransform: 'var(--side-t)',
    playIcon: 'II', soundLabel: 'Zvuk vypnutý', subscribeLabel: 'Odoberať',
    cartCount: '0',
  };
  // Runtime návrhu vkládá každou textovou interpolaci do <span class="sc-interp"> (proto se na ni neaplikuje text roll).
  h = h.replace(/>([^<]*)</g, (whole, text) => '>' + text.replace(/\{\{ (\w+) \}\}/g, (m, key) => key in values ? `<span class="sc-interp${key === 'cartCount' ? ' cart-count' : ''}">${values[key]}</span>` : m) + '<');
  h = h.replace(/\{\{ (\w+) \}\}/g, (whole, key) => {
    if (!(key in values)) throw new Error(`dc: neznámý binding ${key} (${page})`);
    return values[key];
  });
  // style-hover → třída.
  h = h.replace(/<(\w[\w-]*)([^>]*?)\sstyle-hover="([^"]*)"([^>]*)>/g, (_, tag, a, decl, b) => {
    const cls = hoverClass(decl);
    const all = a + b;
    return /\sclass="/.test(all) ? `<${tag}${all.replace(/\sclass="/, ` class="${cls} `)}>` : `<${tag} class="${cls}"${all}>`;
  });
  // Assety.
  h = h.replace(/\.\/assets\//g, '/assets/');
  h = rewriteLinks(h, {page, region});
  return h;
}

// Rozřezání návrhu na části.
function parts(src) {
  const body = src.slice(src.indexOf('<div lang="sk"'), src.lastIndexOf('</x-dc>'));
  const inner = body.slice(body.indexOf('>') + 1, body.lastIndexOf('</div>'));
  const take = re => { const m = inner.match(re); if (!m) throw new Error('dc: chybí část ' + re); return m[0]; };
  const footer = take(/<footer[\s\S]*?<\/footer>/);
  const overlay = take(/<div onClick="\{\{ closeMenu \}\}"[^>]*><\/div>/);
  const rail = take(/<sc-if value="\{\{ wide \}\}"[^>]*>\s*<aside id="ana-rail"[\s\S]*?<\/aside>\s*<\/sc-if>/);
  const asides = inner.slice(inner.indexOf(rail) + rail.length).match(/<aside[\s\S]*?<\/aside>/g);
  const sections = inner.slice(0, inner.indexOf(footer)).match(/<section[\s\S]*?<\/section>/g);
  const header = take(/<header[\s\S]*?<\/header>/);
  return {sections, footer, overlay, rail, side: asides[0], top: asides[1], header};
}
const P = {home: parts(SOURCES.home), about: parts(SOURCES.about)};

// Bleed pod lištu (applyBleed z návrhu) staticky: sekce mimo úvodní mají margin -52px a padding +52px.
const bleed = html => html.replace(/^<(section|footer)\b([^>]*?)style="([^"]*)"/, (_, tag, a, style) =>
  `<${tag}${a}style="${style};margin-left:var(--rail-neg);padding-left:var(--rail-pad)"`);

const ids = html => html
  .replace('<aside id="ana-rail" data-screen-label="Rail"', '<aside id="ana-rail" data-screen-label="Rail" aria-label="Jazyk, menu a kontakt"')
  .replace('<aside data-lenis-prevent="true" role="dialog" aria-label="Menu"', '<aside id="dc-side-menu" data-lenis-prevent="true" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden="true" inert')
  .replace('<aside data-lenis-prevent="true" role="dialog" aria-label="Hlavné menu"', '<aside id="dc-top-menu" data-lenis-prevent="true" role="dialog" aria-modal="true" aria-label="Hlavné menu" aria-hidden="true" inert')
  .replace(/^<div /, '<div data-menu-overlay ');

// Globální prvky stránky: lišta, menu, overlay, patička. `page` určuje, ze kterého návrhu a jak se mapují kotvy.
export function chrome(page) {
  const src = page === 'about' ? P.about : P.home;
  const linkPage = page === 'home' || page === 'about' ? page : 'other';
  return {
    header: convert(src.header, {page: linkPage, region: 'header'}),
    footer: bleed(convert(src.footer, {page: linkPage, region: 'footer'})),
    overlay: ids(convert(src.overlay, {page: linkPage})),
    rail: ids(convert(src.rail, {page: linkPage, region: 'rail'})),
    menus: ids(convert(src.side, {page: linkPage, region: 'menu'})) + ids(convert(src.top, {page: linkPage, region: 'menu'})),
  };
}

export function homeSections(products) {
  const data = {
    products: products.map(p => ({...p, label: 'Do košíka', fg: '#EFE5C7'})),
    consults: [
      {n: '01', title: 'Online zdravotná konzultácia', sub: 'Osobne aj na diaľku', href: CONSULT_ROUTES['01']},
      {n: '02', title: 'Supervízia', sub: 'Pre odborníkov a tímy', href: CONSULT_ROUTES['02']},
      {n: '03', title: 'Astrologický profil', sub: 'Zdravie a predispozície', href: CONSULT_ROUTES['03']},
    ],
  };
  return P.home.sections.map((s, i) => {
    const out = convert(s, {page: 'home', data});
    return i === 0 ? out.replace(/<header[\s\S]*?<\/header>/, '%%HEADER%%') : bleed(out);
  }).join('\n');
}

export function aboutSections() {
  const data = {services: [
    {n: '01', title: 'Online zdravotná konzultácia', href: CONSULT_ROUTES['01']},
    {n: '02', title: 'Supervízia', href: CONSULT_ROUTES['02']},
    {n: '03', title: 'Astrologický profil', href: CONSULT_ROUTES['03']},
  ]};
  return P.about.sections.map((s, i) => {
    const out = convert(s, {page: 'about', data});
    return i === 0 ? out.replace(/<header[\s\S]*?<\/header>/, '%%HEADER%%') : bleed(out);
  }).join('\n');
}

export const ROOT_STYLE = 'font-family:Outfit,sans-serif;font-weight:300;color:#EFE5C7;background:#283020;overflow-x:hidden;padding:0 0 0 var(--rail-pad)';
// Globální styly z <helmet> návrhu (rozsah omezen na stránky v novém vzhledu tam, kde by rozbily starší obsah).
export const HELMET_CSS = `html.lenis,html.lenis body{height:auto}
.lenis.lenis-smooth{scroll-behavior:auto !important}
.lenis.lenis-smooth [data-lenis-prevent]{overscroll-behavior:contain}
.lenis.lenis-stopped{overflow:hidden}
html:has(body.dc-page),body.dc-page{margin:0;background:#283020}
.dc-root *,.dc-chrome *{box-sizing:border-box}
.dc-root a,.dc-chrome a{color:inherit;text-decoration:none}.dc-root a:hover,.dc-chrome a:hover{color:#C9A355}
.dc-root input:-webkit-autofill,.dc-root input:-webkit-autofill:hover,.dc-root input:-webkit-autofill:focus,.dc-chrome input:-webkit-autofill,.dc-chrome input:-webkit-autofill:hover,.dc-chrome input:-webkit-autofill:focus{-webkit-text-fill-color:#EFE5C7;-webkit-box-shadow:0 0 0 1000px rgba(0,0,0,0) inset;box-shadow:0 0 0 1000px rgba(0,0,0,0) inset;transition:background-color 99999s ease 0s;caret-color:#EFE5C7}
.dc-root input:focus,.dc-chrome input:focus{outline:none}
.dc-root input,.dc-chrome input{-webkit-appearance:none;appearance:none;background-clip:padding-box}
.dc-root input::placeholder,.dc-chrome input::placeholder{color:#69705E}`;
