import {escape as e,arrow,button,pageIntro,splitHero} from './components.mjs';
import {picture} from './webp.mjs';
import content from './legacy-content.json' with {type:'json'};
import {withdrawalForm} from './withdrawal.mjs';
export {content as legacyContent};
// Kľúč polia v administrácii: <stranka>__<sekcia>__<index>-<typ> (rovnaký formát ako generátor semena).
export const contentSlug=path=>String(path||'/').replace(/^\/+|\/+$/g,'').replace(/\//g,'-').replace(/[^a-z0-9-]+/gi,'-').toLowerCase()||'home';
export const legacyLinks=()=>`<section class="section content-directory"><h2>ANASTASIA</h2><nav aria-label="Sekcie pôvodného webu">${Object.entries(content).map(([path,page])=>`<a href="${path}">${e(page.title)}</a>`).join('')}</nav></section>`;
const media=(src,alt,video=false,key='')=>video?`<div class="source-media"><video class="story-video" muted loop playsinline preload="none" poster="/media/poster.jpg" aria-label="Prírodná atmosféra"><source src="/media/hero-720p.mp4" type="video/mp4"></video><button class="story-video-toggle" type="button" aria-pressed="false" aria-label="Prehrať video">▷</button></div>`:`<figure class="source-media">${picture(src,alt,`loading="lazy" decoding="async" width="900" height="1000"${key?` data-content="${e(key)}"`:''}`)}</figure>`;
// Pôvodná stránka Reklamácie má len nadpis – reklamačné pravidlá preberáme z čl. VIII vlastných VOP.
function withClaims(page){
  if(!page.source.endsWith('/reklamacie')||page.blocks.length>1)return page;
  const vop=content['/vop']?.blocks||[],from=vop.findIndex(b=>b.type==='h2'&&/^VIII\./.test(b.text));
  if(from<0)return page;
  const to=vop.findIndex((b,i)=>i>from&&b.type==='h2');
  const title=page.blocks[0]||{type:'h1',text:page.title,chunks:[page.title],links:[]};
  return {...page,blocks:[title,...vop.slice(from,to<0?undefined:to)]};
}
// Právne stránky: vlastný layout ANASTASIA (úvod s obrázkom k téme, zlaté číslovanie článkov), žiadny holý text.
const LEGAL=['/vop','/gdpr','/reklamacie','/odstupenie','/cookies'];
const ROMAN=/^([IVXL]+(?=\.)|\d{1,2})\.?\s+(.+)$/;
// Obrázok k téme každej právnej stránky (Unsplash, voľná licencia).
const LEGAL_IMG={vop:'Zápisník so suchými ružami',gdpr:'Osobný diár na stole',cookies:'Čaj a domáce sušienky',odstupenie:'Balíky s kvetmi',reklamacie:'Zápisník, pero a kytica'};
function legalPage(page,render){
  // Zlúčenie odstavcov rozdelených v pôvodnom webe uprostred vety.
  const blocks=[];
  for(const b of page.blocks){
    const prev=blocks.at(-1);
    if(b.type==='p'&&prev?.type==='p'&&!/[.:;!?)“"]\s*$/.test(prev.text)&&/^[a-zá-ž]/.test(b.text)){
      blocks[blocks.length-1]={...prev,text:prev.text+' '+b.text,chunks:[...prev.chunks.slice(0,-1),prev.chunks.at(-1)+' '+b.chunks[0],...b.chunks.slice(1)],links:[...(prev.links||[]),...(b.links||[])]};
    }else blocks.push(b);
  }
  const fix=b=>{
    if(b.type!=='p')return b;
    const chunks=[];
    for(const c of b.chunks){const prev=chunks.at(-1);if(prev!==undefined&&!/[.:;!?)“"]\s*$/.test(prev)&&/^\s*[a-zá-ž]/.test(c))chunks[chunks.length-1]=prev.trimEnd()+' '+c.trimStart();else chunks.push(c);}
    return {...b,chunks:chunks.map(c=>c.replace(/,(?=[a-zá-ž])/g,', ').replace(/\s+,/g,','))};
  };
  const [head,...rest]=blocks;
  const arts=[];let cur=null;
  for(const b of rest){
    if(b.type==='h2'||b.type==='h1'){cur={title:b.text,body:[]};arts.push(cur);}
    else if(b.type!=='image'){if(!cur){cur={title:'',body:[]};arts.push(cur);}cur.body.push(fix(b));}
  }
  const point=html=>html.replace(/<p class="source-text">(\d+\.\d+\.?)\s+/g,'<p class="source-text"><span class="legal-pt">$1</span> ');
  const id=(t,i)=>'cl-'+String(t.match(ROMAN)?.[1]||i+1).toLowerCase();
  const toc=arts.length>2?`<nav class="legal-toc" aria-label="Obsah">${arts.map((a,i)=>{const m=a.title.match(ROMAN);return `<a href="#${id(a.title,i)}"><b>${e(m?.[1]||i+1)}</b>${e(m?.[2]||a.title)}</a>`;}).join('')}</nav>`:'';
  const isClaims=page.source.endsWith('/reklamacie');
  const art=(a,i)=>{const m=a.title.match(ROMAN);return `<section class="legal-art reveal" id="${id(a.title,i)}">${a.title?`<div class="legal-num" aria-hidden="true">${e(m?.[1]||'')}</div><h2>${m?`<span class="legal-h-num">${e(a.title.slice(0,a.title.length-m[2].length))}</span>${e(m[2])}`:e(a.title)}</h2>`:''}<div class="legal-body">${point(a.body.map(render).join(''))}</div></section>`;};
  const slug=page.source.split('/').filter(Boolean).pop();const img=LEGAL_IMG[slug]?`<figure class="legal-figure"><img src="/legal/${slug}.jpg" alt="${e(LEGAL_IMG[slug])}" width="960" height="1200" loading="eager" decoding="async"></figure>`:'';
  return `<section class="legal-hero${img?' has-figure':''}" data-sk-only><div class="legal-hero-text"><p class="legal-eyebrow">ANASTASIA · Právne informácie</p><h1>${e(head?.text||page.title)}</h1>${toc}</div>${img}</section><article class="legal-doc" data-sk-only>${arts.filter(a=>a.title||a.body.length).map(art).join('')}${isClaims?`<a class="legal-more reveal" href="/vop"><span>Úplné znenie</span><strong>Všeobecné obchodné podmienky</strong>${arrow}</a>`:''}</article>${page.source.endsWith('/odstupenie')?withdrawalForm():''}${button('/','Na úvod','legacy-back')}`;
}
// Lanserhof rozloženie starších podstránok: veľký úvod s fotkou, kapitoly v striedavých pásoch, karty, rezervácia na konci.
const L='/img/lucia/';
const LAN={
  '/konzultacie/online-zdravotna-konzultacia':{eyebrow:'Konzultácie',img:L+'lucia-portret-hero-1600.webp',tone:'lavender',book:'online-zdravotna-konzultacia',photos:{'O mne':L+'lucia-portret-1600.webp'}},
  '/konzultacie/supervizia':{eyebrow:'Konzultácie',img:L+'stacionar-priestor-1600.webp',tone:'sage',book:'supervizia'},
  '/konzultacie/astrologicky-profil-zdravia-a-vitality':{eyebrow:'Konzultácie',img:'/media/night-sky.jpg',video:'/media/night-sky.mp4',tone:'night',book:'astrologia-zdravie-predispozicia',cta:'Objednať výklad'},
  '/denny-stacionar-vysna-slana':{eyebrow:'Vyšná Slaná',img:L+'stacionar-kresla-1600.webp',tone:'sage',link:['/denny-stacionar-vysna-slana/ds-dnes','Aktuálne dianie v stacionári'],gallery:true},
  '/denny-stacionar-vysna-slana/ds-dnes':{eyebrow:'Denný stacionár',img:L+'stacionar-priestor-1600.webp',tone:'cream',link:['/kontakt','Kontaktovať nás'],gallery:true},
};
const BOOK_RE=/^(VÝKLAD\s+)?OBJ?EDNA[ŤT](\s.{0,40})?$/i, PRICE_RE=/^Cena:\s*(.+)$/i;
const GALLERY=[['stacionar-priestor','Spoločenský priestor denného stacionára'],['stacionar-poradna','Poradenská miestnosť'],['stacionar-kresla','Oddychová časť']];
function lanStory(page,render,keyOf,o){
  const tones=['cream','lavender','sage'];
  let price='';
  const blocks=page.blocks.filter(b=>{
    if(b.type==='image')return false;
    const t=(b.text||'').trim();
    if(b.type==='p'&&BOOK_RE.test(t))return false;
    if(b.type==='p'&&/Kapacita:.*Plánované otvorenie:/.test(t))return false;
    if(b.type==='p'&&PRICE_RE.test(t)){price=t.match(PRICE_RE)[1];return false;}
    return true;
  });
  const hi=blocks.findIndex(b=>/^h[12]$/.test(b.type));
  const head=hi>=0&&hi<3?blocks[hi]:null;
  const rest=head?[...blocks.slice(0,hi),...blocks.slice(hi+1)]:blocks;
  const leadIdx=head?rest.findIndex((b,i)=>i>=hi&&b.type==='p'&&b.text.length<200):rest.findIndex(b=>b.type==='p');
  const lead=leadIdx>=0?rest.splice(leadIdx,1)[0]:null;
  const keyAttr=b=>keyOf.get(b)?` data-content="${e(keyOf.get(b))}"`:'';
  const intro=`<div class="page-intro${(head?.text||page.title).length>40?' page-intro--long':''}"><p class="eyebrow">${e(o.eyebrow)}</p><h1${head?keyAttr(head):''}>${e(head?.text||page.title)}</h1>${lead?`<p class="lead"${keyAttr(lead)}>${e(lead.text)}</p>`:''}</div>`;
  const extra=o.link?button(o.link[0],o.link[1]):o.book?button(`/konzultacie/rezervacia?typ=${encodeURIComponent(o.book)}`,o.cta||'Rezervovať termín'):'';
  const hero=o.video
    ?`<div class="lan-hero lan-hero--night"><div class="lan-hero__text">${intro}${extra}</div><figure class="lan-hero__photo"><video autoplay muted loop playsinline preload="metadata" poster="${e(o.img)}" aria-hidden="true"><source src="${e(o.video)}" type="video/mp4"></video></figure></div>`
    :splitHero(intro,o.img,head?.text||page.title,{tone:o.tone,extra});
  // Kapitoly podľa h2. Stránka bez h2 sa delí podľa h3.
  const lvl=rest.some(b=>b.type==='h2')?'h2':'h3';
  const chapters=[];let cur={title:null,body:[]};
  for(const b of rest){if(b.type===lvl){if(cur.title||cur.body.length)chapters.push(cur);cur={title:b,body:[]};}else cur.body.push(b);}
  if(cur.title||cur.body.length)chapters.push(cur);
  const body=list=>list.map(b=>/^h[3-6]$/.test(b.type)?`<h3${keyAttr(b)}>${e(b.text)}</h3>`:render(b)).join('');
  // Pri kapitole s podnadpismi h3 vznikne mriežka kariet.
  const cards=list=>{const out=[];let c=null;const pre=[];for(const b of list){if(b.type==='h3'){c={h:b,body:[]};out.push(c);}else if(c)c.body.push(b);else pre.push(b);}return {pre,out};};
  let n=0;
  const short=lvl==='h3'?chapters.filter(c=>c.title&&c.body.reduce((a,b)=>a+(b.text||'').length,0)<260):[];
  const chapterHtml=chapters.filter(c=>!short.includes(c)).map(c=>{
    const tone=tones[n%3];const no=c.title?String(++n).padStart(2,'0'):'';
    const photo=c.title&&o.photos?.[c.title.text];
    const {pre,out}=cards(c.body);
    const inner=out.length>=2?`${body(pre)}<div class="lan-cards">${out.map(x=>`<div class="lan-card"><h3${keyAttr(x.h)}>${e(x.h.text)}</h3>${body(x.body)}</div>`).join('')}</div>`:body(c.body);
    const headHtml=c.title?`<div class="lan-chap__head"><span class="lan-chap__no">${no}</span><h2${keyAttr(c.title)}>${e(c.title.text)}</h2></div>`:'<div class="lan-chap__head"></div>';
    return `<section class="lan-chap lan-chap--${tone}${photo?' lan-chap--photo':''}${!c.title&&chapters.length===1?' lan-chap--lone':''}">${photo?`<figure class="lan-chap__photo"><img src="${e(photo)}" alt="" width="900" height="1100" loading="lazy" decoding="async"></figure>`:headHtml}<div class="lan-chap__body">${photo?headHtml:''}${inner}</div></section>`;
  });
  // Krátke fakty (otvorenie, kapacita, hodiny) v jednom páse vedľa seba.
  if(short.length){const facts=`<section class="lan-chap lan-chap--lavender lan-facts">${short.map(c=>`<div class="lan-fact"><h3${keyAttr(c.title)}>${e(c.title.text)}</h3>${body(c.body)}</div>`).join('')}</section>`;chapterHtml.splice(Math.min(1,chapterHtml.length),0,facts);}
  const gallery=o.gallery?`<section class="lan-gallery">${GALLERY.filter(([f])=>!o.img.includes(f)).map(([f,alt])=>`<figure>${picture(L+f+'-1600.webp',alt,'loading="lazy" decoding="async" width="900" height="1100"')}</figure>`).join('')}</section>`:'';
  const cta=o.book?`<section class="lan-cta"><p class="eyebrow">Rezervácia</p><h2>${e(head?.text||page.title)}</h2>${price?`<p class="lan-cta__price">${e(price)}</p>`:''}${button(`/konzultacie/rezervacia?typ=${encodeURIComponent(o.book)}`,o.cta||'Vybrať termín')}</section>`:'';
  return `<div class="lan-story">${hero}${chapterHtml.join('')}${gallery}${cta}</div>`;
}
// Malé alebo rozmazané obrázky zo starého webu nahrádzajú ostré fotky priestorov ANASTASIA.
const SHARP={'/media/hucpcycx/supervizia-2.jpg':'/img/lucia/stacionar-priestor-1600.webp'};
export function legacyPage(page,{about=false,contactForm='',path=''}={}){
  page=withClaims(page);
  // Konzultácie sa objednávajú výberom termínu (rezervácia), nie cez starý e-shop.
  const consult=/\/konzultacie(\/|$)/.test(page.source);
  if(!page.blocks.length)return '';
  const photos=page.blocks.filter(b=>b.type==='image');let first=!about;
  // Obsah z administrácie: každý blok má stabilný kľúč (rovnaký ako v semene).
  const pageKey=contentSlug(path||page.source);let sectionNo=0;
  const blockKey=new Map();
  page.blocks.forEach((b,i)=>{if(b.type==='h1'||sectionNo===0)sectionNo++;const type=b.type==='image'?'image':/^h[1-6]$/.test(b.type)?'text':'rich';blockKey.set(b,`${pageKey}__${pageKey}-${sectionNo}__${i}-${type}`);});
  const render=b=>{
    const key=blockKey.get(b);
    if(b.type==='image')return '';
    if(/^h[1-6]$/.test(b.type)){const tag=first?'h1':b.type==='h1'?'h2':b.type;first=false;return `<${tag} class="reveal"${key?` data-content="${e(key)}"`:''}>${e(b.text)}</${tag}>`;}
    if(['table','ul','ol'].includes(b.type))return `<div class="source-structure"${key?` data-content="${e(key)}"`:''}>${b.html}</div>`;
    return b.chunks.map(part=>{let html=e(part);for(const [li,link] of (b.links||[]).entries()){if(!link.text||!link.href||!(/^(https?:|mailto:|tel:|\/)/.test(link.href)))continue;const href=link.href.startsWith('/eshop/produkt/')?(consult?`/konzultacie/rezervacia?typ=${encodeURIComponent(link.href.split('#')[0].split('/').pop())}`:link.href.split('#')[0]):link.href.startsWith('/')?(content[link.href.replace(/\/$/,'')]?link.href:'https://anastasiaoz.eu'+link.href):link.href;const linkKey=key?`${key.replace(/-(text|rich|image)$/,'')}-link-${li}`:'';html=html.replace(e(link.text),`<a class="source-link" href="${e(href)}"${linkKey?` data-content="${e(linkKey)}"`:''}>${e(link.text)}</a>`);}return `<p class="source-text"${key?` data-content="${e(key)}"`:''}>${html}</p>`;}).join('');
  };
  if(LEGAL.some(x=>page.source.endsWith(x)))return legalPage(page,render);
  const lanKey=Object.keys(LAN).find(x=>page.source.replace(/\/$/,'').endsWith(x));
  if(lanKey&&!about)return lanStory(page,render,blockKey,LAN[lanKey]);
  const groups=[];let group=[];
  for(const block of page.blocks){
    if(group.length&&/^h[12]$/.test(block.type)){groups.push(group);group=[];}
    group.push(block);
  }
  if(group.length)groups.push(group);
  const reading=page.source.includes('/vop')||page.source.includes('/gdpr')||page.source.includes('/reklamacie')||groups.length>12;
  if(about)groups.splice(0,groups.length,page.blocks);
  const opening=about?`<section class="section lucia-opening"><h1 class="reveal">Lucia<br><span>Rogožanová.</span></h1>${media(photos[0]?.src||'/media/poster.jpg','Mgr. Lucia Rogožanová')}<p class="lucia-caption">Mgr. Lucia Rogožanová, MBA</p></section>`:'';
  const title=!about&&!page.blocks.some(b=>/^h[1-6]$/.test(b.type))?`<section class="section source-title"><h1>${e(page.title)}</h1></section>`:'';
  const body=groups.map((group,i)=>{
    const images=group.filter(b=>b.type==='image');
    const visual=images.map(b=>SHARP[b.originalSrc]?media(SHARP[b.originalSrc],b.alt):media(b.src,b.alt,false,blockKey.get(b))).join('');
    const mode=about?'author-quote':i===0?'source-opening':images.length?'source-gallery':'source-chapter';
    return `<section class="section ${mode} ${images.length?'has-photo':''}"><div class="story-copy">${group.map(render).join('')}</div>${about?'':visual}</section>`;
  }).join('');
  // Text „OBJEDNAŤ TERMÍN TU“ zo starého webu bol mŕtvy: na konzultáciách z neho je jediné tlačidlo na rezerváciu.
  const bookRe=/<p class="source-text"([^>]*)>\s*(?:<a class="source-link" href="([^"]*)"[^>]*>)?\s*(OBJ?EDNA[ŤT][^<]{0,40}TERM[IÍ]N[^<]{0,20})(?:<\/a>)?\s*<\/p>/i;
  const inlineBooking=consult&&bookRe.test(body);
  const story=inlineBooking?body.replace(bookRe,(_,attrs,href,text)=>`<p class="source-book"${attrs}><a class="button" href="${href||'/konzultacie/rezervacia'}">${text.trim()} ${arrow}</a></p>`):body;
  return `${opening}${title}<article class="legacy-story ${reading?'reading-story':''} ${about?'lucia-story':''}">${story}</article>${about?`<section class="author-film">${media('/media/poster.jpg','',true)}${button('/konzultacie','Konzultácie','light')}</section>`:''}${consult&&!inlineBooking?`<section class="section booking-cta">${button('/konzultacie/rezervacia','Vybrať termín konzultácie')}</section>`:''}${contactForm}${button('/','Na úvod','legacy-back')}`;
}
