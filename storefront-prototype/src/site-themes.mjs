// Barvy veřejného webu, které volí Lucia (zákaznická část má vlastní volbu, viz center-themes.mjs).
// Návrhy (design/*.dc.html) i styles.css zůstávají beze změny: barvy značky se při buildu
// převedou na CSS proměnné (tokenizeColors), takže přepnutí motivu je jen atribut na <html>.
// main = pozadí hlavičky/sekcí a text, deep/dark = tmavší odstíny (stíny, přechody), accent = zlatý akcent.
export const SITE_THEME_PREVIEW_KEY='ana-site-theme-preview';
export const siteThemes=[
  {id:'zelena',label:'Lesná zelená',main:'#283020',deep:'#26321E',dark:'#14200F',accent:'#C9A355',accentDeep:'#796236'},
  {id:'bordo',label:'Bordová',main:'#4A1A26',deep:'#3D1520',dark:'#1E0A10',accent:'#C9A355',accentDeep:'#7A5A2E'},
  {id:'modra',label:'Nočná modrá',main:'#1F2A4A',deep:'#1A233E',dark:'#0C1224',accent:'#C9A355',accentDeep:'#796236'},
  {id:'terakota',label:'Terakota',main:'#6E3418',deep:'#5E2C14',dark:'#2A1309',accent:'#E2BC78',accentDeep:'#8A6A34'},
  // Odvozeno z hlavičky anastasiaoz.eu (#73729C → #A7A5CF), ztmaveno kvůli čitelnosti krémového textu.
  {id:'levandula',label:'Levanduľová (pôvodný web)',main:'#55547F',deep:'#48476E',dark:'#222137',accent:'#A7A5CF',accentDeep:'#73729C'},
  {id:'slivka',label:'Slivková',main:'#3E2448',deep:'#341E3D',dark:'#170D1C',accent:'#D2B07A',accentDeep:'#7C6236'},
];
const TOKENS={'283020':'main','2a3222':'main','26321e':'deep','14200f':'dark','c9a355':'accent','796236':'accent-deep'};
const RGB={'26,34,22':'dark','30,38,25':'dark'};
const vars=t=>`--site-main:${t.main};--site-deep:${t.deep};--site-dark:${t.dark};--site-accent:${t.accent};--site-accent-deep:${t.accentDeep}`;
export const siteThemeCss=()=>siteThemes.map((t,i)=>`${i?`:root[data-site-theme="${t.id}"]`:':root'}{${vars(t)}}`).join('');
const mix=(token,alpha)=>alpha>=1?`var(--site-${token})`:`color-mix(in srgb,var(--site-${token}) ${Math.round(alpha*100)}%,transparent)`;
// Jen v CSS a style="" – prezentační atributy SVG (fill="#…") ani <meta content> var() neberou, proto ="#… zůstává.
export const tokenizeColors=text=>text
  .replace(/(?<!=["'])#(283020|2a3222|26321e|14200f|c9a355|796236)([0-9a-f]{2})?(?![0-9a-f])/gi,(m,hex,a)=>mix(TOKENS[hex.toLowerCase()],a?parseInt(a,16)/255:1))
  .replace(/rgba\(\s*(26,\s*34,\s*22|30,\s*38,\s*25)\s*,\s*([\d.]+)\s*\)/gi,(m,rgb,a)=>mix(RGB[rgb.replace(/\s/g,'')],Number(a)));
// Náhled pro Luciu z adminu: ?vzhlad=<id> platí jen v této záložce (sessionStorage), návštěvníci vidí motiv z buildu/serveru.
export const siteThemeBoot=()=>`try{var ids=${JSON.stringify(siteThemes.map(t=>t.id))},q=new URLSearchParams(location.search).get("vzhlad"),s=sessionStorage;if(q!==null){if(ids.indexOf(q)>=0)s.setItem(${JSON.stringify(SITE_THEME_PREVIEW_KEY)},q);else s.removeItem(${JSON.stringify(SITE_THEME_PREVIEW_KEY)});}var p=s.getItem(${JSON.stringify(SITE_THEME_PREVIEW_KEY)});if(ids.indexOf(p)>=0)document.documentElement.dataset.siteTheme=p;}catch(e){}\n`;
