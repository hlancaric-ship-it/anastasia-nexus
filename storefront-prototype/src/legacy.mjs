import {escape as e,button} from './components.mjs';
import content from './legacy-content.json' with {type:'json'};
import {withdrawalForm} from './withdrawal.mjs';
export {content as legacyContent};
export const legacyLinks=()=>`<section class="section content-directory"><h2>ANASTASIA</h2><nav aria-label="Sekcie pôvodného webu">${Object.entries(content).map(([path,page])=>`<a href="${path}">${e(page.title)}</a>`).join('')}</nav></section>`;
const media=(src,alt,video=false)=>video?`<div class="source-media"><video class="story-video" muted loop playsinline preload="none" poster="/media/poster.jpg" aria-label="Prírodná atmosféra"><source src="/media/hero-720p.mp4" type="video/mp4"></video><button class="story-video-toggle" type="button" aria-pressed="false" aria-label="Prehrať video">▷</button></div>`:`<figure class="source-media"><img src="${e(src)}" alt="${e(alt)}" loading="lazy" width="900" height="1000"></figure>`;
// Právne stránky: vlastný layout ANASTASIA (lesný úvod, zlaté číslovanie článkov), žiadny holý text.
// Každá časť právnych textov klientky je vlastná stránka (VOP, reklamácie, odstúpenie, GDPR, cookies).
const LEGAL=['/vop','/reklamacie','/odstupenie','/gdpr','/cookies'];
// Číslovanie článkov: „I. Úvodné ustanovenia“ aj „1 Predávajúci a kontakty“ (bez bodky).
const ROMAN=/^([IVXL]+|\d{1,2})[.)]?\s+(.+)$/;
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
  const art=(a,i)=>{const m=a.title.match(ROMAN);return `<section class="legal-art reveal" id="${id(a.title,i)}">${a.title?`<div class="legal-num" aria-hidden="true">${e(m?.[1]||'')}</div><h2>${m?`<span class="legal-h-num">${e(a.title.slice(0,a.title.length-m[2].length))}</span>${e(m[2])}`:e(a.title)}</h2>`:''}<div class="legal-body">${point(a.body.map(render).join(''))}</div></section>`;};
  return `<section class="legal-hero"><p class="legal-eyebrow">ANASTASIA · Právne informácie</p><h1>${e(head?.text||page.title)}</h1>${toc}</section><article class="legal-doc">${arts.filter(a=>a.title||a.body.length).map(art).join('')}</article>${page.source.endsWith('/odstupenie')?withdrawalForm():''}${button('/','Na úvod','legacy-back')}`;
}
export function legacyPage(page,{about=false,contactForm=''}={}){
  // Konzultácie sa objednávajú výberom termínu (rezervácia), nie cez starý e-shop.
  const consult=/\/konzultacie(\/|$)/.test(page.source);
  if(!page.blocks.length)return '';
  const photos=page.blocks.filter(b=>b.type==='image');let first=!about;
  const render=b=>{
    if(b.type==='image')return '';
    if(/^h[1-6]$/.test(b.type)){const tag=first?'h1':b.type==='h1'?'h2':b.type;first=false;return `<${tag} class="reveal">${e(b.text)}</${tag}>`;}
    if(['table','ul','ol'].includes(b.type))return `<div class="source-structure">${b.html}</div>`;
    return b.chunks.map(part=>{let html=e(part);for(const link of b.links||[]){if(!link.text||!link.href||!(/^(https?:|mailto:|tel:|\/)/.test(link.href)))continue;const href=link.href.startsWith('/eshop/produkt/')?(consult?`/konzultacie/rezervacia?typ=${encodeURIComponent(link.href.split('#')[0].split('/').pop())}`:link.href.split('#')[0]):link.href.startsWith('/')?(content[link.href.replace(/\/$/,'')]?link.href:'https://anastasiaoz.eu'+link.href):link.href;html=html.replace(e(link.text),`<a class="source-link" href="${e(href)}">${e(link.text)}</a>`);}return `<p class="source-text">${html}</p>`;}).join('');
  };
  if(LEGAL.some(x=>page.source.endsWith(x)))return legalPage(page,render);
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
    const visual=images.map(b=>media(b.src,b.alt)).join('');
    const mode=about?'author-quote':i===0?'source-opening':images.length?'source-gallery':'source-chapter';
    return `<section class="section ${mode} ${images.length?'has-photo':''}"><div class="story-copy">${group.map(render).join('')}</div>${about?'':visual}</section>`;
  }).join('');
  return `${opening}${title}<article class="legacy-story ${reading?'reading-story':''} ${about?'lucia-story':''}">${body}</article>${about?`<section class="author-film">${media('/media/poster.jpg','',true)}${button('/konzultacie','Konzultácie','light')}</section>`:''}${consult?`<section class="section booking-cta">${button('/konzultacie/rezervacia','Vybrať termín konzultácie')}</section>`:''}${contactForm}${button('/','Na úvod','legacy-back')}`;
}
