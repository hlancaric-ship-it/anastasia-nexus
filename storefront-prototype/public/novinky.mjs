// Novinky: stránka s jazdiacou radou príspevkov, partneri a výsuvný panel. Všetky texty sa vkladajú ako text (žiadne HTML z API).
import {config} from './config.mjs';
const $=id=>document.getElementById(id);
const root=$('nv');
if(root){
const safeUrl=u=>typeof u==='string'&&(/^https:\/\//i.test(u)||/^\/(?!\/)/.test(u))?u:null;
const el=(tag,cls,text,attrs)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;if(attrs)for(const[k,v]of Object.entries(attrs))if(v!=null)n.setAttribute(k,v);return n};
const bg=(n,u)=>{const s=safeUrl(u);if(s)n.style.backgroundImage=`url("${s.replace(/"/g,'%22')}")`};
const store=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch{return null}};
const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
let data=JSON.parse($('nv-data').textContent);
let cat='all';
const CAT_LABEL={tip:'Tip',pozvanka:'Pozvánka',anketa:'Anketa',novinka:'Novinka'};
const catName=c=>CAT_LABEL[c]||c;
const para=(parent,text,cls)=>String(text||'').split('\n').filter(Boolean).forEach(t=>parent.append(el('p',cls,t)));
const withScript=(h,title,word)=>{h.textContent='';const i=word?title.indexOf(word):-1;if(i<0){h.append(title,' ');if(word)h.append(el('em',null,word));return}h.append(title.slice(0,i),el('em',null,word),title.slice(i+word.length))};
// --- modal pre video ---
const modal=el('div','nv-modal',null,{hidden:'',role:'dialog','aria-modal':'true','aria-label':'Video'});const mclose=el('button',null,'×',{type:'button','aria-label':'Zavrieť video'});modal.append(mclose);document.body.append(modal);
let mediaEl=null;
function closeModal(){modal.hidden=true;if(mediaEl){mediaEl.remove();mediaEl=null}}
function openVideo(p){
 closeModal();
 if(p.kind==='youtube'&&/^[\w-]{11}$/.test(p.youtube_id||'')){mediaEl=el('iframe',null,null,{src:`https://www.youtube-nocookie.com/embed/${p.youtube_id}?autoplay=1&rel=0`,allow:'autoplay; encrypted-media; picture-in-picture',allowfullscreen:'',title:p.title,referrerpolicy:'strict-origin-when-cross-origin'})}
 else if(safeUrl(p.video_url)){mediaEl=el('video',null,null,{src:p.video_url,controls:'',autoplay:'',playsinline:'',poster:safeUrl(p.poster_url)||null})}
 else return;
 modal.append(mediaEl);modal.hidden=false;mclose.focus();
}
mclose.onclick=closeModal;modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});
// --- ankety ---
const voted=id=>store('nv-vote-'+id);
function renderPoll(box,p){
 box.textContent='';const poll=p.poll;if(!poll)return;
 const done=voted(p.id);box.append(el('p','nv-q',poll.question));
 poll.options.forEach(o=>{
  if(done){const row=el('div','nv-opt nv-opt--res'+(done===o.id?' is-mine':''));const pct=poll.total?Math.round(100*o.votes/poll.total):0;const bar=el('i');bar.style.width=pct+'%';row.append(bar,el('span',null,o.label),el('b',null,pct+' %'));box.append(row)}
  else{const b=el('button','nv-opt',o.label,{type:'button'});b.addEventListener('click',e=>{e.stopPropagation();vote(p,o.id,box)});box.append(b)}
 });
 if(done)box.append(el('small',null,`Hlasov: ${poll.total}`));
}
async function vote(p,option,box){
 try{
  const r=await fetch(`${config.apiBaseUrl}/store/novinky/polls/${encodeURIComponent(p.id)}/vote`,{method:'POST',headers:{'content-type':'application/json','x-publishable-api-key':config.publishableKey},body:JSON.stringify({option})});
  const j=await r.json().catch(()=>({}));
  if(r.ok||r.status===409){if(j.poll)p.poll=j.poll;store('nv-vote-'+p.id,r.status===409?(voted(p.id)||'x'):option);render()}
 }catch{/* sieť: hlas sa nezapísal, anketa zostane otvorená */}
}
// --- karta príspevku v rade ---
function postCard(p,clone){
 const isLink=!!safeUrl(p.link_url)&&p.kind!=='video'&&p.kind!=='youtube'&&p.kind!=='poll';
 const card=el(isLink?'a':'article','nv-post nv-post--'+(p.kind==='youtube'?'video':p.kind)+' nv-cat-'+p.category);
 if(isLink)card.href=p.link_url;
 if(clone){card.setAttribute('aria-hidden','true');card.inert=true}
 card.dataset.id=p.id;
 const img=p.image_url||p.poster_url;
 if(p.kind==='video'||p.kind==='youtube'){
  const m=el('button','nv-media',null,{type:'button','aria-label':'Prehrať video: '+p.title});bg(m,img);m.append(el('span','nv-play','▶'),el('span','nv-badge',p.kind==='youtube'?'YouTube':'Video'));m.addEventListener('click',()=>{if(!dragMoved)openVideo(p)});card.append(m);
 }else if(p.kind==='image'&&safeUrl(img)){const m=el('div','nv-media',null,{role:'img','aria-label':p.image_alt||''});bg(m,img);card.append(m)}
 const b=el('div','nv-pb');b.append(el('p','nv-n',catName(p.category)),el('h3',null,p.title));
 if(p.excerpt)para(b,p.excerpt.split('\n')[0]);
 if(p.kind==='poll'){const box=el('div','nv-poll');renderPoll(box,p);b.append(box)}
 card.append(b);return card;
}
// --- vykreslenie ---
function render(){
 const pg=data.page||{};
 $('nv-eyebrow').textContent=pg.eyebrow||'';
 withScript($('nv-title'),pg.title||'',pg.title_script);
 $('nv-intro').textContent=pg.intro||'';
 const partner=$('nv-partner');const pu=safeUrl(pg.partner_url);partner.hidden=!pu;if(pu){partner.textContent=(pg.partner_label||'Chcem sa stať partnerom')+' →';partner.href=pu}
 // rubriky
 const chips=$('nv-chips');chips.textContent='';
 [{key:'all',label:'Všetko'},...(data.categories||[])].forEach(c=>{const b=el('button',null,c.label,{type:'button','aria-pressed':String(cat===c.key)});b.onclick=()=>{cat=c.key;render()};chips.append(b)});
 // hlavný príspevok
 const f=data.featured,feat=$('nv-feat');feat.textContent='';feat.hidden=!f;
 if(f){const w=el('div','nv-w');const t=el('div','nv-feat-txt nv-glass');t.append(el('p','nv-tag',catName(f.category)));const h=el('h2');const parts=f.title.split(' ');const last=parts.pop();h.append(parts.join(' ')+' ',el('em',null,last));t.append(h);para(t,f.excerpt);
  if(safeUrl(f.link_url)){const a=el('a','nv-btn',(f.link_label||'Čítať ďalej')+' →');a.href=f.link_url;t.append(a)}
  const aw=el('div','nv-archwrap');const ar=el('div','nv-arch',null,{role:'img','aria-label':f.image_alt||f.title});bg(ar,f.image_url);aw.append(ar);aw.insertAdjacentHTML('beforeend',document.querySelector('.nv-leaf')?.outerHTML||'');w.append(t,aw);feat.append(w)}
 // rad
 const track=$('nv-track');track.textContent='';
 const list=(data.posts||[]).filter(p=>cat==='all'||p.category===cat);
 [false,true].forEach(c=>list.forEach(p=>track.append(postCard(p,c))));
 track.dataset.loop=list.length?'1':'';
 // pozvánka
 const inv=(data.posts||[]).find(p=>p.category==='pozvanka'),ib=$('nv-invite');ib.textContent='';ib.hidden=!inv;
 if(inv){const w=el('div','nv-w'),band=el('div','nv-band'),d=el('div');const ih=el('h2');const iw=inv.title.split(' ');const il=iw.pop();ih.append(iw.length?iw.join(' ')+' ':'',el('em',null,il));d.append(el('p','nv-tag',catName(inv.category)),ih);para(d,inv.excerpt);band.append(d);
  if(safeUrl(inv.link_url)){const a=el('a','nv-btn nv-btn--w',(inv.link_label||'Čítať ďalej')+' →');a.href=inv.link_url;band.append(a)}
  w.append(band);ib.append(w)}
 // partneri
 const g=$('nv-pgrid');g.textContent='';
 (data.ads||[]).slice().sort((a,b)=>a.slot-b.slot).slice(0,3).forEach(a=>{
  const c=el('div','nv-pc'),i=el('div','nv-pi',null,{role:'img','aria-label':a.image_alt||''});bg(i,a.image_url);if(/packshots/.test(a.image_url||''))i.classList.add('nv-pi--contain');
  const t=el('div','nv-pt');t.append(el('span','nv-rk',a.label||'Reklama'),el('h3',null,a.title),el('p',null,a.text));
  const b=el('a','nv-btn',(a.button||'Zistiť viac')+' →');const u=safeUrl(a.url);if(u){b.href=u;b.rel='sponsored noopener';b.target='_blank';b.addEventListener('click',()=>beacon(a.slot))}t.append(b);c.append(i,t);g.append(c)});
 renderPanel();
}
function beacon(slot){try{navigator.sendBeacon?.(`${config.apiBaseUrl}/store/novinky/ads/${slot}/click`)}catch{}}
// --- panel ---
const dock=$('nv-dock'),tab=$('nv-tab'),xbtn=$('nv-x');
function renderPanel(){
 const pn=data.panel||{};
 const on=!!pn.enabled;tab.hidden=!on;if(!on){dock.hidden=true;document.documentElement.classList.remove('nv-lock');return}
 const h=$('nv-ptitle');h.textContent='';h.append((pn.title||'Naše')+' ');h.append(el('em',null,pn.title_script||'novinky'));
 const feed=$('nv-feed');feed.textContent='';
 [data.featured,...(data.posts||[])].filter(Boolean).forEach(p=>{
  const link=safeUrl(p.link_url);const it=el(link&&p.kind!=='video'&&p.kind!=='youtube'?'a':'div','nv-it nv-it--'+p.category);if(it.tagName==='A')it.href=link;
  it.append(el('p','nv-n',catName(p.category)),el('h3',null,p.title));if(p.excerpt)it.append(el('p',null,p.excerpt.split('\n')[0]));
  if(p.kind==='video'||p.kind==='youtube'){it.style.cursor='pointer';it.tabIndex=0;it.setAttribute('role','button');it.addEventListener('click',()=>openVideo(p));it.addEventListener('keydown',e=>{if(e.key==='Enter')openVideo(p)})}
  feed.append(it)});
 const ad=pn.ad,box=$('nv-adbox');box.textContent='';box.hidden=!ad;
 if(ad){const i=el('div','nv-ai',null,{role:'img','aria-label':ad.image_alt||''});bg(i,ad.image_url);if(/packshots/.test(ad.image_url||''))i.classList.add('nv-ai--contain');const t=el('div');t.append(el('h3',null,ad.title),el('p',null,ad.text));const b=el('a','nv-btn',(ad.button||'Zistiť viac')+' →');const u=safeUrl(ad.url);if(u){b.href=u;b.rel='sponsored noopener';b.target='_blank';b.addEventListener('click',()=>beacon(ad.slot))}t.append(b);box.append(el('span','nv-rk',ad.label||'Reklama'),i,t)}
 setPanel(store('nv-panel')==='open',false);
}
function setPanel(open,remember=true){
 dock.hidden=false;dock.classList.toggle('is-closed',!open);dock.inert=!open;
 tab.hidden=open||!data.panel?.enabled;tab.setAttribute('aria-expanded',String(open));
 document.documentElement.classList.toggle('nv-lock',open);
 if(remember)store('nv-panel',open?'open':'closed');
 if(open&&remember)xbtn.focus();else if(!open&&remember)tab.focus();
}
tab.onclick=()=>setPanel(true);xbtn.onclick=()=>setPanel(false);
addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!modal.hidden)closeModal();else if(!dock.classList.contains('is-closed')&&!dock.hidden)setPanel(false)});
// --- jazdiaca rada ---
const reel=$('nv-reel'),track=$('nv-track');let paused=false,drag=false,dragMoved=false,sx=0,sl=0,visible=true,acc=0;
const half=()=>track.scrollWidth/2;
const wrap=()=>{const h=half();if(h>0){if(reel.scrollLeft>=h)reel.scrollLeft-=h;else if(reel.scrollLeft<=0)reel.scrollLeft+=h}};
function tick(){if(!paused&&!drag&&visible&&!reduce&&track.dataset.loop){acc+=0.6;const d=Math.floor(acc);if(d){reel.scrollLeft+=d;acc-=d}wrap()}requestAnimationFrame(tick)}
reel.addEventListener('mouseenter',()=>paused=true);reel.addEventListener('mouseleave',()=>{paused=false});
reel.addEventListener('focusin',()=>paused=true);reel.addEventListener('focusout',()=>paused=false);
reel.addEventListener('touchstart',()=>paused=true,{passive:true});reel.addEventListener('touchend',()=>setTimeout(()=>paused=false,2500),{passive:true});
reel.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0)return;drag=true;dragMoved=false;sx=e.clientX;sl=reel.scrollLeft});
addEventListener('pointerup',()=>{if(!drag)return;drag=false;reel.classList.remove('is-drag');setTimeout(()=>dragMoved=false,0)});
reel.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-sx;if(Math.abs(dx)>5){dragMoved=true;reel.classList.add('is-drag')}reel.scrollLeft=sl-dx;wrap()});
reel.addEventListener('click',e=>{if(dragMoved){e.preventDefault();e.stopPropagation()}},true);
reel.addEventListener('dragstart',e=>e.preventDefault());
reel.addEventListener('scroll',wrap,{passive:true});
reel.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();step(1)}if(e.key==='ArrowLeft'){e.preventDefault();step(-1)}});
const step=d=>{const c=track.firstElementChild;if(c)reel.scrollBy({left:d*(c.offsetWidth+28),behavior:reduce?'auto':'smooth'})};
$('nv-next').onclick=()=>step(1);$('nv-prev').onclick=()=>step(-1);
new IntersectionObserver(([en])=>visible=en.isIntersecting).observe(reel);
render();requestAnimationFrame(()=>{reel.scrollLeft=1;requestAnimationFrame(tick)});
// --- živé dáta z API (kontrakt s adminom); do té doby běží ukázková data ---
(async()=>{
 try{
  const r=await fetch(`${config.apiBaseUrl}/store/novinky`,{headers:{'x-publishable-api-key':config.publishableKey}});
  if(!r.ok)return;const j=await r.json();
  if(j&&Array.isArray(j.posts)&&Array.isArray(j.ads)){data=j;render()}
 }catch{/* ostáva ukážka */}
})();
}
