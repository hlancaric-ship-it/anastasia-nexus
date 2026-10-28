// Výsuvný panel Novinky na všetkých stránkach okrem /novinky (tá má vlastný). Obsah len z API, vkladá sa ako text.
// Keď API neodpovie alebo je panel v admine vypnutý, záložka sa nezobrazí (žiadne ukážkové dáta mimo stránky Novinky).
import {config} from './config.mjs';

const $=id=>document.getElementById(id);
const safeUrl=u=>typeof u==='string'&&(/^https:\/\//i.test(u)||/^\/(?!\/)/.test(u))?u:null;
const el=(tag,cls,text,attrs)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;if(attrs)for(const[k,v]of Object.entries(attrs))if(v!=null)n.setAttribute(k,v);return n};
const store=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch{return null}};
const CAT_LABEL={tip:'Tip',pozvanka:'Pozvánka',anketa:'Anketa',novinka:'Novinka'};
const LEAF='<svg class="nv-leaf" viewBox="0 0 120 160" fill="none" stroke="#C9A55C" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><path d="M60 158C58 110 62 60 78 8"/><path d="M60 128C42 120 28 104 24 84c20 4 34 22 36 44z"/><path d="M62 100C80 94 94 78 98 58c-20 2-34 20-36 42z"/><path d="M60 70C46 62 36 48 34 30c16 4 26 18 26 40z"/><path d="M70 44C82 38 90 26 92 12c-14 2-22 14-22 32z"/></svg>';

function beacon(slot){try{fetch(`${config.apiBaseUrl}/store/novinky/ads/${slot}/click`,{method:'POST',keepalive:true,headers:{'x-publishable-api-key':config.publishableKey}}).catch(()=>{})}catch{}}

async function load(){
  try{
    const r=await fetch(`${config.apiBaseUrl}/store/novinky`,{headers:{'x-publishable-api-key':config.publishableKey}});
    if(!r.ok)return null;
    const j=await r.json();
    return j&&j.panel&&Array.isArray(j.posts)?j:null;
  }catch{return null}
}

function mount(data){
  const pn=data.panel;
  const posts=[data.featured,...data.posts].filter(Boolean);
  if(!pn.enabled)return;
  if(!document.querySelector('link[href^="/novinky.css"]'))document.head.append(el('link',null,null,{rel:'stylesheet',href:'/novinky.css'}));
  const wrap=el('div','nv nv--dock');
  const tab=el('button','nv-tab','Novinky',{type:'button','aria-controls':'nv-dock','aria-expanded':'false',id:'nv-tab'});
  const dock=el('aside','nv-dock is-closed',null,{id:'nv-dock','aria-label':'Novinky'});
  const leafp=el('div','nv-leafp');
  const x=el('button','nv-x','×',{type:'button','aria-label':'Zavrieť'});
  const head=el('div','nv-head');head.insertAdjacentHTML('afterbegin',LEAF);
  const h=el('h2');h.append((pn.title||'Naše')+' ',el('em',null,pn.title_script||'novinky'));
  head.append(el('p','nv-lbl','Čo je nové'),h);
  const feed=el('div','nv-feed');
  posts.forEach(p=>{
    // Video a anketa sa otvárajú na stránke Novinky, v paneli je len odkaz.
    const rich=p.kind==='video'||p.kind==='youtube'||p.kind==='poll';
    const link=rich?'/novinky':safeUrl(p.link_url);
    const it=el(link?'a':'div','nv-it nv-it--'+p.category);if(link)it.href=link;
    it.append(el('p','nv-n',CAT_LABEL[p.category]||p.category),el('h3',null,p.title));
    if(p.excerpt)it.append(el('p',null,String(p.excerpt).split('\n')[0]));
    feed.append(it);
  });
  if(!posts.length){const it=el('div','nv-it nv-it--tip');it.append(el('h3',null,'Novinky pripravujeme'),el('p',null,'Čoskoro tu nájdete tipy, pozvánky a novinky zo sveta ANASTASIA.'));feed.append(it)}
  const all=el('a','nv-it nv-it--tip',null,{href:'/novinky'});all.append(el('h3',null,'Všetky novinky →'));feed.append(all);
  leafp.append(x,head,feed);dock.append(leafp);
  const ad=pn.ad;
  if(ad){
    const box=el('div','nv-adbox');const i=el('div','nv-ai',null,{role:'img','aria-label':ad.image_alt||''});
    const src=safeUrl(ad.image_url);if(src)i.style.backgroundImage=`url("${src.replace(/"/g,'%22')}")`;if(/packshots/.test(ad.image_url||''))i.classList.add('nv-ai--contain');
    const t=el('div');t.append(el('h3',null,ad.title),el('p',null,ad.text));
    const b=el('a','nv-btn',(ad.button||'Zistiť viac')+' →');const u=safeUrl(ad.url);if(u){b.href=u;b.rel='sponsored noopener';b.target='_blank';b.addEventListener('click',()=>beacon(ad.slot))}
    t.append(b);box.append(el('span','nv-rk',ad.label||'Reklama'),i,t);dock.append(box);
  }
  wrap.append(tab,dock);document.body.append(wrap);
  const set=(open,remember=true)=>{
    dock.classList.toggle('is-closed',!open);dock.inert=!open;tab.hidden=open;tab.setAttribute('aria-expanded',String(open));
    document.documentElement.classList.toggle('nv-lock',open);
    if(remember){store('nv-panel',open?'open':'closed');(open?x:tab).focus()}
  };
  tab.onclick=()=>set(true);x.onclick=()=>set(false);
  addEventListener('keydown',e=>{if(e.key==='Escape'&&!dock.classList.contains('is-closed'))set(false)});
  // Na úvode panel nikdy neprekryje hero sám od seba, viditeľná je len záložka.
  set(false,false);
}

if(!$('nv'))load().then(data=>{if(data)mount(data)});
