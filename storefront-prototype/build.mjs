const mediaOrigin=process.env.ANASTASIA_MEDIA_ORIGIN||'';
if(mediaOrigin&&(!/^https?:\/\/[a-zA-Z0-9.:-]+$/.test(mediaOrigin)||!(mediaOrigin.startsWith('https://')||/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(mediaOrigin))))throw Error('Invalid media origin');
import {mkdir,writeFile,readFile,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {legacyContent,legacyPage} from './src/legacy.mjs';
import {chrome,homeSections,aboutSections,dcCss,ROOT_STYLE,HELMET_CSS} from './src/dc.mjs';
import {api} from './src/lib/api/index.mjs';
import {createHttpApi} from './src/lib/api/http.mjs';
import {FEATURED_SLUGS} from './src/lib/api/catalog.mjs';
import {escape as e} from './src/components.mjs';
import * as views from './src/pages.mjs';
import {centerThemeCss,centerThemeBoot} from './src/center-themes.mjs';
import {siteThemes,siteThemeCss,siteThemeBoot,tokenizeColors} from './src/site-themes.mjs';
// Motiv webu volí Lucia v adminu; v produkci ho dosadí server, v náhledu SITE_THEME=bordo node build.mjs.
const siteTheme=process.env.SITE_THEME||siteThemes[0].id;
if(!siteThemes.some(t=>t.id===siteTheme))throw new Error(`Unknown SITE_THEME ${siteTheme}`);
const root=dirname(fileURLToPath(import.meta.url)),out=join(root,'dist');
let catalogProducts=api.getProducts();
if(process.env.ANASTASIA_PUBLISHABLE_KEY&&process.env.ANASTASIA_REGION_ID){
 const store=createHttpApi({getItem:()=>null,setItem:()=>{}},{apiBaseUrl:process.env.ANASTASIA_API_ORIGIN||'http://127.0.0.1:9100',publishableKey:process.env.ANASTASIA_PUBLISHABLE_KEY,regionId:process.env.ANASTASIA_REGION_ID});
 catalogProducts=await store.getProducts();if(!catalogProducts.length)throw new Error('Real catalog build returned no products');
}
const catalog=category=>views.catalog(category,catalogProducts);
// Denný stacionár: fotografie z dodaných souborů (public/media/ds).
const dsPhotos=(dir,files)=>`<section class="section photo-gallery">${files.map(f=>`<figure><img src="/media/ds/${f}" alt="Denný stacionár Vyšná Slaná – ${f.replace(/\.[a-z]+$/,'').replace(/[_-]/g,' ')}" loading="lazy" width="1200" height="800"></figure>`).join('')}</section>`;
const routes=new Map();
const add=(path,title,body)=>routes.set(path,{title,body});
// Úvod a O Lucii se generují přímo z handoff návrhů (design/*.dc.html).
const dcProducts=catalogProducts.slice(0,4).map((p,i)=>({n:`N° ${String(i+1).padStart(2,'0')}`,slug:e(p.slug),name:e(p.name),cat:e(p.category),price:e(p.priceLabel),priceLabel:e(p.priceLabel),img:p.image,add:e(p.code)}));
const add2=(path,title,body,design)=>routes.set(path,{title,body,design});
add2('/','Light for the Future',homeSections(dcProducts),'home');
add('/eshop','Obchod',catalog());add('/eshop/kategorie','Kategórie',views.categories());
add('/eshop/kategoria/bio-kozmetika-bez-chemie','Bio kozmetika',catalog('Kozmetika'));
for(const [slug,cat] of [['kozmetika','Kozmetika'],['bylinky-a-vyziva','Bylinky a výživa'],['programy-a-sluzby','Programy a služby']])add(`/eshop/kategoria/${slug}`,cat,catalog(cat));
for(const p of catalogProducts)add(`/eshop/produkt/${p.slug}`,p.name,views.product(p,catalogProducts));
// Zachovat původní velikost písmen staré adresy minerálního krému.
const mineral=catalogProducts.find(p=>p.slug.toLowerCase()==='mineralny-ochranny-krem-pre-citlivu-pokozku');if(mineral)add('/eshop/produkt/Mineralny-ochranny-krem-pre-citlivu-pokozku',mineral.name,views.product(mineral,catalogProducts));
for(const p of api.getPages())add(p.path,p.title,views.content(p));
add('/darcekovy-poukaz','Darčekový poukaz',views.giftVoucher());add('/kosik','Košík',views.cart());add('/eshop/kosik','QR košík',views.cart());add('/pokladna','Objednávka',views.checkout());
add('/prihlasenie','Prihlásenie',views.login());
add('/nova-registracia/vyhody','Výhody registrácie',views.registrationBenefits());add('/prihlasenie/potvrdit','Potvrdenie prihlásenia',views.login(true));add('/nova-registracia','Prihlásenie bez hesla',views.login());
add('/ucet','Môj účet',views.account());add('/reset-40','RESET 40+',views.reset());add('/reset-40/knihovna','Moje programy',views.reset(true));
add('/klub','Klub ANASTASIA',views.klub());add('/konzultacie/rezervacia','Rezervácia konzultácie',views.booking());
add('/kontakt','Kontakt',views.contact());add('/gdpr','Súkromie',views.privacy());
for(const [alias,target] of Object.entries(api.getAliases())){const source=routes.get(target);if(!source)throw new Error(`Missing alias target ${target}`);routes.set(alias,source);}
for(const [path,page] of Object.entries(legacyContent)){
  const existing=routes.get(path);
  if(path==='/kontakt'){add(path,page.title,views.contact(page.blocks));continue;}
  if(page.blocks.length){
    let contactForm='';
    add(path,page.title,legacyPage(page,{contactForm})+(path==='/denny-stacionar-vysna-slana'?dsPhotos('ds',['vonkajsi-vchod.jpg'])+'<section class="section"><a class="button" href="/denny-stacionar-vysna-slana/ds-dnes">Aktuálne dianie v stacionári ↗</a></section>':''));
  }else if(path==='/zdrava-lekaren'){add('/zdrava-lekaren',page.title,catalog());add('/eshop/kategoria/-vsetko-','Zdravá lekáreň',catalog());}
  else if(!existing)add(path,page.title,views.pagePlaceholder?views.pagePlaceholder(page):`<section class="section">${views.content({kind:'future',title:page.title,headline:page.title,intro:''})}</section>`);
}
add('/zdravy-svet','Zdravý svet',views.zdravySvet());
add2('/o-lucii','O Lucii',aboutSections(),'about');
// The actual CSV target column controls coverage, not guessed paths.
const csv=await readFile(join(root,'../backend/docs/wp/redirects-map.csv'),'utf8');
// Drafty starého webu (ve výpisu mali stav 404) na novom webe tiež 404 – nie výpis e-shopu.
const DRAFT_PRODUCTS=new Set(['wobenzym','usi','lososovy','protiparazitom','prirodny-jod','ocne-kvapky-pre-psa','sampon-zvierata','bolest-klby','bolest-oci','personalizovany-zdravotny-protokol-zaklad']);
for(const row of csv.trim().split(/\r?\n/).slice(1)){const target=new URL(row.split(',')[1]);const path=target.pathname.replace(/\/$/,'')||'/';if(routes.has(path))continue;if(path.startsWith('/eshop/produkt/')&&DRAFT_PRODUCTS.has(path.split('/').pop()))continue;if(path.startsWith('/eshop/produkt/'))add(path,'Obchod',catalog());else throw new Error(`Missing legacy route ${path}`);}
const CHROME={home:chrome('home'),about:chrome('about'),world:chrome('world'),other:chrome('other')};
const CTX='font-family:Outfit,sans-serif;font-weight:300;color:#EFE5C7';
const VERSION=Date.now().toString(36);
const V='?v='+VERSION;
const BOOT_CSS=`<style>html,body{margin:0;background:#F5F2E8}.dc-root,.legacy-shell{background:#F5F2E8}html:not(.ana-booted) .dc-chrome,html:not(.ana-booted) .lh-say--one,html:not(.ana-booted) .lh-say--two{visibility:hidden}</style>`;
const scripts='<div class="toast" role="status" hidden></div><div class="page-transition" aria-hidden="true"></div><script src="/vendor/lenis.min.js" defer></script><script src="/vendor/gsap.min.js" defer></script><script src="/vendor/ScrollTrigger.min.js" defer></script><script type="module" src="/app.mjs'+V+'"></script><script type="module" src="/motion.mjs'+V+'"></script>';
const document=(...args)=>tokenizeColors(renderDocument(...args));
const renderDocument=(path,{title,body,design})=>{
  const customerLogin=['/prihlasenie','/prihlasenie/potvrdit','/nova-registracia'].includes(path);
  const c=CHROME[path==='/zdravy-svet'?'world':design||'other'];
  const shell=design
    ?`<div id="page-shell" class="dc-root" lang="sk" style="${ROOT_STYLE}"><main id="main" tabindex="-1"${path==='/o-lucii'?' data-sk-only':''}>${body.replace('%%HEADER%%',c.header)}</main>${c.footer}</div>`
    :`<div id="page-shell" class="legacy-shell"><div class="dc-chrome" style="${CTX};background:${path==='/ucet'||customerLogin?'var(--center-main)':'#283020'};margin-left:var(--rail-neg);padding-left:var(--rail-pad)">${c.header}</div><main id="main" class="legacy-main" tabindex="-1" data-sk-only>${body}</main><div class="dc-chrome" style="${CTX}">${c.footer}</div></div>`;
  return `<!doctype html><html lang="sk"${siteTheme===siteThemes[0].id?'':` data-site-theme="${siteTheme}"`}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#283020"><meta name="robots" content="noindex,nofollow"><meta name="ana-country" content=""><meta name="description" content="${e(title)} — lokálny náhľad storefrontu ANASTASIA."><title>${e(title)} — ANASTASIA</title><link rel="icon" href="/assets/brand-mark.svg" type="image/svg+xml"><link rel="preload" href="/assets/outfit.ttf" as="font" type="font/ttf" crossorigin><link rel="stylesheet" href="/tokens.css${V}"><link rel="stylesheet" href="/base.css${V}"><link rel="stylesheet" href="/dc.css${V}"><link rel="stylesheet" href="/product-detail.css${V}"><script src="/site-theme.js"></script>${path==='/ucet'||customerLogin?'<script src="/center-theme.js"></script>':''}</head>${BOOT_CSS}<body${design?` class="dc-page${path==='/'?' lh-intro-page':''}"`:path==='/ucet'?' class="customer-page"':customerLogin?' class="customer-login"':''}><a class="skip-link" href="#main">Preskočiť na obsah</a>${shell}<div class="dc-chrome" style="${CTX}">${c.overlay}${c.rail}${c.menus}</div>${scripts}</body></html>`;
};
await mkdir(out,{recursive:true});await cp(join(root,'public'),out,{recursive:true});await cp(join(root,'src/lib'),join(out,'lib'),{recursive:true});await cp(join(root,'src/components.mjs'),join(out,'components.mjs'));await cp(join(root,'src/site-themes.mjs'),join(out,'site-themes.mjs'));
{
 const file=join(out,'config.mjs');let source=await readFile(file,'utf8');
 for(const [key,name] of Object.entries({apiBaseUrl:'ANASTASIA_API_ORIGIN',publishableKey:'ANASTASIA_PUBLISHABLE_KEY',regionId:'ANASTASIA_REGION_ID'})){
  const value=process.env[name];if(!value)continue;
  if(!/^[A-Za-z0-9_:/.-]+$/.test(value))throw new Error('Invalid public build configuration');
  const pattern=new RegExp('('+key+': w\\.'+key+' \\|\\| )'+"'[^']*'");source=source.replace(pattern,(_,prefix)=>prefix+JSON.stringify(value));
 }
 await writeFile(file,source);
}
for(const [path,page] of routes){const dir=join(out,path);await mkdir(dir,{recursive:true});await writeFile(join(dir,'index.html'),document(path,page));}
// styles.css ve vrstvě: neoznačená pravidla z dc.css (reset a inline návrh) mají vždy přednost.
await writeFile(join(out,'base.css'),'@import url("/styles.css") layer(legacy);\n');
await writeFile(join(out,'styles.css'),tokenizeColors(await readFile(join(out,'styles.css'),'utf8')));
// Detail produktu má vlastní paletu a musí sledovat motiv stejně jako zbytek.
await writeFile(join(out,'product-detail.css'),tokenizeColors(await readFile(join(out,'product-detail.css'),'utf8')));
// Definice motivů se netokenizují (jinak by --site-main:#283020 odkazoval sám na sebe).
await writeFile(join(out,'dc.css'),centerThemeCss()+'\n'+siteThemeCss()+'\n'+tokenizeColors([
  '/* Návrhové stránky a chrome nemají žádný styl kromě inline – starší styles.css se v nich vrací na výchozí hodnoty prohlížeče. */',
  '/* SVG mimo reset: all:revert by zahodil prezentační atributy (stroke, fill). */.dc-root :where(:not(svg,svg *)),.dc-chrome :where(:not(svg,svg *)){all:revert}.dc-root :where(svg),.dc-chrome :where(svg){width:revert;height:revert;flex-shrink:revert}.dc-root,.dc-chrome{font-synthesis:weight style;font-size:16px;line-height:normal}',
  HELMET_CSS,
  '/* Zákaznická část: barvu určuje zákaznice, menu a lišta ji přebírají přes stejné proměnné. */.customer-page,.customer-login{--site-main:var(--center-main);--site-deep:color-mix(in srgb,var(--center-main) 82%,#000);--site-dark:color-mix(in srgb,var(--center-main) 45%,#000);--site-accent:var(--center-accent);--site-accent-deep:color-mix(in srgb,var(--center-accent) 60%,var(--center-main))}',
  '.customer-page footer{position:relative;border-top:0!important}.customer-page footer::before{content:"";position:absolute;top:0;left:var(--rail-neg);right:0;height:140px;background:linear-gradient(180deg,var(--center-main) 0%,var(--center-deep) 100%);pointer-events:none}.customer-page footer>div{position:relative}',
  '.customer-page .legacy-shell>.dc-chrome:first-child{position:sticky;top:0;z-index:30}.customer-page .legacy-shell>.dc-chrome:first-child header{height:76px;padding-top:0!important;padding-bottom:0!important}',
  '/* Přístupnost: návrh ruší obrys inputu (i inline outline:0); pro klávesnici vracíme zlatý obrys (bez vlivu na vzhled bez fokusu). */.dc-root input:focus-visible,.dc-chrome input:focus-visible{outline:1px solid #C9A355!important;outline-offset:4px}',
  ':root{--rail-pad:0px;--rail-neg:0px;--cap-left:20px;--menu-right:12px;--ov-o:0;--ov-p:none;--side-o:0;--side-p:none;--side-t:translate(-24px,-50%);--top-o:0;--top-p:none;--top-t:translateY(-16px)}',
  '@media (min-width:1000px){:root{--rail-pad:52px;--rail-neg:-52px;--cap-left:72px;--menu-right:24px}}',
  '.dc-root dc-wide,.dc-chrome dc-wide{display:contents}.dc-root dc-narrow,.dc-chrome dc-narrow{display:none}@media (max-width:999.98px){.dc-root dc-wide,.dc-chrome dc-wide{display:none}.dc-root dc-narrow,.dc-chrome dc-narrow{display:contents}}',
  '/* Přístupnost: v návrhu se na úzkém displeji tlačítko „Zavrieť“ horního menu ocitne mimo panel (vodorovný scroll uvnitř menu); řádek se zalomí. */@media (max-width:999.98px){#dc-top-menu>div:nth-child(3){flex-wrap:wrap;row-gap:10px}}',
  '.legacy-shell{padding-left:var(--rail-pad)}.legacy-shell>.dc-chrome{overflow-x:clip}.legacy-main>*{margin-left:var(--rail-neg);border-left:var(--rail-pad) solid transparent}',
  '.legacy-main>.zs-follow-image{border-left:0}',
  '.legacy-shell>.dc-chrome:has(footer){overflow-x:visible}.legacy-shell footer{overflow-x:clip}',
  dcCss()].join('\n')));
await writeFile(join(out,'center-theme.js'),centerThemeBoot());
await writeFile(join(out,'site-theme.js'),siteThemeBoot());
await writeFile(join(out,'404.html'),document('/404',{title:'Stránka nenájdená',body:views.notFound()}));
await writeFile(join(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
const apiOrigin=process.env.ANASTASIA_API_ORIGIN||'http://127.0.0.1:9100';
await writeFile(join(out,'_headers'),`/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: default-src 'self'; script-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' https://*.stripe.com data:; media-src 'self' ${mediaOrigin}; font-src 'self'; connect-src 'self' ${apiOrigin} ${mediaOrigin} https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'\n`);
await writeFile(join(out,'routes.json'),JSON.stringify([...routes.keys()],null,2));
console.log(`Built ${routes.size} static pages; all 34 legacy target paths covered (trailing slash variants normalized). ${process.env.ANASTASIA_PUBLISHABLE_KEY?'Real catalog loaded from Medusa.':'No backend calls.'}`);
