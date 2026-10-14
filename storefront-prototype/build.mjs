import {mkdir,writeFile,readFile,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {legacyContent,legacyPage} from './src/legacy.mjs';
import {chrome,homeSections,aboutSections,dcCss,ROOT_STYLE,HELMET_CSS} from './src/dc.mjs';
import {api} from './src/lib/api/index.mjs';
import {escape as e} from './src/components.mjs';
import * as views from './src/pages.mjs';
const root=dirname(fileURLToPath(import.meta.url)),out=join(root,'dist');
const routes=new Map();
const add=(path,title,body)=>routes.set(path,{title,body});
// Úvod a O Lucii se generují přímo z handoff návrhů (design/*.dc.html).
const dcProducts=api.getProducts().slice(0,4).map((p,i)=>({n:`N° ${String(i+1).padStart(2,'0')}`,name:e(p.name),cat:e(p.category),price:e(p.priceLabel),img:p.image,add:e(p.code)}));
const add2=(path,title,body,design)=>routes.set(path,{title,body,design});
add2('/','Light for the Future',homeSections(dcProducts),'home');
add('/eshop','Obchod',views.catalog());add('/eshop/kategorie','Kategórie',views.categories());
add('/eshop/kategoria/bio-kozmetika-bez-chemie','Bio kozmetika',views.catalog('Kozmetika'));
for(const p of api.getProducts())add(`/eshop/produkt/${p.slug}`,p.name,views.product(p));
for(const p of api.getPages())add(p.path,p.title,views.content(p));
add('/darcekovy-poukaz','Darčekový poukaz',views.giftVoucher());add('/kosik','Košík',views.cart());add('/eshop/kosik','QR košík',views.cart());add('/pokladna','Objednávka',views.checkout());
add('/prihlasenie','Prihlásenie',views.login());add('/prihlasenie/potvrdit','Potvrdenie prihlásenia',views.login(true));add('/nova-registracia','Prihlásenie bez hesla',views.login());
add('/ucet','Môj účet',views.account());add('/reset-40','RESET 40+',views.reset());add('/reset-40/knihovna','Moje programy',views.reset(true));
add('/kontakt','Kontakt',views.contact());add('/gdpr','Súkromie',views.privacy());
for(const [alias,target] of Object.entries(api.getAliases())){const source=routes.get(target);if(!source)throw new Error(`Missing alias target ${target}`);routes.set(alias,source);}
for(const [path,page] of Object.entries(legacyContent)){
  const existing=routes.get(path);
  if(page.blocks.length){
    let contactForm='';
    if(path==='/kontakt')contactForm=`<section class="section legacy-contact-form">${views.contact().match(/<form id="contact-form"[\s\S]*?<\/form>/)?.[0]||''}</section>`;
    add(path,page.title,legacyPage(page,{contactForm}));
  }else if(path==='/zdrava-lekaren'){add('/zdrava-lekaren',page.title,views.catalog());add('/eshop/kategoria/-vsetko-','Zdravá lekáreň',views.catalog());}
  else if(!existing)add(path,page.title,views.pagePlaceholder?views.pagePlaceholder(page):`<section class="section">${views.content({kind:'future',title:page.title,headline:page.title,intro:''})}</section>`);
}
add('/zdravy-svet','Zdravý svet',views.zdravySvet());
add2('/o-lucii','O Lucii',aboutSections(),'about');
// The actual CSV target column controls coverage, not guessed paths.
const csv=await readFile(join(root,'../backend/docs/wp/redirects-map.csv'),'utf8');
for(const row of csv.trim().split(/\r?\n/).slice(1)){const target=new URL(row.split(',')[1]);const path=target.pathname.replace(/\/$/,'')||'/';if(!routes.has(path))throw new Error(`Missing legacy route ${path}`);}
const CHROME={home:chrome('home'),about:chrome('about'),world:chrome('world'),other:chrome('other')};
const CTX='font-family:Outfit,sans-serif;font-weight:300;color:#EFE5C7';
const scripts='<div class="toast" role="status" hidden></div><div class="page-transition" aria-hidden="true"></div><script src="/vendor/lenis.min.js" defer></script><script type="module" src="/app.mjs"></script>';
const document=(path,{title,body,design})=>{
  const c=CHROME[path==='/zdravy-svet'?'world':design||'other'];
  const shell=design
    ?`<div id="page-shell" class="dc-root" lang="sk" style="${ROOT_STYLE}"><main id="main" tabindex="-1">${body.replace('%%HEADER%%',c.header)}</main>${c.footer}</div>`
    :`<div id="page-shell" class="legacy-shell"><div class="dc-chrome" style="${CTX};background:#283020;margin-left:var(--rail-neg);padding-left:var(--rail-pad)">${c.header}</div><main id="main" class="legacy-main" tabindex="-1">${body}</main><div class="dc-chrome" style="${CTX}">${c.footer}</div></div>`;
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#283020"><meta name="robots" content="noindex,nofollow"><meta name="description" content="${e(title)} — lokálny náhľad storefrontu ANASTASIA."><title>${e(title)} — ANASTASIA</title><link rel="icon" href="/assets/brand-mark.svg" type="image/svg+xml"><link rel="preload" href="/assets/outfit.ttf" as="font" type="font/ttf" crossorigin><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/dc.css"></head><body${design?' class="dc-page"':''}><a class="skip-link" href="#main">Preskočiť na obsah</a>${shell}<div class="dc-chrome" style="${CTX}">${c.overlay}${c.rail}${c.menus}</div>${scripts}</body></html>`;
};
await mkdir(out,{recursive:true});await cp(join(root,'public'),out,{recursive:true});await cp(join(root,'src/lib'),join(out,'lib'),{recursive:true});await cp(join(root,'src/components.mjs'),join(out,'components.mjs'));
for(const [path,page] of routes){const dir=join(out,path);await mkdir(dir,{recursive:true});await writeFile(join(dir,'index.html'),document(path,page));}
// styles.css ve vrstvě: neoznačená pravidla z dc.css (reset a inline návrh) mají vždy přednost.
await writeFile(join(out,'base.css'),'@import url("/styles.css") layer(legacy);\n');
await writeFile(join(out,'dc.css'),[
  '/* Návrhové stránky a chrome nemají žádný styl kromě inline – starší styles.css se v nich vrací na výchozí hodnoty prohlížeče. */',
  '/* SVG mimo reset: all:revert by zahodil prezentační atributy (stroke, fill). */.dc-root :where(:not(svg,svg *)),.dc-chrome :where(:not(svg,svg *)){all:revert}.dc-root :where(svg),.dc-chrome :where(svg){width:revert;height:revert;flex-shrink:revert}.dc-root,.dc-chrome{font-synthesis:weight style;font-size:16px;line-height:normal}',
  HELMET_CSS,
  '/* Přístupnost: návrh ruší obrys inputu (i inline outline:0); pro klávesnici vracíme zlatý obrys (bez vlivu na vzhled bez fokusu). */.dc-root input:focus-visible,.dc-chrome input:focus-visible{outline:1px solid #C9A355!important;outline-offset:4px}',
  ':root{--rail-pad:0px;--rail-neg:0px;--cap-left:20px;--menu-right:12px;--ov-o:0;--ov-p:none;--side-o:0;--side-p:none;--side-t:translate(-24px,-50%);--top-o:0;--top-p:none;--top-t:translateY(-16px)}',
  '@media (min-width:1000px){:root{--rail-pad:52px;--rail-neg:-52px;--cap-left:72px;--menu-right:24px}}',
  '.dc-root dc-wide,.dc-chrome dc-wide{display:contents}.dc-root dc-narrow,.dc-chrome dc-narrow{display:none}@media (max-width:999.98px){.dc-root dc-wide,.dc-chrome dc-wide{display:none}.dc-root dc-narrow,.dc-chrome dc-narrow{display:contents}}',
  '/* Přístupnost: v návrhu se na úzkém displeji tlačítko „Zavrieť“ horního menu ocitne mimo panel (vodorovný scroll uvnitř menu); řádek se zalomí. */@media (max-width:999.98px){#dc-top-menu>div:nth-child(3){flex-wrap:wrap;row-gap:10px}}',
  '.legacy-shell{padding-left:var(--rail-pad)}.legacy-shell>.dc-chrome{overflow-x:clip}.legacy-main>*{margin-left:var(--rail-neg);border-left:var(--rail-pad) solid transparent}',
  '.legacy-main>.zs-follow-image{border-left:0}',
  '.legacy-shell>.dc-chrome:has(footer){overflow-x:visible}.legacy-shell footer{overflow-x:clip}',
  dcCss()].join('\n'));
await writeFile(join(out,'404.html'),document('/404',{title:'Stránka nenájdená',body:views.notFound()}));
await writeFile(join(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
await writeFile(join(out,'_headers'),'/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\'; media-src \'self\'; font-src \'self\'; connect-src \'self\'; frame-ancestors \'none\'; base-uri \'none\'; form-action \'self\'\n');
await writeFile(join(out,'routes.json'),JSON.stringify([...routes.keys()],null,2));
console.log(`Built ${routes.size} static pages; all 34 legacy target paths covered (trailing slash variants normalized). No backend calls.`);
