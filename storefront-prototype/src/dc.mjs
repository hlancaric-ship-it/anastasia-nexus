// Převod handoff návrhů (design/*.dc.html) na statické HTML 1:1.
// Inline styly, texty a struktura se přebírají doslova; mění se jen to, co je v návrhu
// vázané na React stav (šířka okna, otevřené menu, košík) — to přebírají CSS proměnné a app.mjs.
import {readFileSync} from 'node:fs';
import {homeSections as homeLhSections, HOME_CSS, LH_HEADER} from './home-lh.mjs';
import {fileURLToPath} from 'node:url';
import {escape} from './components.mjs';
import {menuGroups} from './lib/menu-navigation.mjs';
import {cookieSettingsLink} from './cookie-consent.mjs';

const read = name => readFileSync(fileURLToPath(new URL(`../design/${name}`, import.meta.url)), 'utf8');
const SOURCES = {home: read('homepage-v2.dc.html'), about: read('o-lucii.dc.html')};

export const PHONE = 'tel:+421905363778';
const EXTERNAL = {
  Facebook: 'https://www.facebook.com/Anastasia-OZ-102480594468471/',
  YouTube: 'https://www.youtube.com/@luciarogozanova544',
};
// Cílové routy podle textu odkazu (návrh má většinou href="#").
const ROUTES = {
  'ANASTASIA': '/', 'SK': '/', 'LIGHT FOR THE FUTURE': '/', '← Na úvod': '/',
  'Všetky produkty': '/eshop', 'Kategórie': '/eshop/kategorie', 'Novinky': '/eshop?filter=novinky', 'Bestsellery': '/eshop?filter=bestsellery', 'Odporúčame': '/eshop?filter=odporucame',
  'Celý obchod': '/eshop', 'Obchod': '/eshop',
  'AI ANASTASIA ACADEMY': '/eshop?category=sebarozvoj', 'BIOKOZMETIKA': '/eshop?category=bio-kozmetika-bez-chemie', 'Zdravé doplnky výživy': '/eshop?category=zdrave-doplnky-vyzivy', 'Programy a služby': '/eshop?category=sebarozvoj', 'Biokozmetika': '/eshop?category=bio-kozmetika-bez-chemie',
  'RESET 40+': '/reset-40', 'Objaviť RESET 40+': '/reset-40', 'Programy': '/eshop?category=sebarozvoj',
  'Klub': '/klub', 'Moja knižnica': '/ucet', 'Výuka': '/eshop/produkt/vyuka-vedomeho-vnimania', 'Aktuality': '/zdrava-lekaren',
  'Konzultácie': '/konzultacie', 'Všetky konzultácie': '/konzultacie', 'Služby': '/konzultacie',
  'Online konzultácia': '/konzultacie/online-zdravotna-konzultacia', 'Supervízia': '/konzultacie/supervizia',
  'Astrologický profil': '/konzultacie/astrologicky-profil-zdravia-a-vitality', 'Astrológia': '/konzultacie/astrologicky-profil-zdravia-a-vitality',
  'AI ANASTASIA': '/ai-anastasia',
  'Zdravý svet': '/zdravy-svet', 'O Lucii': '/o-lucii', 'Príbeh Lucie': '/o-lucii', 'Kontakt': '/kontakt',
  'Recenzie zákazníkov': '/ai-anastasia/recenzie-zakaznikov',
  'Pharmanews': '/ai-anastasia/pharmanews-novinky-zo-sveta-farmacie-zdravia-mediciny', 'Zdravé lekárne': '/zdrava-lekaren',
  'Obchodné podmienky': '/vop', 'Súkromie a GDPR': '/gdpr', 'Reklamácie': '/reklamacie',
  'Môj účet': '/ucet', 'Košík': '/kosik', 'Napíšte nám': '/kontakt',
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
    if ((region === 'menu' || region === 'header') && (ROUTES[label] || ROUTES[text])) target = ROUTES[label] || ROUTES[text];
    else if (href.startsWith('/')) target = href; // už přeložená routa (iterace)
    else if (href.startsWith('https://')) target = href;
    else if (href.startsWith('tel:')) target = PHONE;
    else if (href.startsWith('mailto:')) target = href;
    else if (label && EXTERNAL[label]) target = EXTERNAL[label];
    else if (label === 'EN' || label === 'RU') target = null; // jazykové mutace zatím nejsou
    else if (/\.dc\.html/.test(href)) {
      const hash = href.split('#')[1];
      target = /Môj účet/.test(href) ? '/ucet' : /O Lucii/.test(href) ? '/o-lucii' : hash && (region === 'header' || KEEP_ANCHOR.has(text)) ? `/#${hash}` : ROUTES[label] ?? ROUTES[text] ?? '/';
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
    // Ukážkové hlášky na webe nechceme (Lucky 2026-10-14).
    if (cond === 'hasProgramVideo' || cond === 'showPreviewNotice') return '';
    return inner; // hasHeroVideo, hasSkyVideo
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
    railPad: 'var(--rail-pad)', railNeg: 'var(--rail-neg)', heroHeight: '100dvh', captionLeft: 'var(--cap-left)', menuRight: 'var(--menu-right)',
    overlayOpacity: 'var(--ov-o,0)', overlayPointer: 'var(--ov-p,none)',
    menuOpacity: 'var(--top-o,0);visibility:var(--top-v,hidden)', menuPointer: 'var(--top-p,none)', menuTransform: 'var(--top-t)',
    sideOpacity: 'var(--side-o,0);visibility:var(--side-v,hidden)', sidePointer: 'var(--side-p,none)', sideTransform: 'var(--side-t)',
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

const mediaControls=`<div data-media-controls aria-label="Ovládanie videa a zvuku">
  <button type="button" data-sound-toggle aria-pressed="false" aria-label="Zapnúť zvuk" title="Zapnúť zvuk"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12H3v8h4v-8zm16 0h1v8h-4v-8z"/><path class="sound-cross" d="m9 17 6 6m0-6-6 6"/></svg><span class="sc-interp media-label">Zvuk vypnutý</span></button>
  <button type="button" data-sound-next hidden aria-label="Ďalšia skladba" title="Ďalšia skladba"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m5 5 10 7-10 7z"/><path d="M19 5v14"/></svg><span class="media-label">Ďalšia skladba</span></button>
  <button type="button" data-video-toggle aria-pressed="false" aria-label="Pozastaviť video" title="Pozastaviť video"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path class="pause-icon" d="M8 4v16M16 4v16"/><path class="play-icon" d="m7 4 13 8-13 8z"/></svg><span class="sc-interp media-label">Pozastaviť video</span></button>
</div>`;

// Bleed pod lištu (applyBleed z návrhu) staticky: sekce mimo úvodní mají margin -52px a padding +52px.
const bleed = html => html.replace(/^<(section|footer)\b([^>]*?)style="([^"]*)"/, (_, tag, a, style) =>
  `<${tag}${a}style="${style};margin-left:var(--rail-neg);padding-left:var(--rail-pad)"`);

const ids = html => html
  .replace('<aside id="ana-rail" data-screen-label="Rail"', '<aside id="ana-rail" data-screen-label="Rail" aria-label="Jazyk, menu a kontakt"')
  .replace('<aside data-lenis-prevent="true" role="dialog" aria-label="Menu"', '<aside id="dc-side-menu" data-lenis-prevent="true" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden="true" inert')
  .replace('<aside data-lenis-prevent="true" role="dialog" aria-label="Hlavné menu"', '<aside id="dc-top-menu" data-lenis-prevent="true" role="dialog" aria-modal="true" aria-label="Hlavné menu" aria-hidden="true" inert')
  .replace(/^<div /, '<div data-menu-overlay ')
  .replace(/top:\s*37px/g, 'top: 0')
  .replace(/left:\s*-5px/g, 'left: 0');

// Patička: skupiny odkazů bez duplicit (AI ANASTASIA a Academy vedou z log značek, podstránky konzultácií nejsou vedle rozcestníku).
const FOOTER_GROUPS = {
  'Svet': [['Obchod', '/eshop'], ['RESET 40+', '/reset-40'], ['Zdravý svet', '/zdravy-svet']],
  'Sprevádzanie': [['Konzultácie', '/konzultacie'], ['Supervízia', '/konzultacie/supervizia'], ['Astrológia', '/konzultacie/astrologicky-profil-zdravia-a-vitality']],
  'Informácie': [['O Lucii', '/o-lucii'], ['Zdravá lekáreň', '/zdrava-lekaren'], ['Denný stacionár Vyšná Slaná', '/denny-stacionar-vysna-slana'], ['Môj účet', '/ucet'], ['Kontakt', '/kontakt']],
};
const FOOTER_BRANDS = {'ANASTASIA.ACADEMY': '/ai-anastasia-academy', 'AI ANASTASIA': '/ai-anastasia'};
// Odkazy na päť právnych stránok (r19 bod 5): VOP, GDPR, reklamácie, odstúpenie od zmluvy, cookies.
const LEGAL_LINKS = [['Obchodné podmienky','/vop'],['Súkromie a GDPR','/gdpr'],['Reklamácie','/reklamacie'],['Odstúpenie od zmluvy','/odstupenie'],['Cookies','/cookies']];
function footerLegalLinks(html) {
  return html.replace(/(<div style="display:flex;gap:28px;flex-wrap:wrap">)(?:<a href="#">[^<]*<\/a>)+/,
    (_, head) => head + LEGAL_LINKS.map(([t,h])=>`<a href="${h}">${t}</a>`).join(''));
}
// Odkaz „Nastavenia cookies“ v pätičke (názov je z textu klientky): otvorí panel, kde sa voľba zmení.
function withCookieSettings(html) {
  if (!html.includes('<a href="/cookies">Cookies</a>')) throw new Error('dc: v patičce chybí odkaz Cookies');
  return html.replace('<a href="/cookies">Cookies</a>', `<a href="/cookies">Cookies</a>${cookieSettingsLink()}`);
}
function footerLinks(html) {
  let out = html;
  for (const [title, links] of Object.entries(FOOTER_GROUPS)) {
    out = out.replace(new RegExp(`(>${title}</span>\\s*)(?:<a\\b[^>]*>[^<]*</a>)+`), (_, head) => head + links.map(([t, h]) => `<a href="${h}">${t}</a>`).join(''));
  }
  // Kontakt v päte ako na starom webe: telefón, e-mail a odkaz na Cookies.
  out = out.replace(/(<div style="display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;padding-top:26px;font-size:12px;color:#C4C7B6">)/,
    '$1<div style="display:flex;gap:24px;flex-wrap:wrap"><a href="tel:+421905363778">+421 905 363 778</a><a href="mailto:zdravysvet@anastasiaoz.eu">zdravysvet@anastasiaoz.eu</a></div>');
  // Tri originálne veľké logá značiek v pätičke bez ďalších textových popiskov, rovnaký symetrický rozestup (Lucky 28. 10.).
  const BRAND_TRIO = '<div class="sf-brands" style="display:flex;justify-content:center;align-items:center;gap:clamp(36px,5vw,72px);padding:clamp(36px,4vw,60px) 20px;border-bottom:1px solid rgba(201,163,85,0.28)">'
    + '<a href="/" class="footer-brand" title="ANASTASIA — Light for the Future" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none"><img src="/assets/lucia-koule.png" class="brand-seal" alt="ANASTASIA — Light for the Future" style="height:clamp(200px,21vw,290px);width:auto;object-fit:contain"></a>'
    + '<a href="https://www.anastasia.academy/" target="_blank" rel="noopener" class="footer-brand" title="ANASTASIA — ACADEMY" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none"><img src="/assets/menu-logo-academy.png" class="brand-seal" alt="ANASTASIA — ACADEMY" style="height:clamp(200px,21vw,290px);width:auto;object-fit:contain"></a>'
    + '<a href="https://www.aianastasia.com/" target="_blank" rel="noopener" class="footer-brand" title="ANASTASIA — AI ANASTASIA" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none"><img src="/assets/menu-logo-ai.png" class="brand-seal" alt="ANASTASIA — AI ANASTASIA" style="height:clamp(200px,21vw,290px);width:auto;object-fit:contain"></a>'
    + '</div>';
  out = out.replace(/<div style="display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\);align-items:end;[\s\S]*?border-bottom:1px solid rgba\(201,163,85,0\.28\)">[\s\S]*?<\/div>(?=\s*<div style="display:flex;justify-content:space-between;)/,
    BRAND_TRIO);
  return out;
}

// Jednotná kompaktná pätička na všetkých stránkach: triedy namiesto výberu podľa inline štýlov návrhu.
const FOOTER_PARTS = [
  ['<footer ', '<footer class="site-footer" '],
  ['<div style="max-width:1560px;margin:0 auto;padding:clamp(80px', '<div class="sf-wrap" style="max-width:1560px;margin:0 auto;padding:clamp(80px'],
  ['<div style="display:flex;flex-wrap:wrap;gap:56px clamp(40px,6vw,96px);padding-bottom', '<div class="sf-top" style="display:flex;flex-wrap:wrap;gap:56px clamp(40px,6vw,96px);padding-bottom'],
  ['<div style="display:flex;flex-direction:column;gap:22px;flex:1 1 440px', '<div class="sf-news" style="display:flex;flex-direction:column;gap:22px;flex:1 1 440px'],
  ['<div style="display:flex;flex-wrap:wrap;gap:40px clamp(36px,5vw,88px);flex:0 1 auto"', '<div class="sf-links" style="display:flex;flex-wrap:wrap;gap:40px clamp(36px,5vw,88px);flex:0 1 auto"'],
  ['<div style="display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;padding-top:26px', '<div class="sf-bottom" style="display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;padding-top:26px'],
];
function footerClasses(html) {
  for (const [from, to] of FOOTER_PARTS) {
    if (!html.includes(from)) throw new Error(`dc: v pätičke chýba časť ${from.slice(0, 60)}`);
    html = html.replace(from, to);
  }
  return html;
}

// Globální prvky stránky: lišta, menu, overlay, patička. `page` určuje, ze kterého návrhu a jak se mapují kotvy.
// Staré kruhové logo (BUSINESS / LIFE COACHING / MARTIAL ART) nahrádza výhradne zlatá pečať ANASTASIA (Lucky 26. 10.).
const seal=h=>h.replace(/<img src="\.?\/assets\/(?:lucia-logo|logo-mark)\.png"([^>]*)>/g,(m,a)=>`<img src="/assets/lucia-koule.png" class="brand-seal"${a.replace(/filter:[^;"]*;?/,'').replace(/opacity:\.82;?/,'')}>`);

export function chrome(page) {
  const src = page === 'about' ? P.about : P.home;
  const linkPage = page === 'home' || page === 'about' ? page : 'other';
  const side=src.side.replace(/<div style="display:flex;align-items:center;gap:14px"><img src="\.\/assets\/logo-mark\.png"[^>]*><div style="display:flex;flex-direction:column;gap:3px">[\s\S]*?<\/div><\/div>/,'');
  // Tri logá z pätičky v spodnom riadku horného menu vpravo, vedľa jazykov.
  const MENU_LOGOS='<div class="menu-brand-logos" style="display:flex;justify-content:flex-end;align-items:center;gap:20px;min-width:0;padding-top:6px">'
    +'<a data-menu-brand href="/" data-menu-close title="ANASTASIA — Light for the Future" style="display:inline-flex;align-items:center;justify-content:center;color:#403f62;text-decoration:none"><img src="/assets/lucia-koule.png" class="brand-seal" alt="ANASTASIA — Light for the Future" style="height:84px;width:84px;object-fit:contain"></a>'
    +'<a data-menu-brand href="https://www.anastasia.academy/" target="_blank" rel="noopener" title="ANASTASIA — ACADEMY" style="display:inline-flex;align-items:center;justify-content:center;color:#403f62;text-decoration:none"><img src="/assets/menu-logo-academy.png" class="brand-seal" alt="ANASTASIA — ACADEMY" style="height:84px;width:84px;object-fit:contain"></a>'
    +'<a data-menu-brand href="https://www.aianastasia.com/" target="_blank" rel="noopener" title="ANASTASIA — AI ANASTASIA" style="display:inline-flex;align-items:center;justify-content:center;color:#403f62;text-decoration:none"><img src="/assets/menu-logo-ai.png" class="brand-seal" alt="ANASTASIA — AI ANASTASIA" style="height:84px;width:84px;object-fit:contain"></a></div>';
  const menuMark='<span class="menu-brand-mark"><img src="./assets/lucia-logo.png" alt="ANASTASIA"></span>';
  // Obě menu čtou stejný seznam; původní návrhové duplicity se nepřenášejí.
  const menuBrand=html=>{
    // Položka účtu v menu (aj ikona) je označená pre runtime: text a cesta podľa prihlásenia.
    html=html.replace(/(<a\b[^>]*?)(>)\s*Zdravý svet\s*<\/a>/g, '$1 data-menu-account$2Môj účet</a>').replace(/<a\b[^>]*>\s*O Lucii\s*<\/a>/g, '').replace(/(<a\b[^>]*aria-label="Môj účet")/g, '$1 data-menu-account');
    let index=0;
    const groupOffsets=[0,5,9];
    html=html.replace(/<div style="display:flex;flex-direction:column;gap:(?:2|4)px;[^"]*">[\s\S]*?<\/div>/g,whole=>{
      if(index>=menuGroups.length)return whole;
      const group=menuGroups[index++];
      const large=whole.includes('font-size:25px');
      const wrapper=whole.slice(0,whole.indexOf('>')+1);
      // Kľúče polí menu z administrácie (rovnaké poradie ako v semene).
      const slug=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'');
      const base=`global__menu-${slug(group.title)}`;
      let field=groupOffsets[index-1];
      const link=(label,href,heading=false,keyIndex=field++)=>{// Položky menu idú zo zoznamu kategórií, nie z textov v administrácii (staré texty tam nesedeli na odkazy).
        const content='';return `<a href="${escape(href)}" onClick="{{ closeMenu }}" style="font-size:${heading?(large?25:19):(large?14:12)}px;color:${heading?'#C9A355':'#EFE5C7'};padding:4px 0;${heading?'margin-bottom:6px;':''}" style-hover="color:#C9A355"${content}>${escape(label)}</a>`;};
      const title=group.title==='Obchod'?link(group.title,group.href,true,field++):`<span style="font-size:${large?25:19}px;color:#C9A355;margin-bottom:6px"${(field++,"")}>${escape(group.title)}</span>`;
      return wrapper+title+group.links.map(item=>{if(!item){field++;return '';}const [label,href]=item;return link(label,href);}).join('')+'</div>';
    });
    // Dekorativní fotka lesa a poznámka „už čoskoro“ v dolní části menu se nevykreslují.
    html=html.replace(/<div style="grid-column:span 2;min-height:190px;[^"]*hero-forest\.jpg[^"]*"><\/div>/,'').replace(/<span style="font-size:9px;opacity:0\.7">EN \/ RU už čoskoro<\/span>/,'');
    return html.replace(/<img src="\.\/assets\/logo-mark\.png"[^>]*>/,menuMark)
      .replaceAll('background:linear-gradient(135deg,rgba(255,255,255,0.14) 0%,rgba(255,255,255,0.04) 30%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.08) 100%),rgba(26,34,22,0.42)', 'background:#F5F2E8')
      .replaceAll('color:#EFE5C7','color:#283020')
      .replaceAll('color:#C9A355','color:#313C2B')
      .replaceAll('style-hover="color:#C9A355"','style-hover="color:#62527F"')
      .replaceAll('backdrop-filter:blur(40px) saturate(170%) brightness(0.52);-webkit-backdrop-filter:blur(40px) saturate(170%) brightness(0.52);text-shadow:0 1px 14px rgba(0,0,0,0.35);','');
  };
  // Horné menu: štyri sekcie vedľa seba (Môj účet a Kontakt sú štvrtý
  // stĺpec), dole jazyky vľavo a tri logá vpravo.
  const topLayout=html=>{
    const block=html.match(/<div style="display:flex;flex-direction:column">\s*(<a class="dch6"[^>]*font-size:30px[\s\S]*?)<\/div>/);
    const bottom='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:24px;padding-top:20px;';
    if(!block||!html.includes(bottom))return html;
    const links=block[1].replace(/style="font-weight:300;font-size:30px;line-height:1\.35;letter-spacing:-0\.6px"/g,'style="font-size:14px;color:var(--site-main);padding:4px 0;"').trim();
    const column='<div style="display:flex;flex-direction:column;gap:4px;padding-left:20px"><span style="font-size:25px;color:#313C2B;margin-bottom:6px">Kontakt</span>'+links+'</div>';
    html=html.replace(block[0],'');
    const at=html.lastIndexOf('</div>',html.indexOf(bottom));
    html=html.slice(0,at)+column+html.slice(at);
    return html.replace(bottom,'<div class="menu-bottom-row" style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding-top:20px;').replace(/(<div class="menu-bottom-row"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>)/,'$1'+MENU_LOGOS);
  };
  const accountLink='<a class="header-account" data-global-account href="/prihlasenie" aria-label="Prihlásiť sa" title="Prihlásiť sa"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg></a>';
  const headerHtml=convert(src.header.replace('>Programy</a>','>Programy a služby</a>'), {page: linkPage, region: 'header'}).replace(/<a href="[^"]*" style="display:flex;flex-direction:column;align-items:center;gap:6px">[\s\S]*?<\/a>/, '<a class="header-brand" href="/" aria-label="ANASTASIA — domov"><span class="header-brand-emblem"><img src="/assets/lucia-logo.png" alt=""></span><span class="header-brand-wordmark">ANASTASIA<small>LIGHT FOR THE FUTURE</small></span></a>').replace('<dc-wide><a href="/konzultacie">',accountLink+'<dc-wide><a href="/konzultacie">').replace('<header ','<header id="lh-top" class="lh-top" ');
  // Na novém rozvržení úvodu hlavička leží přes hero, ne tlačí obsah dolů.
  const header=page==='home'?headerHtml.replace('style="position:relative;z-index:2;','style="position:absolute;left:0;right:0;top:0;z-index:4;'):headerHtml;
  const out={
    header: page==='home' || page==='about' ? LH_HEADER : header,
    footer: bleed(withCookieSettings(convert(footerClasses(footerLegalLinks(footerLinks(src.footer))), {page: linkPage, region: 'footer'}))),
    overlay: ids(convert(src.overlay, {page: linkPage})),
    rail: ids(convert(src.rail, {page: linkPage, region: 'rail'})).replace('</aside>', `${mediaControls}</aside>`),
    menus: ids(convert(menuBrand(side), {page: linkPage, region: 'menu'})) + ids(topLayout(convert(menuBrand(src.top), {page: linkPage, region: 'menu'}))),
  };
  for(const k of Object.keys(out)) out[k]=seal(out[k]);
  return out;
}

export function homeSections(products, categories) {
  // Hlavička se vkládá před hero, kategorie přicházejí z aktivního Store API.
  return '%%HEADER%%\n'+homeLhSections(products, categories);
}

export function aboutSections() {
  const data = {services: [
    {n: '01', title: 'Online zdravotná konzultácia', href: CONSULT_ROUTES['01']},
    {n: '02', title: 'Supervízia', href: CONSULT_ROUTES['02']},
    {n: '03', title: 'Astrologický profil', href: CONSULT_ROUTES['03']},
  ]};
  return P.about.sections.map((s, i) => {
    const out = convert(s, {page: 'about', data});
    return seal(i === 0 ? out.replace(/<header[\s\S]*?<\/header>/, '%%HEADER%%') : bleed(out));
  }).join('\n');
}

// overflow-x:clip místo hidden — hidden by z kořene udělal scroll kontejner
// a sticky sekce (úvod, obloha) by se držely vůči němu místo vůči oknu.
export const ROOT_STYLE = 'font-family:Figtree,sans-serif;font-weight:300;color:#EFE5C7;background:transparent;overflow-x:clip;padding:0 0 0 var(--rail-pad)';
// Globální styly z <helmet> návrhu (rozsah omezen na stránky v novém vzhledu tam, kde by rozbily starší obsah).
// Plynulé přechody mezi sekcemi: smoothstep místo lineárního gradientu, aby na konci přechodu nevznikla viditelná hrana.
const SMOOTH = [0, .028, .104, .216, .352, .5, .648, .784, .896, .972, 1];
const ease = (rgb, a0, a1, p0, p1) => SMOOTH.map((k, i) => `rgba(${rgb},${+(a0 + (a1 - a0) * k).toFixed(3)}) calc(${p0} + (${p1} - ${p0}) * ${i / 10})`).join(',');
// Stejná křivka pro barvu motivu (proměnná), aby přechod navázal na sousední sekci v každém motivu.
const easeVar = (color, a0, a1, p0, p1) => SMOOTH.map((k, i) => `color-mix(in srgb,${color} ${+((a0 + (a1 - a0) * k) * 100).toFixed(1)}%,transparent) calc(${p0} + (${p1} - ${p0}) * ${i / 10})`).join(',');
const CREAM = '245,242,232', MASK = '0,0,0';
export const HELMET_CSS = `
${HOME_CSS}
/* Pätička – rovnaká a kompaktná na všetkých stránkach: newsletter vľavo, tri skupiny odkazov vedľa seba, menšie logá. */
.site-footer .sf-wrap{max-width:1320px!important;padding:clamp(44px,5vw,72px) clamp(20px,4vw,64px) 26px!important}
.site-footer .sf-top{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:36px clamp(40px,6vw,96px)!important;padding-bottom:clamp(32px,4vw,52px)!important;align-items:start}
.site-footer .sf-news{gap:14px!important}
.site-footer .sf-news>p:first-child{font-size:clamp(32px,3.2vw,46px)!important}
.site-footer .sf-news>p:first-child,.site-footer .sf-links>div>span,.site-footer .sf-links a,.site-footer .sf-bottom,.site-footer .sf-bottom a{color:var(--site-cream,#EFE5C7)!important}
.site-footer .sf-news>p:not(:first-child){color:#C4C7B6!important}
.site-footer .sf-news input{color:var(--site-cream,#EFE5C7)!important;border-color:rgba(239,229,199,.6)!important}
.site-footer .sf-news input::placeholder{color:#C4C7B6!important;opacity:1}
.site-footer .sf-links>div>span{color:var(--site-accent-light,#C9BCE0)!important}
.site-footer .sf-news button,.site-footer .sf-news input[type=submit]{background:var(--site-accent-deep,#62527F)!important;color:#fff!important;border-color:var(--site-accent-deep,#62527F)!important;min-height:44px}
.site-footer .sf-links a:hover,.site-footer .sf-bottom a:hover{color:var(--site-accent-light,#C9BCE0)!important}
.site-footer .sf-brands>*>span,.site-footer .sf-brands>*>div span{color:var(--site-cream,#EFE5C7)!important}
.site-footer .sf-brands>*>img,.site-footer .sf-brands>*>div img{filter:none!important}
.site-footer .sf-links{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:26px clamp(18px,3vw,44px)!important;width:100%}
.site-footer .sf-links>div{display:flex!important;flex-direction:column!important;gap:10px!important;min-width:0!important}
.site-footer .sf-links>div>span{margin-bottom:4px!important}
.site-footer .sf-links a{line-height:1.35;overflow-wrap:anywhere}
.site-footer .sf-brands{display:flex!important;flex-wrap:wrap!important;justify-content:center!important;align-items:center!important;gap:clamp(36px,5vw,72px)!important;padding:clamp(36px,4vw,60px) 20px!important;border-top:1px solid color-mix(in srgb,var(--site-accent-light,#C9BCE0) 22%,transparent);border-bottom:1px solid color-mix(in srgb,var(--site-accent-light,#C9BCE0) 22%,transparent)}
.site-footer .sf-brands>*>img,.site-footer .sf-brands a>img{height:clamp(200px,21vw,290px)!important;width:auto!important;object-fit:contain!important;transition:transform .25s ease}
.site-footer .sf-brands a:hover>img{transform:translateY(-4px) scale(1.02)}
.site-footer .sf-bottom{padding-top:20px!important;align-items:center;row-gap:12px!important}
@media(max-width:999.98px){.site-footer .sf-top{grid-template-columns:1fr}}
@media(max-width:699.98px){
.site-footer .sf-links{grid-template-columns:1fr 1fr;gap:26px 18px!important}
.site-footer .sf-links>div:nth-child(3){grid-column:auto;display:flex!important;columns:auto}
.site-footer .sf-brands{gap:clamp(16px,4vw,28px)!important}
.site-footer .sf-brands>*>img,.site-footer .sf-brands a>img{height:clamp(120px,28vw,180px)!important;width:auto!important}
.site-footer .sf-bottom{flex-direction:column;align-items:flex-start}
}
:is(.dc-root,.dc-chrome) .header-brand{display:flex;align-items:center;gap:12px;color:inherit;text-decoration:none}
:is(.dc-root,.dc-chrome) .header-brand-emblem{position:relative;display:block;width:36px;height:36px;overflow:hidden;border-radius:50%;flex-shrink:0}
:is(.dc-root,.dc-chrome) .header-brand-emblem img{position:absolute;width:116.62%;height:auto;max-width:none;left:-8.45%;top:-34.01%;filter:invert(1) sepia(.3) saturate(1.4) brightness(.95)}
:is(.dc-root,.dc-chrome) .header-brand-wordmark{font-size:17px;font-weight:300;letter-spacing:4px;display:flex;flex-direction:column;gap:4px;white-space:nowrap}
:is(.dc-root,.dc-chrome) .header-brand-wordmark small{font-size:6px;letter-spacing:2px}
@media(max-width:1199px){:is(.dc-root,.dc-chrome) .header-brand-wordmark{display:none}}
/* Kompaktní společná hlavička; ikona je malá, ovládací plocha zůstává pohodlná. */
:is(.dc-root,.dc-chrome) header:has([data-menu-open]){height:64px!important;min-height:64px!important;padding-block:8px!important}
:is(.dc-root,.dc-chrome) header [data-menu-open]{height:40px!important;font-size:13px!important;gap:12px!important}
:is(.dc-root,.dc-chrome) .header-account{display:flex;align-items:center;justify-content:center;width:40px;height:40px;flex-shrink:0}
/* Nic nesmí stránku rozšířit do strany (mobil by ji oddálil a „ujížděla“). */
html,body{overflow-x:clip}
/* Mobilní menu: celé na jednom displeji (zbytek dorovná fitMenu v app.mjs i při zvětšeném písmu). */
@media(max-width:760px){#dc-top-menu{top:0!important;left:0!important;right:0!important;bottom:0!important;width:auto!important;max-height:none!important;border-radius:0!important;padding:16px 18px 18px!important;gap:14px!important}
#dc-top-menu{overflow-x:hidden!important}
#dc-top-menu>div:nth-child(3){flex-wrap:nowrap!important;gap:8px!important}
#dc-top-menu>div:nth-child(3)>div:first-child{gap:10px!important;min-width:0}
#dc-top-menu .menu-brand-mark{width:40px;height:40px}
#dc-top-menu>div:nth-child(3)>div:first-child span[style*="font-size:20px"]{font-size:14px!important;letter-spacing:3px!important}
#dc-top-menu>div:nth-child(3)>div:first-child span[style*="font-size:7px"]{display:none!important}
#dc-top-menu>div:nth-child(3)>div:last-child{gap:2px!important;flex-shrink:0}
#dc-top-menu>div:nth-child(4)>div,#dc-top-menu>div:nth-child(4) a{min-width:0;overflow-wrap:break-word;white-space:normal!important}
#dc-top-menu>div:nth-child(4) a span{max-width:100%;white-space:normal!important}
#dc-top-menu>div:nth-child(4){grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;row-gap:14px!important;column-gap:18px!important}
#dc-top-menu>div:nth-child(4)>div{padding:0!important;border:0!important;gap:0!important}
#dc-top-menu>div:nth-child(4) [style*="font-size:25px"]{font-size:19px!important;margin-bottom:2px!important}
#dc-top-menu>div:nth-child(4) a[style*="font-size:14px"]{padding:5px 0!important}
#dc-top-menu>div:nth-child(5){grid-template-columns:1fr!important;gap:10px!important;padding-top:12px!important}
#dc-top-menu>div:nth-child(5)>div:first-child{gap:10px!important}
#dc-top-menu>div:nth-child(5)>div:nth-child(2){display:none!important}
#dc-top-menu>div:nth-child(5) a[style*="font-size:30px"]{font-size:21px!important}}
:is(.dc-root,.dc-chrome) .header-account svg{width:16px;height:16px}
:is(.dc-root,.dc-chrome) [role="dialog"] a[style*="width:40px"][data-menu-account]>span{transform:scale(.8)}
#dc-side-menu{overflow-x:hidden!important}
#dc-side-menu>div:last-child{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;flex-wrap:nowrap!important}
#dc-side-menu>div:last-child a,#dc-side-menu>div:last-child a span{font:400 12px/1.3 Figtree,sans-serif!important;letter-spacing:0!important;padding:4px 0!important;min-height:0!important;transform:none!important;white-space:nowrap!important}
@media(max-width:999.98px){:is(.dc-root,.dc-chrome) header:has([data-menu-open]){height:60px!important;min-height:60px!important}}
/* Mobil: úpravy rytmu sekcí (bez centrování – Lucky 2026-10-14) */
@media(max-width:699.98px){
section[data-screen-label="01 Hero"] div[style*="text-transform:uppercase"]:has(>span[style*="height:1px"]){letter-spacing:2px!important;font-size:10px!important;gap:10px!important}
section[data-screen-label="01 Hero"] div[style*="text-transform:uppercase"]>span[style*="height:1px"]{width:24px!important}
#o-lucii{grid-template-columns:1fr!important}
#o-lucii>div:last-child{display:contents!important}
#o-lucii>div:last-child>*{margin-inline:24px!important}
#o-lucii>div:first-child{order:3;min-height:clamp(420px,110vw,560px)!important}
#o-lucii::before{height:80px!important}#o-lucii>div:last-child>div:first-child{order:1;padding-top:96px}
#o-lucii h2~div:has(>p){order:2;padding:14px 0 28px!important}
#o-lucii h2~div:has(>p)>span{display:none}
#o-lucii h2~div p :is(br,span){display:none}
#o-lucii h2{order:4;margin-top:40px!important}
#o-lucii a.dch1{order:5;align-self:flex-start;justify-self:start;margin-top:30px!important;margin-bottom:64px!important}
.wisdom{position:relative;margin-top:-150px;padding-top:0;background:linear-gradient(180deg,transparent 0,#F5F2E8 150px)!important}

}
/* Kolekcia na landing page: prehľad (nie obchod), na mobile rotujúci pás 2 kariet */
.kol-tabs{display:none}
@media(max-width:699.98px){
.kol-tabs{display:flex;gap:8px;margin:-24px 0 22px;overflow-x:auto;scrollbar-width:none}
.kol-tabs a{flex:none;height:34px;padding:0 16px;display:inline-flex;align-items:center;border-radius:999px;border:1px solid rgba(239,229,199,.24);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#EFE5C7;text-decoration:none}
.kol-tabs a:first-child{background:#C9A355;border-color:#C9A355;color:#283020}
.kol-track{display:flex!important;gap:12px!important;overflow-x:auto;scroll-snap-type:x mandatory;margin-inline:-20px;padding:0 20px 6px;scroll-padding-inline:20px;scrollbar-width:none;overscroll-behavior-x:contain}
.kol-track::-webkit-scrollbar{display:none}
.kol-track>article{flex:0 0 calc((100% - 12px)/2);scroll-snap-align:start;gap:12px!important;min-width:0}
.kol-track>article>div:first-child{border-radius:44px 0 0 0!important}
.kol-track>article>div:first-child>div[style*="top:18px"]{display:none!important}
.kol-track>article>div:first-child>div[style*="bottom:16px"]{left:10px!important;bottom:10px!important;height:26px!important;font-size:10px!important}
.kol-track>article>div:last-child{gap:6px!important}
.kol-track>article>div:last-child>div:first-child{padding-top:10px!important;gap:6px!important}
.kol-track>article>div:last-child>div:first-child>span:first-child{font-size:9px!important;letter-spacing:.16em!important}
.kol-track>article>div:last-child>div:first-child>span:last-child{font-size:13px!important;white-space:nowrap}
.kol-track>article h3{font-size:17px!important;line-height:1.2!important}
.kol-track>article button[data-add]{height:36px!important;padding:0 14px!important;font-size:10px!important;letter-spacing:.12em!important;gap:8px!important}
.sky-section .sky-window{margin-right:-20px!important}
*:has(>header [data-menu-open]){display:flow-root}
}
html.lenis,html.lenis body{height:auto}
.lenis.lenis-smooth{scroll-behavior:auto !important}
.lenis.lenis-smooth [data-lenis-prevent]{overscroll-behavior:contain}
.lenis.lenis-stopped{overflow:hidden}
/* Tělo je krémové – zelená by při načítání prolínala. Sekce nesou barvu vlastní. */
html:has(body.dc-page),body.dc-page{margin:0;background:#F5F2E8}
.dc-root *,.dc-chrome *{box-sizing:border-box}
.dc-root a,.dc-chrome a{color:inherit;text-decoration:none}.dc-root a:hover,.dc-chrome a:hover{color:#C9A355}
:root{--field-surface:#F7F5ED;--field-ink:var(--ink,#283020)}
.customer-center{--field-surface:var(--center-paper,#F5F2E8);--field-ink:var(--center-ink,#4A1A26)}
.customer-login{--field-surface:var(--center-main,#4A1A26);--field-ink:#EFE5C7}
.dc-root,.dc-chrome{--field-surface:var(--site-dark,#17332F);--field-ink:#EFE5C7}
:is(input,select,textarea):is(:autofill,:-webkit-autofill){-webkit-text-fill-color:var(--field-ink)!important;-webkit-box-shadow:0 0 0 1000px var(--field-surface) inset!important;box-shadow:0 0 0 1000px var(--field-surface) inset!important;caret-color:var(--field-ink);transition:background-color 99999s ease 0s}
.dc-root input:focus,.dc-chrome input:focus{outline:none}
.dc-root input,.dc-chrome input{-webkit-appearance:none;appearance:none;background-clip:padding-box}
.dc-root input::placeholder,.dc-chrome input::placeholder{color:#69705E}
.hero-brand{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:flex-start;padding:20px clamp(80px,12vw,220px)}
.hero-brand img{height:clamp(220px,34svh,360px);max-height:100%;max-width:100%;object-fit:contain;filter:invert(1) sepia(0.3) saturate(1.4) brightness(0.95) url(#brand-wave)}
[data-screen-label="01 Hero"] h1,[data-screen-label="01 Hero"] p{color:#EFE5C7!important;text-shadow:0 2px 4px #14200f,0 0 16px #14200f;-webkit-text-stroke:.5px #14200f;paint-order:stroke fill}
[data-screen-label="01 Hero"] h1{font-weight:200!important}
.menu-brand-mark{position:relative;display:block;width:56px;height:56px;overflow:hidden;flex-shrink:0;border-radius:50%}.menu-brand-mark img{position:absolute;width:116.62%;height:auto;max-width:none;left:-8.45%;top:-34.01%;filter:invert(1) sepia(.3) saturate(1.4) brightness(.95)}
.header-brands{display:flex;align-items:center;justify-content:center;gap:24px;width:300px;height:64px}
.header-brands>span{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:84px}
.header-brands img{height:48px;width:auto;max-width:70px;object-fit:contain}
.header-brands>span:first-child img{height:62px;filter:invert(1) sepia(.3) saturate(1.4) brightness(.95)}
.header-brands small{font-size:7px;letter-spacing:1px;color:#C9A355;white-space:nowrap}
.header-academy b{font-size:10px;letter-spacing:2px;font-weight:200}
[data-screen-label="01 Hero"] header{background:#26321E}
:is(.dc-root,.dc-chrome):not(.customer-page *,.customer-login *) header:has([data-menu-open]){background:linear-gradient(180deg,rgba(255,255,255,0.16) 0%,rgba(255,255,255,0.05) 45%,rgba(255,255,255,0.02) 70%,rgba(255,255,255,0.09) 100%),color-mix(in srgb,var(--site-dark) 42%,transparent)!important;border-bottom:1px solid rgba(255,255,255,0.24)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,0.18),inset 0 -1px 0 rgba(255,255,255,0.12),0 10px 40px rgba(0,0,0,0.14);backdrop-filter:blur(26px) saturate(180%) brightness(1.05);-webkit-backdrop-filter:blur(26px) saturate(180%) brightness(1.05)}
.sky-section{--sky-overlap:0px;--sky-inset:96px;--sky-fade:linear-gradient(${ease(MASK,0,1,'0%','32%')},${ease(MASK,1,0,'66%','100%')});position:relative;isolation:isolate;overflow:visible}
.sky-spill{position:absolute;inset:calc(-1 * var(--sky-overlap)) 0 0;pointer-events:none;z-index:-1;overflow:hidden;opacity:.3}
.sky-spill video{position:absolute;object-fit:cover;max-width:none;filter:none;-webkit-mask-image:linear-gradient(to right,${ease(MASK,1,0,'55%','100%')}),var(--sky-fade);-webkit-mask-composite:source-in;mask-image:linear-gradient(to right,${ease(MASK,1,0,'55%','100%')}),var(--sky-fade);mask-composite:intersect}
.sky-section>div:not(.sky-spill){position:relative;padding-top:var(--sky-inset)!important;padding-bottom:0!important}
.sky-window{margin-top:calc(-1 * (var(--sky-inset) + var(--sky-overlap)))}
@media(min-width:1000px) and (max-width:1300px){.sky-section{--sky-inset:32px}.sky-section>div:not(.sky-spill)>div:first-child{gap:24px!important}.sky-section a:has([data-roll-target]){padding-block:22px!important}}
@media(max-width:999.98px){.sky-section{--sky-inset:0px}.sky-section>div:not(.sky-spill){padding-bottom:48px!important}.sky-section>div:not(.sky-spill)>div:first-child{padding-inline:20px}}
.dc-root:has(.sky-section)>footer{position:relative;border-top:0!important}.dc-root:has(.sky-section)>footer::before{content:"";position:absolute;inset:0 0 auto;height:140px;background:linear-gradient(180deg,#26321E,#17332F);pointer-events:none}.dc-root:has(.sky-section)>footer>div{position:relative}
.sky-window video{opacity:1;filter:none}
.sky-section .sky-window{border-radius:0!important;background:transparent!important;-webkit-mask-image:var(--sky-fade);mask-image:var(--sky-fade)}
@media(min-width:1000px){.sky-section .sky-window{-webkit-mask-image:linear-gradient(to right,${ease(MASK,1,0,'55%','100%')}),var(--sky-fade);-webkit-mask-composite:source-in;mask-image:linear-gradient(to right,${ease(MASK,1,0,'55%','100%')}),var(--sky-fade);mask-composite:intersect}}
.sky-section .sky-window>div:last-child{top:50%!important;bottom:auto!important;right:28%!important;transform:translateY(-50%);padding:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;gap:14px!important;text-shadow:0 1px 18px rgba(0,0,0,.55)}
.sky-section .sky-window>div:last-child>span:first-child{display:flex;align-items:center;gap:14px}
.sky-section .sky-window>div:last-child>span:first-child::before{content:"";width:40px;height:1px;background:currentColor}
.sky-section .sky-window>div:last-child>span:last-child{font-size:clamp(26px,2.6vw,40px)!important}
/* krémová mezera mezi konzultacemi a O Lucii */
.sky-section{padding-bottom:clamp(96px,10vw,180px)!important}
#o-lucii{position:relative}
#program{padding-bottom:clamp(88px,10vw,170px)!important}
#o-lucii::before{content:"";position:absolute;inset:0 0 auto;height:clamp(240px,28vw,440px);background:linear-gradient(180deg,${ease(CREAM,1,0,'0%','100%')});pointer-events:none;z-index:1}
@media(min-width:1000px){.sky-section>div:not(.sky-spill)>div:first-child{align-self:center}}
.wisdom{margin-left:var(--rail-neg);padding:clamp(64px,7vw,120px) clamp(20px,4vw,64px) clamp(72px,8vw,140px) calc(var(--rail-pad) + clamp(20px,4vw,64px));background:#F5F2E8;color:var(--site-main);text-align:center}
.kol-status{margin:18px 0 0;font-size:11px;font-weight:400;letter-spacing:.16em;text-transform:uppercase;color:var(--site-accent-deep);opacity:.75}
/* Hero: vlastní signatúra značky — hluboký přechod pod text a průsvitný wordmark.
   Návrhová reference scrim neobsahuje, bez něj text drží jen les na okraji. */
.hero-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(16,24,15,.46) 0%,rgba(16,24,15,.18) 28%,rgba(16,24,15,.58) 58%,rgba(8,12,7,.86) 82%,rgba(4,6,4,.94) 100%)}
.hero-ghost{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-weight:100;font-size:clamp(110px,20vw,360px);letter-spacing:-.06em;line-height:.8;color:rgba(239,229,199,.07);white-space:nowrap;pointer-events:none;user-select:none}
[data-screen-label="01 Hero"] h1{font-weight:100}
/* Figtree je variabilní font (300–600) — bez toho se váha 300 syntetizuje z 400
   a display vypadá tlustší, než je v návrhu. */
.dc-root,.dc-chrome{font-synthesis:none}
.wisdom figure{margin:0 auto;max-width:1180px;display:flex;flex-direction:column;align-items:center;gap:clamp(28px,3.4vw,48px)}
.wisdom-mark{width:1px;height:clamp(48px,6vw,80px);background:linear-gradient(transparent,var(--site-accent-deep))}
.wisdom blockquote{margin:0;font-weight:100;font-size:clamp(34px,4.6vw,72px);line-height:1.08;letter-spacing:-0.035em}
.wisdom figcaption{display:flex;align-items:center;gap:16px;font-weight:400;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--site-accent-deep)}
.wisdom figcaption::before,.wisdom figcaption::after{content:"";width:48px;height:1px;background:currentColor;opacity:.6}
.site-footer{background:var(--ana-forest)!important;color:var(--ana-paper)!important}
.dc-root footer{background:var(--ana-forest)!important}
.site-footer .sf-news>p:not(:first-child){color:#E4E8DD!important}
.site-footer .sf-news input::placeholder{color:#E4E8DD!important}
.site-footer .sf-brands>*>img,.site-footer .sf-brands>*>div img{filter:none!important}
.site-footer .sf-brands>*>span,.site-footer .sf-brands>*>div span{color:var(--site-accent-light,#C9BCE0)!important}
.site-footer a{min-height:44px;display:inline-flex;align-items:center}
.site-footer .sf-links>div{align-items:flex-start}
.site-footer .sf-links a{min-height:40px}
.button:not(.light){background:var(--site-main,var(--ana-forest))!important;border-color:var(--site-main,var(--ana-forest))!important;color:var(--ana-paper)!important}
.button.outline{background:transparent!important;color:var(--site-main,#313C2B)!important;border-color:var(--site-accent,#9C86C2)!important}
.button.outline:hover,.text-link:hover,.consultation-composition a:hover{color:var(--site-accent-deep,#62527F)!important}
.tone-0,.statement,.program-feature{background:var(--ana-surface-lavender)!important;color:var(--ana-forest)!important}
.tone-0 .story-copy,.program-feature .program-copy,.statement h2{color:var(--ana-forest)!important}
.tone-0 .story-copy p,.program-feature .program-copy p{color:var(--ana-forest)!important}
.tone-1{background:var(--ana-sage)!important;color:var(--ana-forest)!important}
.consultation-secondary>a{border-color:color-mix(in srgb,var(--site-accent,#9C86C2) 35%,transparent)!important}
.lh-eyebrow,.eyebrow,.kol-status{color:var(--site-accent-deep,#62527F)!important}
.text-link,.category-list>a:hover,.site-header a:hover{color:var(--site-accent-deep,#62527F)}
.dc-chrome #dc-top-menu a:hover,.dc-chrome #dc-side-menu a:hover{color:var(--site-accent-deep,#62527F)!important}
.photo-gallery--lucia img{height:min(70svh,720px);object-fit:cover}
.photo-gallery--lucia figure{min-width:0;overflow:hidden;border-radius:var(--product-card-radius,32px)}
.photo-gallery--lucia figcaption{padding:14px 18px 18px;overflow-wrap:anywhere;text-indent:0}
.lh-cat{color:var(--site-main,var(--ana-forest))!important;-webkit-text-fill-color:var(--site-main,var(--ana-forest))!important;text-shadow:0 1px 12px color-mix(in srgb,var(--ana-paper) 96%,transparent),0 0 3px color-mix(in srgb,var(--ana-paper) 85%,transparent)!important}
.header-brands small{color:var(--site-main,var(--ana-forest))!important;text-shadow:0 1px 5px color-mix(in srgb,var(--ana-paper) 90%,transparent)}
.header-brands img{filter:drop-shadow(0 1px 3px rgba(245,242,232,.95))}
#dc-top-menu{background:var(--ana-paper)!important;color:var(--ana-forest)!important;max-height:calc(100dvh - 24px)!important;overflow:auto!important}
@media(max-width:999.98px){#dc-top-menu{padding:14px 18px!important;gap:10px!important}#dc-top-menu>div:nth-child(4){row-gap:9px!important}#dc-top-menu>div:nth-child(4) a[style*="font-size:14px"]{min-height:40px!important;padding:4px 0!important}#dc-top-menu>div:nth-child(5){padding-top:6px!important}}
@media(max-width:760px){.photo-gallery--lucia img{height:clamp(250px,56svh,560px)}.site-footer .sf-links{grid-template-columns:repeat(2,minmax(0,1fr))!important}.site-footer .sf-links>div:nth-child(3){grid-column:1/-1;display:flex!important}}
#program>div[style^="position:absolute;inset:0;background:linear-gradient(90deg"]{background:linear-gradient(180deg,${ease(CREAM,0,1,'56%','100%')}),linear-gradient(90deg,rgba(16,24,15,0.82) 0%,rgba(16,24,15,0.35) 55%,rgba(16,24,15,0.6) 100%)!important}
/* patička na mobilu: tři loga zmenšená v jednom řádku, ne natažená pod sebou */@media(max-width:699.98px){footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]{gap:10px!important;padding:28px 0 32px!important;align-items:start!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>:is(div,a){grid-template-rows:auto auto!important;row-gap:12px!important;align-items:center!important;align-content:start}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>:is(div,a)>img{height:92px!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>:is(div,a)>div{gap:8px!important;padding-bottom:0!important;min-height:92px;justify-content:center}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>:is(div,a)>div>span:first-child[style*="width:1px"]{display:none!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>:is(div,a)>div>img{width:58px!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>:is(div,a) span[style*="white-space:nowrap"]{font-size:11px!important;letter-spacing:.22em!important;padding-left:.22em!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>:is(div,a) span[style*="letter-spacing:0.6em"]{font-size:7.5px!important;letter-spacing:.38em!important;gap:5px!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>:is(div,a) span[style*="letter-spacing:0.6em"]>span{width:8px!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>:is(div,a)>span:last-child{font-size:7.5px!important;letter-spacing:1.4px!important;text-align:center}footer div[style*="justify-content:space-between;gap:20px;flex-wrap:wrap;padding-top:26px"]{padding-bottom:88px}}
/* menu: dekorativní obrázek lesa v menu nechceme */[style*="hero-forest.jpg"][style*="min-height:190px"]{display:none!important}
@media(max-width:999.98px){header:has(.header-brands){gap:6px!important;padding-inline:16px!important}.header-brands{width:128px;gap:5px;height:48px}.header-brands>span{width:40px}.header-brands img{height:28px;max-width:36px}.header-brands>span:first-child img{height:44px}.header-academy b{font-size:6px;letter-spacing:.5px}.header-brands small{font-size:4px;letter-spacing:.3px}}
@media(prefers-reduced-motion:reduce){.hero-brand img{filter:invert(1) sepia(.3) saturate(1.4) brightness(.95)}}
@media(max-width:999.98px){.hero-brand{padding:16px 20px}.hero-brand img{height:clamp(180px,27svh,260px)}}
[data-media-controls]{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0;flex-shrink:0;border-top:1px solid currentColor}
[data-media-controls] button{display:grid;place-items:center;position:relative;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer}
[data-media-controls] button:hover{background:rgba(201,163,85,.15)}
[data-media-controls] button[hidden]{display:none!important}
[data-media-controls] button:focus-visible{outline:2px solid #C9A355;outline-offset:1px}
[data-media-controls] svg{width:20px;height:20px;display:block}
[data-media-controls] .media-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
[data-sound-toggle][aria-pressed=false] .sound-waves,[data-sound-toggle][aria-pressed=true] .sound-cross,[data-video-toggle][aria-pressed=false] .play-icon,[data-video-toggle][aria-pressed=true] .pause-icon{display:none}
@media(max-width:999.98px){[data-mobile-media]{position:absolute;left:20px;bottom:12px}[data-mobile-media] [data-media-controls] button{color:#EFE5C7!important}.zs-intro>[data-mobile-media]{position:fixed;left:16px;bottom:16px;z-index:39;color:#EFE5C7}[data-mobile-media] [data-media-controls]{flex-direction:row;border:0;padding:0;background:rgba(30,38,25,.4);border-radius:24px;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}}`;
