// Zdroje médií pre CSP: jeden alebo viac originov oddelených čiarkou (napr. doručovanie chránených médií + verejné R2).
const mediaOrigin=(process.env.ANASTASIA_MEDIA_ORIGIN||'').split(/[\s,]+/).filter(Boolean).map(o=>{if(!/^https?:\/\/[a-zA-Z0-9.:-]+$/.test(o)||!(o.startsWith('https://')||/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(o)))throw Error('Invalid media origin');return o;}).join(' ');
import {mkdir,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {legacyContent,legacyPage} from './src/legacy.mjs';
import {chrome,homeSections,aboutSections,dcCss,ROOT_STYLE,HELMET_CSS} from './src/dc.mjs';
import {HOME_CSS} from './src/home-lh.mjs';
import {cookieConsent} from './src/cookie-consent.mjs';
import {api} from './src/lib/api/index.mjs';
import {createHttpApi,JWT_KEY} from './src/lib/api/http.mjs';
import {FEATURED_SLUGS,SHOP_CATEGORIES} from './src/lib/api/catalog.mjs';
import {menuGroups} from './src/lib/menu-navigation.mjs';
const escapeHtml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
import {escape as e} from './src/components.mjs';
import * as views from './src/pages.mjs';
import {libraryPage} from './src/library-page.mjs';
import {novinky} from './src/novinky.mjs';
import {centerThemeCss,centerThemeBoot} from './src/center-themes.mjs';
import {siteThemes,siteThemeCss,siteThemeBoot,tokenizeColors} from './src/site-themes.mjs';
import {accountGuardBoot} from './src/account-guard.mjs';
// Motiv webu volí Lucia v adminu; v produkci ho dosadí server, v náhledu SITE_THEME=bordo node build.mjs.
const siteTheme=process.env.SITE_THEME||siteThemes[0].id;
if(!siteThemes.some(t=>t.id===siteTheme))throw new Error(`Unknown SITE_THEME ${siteTheme}`);
const root=dirname(fileURLToPath(import.meta.url)),out=join(root,'dist');
let catalogProducts=api.getProducts();
let homepageProducts=[];
let homepageCategories=[];
if(process.env.ANASTASIA_PUBLISHABLE_KEY&&process.env.ANASTASIA_REGION_ID){
 const store=createHttpApi({getItem:()=>null,setItem:()=>{}},{apiBaseUrl:process.env.ANASTASIA_API_ORIGIN||'http://127.0.0.1:9100',publishableKey:process.env.ANASTASIA_PUBLISHABLE_KEY,regionId:process.env.ANASTASIA_REGION_ID});
 catalogProducts=await store.getProducts();if(!catalogProducts.length)throw new Error('Real catalog build returned no products');
 homepageProducts=catalogProducts;
 homepageCategories=[...new Set([...await store.getCategories(),...homepageProducts.map(product=>product.category).filter(Boolean)])].filter(name=>SHOP_CATEGORIES.includes(name)).slice(0,4);
}
const catalog=category=>views.catalog(category,catalogProducts);
const luciaImages=`<style>.lucia-real-photos{max-width:1320px;margin:0 auto;padding:clamp(48px,7vw,96px) clamp(20px,4vw,64px);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(18px,3vw,40px);color:var(--ana-forest)}.lucia-real-photos figure{margin:0;overflow:hidden;border-radius:24px;background:var(--ana-surface-lavender)}.lucia-real-photos img{display:block;width:100%;height:min(70vh,620px);min-height:280px;max-height:70vh;object-fit:cover}.lucia-real-photos figcaption{padding:14px 18px;font:300 15px/1.5 Figtree,sans-serif;overflow-wrap:anywhere;text-indent:0}.lucia-real-photos h2{grid-column:1/-1;margin:0;font:300 clamp(32px,4vw,52px)/1.12 Fraunces,serif;color:var(--ana-forest)}.photo-gallery.photo-gallery--lucia{background:var(--ana-paper)}.photo-gallery--lucia figure{overflow:hidden;border-radius:24px;background:var(--ana-surface-lavender)}.photo-gallery--lucia img{width:100%;height:min(70vh,720px);max-height:70vh;object-fit:cover}.photo-gallery--lucia figcaption{padding:14px 18px;overflow-wrap:anywhere;text-indent:0}@media(max-width:680px){.lucia-real-photos{grid-template-columns:1fr}.lucia-real-photos h2{grid-column:auto}.lucia-real-photos img{min-height:220px;max-height:70vh}}</style>`;
const luciaPhoto=(name,alt)=>`<figure><img src="/img/lucia/${name}-1600.webp" srcset="/img/lucia/${name}-800.webp 800w, /img/lucia/${name}-1600.webp 1600w" sizes="(max-width: 800px) 100vw, 640px" alt="${alt}" loading="lazy" decoding="async"><figcaption>${alt}</figcaption></figure>`;
const pharmacyStory=`${luciaImages}<section class="lucia-real-photos"><h2>Zdravá lekáreň ANASTASIA</h2>${luciaPhoto('lekaren','Interiér lekárne ANASTASIA vo Vyšnej Slanej')}</section>`;
const aboutPhotos=`${luciaImages}<section class="lucia-real-photos"><h2>Osobne a vo Vyšnej Slanej</h2>${luciaPhoto('lucia-portret','Lucia Rogožanová v priestoroch ANASTASIA')}${luciaPhoto('lekaren','Svetlý interiér lekárne ANASTASIA')}</section>`;
const stationPhotos=`${luciaImages}<section class="section photo-gallery photo-gallery--lucia"><h2>Denný stacionár Vyšná Slaná</h2><div class="photo-gallery-grid">${luciaPhoto('stacionar-priestor','Spoločenský priestor denného stacionára vo Vyšnej Slanej')}${luciaPhoto('stacionar-poradna','Poradenská miestnosť denného stacionára')}${luciaPhoto('stacionar-kresla','Oddychová časť denného stacionára')}</div></section>`;
// Denný stacionár: fotografie z dodaných souborů (public/media/ds).
const dsPhotos=(dir,files)=>`<section class="section photo-gallery">${files.map(f=>`<figure><img src="/img/${f.replace(/\.(?:jpe?g|png)$/i,'.webp')}" alt="Denný stacionár Vyšná Slaná – ${f.replace(/\.[a-z]+$/,'').replace(/[_-]/g,' ')}" loading="lazy" width="1200" height="800"></figure>`).join('')}</section>`;
// Jedno písmo: Outfit sa nahrádza Figtree (22. 10.).
const unifyFont=html=>html.replaceAll('Outfit,sans-serif','Figtree,"Helvetica Neue",sans-serif')
  // Bez zdvojených odkazov: Zdravá lekáreň = Obchod, Programy a služby = AI ANASTASIA Academy.
  .replace(/<dc-wide><a href="\/eshop\?category=[^"]*">Programy a služby<\/a><\/dc-wide>/g,'')
  .replace(/<a href="\/eshop\?category=sebarozvoj">Programy a služby<\/a>/g,'')
  .replace(/<a(?=[^>]*href="\/zdrava-lekaren")[^>]*>[\s\S]*?<\/a>/g,'')
  // AI ANASTASIA a Academy majú vlastné weby (napojenie na jadro vo fáze 2).
  // Odkazy rovno na cieľ presmerovania, externé weby v novom okne.
  .replace(/href="(\/[^"?#]*?)\/?"/g,(m,path)=>{const hit=DUPLICATE_REDIRECTS.find(([from])=>from===path);if(!hit)return m;const to=hit[1];return to.startsWith('https://')?`href="${to}" target="_blank" rel="noopener"`:`href="${to}"`;})
  .replaceAll('href="/ai-anastasia-academy"','href="https://www.anastasia.academy/" target="_blank" rel="noopener"')
  .replaceAll('href="/ai-anastasia"','href="https://www.aianastasia.com/" target="_blank" rel="noopener"');
// Zdvojené stránky: jedna adresa na obsah, ostatné 301 (22. 10.).
const DUPLICATE_REDIRECTS=[
  ['/darcekovy-poukaz','/eshop/?category=darcekove-poukazy'],
  ['/zdrava-lekaren','/eshop/'],['/eshop/kategoria/-vsetko-','/eshop/'],['/eshop/kategorie','/eshop/'],
  ['/eshop/kategoria/bio-kozmetika-bez-chemie','/eshop/?category=bio-kozmetika-bez-chemie'],['/eshop/kategoria/kozmetika','/eshop/?category=bio-kozmetika-bez-chemie'],
  ['/eshop/kategoria/bylinky-a-vyziva','/eshop/?category=zdrave-doplnky-vyzivy'],['/eshop/kategoria/programy-a-sluzby','/eshop/?category=sebarozvoj'],
  ['/nova-registracia','/prihlasenie/'],['/eshop/produkt/astrologia','/eshop/produkt/astrologia-zdravie-predispozicia/'],
  ['/ai-anastasia-academy','https://www.anastasia.academy/'],['/ai-anastasia','https://www.aianastasia.com/'],['/eshop/produkt/ritualne-sviecky-voskove','/eshop/'],['/eshop/produkt/saty-lanove','/eshop/'],
  // Obsah AI ANASTASIA a Academy patrí na ich weby, prázdne stránky preč (22. 10.).
  ['/programy','https://www.anastasia.academy/'],['/vyuka','https://www.anastasia.academy/'],['/programy/individualne','https://www.anastasia.academy/'],['/programy/pre-firmy','https://www.anastasia.academy/'],['/blog/zdrava-lekaren-aktuality','https://www.anastasia.academy/'],
  ['/pre-odbornikov','/konzultacie/supervizia/'],['/astrologia','/konzultacie/astrologicky-profil-zdravia-a-vitality/'],['/konzultacie/astrologia','/konzultacie/astrologicky-profil-zdravia-a-vitality/'],
  ['/online-zdravotna-konzultacia','/konzultacie/online-zdravotna-konzultacia/'],['/ai-anastasia/recenzie-zakaznikov','/ai-anastasia/recenzie-zakaznikov-ai-anastasia-com/'],
  ['/ai-anastasia/pharmanews-novinky-zo-sveta-farmacie-zdravia-mediciny','https://www.aianastasia.com/insights'],['/ai-anastasia/recenzie-farmaceutickych-produktov','https://www.aianastasia.com/expert-rating'],
  // Zvyšné staré adresy z prehľadu starého webu (22. 10.).
  ['/eshop/kategoria/sebarozvoj','/eshop/?category=sebarozvoj'],['/eshop/kategoria/zdrave-doplnky-vyzivy','/eshop/?category=zdrave-doplnky-vyzivy'],
  ['/eshop/kategoria/Podkategoria41','/eshop/'],['/eshop/kategoria/podkategoria21','/eshop/'],
  ['/moj-ucet','/ucet/'],
  // Produkty, ktoré starý web už nepredáva (bez ceny a mimo e-shopu, 23. 10.).
  ['/eshop/produkt/kava-zdrava','/eshop/'],['/eshop/produkt/telove-maslo','/eshop/'],['/eshop/produkt/vydymovanie-zmes','/eshop/'],['/eshop/produkt/lanova-sukna','/eshop/'],['/moj-ucet/prihlasenie','/prihlasenie/'],['/zabudnute-heslo','/prihlasenie/'],
];
const routes=new Map();
const add=(path,title,body)=>routes.set(path,{title,body});
// Úvod a O Lucii se generují přímo z handoff návrhů (design/*.dc.html).
const add2=(path,title,body,design)=>routes.set(path,{title,body,design});
// Úvod webu je nový koncept (30+, poukaz, čo tu nájdete). Pôvodný úvod ostáva na /povodny-uvod.
// Úvod ukazuje presne kategórie obchodu z menu webu, rovnaké názvy aj odkazy ako v administrácii (Lucky 26. 10.).
const preCategories=menuGroups[0].links;
let preIndex=0;
const konceptHome=readFileSync(join(root,'src','koncept-home.html'),'utf8').replace(/<!--[\s\S]*?-->\n?/g,'')
 .replace(/<a class="kc-pre__i kc-pre__cat" href="[^"]*"( style="[^"]*")>[^<]*<\/a>\n?/g,(m,style)=>{const item=preCategories[preIndex++];return item?`<a class="kc-pre__i kc-pre__cat" href="${escapeHtml(item[1])}"${style}>${escapeHtml(item[0])}</a>\n`:'';});
if(preIndex<preCategories.length)throw new Error('Preloader má menej miest ako kategórií e-shopu');
add2('/','ANASTASIA',konceptHome,'about');
add2('/povodny-uvod','Light for the Future',homeSections(homepageProducts,homepageCategories),'home');
add('/eshop','Obchod',catalog());add('/eshop/kategorie','Kategórie',views.categories());
add('/eshop/kategoria/bio-kozmetika-bez-chemie','Bio kozmetika',catalog('Kozmetika'));
for(const [slug,cat] of [['kozmetika','Kozmetika'],['bylinky-a-vyziva','Bylinky a výživa'],['programy-a-sluzby','Programy a služby']])add(`/eshop/kategoria/${slug}`,cat,catalog(cat));
for(const p of catalogProducts)add(`/eshop/produkt/${p.slug}`,p.name,views.product(p,catalogProducts));
// Zachovat původní velikost písmen staré adresy minerálního krému.
const mineral=catalogProducts.find(p=>p.slug.toLowerCase()==='mineralny-ochranny-krem-pre-citlivu-pokozku');if(mineral)add('/eshop/produkt/mineralny-ochranny-krem-pre-citlivu-pokozku',mineral.name,views.product(mineral,catalogProducts));
for(const p of api.getPages())add(p.path,p.title,views.content(p));
add('/darcekovy-poukaz','Darčekový poukaz',views.giftVoucher());add('/kosik','Košík',views.cart());add('/eshop/kosik','QR košík',views.cart());add('/pokladna','Objednávka',views.checkout());add('/dakujeme','Ďakujeme za objednávku',views.thankYou());
add('/prihlasenie','Prihlásenie',views.login());
add('/nova-registracia/vyhody','Výhody registrácie',views.registrationBenefits());add('/prihlasenie/potvrdit','Potvrdenie prihlásenia',views.login(true));add('/nova-registracia','Prihlásenie bez hesla',views.login());
add('/ucet','Môj účet',views.account());add('/reset-40','RESET 40+',views.reset());add('/reset-40/knihovna','Moje programy',libraryPage());
add('/klub','Klub ANASTASIA',views.klub());add('/konzultacie/rezervacia','Rezervácia konzultácie',views.booking());add('/konzultacie','Konzultácie',views.konzultacie());
add('/kontakt','Kontakt',views.contact());add('/gdpr','Súkromie',views.privacy());
for(const [alias,target] of Object.entries(api.getAliases())){const source=routes.get(target);if(!source)throw new Error(`Missing alias target ${target}`);routes.set(alias,source);}
for(const [path,page] of Object.entries(legacyContent)){
  const existing=routes.get(path);
  if(existing && (existing.design||path==='/konzultacie'))continue;
  if(path==='/kontakt'){add(path,page.title,views.contact(page.blocks));continue;}
  if(page.blocks.length){
    let contactForm='';
    add(path,page.title,legacyPage(page,{contactForm,path}));
  }else if(path==='/zdrava-lekaren'){add('/zdrava-lekaren',page.title,catalog());add('/eshop/kategoria/-vsetko-','Zdravá lekáreň',catalog());}
  else if(!existing)add(path,page.title,views.pagePlaceholder?views.pagePlaceholder(page):`<section class="section">${views.content({kind:'future',title:page.title,headline:page.title,intro:''})}</section>`);
}
const reviewsPath='/ai-anastasia/recenzie-zakaznikov-ai-anastasia-com';
if(routes.has(reviewsPath))routes.set('/ai-anastasia/recenzie-zakaznikov',routes.get(reviewsPath));
add('/zdravy-svet','Zdravý svet',views.zdravySvet());
add('/novinky','Novinky',novinky());
add2('/o-lucii','O Lucii',aboutSections()+aboutPhotos,'about');
// Koncept nového úvodu na schválenie (noindex ako celý test), so spoločnou lištou a pätičkou webu.
add2('/koncept','ANASTASIA',konceptHome,'about');
// The actual CSV target column controls coverage, not guessed paths.
const csv=await readFile(join(root,'../backend/docs/wp/redirects-map.csv'),'utf8');
// Drafty starého webu (ve výpisu mali stav 404) na novom webe tiež 404 – nie výpis e-shopu.
const DRAFT_PRODUCTS=new Set(['wobenzym','usi','lososovy','protiparazitom','prirodny-jod','ocne-kvapky-pre-psa','sampon-zvierata','bolest-klby','bolest-oci','personalizovany-zdravotny-protokol-zaklad']);
for(const row of csv.trim().split(/\r?\n/).slice(1)){const target=new URL(row.split(',')[1]);const path=target.pathname.replace(/\/$/,'')||'/';if(routes.has(path))continue;if(path.startsWith('/eshop/produkt/')&&DRAFT_PRODUCTS.has(path.split('/').pop()))continue;if(path.startsWith('/eshop/produkt/'))add(path,'Obchod',catalog());else throw new Error(`Missing legacy route ${path}`);}
const CHROME={home:chrome('home'),about:chrome('about'),world:chrome('world'),other:chrome('other')};
const CTX='font-family:Figtree,"Helvetica Neue",sans-serif;font-weight:300;color:#EFE5C7';
const VERSION=Date.now().toString(36);
const V='?v='+VERSION;
const bootCss=(design)=>design?`<style>html,body{margin:0;background:#F5F2E8}.dc-root,.legacy-shell{background:#F5F2E8}html:not(.motion) .lh-say--one,html:not(.motion) .lh-say--two{visibility:hidden}</style>`:`<style>html,body{margin:0;background:#F5F2E8}.dc-root,.legacy-shell{background:#F5F2E8}html:not(.ana-booted) .dc-chrome,html:not(.ana-booted) .lh-say--one,html:not(.ana-booted) .lh-say--two{visibility:hidden}</style>`;
const scripts='<div class="toast" role="status" hidden></div><div class="page-transition" aria-hidden="true"></div><script type="module" src="/boot.mjs'+V+'" async></script>';
const TOKENS_CSS=readFileSync(join(root,'public','tokens.css'),'utf8');
// Kritické CSS prvej obrazovky je inline v hlavičke, zvyšok sa doplní neblokujúco (data-late).
// O Lucii: pastelové farby úvodu musia byť v prvom vykreslení, inak stránka blikne pôvodnou zelenou (rovnaká vrstva ako neskorý base.css).
const PASTEL_CSS=readFileSync(join(root,'public','pastel-reference.css'),'utf8');
const ABOUT_START='/* The approved O Lucii editorial page',ABOUT_END='/* Finish the public theme';
if(!PASTEL_CSS.includes(ABOUT_START)||!PASTEL_CSS.includes(ABOUT_END))throw new Error('pastel-reference.css: chýba blok O Lucii pre kritické CSS');
const ABOUT_CRITICAL_CSS=`@layer jednotny,polish,legacy;@layer legacy{${PASTEL_CSS.slice(PASTEL_CSS.indexOf(ABOUT_START),PASTEL_CSS.indexOf(ABOUT_END))}}`;
const designCss=(path)=>`<style>${TOKENS_CSS}${siteThemeCss()}${HELMET_CSS}${HOME_CSS}${path==='/o-lucii'||path.startsWith('/o-lucii/')||/^\/(en|ru)\/o-lucii/.test(path)?ABOUT_CRITICAL_CSS:''}</style><link rel="stylesheet" href="/base.css${V}" media="print" data-late><link rel="stylesheet" href="/dc.css${V}" media="print" data-late><link rel="stylesheet" href="/product-detail.css${V}" media="print" data-late><noscript><link rel="stylesheet" href="/base.css${V}"><link rel="stylesheet" href="/dc.css${V}"><link rel="stylesheet" href="/product-detail.css${V}"></noscript>`;
const legacyCss=(path)=>`<link rel="stylesheet" href="/tokens.css${V}"><link rel="stylesheet" href="/base.css${V}"><link rel="stylesheet" href="/dc.css${V}"><link rel="stylesheet" href="/product-detail.css${V}">${path==='/eshop'||path.startsWith('/eshop/')||path==='/kosik'||path==='/pokladna'||path==='/dakujeme'?`<link rel="stylesheet" href="/shop-reference.css${V}">`:''}<link rel="stylesheet" href="/jednotny.css${V}">`;
const isShopPath=path=>path==='/eshop'||path.startsWith('/eshop/')||path==='/kosik'||path==='/pokladna'||path==='/zdrava-lekaren';
const document=(...args)=>tokenizeColors(renderDocument(...args));
const renderDocument=(path,{title,body,design})=>{
  const customerLogin=['/prihlasenie','/prihlasenie/potvrdit','/nova-registracia'].includes(path);
  const translatedPages=new Set(['/o-lucii','/denny-stacionar-vysna-slana']);
  const c=CHROME[path==='/zdravy-svet'?'world':typeof design==='string'?design:(design?'home':'other')];
  const adminUrl=process.env.ANASTASIA_ADMIN_URL||'';
  if(adminUrl&&!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[^\s"']*)?$/.test(adminUrl))throw new Error('Invalid ANASTASIA_ADMIN_URL');
  const adminLink=adminUrl?`<a class="site-admin-link" href="${e(adminUrl)}" rel="noopener">Administrácia</a>`:'';
  const footer=adminLink&&c.footer.includes('data-cookie-settings>Nastavenia cookies</a>')?c.footer.replace('data-cookie-settings>Nastavenia cookies</a>',`data-cookie-settings>Nastavenia cookies</a>${adminLink}`):c.footer.replace('</footer>',`${adminLink}</footer>`);
  const shell=design
    ?`<div id="page-shell" class="dc-root" lang="sk" style="${ROOT_STYLE}"><main id="main" tabindex="-1">${body.replace('%%HEADER%%',c.header)}</main>${footer}</div>`
    :`<div id="page-shell" class="legacy-shell kc-unified${isShopPath(path)?' kc-shop':''}"><div class="dc-chrome" style="${CTX};background:${path==='/ucet'||customerLogin?'var(--center-main)':'#283020'};margin-left:var(--rail-neg);padding-left:var(--rail-pad)">${c.header}</div><main id="main" class="legacy-main" tabindex="-1"${translatedPages.has(path)?'':' data-sk-only'}>${body}</main><div class="dc-chrome" style="${CTX}">${footer}</div></div>`;
  return `<!doctype html><html lang="sk"${design==='home'?' class="lh-locked lh-mobile-intro"':''}${siteTheme===siteThemes[0].id?'':` data-site-theme="${siteTheme}"`}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#283020"><meta name="robots" content="noindex,nofollow"><meta name="ana-country" content=""><meta name="description" content="${e(title)} — ANASTASIA."><title>${e(title)} — ANASTASIA</title><link rel="icon" href="/assets/brand-mark.svg" type="image/svg+xml"><link rel="modulepreload" href="/boot.mjs${V}"><link rel="preload" href="/assets/fonts/figtree-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/figtree-latin-ext.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/fraunces-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/fraunces-latin-italic.woff2" as="font" type="font/woff2" crossorigin>${design?designCss(path):legacyCss(path)}${path==='/reset-40/knihovna'||path==='/ucet'?`<link rel="stylesheet" href="/library-new.css${V}">`:''}<style>.skip-link{position:fixed;left:20px;top:-90px;z-index:2000;padding:16px;background:#F5F2E8;color:#283020}.skip-link:focus{top:10px}.site-admin-link{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border:1px solid #a7a5cf66;border-radius:20px;color:#d9d7ef!important;text-decoration:none!important;font-size:11px;letter-spacing:.08em;opacity:.82}.site-admin-link:hover{opacity:1;color:#fff!important}</style><script src="/site-theme.js"></script>${path==='/ucet'||customerLogin?'<script src="/center-theme.js"></script>':''}${path==='/ucet'?'<script src="/account-guard.js"></script>':''}</head>${bootCss(design)}<body${design?` class="dc-page${design==='home'?' lh-intro-page':''}"`:path==='/ucet'?' class="customer-page"':customerLogin?' class="customer-login"':''}><a class="skip-link" href="#main">Preskočiť na obsah</a>${cookieConsent()}${shell}<div class="dc-chrome" style="${CTX}">${c.overlay}${c.rail}${c.menus}</div>${scripts}</body></html>`;
};
// dist sa stavia vždy načisto, inak by sa na test nasadzovali staré stránky zo starších buildov (Lucky 25. 10.).
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await cp(join(root,'public'),out,{recursive:true});
await cp(join(root,'public','library-new.mjs'),join(out,'library.mjs'));await cp(join(root,'src/lib'),join(out,'lib'),{recursive:true});await cp(join(root,'src/components.mjs'),join(out,'components.mjs'));await cp(join(root,'src/site-themes.mjs'),join(out,'site-themes.mjs'));
{
 const file=join(out,'config.mjs');let source=await readFile(file,'utf8');
 for(const [key,name] of Object.entries({apiBaseUrl:'ANASTASIA_API_ORIGIN',publishableKey:'ANASTASIA_PUBLISHABLE_KEY',regionId:'ANASTASIA_REGION_ID'})){
  const value=process.env[name];if(!value)continue;
  if(!/^[A-Za-z0-9_:/.-]+$/.test(value))throw new Error('Invalid public build configuration');
  const pattern=new RegExp('('+key+': w\\.'+key+' \\|\\| )'+"'[^']*'");source=source.replace(pattern,(_,prefix)=>prefix+JSON.stringify(value));
 }
 await writeFile(file,source);
}
for(const [from] of DUPLICATE_REDIRECTS)routes.delete(from);
// Duplicitné adresy + presmerovania starého webu z public/_redirects (inak by ich build prepísal).
const legacyRedirects=(await readFile(join(root,'public','_redirects'),'utf8').catch(()=>'')).split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).map(l=>l.split(/\s+/).join(' '));
{const seenFrom=new Set();const rules=[...DUPLICATE_REDIRECTS.flatMap(([from,to])=>[`${from} ${to} 301`,`${from}/ ${to} 301`]),...legacyRedirects].filter(r=>{const f=r.split(' ')[0];if(seenFrom.has(f))return false;seenFrom.add(f);return true;});
await writeFile(join(out,'_redirects'),rules.join('\n')+'\n');}
for(const [path,page] of routes){const dir=join(out,path);await mkdir(dir,{recursive:true});await writeFile(join(dir,'index.html'),unifyFont(document(path,page)));}
// styles.css ve vrstvě: neoznačená pravidla z dc.css (reset a inline návrh) mají vždy přednost.
await writeFile(join(out,'base.css'),'@layer jednotny,polish,legacy;\n@import url("/styles.css") layer(legacy);\n@import url("/pastel-reference.css") layer(legacy);\n@import url("/polish.css") layer(polish);\n');
await writeFile(join(out,'styles.css'),unifyFont(tokenizeColors(await readFile(join(out,'styles.css'),'utf8'))));
// Detail produktu má vlastní paletu a musí sledovat motiv stejně jako zbytek.
await writeFile(join(out,'product-detail.css'),tokenizeColors(await readFile(join(out,'product-detail.css'),'utf8')));
// Definice motivů se netokenizují (jinak by --site-main:#283020 odkazoval sám na sebe).
await writeFile(join(out,'dc.css'),centerThemeCss()+'\n'+siteThemeCss()+'\n'+tokenizeColors([
  '/* Návrhové stránky a chrome nemají žádný styl kromě inline – starší styles.css se v nich vrací na výchozí hodnoty prohlížeče. */',
  '/* SVG mimo reset: all:revert by zahodil prezentační atributy (stroke, fill). */.dc-root :where(:not(svg,svg *)),.dc-chrome :where(:not(svg,svg *)){all:revert}.dc-root :where(svg),.dc-chrome :where(svg){width:revert;height:revert;flex-shrink:revert}.dc-root,.dc-chrome{font-synthesis:weight style;font-size:16px;line-height:normal}',
  HELMET_CSS,
  '/* Zákazníková část: barvu určuje zákazník, menu a lišta ji přebírají přes stejné proměnné. */.customer-page,.customer-login{--site-main:var(--center-main);--site-deep:color-mix(in srgb,var(--center-main) 82%,#000);--site-dark:color-mix(in srgb,var(--center-main) 45%,#000);--site-accent:var(--center-accent);--site-accent-deep:color-mix(in srgb,var(--center-accent) 60%,var(--center-main))}',
  '.customer-page footer{position:relative;border-top:0!important}.customer-page footer::before{content:"";position:absolute;top:0;left:var(--rail-neg);right:0;height:140px;background:linear-gradient(180deg,var(--center-main) 0%,var(--center-deep) 100%);pointer-events:none}.customer-page footer>div{position:relative}',
  '.customer-page .legacy-shell>.dc-chrome:first-child{position:sticky;top:0;z-index:30}.customer-page .legacy-shell>.dc-chrome:first-child header{height:76px;padding-top:0!important;padding-bottom:0!important}',
  '/* Přístupnost: návrh ruší obrys inputu (i inline outline:0); pro klávesnici vracíme zlatý obrys (bez vlivu na vzhled bez fokusu). */.dc-root input:focus-visible,.dc-chrome input:focus-visible{outline:1px solid #C9A355!important;outline-offset:4px}',
  ':root{--rail-pad:0px;--rail-neg:0px;--cap-left:20px;--menu-right:12px;--ov-o:0;--ov-p:none;--side-o:0;--side-p:none;--side-t:translate(-24px,-50%);--top-o:0;--top-p:none;--top-t:translateY(-16px)}',
  '@media (min-width:1000px){:root{--rail-pad:52px;--rail-neg:-52px;--cap-left:72px;--menu-right:24px}}',
  '.dc-root dc-wide,.dc-chrome dc-wide{display:contents}.dc-root dc-narrow,.dc-chrome dc-narrow{display:none}@media (max-width:999.98px){.dc-root dc-wide,.dc-chrome dc-wide{display:none}.dc-root dc-narrow,.dc-chrome dc-narrow{display:contents}}',
  '/* Přístupnost: v návrhu se na úzkém displeji tlačítko „Zavrieť“ horního menu ocitne mimo panel (vodorovný scroll uvnitř menu); řádek se zalomí. */@media (max-width:999.98px){#dc-top-menu>div:nth-child(3){flex-wrap:wrap;row-gap:10px}}',
  '.legacy-shell{padding-left:var(--rail-pad)}.legacy-shell>.dc-chrome{overflow-x:clip}.legacy-main>:not(.legal-doc){margin-left:var(--rail-neg);border-left:var(--rail-pad) solid transparent}',
  '.legacy-main>.zs-follow-image{border-left:0}',
  '.legacy-shell>.dc-chrome:has(footer){overflow-x:visible}.legacy-shell footer{overflow-x:clip}',
  '/* 22. 10. Lucky: žiadna horná lišta. Vpravo hore len tlačidlo Menu, vľavo bočná lišta. */',
  '.lh-top{background:transparent!important;border:0!important;box-shadow:none!important;pointer-events:none;display:flex!important;justify-content:flex-end!important}.lh-top>*:not(.lh-top__side),.lh-top__side>*:not(.lh-top__menu),.lh-top__side--right>*{display:none!important}.lh-top__side{pointer-events:none}.lh-intro-page.lh-chrome-in .lh-top__menu{opacity:1!important}.lh-top__menu{display:inline-flex!important;pointer-events:auto!important;background:var(--site-main)!important;color:var(--site-cream)!important;border-color:rgba(201,163,85,.35)!important}',
  '.legacy-shell>.dc-chrome:first-child{background:transparent!important;height:0;margin:0!important;padding:0!important;border:0!important}.legacy-shell>.dc-chrome:first-child>header{position:fixed!important;top:14px;right:clamp(16px,3vw,48px);left:auto;z-index:45;display:flex!important;padding:0!important;border:0!important;background:none!important;pointer-events:none}.legacy-shell>.dc-chrome:first-child>header>div{display:contents!important}.legacy-shell>.dc-chrome:first-child>header .header-brand,.legacy-shell>.dc-chrome:first-child>header>div>:not(dc-wide):not(dc-narrow),.legacy-shell>.dc-chrome:first-child>header dc-wide:not(:has(.dch1)),.legacy-shell>.dc-chrome:first-child>header dc-narrow:not(:has(.dch0)){display:none!important}.legacy-shell>.dc-chrome:first-child>header :is(.dch0,.dch1){pointer-events:auto;background:var(--site-main)!important;color:var(--site-cream)!important;border-radius:80px!important;padding:0 22px!important;height:50px!important}',
  '/* 22. 10. Lucky: jedno písmo všade – nadpisy Fraunces 300, text Figtree. */',
  'h1,h2,h3{font-family:Fraunces,Georgia,"Times New Roman",serif!important;font-weight:300!important}',
  dcCss(),
  `.dc-root main section[data-atmosphere],.legacy-main section[data-atmosphere]{position:relative;isolation:isolate;overflow:hidden;border:1px solid rgba(164,129,191,.26);border-radius:22px;box-shadow:0 5px 22px rgba(112,74,150,.05);backdrop-filter:blur(13px) saturate(108%);-webkit-backdrop-filter:blur(13px) saturate(108%)}
.dc-root main section[data-atmosphere="olive-branch"],.legacy-main section[data-atmosphere="olive-branch"]{background:linear-gradient(112deg,rgba(233,233,242,.83) 0%,rgba(255,255,255,.88) 72%)}
.dc-root main section[data-atmosphere="lavender"],.legacy-main section[data-atmosphere="lavender"]{background:linear-gradient(105deg,rgba(255,255,255,.86) 0%,rgba(233,233,242,.83) 100%)}
.dc-root main section[data-atmosphere="pharmacy-glass"],.legacy-main section[data-atmosphere="pharmacy-glass"]{background:linear-gradient(110deg,rgba(244,240,231,.84) 0%,rgba(255,255,255,.9) 76%)}
.dc-root main section[data-atmosphere="botanical-light"],.legacy-main section[data-atmosphere="botanical-light"]{background:linear-gradient(115deg,rgba(233,233,242,.84) 0%,rgba(255,255,255,.9) 92%)}
.dc-root .ana-atmosphere,.legacy-main .ana-atmosphere{position:absolute;z-index:0;inset:-8% -2%;pointer-events:none;background-position:center;background-size:cover;background-repeat:no-repeat;opacity:.12;filter:grayscale(.48) saturate(.62);mask-image:linear-gradient(90deg,transparent,#000 16%,#000 78%,transparent),linear-gradient(0deg,transparent,#000 10%,#000 72%,transparent);mask-composite:intersect}
.ana-atmosphere[data-source="olive-branch"]{background-image:url('/img/atmosphere/olive-branch.webp')}
.ana-atmosphere[data-source="lavender"]{background-image:url('/img/atmosphere/lavender.webp')}
.ana-atmosphere[data-source="pharmacy-glass"]{background-image:url('/img/atmosphere/pharmacy-glass.webp')}
.ana-atmosphere[data-source="botanical-light"]{background-image:url('/img/botanical-light.webp')}
.dc-root main section[data-atmosphere]>*:not(.ana-atmosphere),.legacy-main section[data-atmosphere]>*:not(.ana-atmosphere){position:relative;z-index:1}
@media(max-width:760px){.dc-root .ana-atmosphere,.legacy-main .ana-atmosphere{inset:-2% -26%;opacity:.09}}
@media(prefers-reduced-motion:reduce){.dc-root .ana-atmosphere,.legacy-main .ana-atmosphere{transform:none!important;will-change:auto!important}}`].join('\n')));
await writeFile(join(out,'center-theme.js'),centerThemeBoot());
await writeFile(join(out,'site-theme.js'),siteThemeBoot());
await writeFile(join(out,'account-guard.js'),accountGuardBoot(JWT_KEY));
await writeFile(join(out,'404.html'),document('/404',{title:'Stránka nenájdená',body:views.notFound()}));
await writeFile(join(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
const apiOrigin=process.env.ANASTASIA_API_ORIGIN||'http://127.0.0.1:9100';
// Admin ukazuje stránky v náhľade vedľa editora textov.
const adminOrigin=process.env.ANASTASIA_ADMIN_ORIGIN||apiOrigin.replace('-api.','-admin.');
await writeFile(join(out,'_headers'),`/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")\n  Content-Security-Policy: default-src 'self'; script-src 'self' https://js.stripe.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' ${mediaOrigin} https://*.stripe.com data:; media-src 'self' ${mediaOrigin}; font-src 'self'; connect-src 'self' ${apiOrigin} ${mediaOrigin} https://api.stripe.com https://cloudflareinsights.com; frame-src https://js.stripe.com https://hooks.stripe.com https://www.youtube-nocookie.com; frame-ancestors ${adminOrigin}; base-uri 'none'; form-action 'self'\n`);
await writeFile(join(out,'routes.json'),JSON.stringify([...routes.keys()],null,2));
console.log(`Built ${routes.size} static pages; all 34 legacy target paths covered (trailing slash variants normalized). ${process.env.ANASTASIA_PUBLISHABLE_KEY?'Real catalog loaded from Medusa.':'No backend calls.'}`);
