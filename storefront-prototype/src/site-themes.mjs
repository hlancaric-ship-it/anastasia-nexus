// Barvy veřejného webu, které volí Lucia (zákazníková část má vlastní volbu, viz center-themes.mjs).
// Návrhy (design/*.dc.html) i styles.css zůstávají beze změny: barvy značky se při buildu
// převedou na CSS proměnné (tokenizeColors), takže přepnutí motivu je jen atribut na <html>
// (preset) nebo inline --site-* proměnné (vlastní barvy). Přebarvení je okamžité, bez rebuildu.
// main = lesná zelená; accent = levanduľový akcent; cream = krémový text na tmavom pozadí.
export const SITE_THEME_PREVIEW_KEY='ana-site-theme-preview'; // náhled z adminu (?vzhlad=), jen tato záložka
export const SITE_THEME_STORE_KEY='ana-site-theme';           // trvalá volba Lucie (localStorage)
export const siteThemes=[
  {id:'zelena',label:'Lesná zelená',main:'#313C2B',deep:'#26321E',dark:'#14200F',accent:'#9C86C2',accentDeep:'#62527F'},
  {id:'bordo',label:'Bordová',main:'#4A1A26',deep:'#3D1520',dark:'#1E0A10',accent:'#C9A355',accentDeep:'#7A5A2E'},
  {id:'modra',label:'Nočná modrá',main:'#1F2A4A',deep:'#1A233E',dark:'#0C1224',accent:'#C9A355',accentDeep:'#796236'},
  {id:'terakota',label:'Terakota',main:'#6E3418',deep:'#5E2C14',dark:'#2A1309',accent:'#E2BC78',accentDeep:'#8A6A34'},
  // Odvozeno z hlavičky anastasiaoz.eu (#73729C → #A7A5CF), ztmaveno kvůli čitelnosti krémového textu.
  {id:'levandula',label:'Levanduľová (pôvodný web)',main:'#55547F',deep:'#48476E',dark:'#222137',accent:'#A7A5CF',accentDeep:'#73729C'},
  {id:'slivka',label:'Slivková',main:'#3E2448',deep:'#341E3D',dark:'#170D1C',accent:'#D2B07A',accentDeep:'#7C6236'},
];
// Konstanty sdílené všemi presety (krémový text a světlá zlatá). V custom motivu je lze přepsat.
export const SITE_BASE={cream:'#F5F2E8',accentLight:'#C9BCE0'};

// Pořadí a názvy CSS proměnných (suffix za --site-). Používá boot, picker i ukládání.
export const THEME_VARS=['main','deep','dark','accent','accent-deep','accent-light','cream'];

// --- Odvození odstínů, ať Lucia zadá jen hlavní barvu + akcent a zbytek se dopočítá ---
const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
const hx=n=>clamp(n).toString(16).padStart(2,'0');
const parseHex=h=>{h=String(h).trim().replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)||0);};
const toHex=a=>`#${hx(a[0])}${hx(a[1])}${hx(a[2])}`;
const mixHex=(a,b,t)=>{const A=parseHex(a),B=parseHex(b);return toHex(A.map((v,i)=>v+(B[i]-v)*t));};
export const darken=(h,t)=>mixHex(h,'#000000',t);
export const lighten=(h,t)=>mixHex(h,'#ffffff',t);

// Z částečného zadání (stačí main + accent) doplní kompletní motiv.
export const deriveSiteTheme=input=>{
  const main=input.main||siteThemes[0].main;
  const accent=input.accent||siteThemes[0].accent;
  return {
    main,
    deep: input.deep||darken(main,0.12),
    dark: input.dark||darken(main,0.55),
    accent,
    accentDeep: input.accentDeep||darken(accent,0.38),
    accentLight: input.accentLight||lighten(accent,0.32),
    cream: input.cream||SITE_BASE.cream,
  };
};
// Motiv (camelCase) → mapa CSS proměnných (suffix).
export const themeToVars=t=>({main:t.main,deep:t.deep,dark:t.dark,accent:t.accent,'accent-deep':t.accentDeep,'accent-light':t.accentLight,cream:t.cream});
// Aplikace/zrušení inline proměnných na prvek (sdílí boot i picker).
export const applySiteVars=(el,v)=>{el.dataset.siteTheme='custom';THEME_VARS.forEach(k=>{if(v[k])el.style.setProperty('--site-'+k,v[k]);});};
export const clearSiteVars=el=>{THEME_VARS.forEach(k=>el.style.removeProperty('--site-'+k));};

const TOKENS={'283020':'main','2a3222':'main','26321e':'deep','14200f':'dark','c9a355':'accent','796236':'accent-deep','efe5c7':'cream','d8c598':'accent-light','313c2b':'main','9c86c2':'accent','62527f':'accent-deep','f5f2e8':'cream','c9bce0':'accent-light'};
// Tmavé odstíny značky v rgba() zápisu — veškeré tmavé scrimy a přechody mají sledovat motiv.
const RGB={'26,34,22':'dark','30,38,25':'dark','16,24,15':'dark','40,48,32':'main','12,18,10':'dark','15,23,14':'dark','28,36,22':'dark','42,50,34':'deep'};
// rgba(16, 24, 15, .62) i bez mezer — stavitelné z klíčů RGB, ať se mapa rozšiřuje na jednom místě.
const rgbPattern=Object.keys(RGB).map(k=>k.split(',').map(p=>p.trim().replace(/\s+/g,'\\s*')).join(',\\s*')).join('|');
const vars=t=>`--site-main:${t.main};--site-deep:${t.deep};--site-dark:${t.dark};--site-accent:${t.accent};--site-accent-deep:${t.accentDeep};--site-accent-light:${t.accentLight||SITE_BASE.accentLight};--site-cream:${t.cream||SITE_BASE.cream}`;
// První motiv je výchozí :root (+ sdílené konstanty cream/accent-light), ostatní jen přepisují barvy přes atribut.
export const siteThemeCss=()=>{
  const head=`:root{${vars(siteThemes[0])}}`;
  const rest=siteThemes.slice(1).map(t=>`:root[data-site-theme="${t.id}"]{${vars(t)}}`).join('');
  return head+rest;
};
const mix=(token,alpha)=>alpha>=1?`var(--site-${token})`:`color-mix(in srgb,var(--site-${token}) ${Math.round(alpha*100)}%,transparent)`;
// Jen v CSS a style="" – prezentační atributy SVG (fill="#…") ani <meta content> var() neberou, proto ="#… zůstává.
// Krémový text (#efe5c7) a světlá zlatá (#d8c598) jsou teď také tokeny, takže se přebarví s motivem.
// Pozn.: čistě bílá (#ffffff), černá (#000000) a světlá pozadí karet zůstávají fixní záměrně – motivy
// ANASTASIA jsou tmavé s krémovým textem a tato pozadí se nevážou na značku.
export const tokenizeColors=text=>text
  // Fallback uvnitř var(--site-*) odstraň, jinak by se při tokenizaci změnil na var(--site-x,var(--site-x)).
  .replace(/var\(--site-([a-z-]+),#([0-9a-f]{6})\)/gi,(m,token,hex)=>TOKENS[hex.toLowerCase()]?`var(--site-${token})`:m)
  .replace(/(?<!=["'])#(283020|2a3222|26321e|14200f|c9a355|796236|efe5c7|d8c598)([0-9a-f]{2})?(?![0-9a-f])/gi,(m,hex,a)=>mix(TOKENS[hex.toLowerCase()],a?parseInt(a,16)/255:1))
  .replace(new RegExp(`rgba\\(\\s*(${rgbPattern})\\s*,\\s*([\\d.]+)\\s*\\)`,`gi`),(m,rgb,a)=>mix(RGB[rgb.replace(/\s/g,'')],Number(a)));

// Boot v <head> (externí /site-theme.js kvůli CSP bez inline scriptů): aplikuje trvalou volbu
// (preset nebo custom barvy z localStorage) i náhled z adminu (?vzhlad=) dřív, než se vykreslí stránka.
export const siteThemeBoot=()=>`try{`+
`var ids=${JSON.stringify(siteThemes.map(t=>t.id))},PK=${JSON.stringify(SITE_THEME_PREVIEW_KEY)},SK=${JSON.stringify(SITE_THEME_STORE_KEY)},VARS=${JSON.stringify(THEME_VARS)},d=document.documentElement,ss=sessionStorage;`+
`var q=new URLSearchParams(location.search).get("vzhlad");if(q!==null){if(ids.indexOf(q)>=0)ss.setItem(PK,q);else ss.removeItem(PK);}`+
`var raw=localStorage.getItem(SK);if(raw){var c=JSON.parse(raw);if(c&&c.id==="custom"&&c.vars){d.dataset.siteTheme="custom";for(var i=0;i<VARS.length;i++){var v=c.vars[VARS[i]];if(v)d.style.setProperty("--site-"+VARS[i],v);}}else if(c&&ids.indexOf(c.id)>=0){d.dataset.siteTheme=c.id;}}`+
`var p=ss.getItem(PK);if(ids.indexOf(p)>=0)d.dataset.siteTheme=p;`+
`}catch(e){}\n`;
