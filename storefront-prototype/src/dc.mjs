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
    if (href.startsWith('/')) target = href; // už přeložená routa (iterace)
    else if (href.startsWith('tel:')) target = PHONE;
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
  .replace(/^<div /, '<div data-menu-overlay ');

// Globální prvky stránky: lišta, menu, overlay, patička. `page` určuje, ze kterého návrhu a jak se mapují kotvy.
export function chrome(page) {
  const src = page === 'about' ? P.about : P.home;
  const linkPage = page === 'home' || page === 'about' ? page : 'other';
  const side=src.side.replace(/<div style="display:flex;align-items:center;gap:14px"><img src="\.\/assets\/logo-mark\.png"[^>]*><div style="display:flex;flex-direction:column;gap:3px">[\s\S]*?<\/div><\/div>/,'');
  const menuMark='<span class="menu-brand-mark"><img src="./assets/lucia-logo.png" alt="ANASTASIA"></span>';
  const menuBrand=html=>html.replace(/<img src="\.\/assets\/logo-mark\.png"[^>]*>/,menuMark).replaceAll('rgba(26,34,22,0.42)','rgba(26,34,22,0.9)');
  return {
    header: convert(src.header, {page: linkPage, region: 'header'}).replace(/<a href="[^"]*" style="display:flex;flex-direction:column;align-items:center;gap:6px">[\s\S]*?<\/a>/, '<span class="header-spacer" aria-hidden="true"></span>'),
    footer: bleed(convert(src.footer, {page: linkPage, region: 'footer'})),
    overlay: ids(convert(src.overlay, {page: linkPage})),
    rail: ids(convert(src.rail, {page: linkPage, region: 'rail'})).replace('</aside>', `${['home','world'].includes(page)?mediaControls:''}</aside>`),
    menus: ids(convert(menuBrand(side), {page: linkPage, region: 'menu'})) + ids(convert(menuBrand(src.top), {page: linkPage, region: 'menu'})),
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
    let out = convert(s, {page: 'home', data});
    if(i===0){
      out=out.replace(/<div style="position:absolute;inset:0;background:linear-gradient\(180deg,rgba\(16,24,15,0\.62\)[^"]*"><\/div>/,'')
        .replace(/<div style="position:relative;flex:1;min-height:0"><\/div>/,'<div class="hero-brand"><svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs><filter id="brand-wave" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.025" numOctaves="1" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" data-brand-wave/></filter></defs></svg><img src="/assets/lucia-logo.png" alt="ANASTASIA — Light for the Future"></div>')
        .replace(/<div style="display:flex;gap:10px;align-items:center">[\s\S]*?<\/button>\s*<\/div>/,'<div data-mobile-media></div>');
    }
    let pre='';
    // Kolekcia na landing page: prehľad (nie obchod) – na mobile vodorovný pás 2 kariet, ktorý sa sám otáča.
    if(out.includes('id="kolekcia"')){
      const grid='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));';
      out=out.replace(grid,'<nav class="kol-tabs" aria-label="Prehľad kolekcie"><a href="/eshop?filter=novinky">Novinky</a><a href="/eshop?filter=bestsellery">Bestsellery</a><a href="/eshop">Celý obchod</a></nav>'+grid.replace('<div ','<div class="kol-track" data-carousel tabindex="0" aria-label="Vybrané produkty" '));
    }
    if(out.includes('data-video="sky"')){
      out=out.replace('<section ', '<section class="sky-section" ').replace('<div style="order:-1;', '<div class="sky-window" style="order:-1;').replace(/<div style="position:absolute;inset:0;background:linear-gradient\(180deg,rgba\(0,0,0,0\) 50%,rgba\(0,0,0,0.65\) 100%\)"><\/div>/,'');
      out=out.replace(/(<section[^>]*>)/, '$1<div class="sky-spill" aria-hidden="true"><video data-video="sky-spill" poster="/assets/night-sky.jpg" autoplay muted loop playsinline preload="metadata">'+VIDEO_SOURCES.sky+'</video></div>');
      // TODO(Lucia): nahradit vlastní myšlenkou Lucie, až ji dodá; zatím oficiální slogan značky
      pre='<section class="wisdom" data-screen-label="04b Myšlienka" aria-label="Light for the Future"><figure><span class="wisdom-mark" aria-hidden="true"></span><blockquote>Light for the Future</blockquote><figcaption>ANASTASIA</figcaption></figure></section>\n';
    }
    // pásmo se vkládá až za bleed, aby sekce s oblohou dál dostala odsazení pod boční lištu
    return i === 0 ? out.replace(/<header[\s\S]*?<\/header>/, '%%HEADER%%') : pre+bleed(out);
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
// Plynulé přechody mezi sekcemi: smoothstep místo lineárního gradientu, aby na konci přechodu nevznikla viditelná hrana.
const SMOOTH = [0, .028, .104, .216, .352, .5, .648, .784, .896, .972, 1];
const ease = (rgb, a0, a1, p0, p1) => SMOOTH.map((k, i) => `rgba(${rgb},${+(a0 + (a1 - a0) * k).toFixed(3)}) calc(${p0} + (${p1} - ${p0}) * ${i / 10})`).join(',');
// Stejná křivka pro barvu motivu (proměnná), aby přechod navázal na sousední sekci v každém motivu.
const easeVar = (color, a0, a1, p0, p1) => SMOOTH.map((k, i) => `color-mix(in srgb,${color} ${+((a0 + (a1 - a0) * k) * 100).toFixed(1)}%,transparent) calc(${p0} + (${p1} - ${p0}) * ${i / 10})`).join(',');
const CREAM = '245,242,232', MASK = '0,0,0';
export const HELMET_CSS = `/* Mobil: úpravy rytmu sekcí (bez centrování – Lucky 2026-10-14) */
@media(max-width:699.98px){
section[data-screen-label="01 Hero"] div[style*="text-transform:uppercase"]:has(>span[style*="height:1px"]){letter-spacing:2px!important;font-size:10px!important;gap:10px!important}
section[data-screen-label="01 Hero"] div[style*="text-transform:uppercase"]>span[style*="height:1px"]{width:24px!important}
footer div[style*="flex-wrap:wrap;gap:40px clamp(36px,5vw,88px)"]{display:grid!important;grid-template-columns:1fr 1fr;gap:34px 18px!important;width:100%;flex:1 1 100%!important}
footer div[style*="flex-wrap:wrap;gap:40px clamp(36px,5vw,88px)"]>div{gap:11px!important;min-width:0}
footer div[style*="flex-wrap:wrap;gap:40px clamp(36px,5vw,88px)"]>div>a{font-size:14px!important;line-height:1.3}
footer div[style*="flex-wrap:wrap;gap:40px clamp(36px,5vw,88px)"]>div>:first-child{margin-bottom:4px}
footer div[style*="flex-wrap:wrap;gap:40px clamp(36px,5vw,88px)"]>div:nth-child(3){grid-column:1/-1;display:grid!important;grid-template-columns:1fr 1fr;column-gap:18px}
footer div[style*="flex-wrap:wrap;gap:40px clamp(36px,5vw,88px)"]>div:nth-child(3)>:first-child{grid-column:1/-1}
footer div[style*="padding-bottom:clamp(60px,7vw,110px)"]{padding-bottom:44px!important;gap:44px!important}
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
html:has(body.dc-page),body.dc-page{margin:0;background:#283020}
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
.hero-brand img{height:clamp(220px,34vh,360px);max-height:100%;max-width:100%;object-fit:contain;filter:invert(1) sepia(0.3) saturate(1.4) brightness(0.95) url(#brand-wave)}
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
#program{padding-bottom:clamp(160px,18vw,300px)!important}
#o-lucii::before{content:"";position:absolute;inset:0 0 auto;height:clamp(240px,28vw,440px);background:linear-gradient(180deg,${ease(CREAM,1,0,'0%','100%')});pointer-events:none;z-index:1}
@media(min-width:1000px){.sky-section>div:not(.sky-spill)>div:first-child{align-self:center}}
.wisdom{margin-left:var(--rail-neg);padding:clamp(48px,6vw,96px) clamp(20px,4vw,64px) clamp(72px,9vw,160px) calc(var(--rail-pad) + clamp(20px,4vw,64px));background:#F5F2E8;color:var(--site-main);text-align:center}
.wisdom figure{margin:0 auto;max-width:980px;display:flex;flex-direction:column;align-items:center;gap:clamp(24px,3vw,40px)}
.wisdom-mark{width:1px;height:clamp(48px,6vw,80px);background:linear-gradient(transparent,var(--site-accent-deep))}
.wisdom blockquote{margin:0;font-weight:100;font-size:clamp(34px,4.6vw,72px);line-height:1.08;letter-spacing:-0.035em}
.wisdom figcaption{display:flex;align-items:center;gap:16px;font-weight:400;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--site-accent-deep)}
.wisdom figcaption::before,.wisdom figcaption::after{content:"";width:48px;height:1px;background:currentColor;opacity:.6}
#program>div[style^="position:absolute;inset:0;background:linear-gradient(90deg"]{background:linear-gradient(180deg,${ease(CREAM,0,1,'56%','100%')}),linear-gradient(90deg,rgba(16,24,15,0.82) 0%,rgba(16,24,15,0.35) 55%,rgba(16,24,15,0.6) 100%)!important}
/* patička na mobilu: tři loga zmenšená v jednom řádku, ne natažená pod sebou */@media(max-width:699.98px){footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]{gap:10px!important;padding:28px 0 32px!important;align-items:start!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>div{grid-template-rows:auto auto!important;row-gap:12px!important;align-items:center!important;align-content:start}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>div>img{height:92px!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>div>div{gap:8px!important;padding-bottom:0!important;min-height:92px;justify-content:center}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>div>div>span:first-child[style*="width:1px"]{display:none!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>div>div>img{width:58px!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>div span[style*="white-space:nowrap"]{font-size:11px!important;letter-spacing:.22em!important;padding-left:.22em!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>div span[style*="letter-spacing:0.6em"]{font-size:7.5px!important;letter-spacing:.38em!important;gap:5px!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>div span[style*="letter-spacing:0.6em"]>span{width:8px!important}footer div[style*="grid-template-columns:repeat(3,minmax(0,1fr));align-items:end"]>div>span:last-child{font-size:7.5px!important;letter-spacing:1.4px!important;text-align:center}footer div[style*="justify-content:space-between;gap:20px;flex-wrap:wrap;padding-top:26px"]{padding-bottom:88px}}
/* menu: dekorativní obrázek lesa v menu nechceme */[style*="hero-forest.jpg"][style*="min-height:190px"]{display:none!important}
@media(max-width:999.98px){header:has(.header-brands){gap:6px!important;padding-inline:16px!important}.header-brands{width:128px;gap:5px;height:48px}.header-brands>span{width:40px}.header-brands img{height:28px;max-width:36px}.header-brands>span:first-child img{height:44px}.header-academy b{font-size:6px;letter-spacing:.5px}.header-brands small{font-size:4px;letter-spacing:.3px}}
@media(prefers-reduced-motion:reduce){.hero-brand img{filter:invert(1) sepia(.3) saturate(1.4) brightness(.95)}}
@media(max-width:999.98px){.hero-brand{padding:16px 20px}.hero-brand img{height:clamp(180px,27vh,260px)}}
[data-media-controls]{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0;flex-shrink:0;border-top:1px solid currentColor}
[data-media-controls] button{display:grid;place-items:center;position:relative;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer}
[data-media-controls] button:hover{background:rgba(201,163,85,.15)}
[data-media-controls] button[hidden]{display:none!important}
[data-media-controls] button:focus-visible{outline:2px solid #C9A355;outline-offset:1px}
[data-media-controls] svg{width:20px;height:20px;display:block}
[data-media-controls] .media-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
[data-sound-toggle][aria-pressed=false] .sound-waves,[data-sound-toggle][aria-pressed=true] .sound-cross,[data-video-toggle][aria-pressed=false] .play-icon,[data-video-toggle][aria-pressed=true] .pause-icon{display:none}
@media(max-width:999.98px){[data-mobile-media]{position:absolute;left:20px;bottom:12px}[data-mobile-media] [data-media-controls] button{color:#EFE5C7!important}.zs-intro>[data-mobile-media]{position:fixed;left:16px;bottom:16px;z-index:39;color:#EFE5C7}[data-mobile-media] [data-media-controls]{flex-direction:row;border:0;padding:0;background:rgba(30,38,25,.4);border-radius:24px;backdrop-filter:blur(14px)}}`;
