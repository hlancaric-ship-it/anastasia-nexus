import {escape as e,arrow,button} from './components.mjs';
import content from './legacy-content.json' with {type:'json'};
export {content as legacyContent};
export const legacyLinks=()=>`<section class="section content-directory"><h2>ANASTASIA</h2><nav aria-label="Sekcie pôvodného webu">${Object.entries(content).map(([path,page])=>`<a href="${path}">${e(page.title)}</a>`).join('')}</nav></section>`;
const media=(src,alt,video=false)=>video?`<div class="source-media"><video class="story-video" muted loop playsinline preload="none" poster="/media/poster.jpg" aria-label="Prírodná atmosféra"><source src="/media/hero-720p.mp4" type="video/mp4"></video><button class="story-video-toggle" type="button" aria-pressed="false" aria-label="Prehrať video">▷</button></div>`:`<figure class="source-media"><img class="parallax" src="${e(src)}" alt="${e(alt)}" loading="lazy" width="900" height="1000"></figure>`;
export function legacyPage(page,{about=false,contactForm=''}={}){
  if(!page.blocks.length)return '';
  const photos=page.blocks.filter(b=>b.type==='image');let first=!about;
  const render=b=>{
    if(b.type==='image')return '';
    if(/^h[1-6]$/.test(b.type)){const tag=first?'h1':b.type==='h1'?'h2':b.type;first=false;return `<${tag} class="reveal">${e(b.text)}</${tag}>`;}
    if(['table','ul','ol'].includes(b.type))return `<div class="source-structure">${b.html}</div>`;
    return b.chunks.map(part=>{let html=e(part);for(const link of b.links||[]){if(!link.text||!link.href||!(/^(https?:|mailto:|tel:|\/)/.test(link.href)))continue;const href=link.href.startsWith('/')?(content[link.href.replace(/\/$/,'')]?link.href:'https://anastasiaoz.eu'+link.href):link.href;html=html.replace(e(link.text),`<a class="source-link" href="${e(href)}">${e(link.text)}</a>`);}return `<p class="source-text">${html}</p>`;}).join('');
  };
  const groups=[];let group=[];
  for(const block of page.blocks){
    if(group.length&&/^h[12]$/.test(block.type)){groups.push(group);group=[];}
    group.push(block);
  }
  if(group.length)groups.push(group);
  const reading=page.source.includes('/vop')||page.source.includes('/gdpr')||groups.length>12;
  if(about)groups.splice(0,groups.length,page.blocks);
  const opening=about?`<section class="section lucia-opening"><h1 class="reveal">Lucia<br><span>Rogožanová.</span></h1>${media(photos[0]?.src||'/media/poster.jpg','Mgr. Lucia Rogožanová')}<p class="lucia-caption">Mgr. Lucia Rogožanová, MBA</p></section>`:'';
  const title=!about&&!page.blocks.some(b=>/^h[1-6]$/.test(b.type))?`<section class="section source-title"><h1>${e(page.title)}</h1></section>`:'';
  const body=groups.map((group,i)=>{
    const images=group.filter(b=>b.type==='image');
    const visual=images.map(b=>media(b.src,b.alt)).join('');
    const mode=about?'author-quote':i===0?'source-opening':images.length?'source-gallery':'source-chapter';
    return `<section class="section ${mode} ${images.length?'has-photo':''}"><div class="story-copy">${group.map(render).join('')}</div>${about?'':visual}</section>`;
  }).join('');
  return `${opening}${title}<article class="legacy-story ${reading?'reading-story':''} ${about?'lucia-story':''}">${body}</article>${about?`<section class="author-film">${media('/media/poster.jpg','',true)}${button('/konzultacie','Konzultácie','light')}</section>`:''}${contactForm}${button('/','Na úvod','legacy-back')}`;
}
