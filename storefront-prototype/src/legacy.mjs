import {escape as e,arrow,button} from './components.mjs';
import {picture} from './webp.mjs';
import content from './legacy-content.json' with {type:'json'};
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
// Právne stránky: vlastný layout ANASTASIA (lesný úvod, zlaté číslovanie článkov), žiadny holý text.
const LEGAL=['/vop','/gdpr','/reklamacie'];
const ROMAN=/^([IVXL]+|\d{1,2})\.\s*(.+)$/;
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
  return `<section class="legal-hero"><p class="legal-eyebrow">ANASTASIA · Právne informácie</p><h1>${e(head?.text||page.title)}</h1>${toc}</section><article class="legal-doc">${arts.filter(a=>a.title||a.body.length).map(art).join('')}${isClaims?`<a class="legal-more reveal" href="/vop"><span>Úplné znenie</span><strong>Všeobecné obchodné podmienky</strong>${arrow}</a>`:''}</article>${button('/','Na úvod','legacy-back')}`;
}
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
    const visual=images.map(b=>media(b.src,b.alt,false,blockKey.get(b))).join('');
    const mode=about?'author-quote':i===0?'source-opening':images.length?'source-gallery':'source-chapter';
    return `<section class="section ${mode} ${images.length?'has-photo':''}"><div class="story-copy">${group.map(render).join('')}</div>${about?'':visual}</section>`;
  }).join('');
  return `${opening}${title}<article class="legacy-story ${reading?'reading-story':''} ${about?'lucia-story':''}">${body}</article>${about?`<section class="author-film">${media('/media/poster.jpg','',true)}${button('/konzultacie','Konzultácie','light')}</section>`:''}${consult?`<section class="section booking-cta">${button('/konzultacie/rezervacia','Vybrať termín konzultácie')}</section>`:''}${contactForm}${button('/','Na úvod','legacy-back')}`;
}
