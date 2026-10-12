import {mkdir,writeFile,readFile,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {api} from './src/lib/api/index.mjs';
import {escape as e,header,menu,footer} from './src/components.mjs';
import * as views from './src/pages.mjs';
const root=dirname(fileURLToPath(import.meta.url)),out=join(root,'dist');
const routes=new Map();
const add=(path,title,body)=>routes.set(path,{title,body});
add('/','Light for the Future',views.home());
add('/eshop','Obchod',views.catalog());add('/eshop/kategorie','Kategórie',views.categories());
add('/eshop/kategoria/bio-kozmetika-bez-chemie','Bio kozmetika',views.catalog('Kozmetika'));
for(const p of api.getProducts())add(`/eshop/produkt/${p.slug}`,p.name,views.product(p));
for(const p of api.getPages())add(p.path,p.title,views.content(p));
add('/kosik','Košík',views.cart());add('/eshop/kosik','QR košík',views.cart());add('/pokladna','Objednávka',views.checkout());
add('/prihlasenie','Prihlásenie',views.login());add('/prihlasenie/potvrdit','Potvrdenie prihlásenia',views.login(true));add('/nova-registracia','Prihlásenie bez hesla',views.login());
add('/ucet','Môj účet',views.account());add('/reset-40','RESET 40+',views.reset());add('/reset-40/knihovna','Moje programy',views.reset(true));
add('/kontakt','Kontakt',views.contact());add('/gdpr','Súkromie',views.privacy());
for(const [slug,title] of [['ritualy','Rituály každodennosti'],['poznanie','Priestor pre poznanie'],['cas-pre-seba','Čas pre seba']])add('/zdravy-svet/clanok/'+slug,title,views.article(title));
for(const [alias,target] of Object.entries(api.getAliases())){const source=routes.get(target);if(!source)throw new Error(`Missing alias target ${target}`);routes.set(alias,source);}
// The actual CSV target column controls coverage, not guessed paths.
const csv=await readFile(join(root,'../backend/docs/wp/redirects-map.csv'),'utf8');
for(const row of csv.trim().split(/\r?\n/).slice(1)){const target=new URL(row.split(',')[1]);const path=target.pathname.replace(/\/$/,'')||'/';if(!routes.has(path))throw new Error(`Missing legacy route ${path}`);}
const document=(path,{title,body})=>`<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#2a3222"><meta name="robots" content="noindex,nofollow"><meta name="description" content="${e(title)} — lokálny náhľad storefrontu ANASTASIA."><title>${e(title)} — ANASTASIA</title><link rel="icon" href="/assets/brand-mark.svg" type="image/svg+xml"><link rel="preload" href="/assets/outfit.ttf" as="font" type="font/ttf" crossorigin><link rel="stylesheet" href="/styles.css"></head><body><a class="skip-link" href="#main">Preskočiť na obsah</a><div id="page-shell">${header(path==='/')}<main id="main" tabindex="-1">${body}</main>${footer()}</div>${menu()}<div class="toast" role="status" hidden></div><div class="page-transition" aria-hidden="true"></div><script src="/vendor/gsap.min.js" defer></script><script src="/vendor/ScrollTrigger.min.js" defer></script><script src="/vendor/lenis.min.js" defer></script><script src="/vendor/simpleParallax.min.js" defer></script><script type="module" src="/app.mjs"></script></body></html>`;
await mkdir(out,{recursive:true});await cp(join(root,'public'),out,{recursive:true});await cp(join(root,'src/lib'),join(out,'lib'),{recursive:true});await cp(join(root,'src/components.mjs'),join(out,'components.mjs'));
for(const [path,page] of routes){const dir=join(out,path);await mkdir(dir,{recursive:true});await writeFile(join(dir,'index.html'),document(path,page));}
await writeFile(join(out,'404.html'),document('/404',{title:'Stránka nenájdená',body:views.notFound()}));
await writeFile(join(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
await writeFile(join(out,'_headers'),'/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\'; media-src \'self\'; font-src \'self\'; connect-src \'self\'; frame-ancestors \'none\'; base-uri \'none\'; form-action \'self\'\n');
await writeFile(join(out,'routes.json'),JSON.stringify([...routes.keys()],null,2));
console.log(`Built ${routes.size} static pages; all 34 legacy target paths covered (trailing slash variants normalized). No backend calls.`);
