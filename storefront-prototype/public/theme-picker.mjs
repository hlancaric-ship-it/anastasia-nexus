// Picker vzhledu pro Luciu: přepínač presetů + vlastní barvy s živým náhledem a uložením.
// Načítá se jen na vyžádání (app.mjs: ?vzhlad-editor=1 nebo window.anaOpenThemePicker()), ne pro běžné návštěvníky.
// Barvy mění okamžitě přes CSS proměnné --site-* na <html>; uloženou volbu pak aplikuje boot (/site-theme.js) na všech stránkách.
import {siteThemes,SITE_BASE,THEME_VARS,deriveSiteTheme,themeToVars,applySiteVars,clearSiteVars,SITE_THEME_STORE_KEY} from '/site-themes.mjs';

const d=document.documentElement;
const read=()=>{try{return JSON.parse(localStorage.getItem(SITE_THEME_STORE_KEY)||'null');}catch{return null;}};
const write=v=>{try{localStorage.setItem(SITE_THEME_STORE_KEY,JSON.stringify(v));}catch{}};
const clearStore=()=>{try{localStorage.removeItem(SITE_THEME_STORE_KEY);}catch{}};

const FIELDS=[['main','Hlavná'],['accent','Akcent'],['deep','Tmavšia'],['dark','Najtmavšia'],['accent-deep','Akcent tmavý'],['accent-light','Akcent svetlý'],['cream','Text (krém)']];
const current=()=>{ // aktuální hodnoty proměnných z :root (po aplikaci boot/presetu)
  const cs=getComputedStyle(d);const o={};THEME_VARS.forEach(k=>o[k]=(cs.getPropertyValue('--site-'+k)||'').trim()||'#000000');return o;};

let panel;
export function openThemePicker(){
  if(panel){panel.hidden=false;return panel;}
  panel=document.createElement('section');
  panel.className='ana-theme-picker';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Vzhľad webu');
  panel.innerHTML=`
    <style>
      .ana-theme-picker{position:fixed;right:16px;bottom:16px;z-index:9999;width:300px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow:auto;background:#1b1b1b;color:#f4f0e4;border:1px solid #C9A355;border-radius:14px;padding:16px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 18px 60px rgba(0,0,0,.5)}
      .ana-theme-picker h2{font-size:15px;margin:0 0 4px}
      .ana-theme-picker p.hint{margin:0 0 12px;font-size:12px;opacity:.7}
      .ana-theme-picker .presets{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
      .ana-theme-picker .presets button{flex:0 0 auto;display:flex;align-items:center;gap:6px;background:#2a2a2a;color:inherit;border:1px solid #444;border-radius:20px;padding:6px 10px;cursor:pointer;font-size:12px}
      .ana-theme-picker .presets button[aria-pressed="true"]{border-color:#C9A355;background:#333}
      .ana-theme-picker .sw{width:14px;height:14px;border-radius:50%;border:1px solid rgba(255,255,255,.3)}
      .ana-theme-picker .rows{display:grid;gap:8px;margin-bottom:14px}
      .ana-theme-picker .row{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .ana-theme-picker .row label{font-size:12px}
      .ana-theme-picker input[type=color]{width:40px;height:28px;padding:0;border:1px solid #555;border-radius:6px;background:none;cursor:pointer}
      .ana-theme-picker .adv{opacity:.85}
      .ana-theme-picker .actions{display:flex;gap:8px;flex-wrap:wrap}
      .ana-theme-picker .actions button{flex:1 1 auto;border-radius:8px;padding:9px 10px;border:0;cursor:pointer;font-weight:600;font-size:13px}
      .ana-theme-picker .save{background:#C9A355;color:#1b1b1b}
      .ana-theme-picker .reset{background:#3a3a3a;color:#f4f0e4}
      .ana-theme-picker .close{background:none;color:#f4f0e4;border:1px solid #555}
      .ana-theme-picker details{margin-bottom:12px}
      .ana-theme-picker summary{cursor:pointer;font-size:12px;opacity:.8;margin-bottom:8px}
      .ana-theme-picker .status{font-size:12px;min-height:16px;margin-bottom:8px;color:#C9A355}
    </style>
    <h2>Vzhľad webu</h2>
    <p class="hint">Vyberte motív alebo si nastavte vlastné farby. Zmena je okamžitá; „Uložiť“ ju použije na celom webe.</p>
    <div class="presets" aria-label="Pripravené motívy"></div>
    <div class="rows" data-basic></div>
    <details><summary>Rozšírené farby</summary><div class="rows" data-advanced></div></details>
    <p class="status" role="status"></p>
    <div class="actions">
      <button type="button" class="save">Uložiť</button>
      <button type="button" class="reset">Predvolené</button>
      <button type="button" class="close">Zavrieť</button>
    </div>`;
  document.body.appendChild(panel);

  const presetsEl=panel.querySelector('.presets');
  siteThemes.forEach(t=>{
    const b=document.createElement('button');b.type='button';
    b.innerHTML=`<span class="sw" style="background:${t.main}"></span>${t.label}`;
    b.addEventListener('click',()=>applyPreset(t.id));
    presetsEl.appendChild(b);
  });

  const inputs={};
  const mkRow=(host,key,label)=>{
    const row=document.createElement('div');row.className='row';
    const id='ana-tp-'+key;
    row.innerHTML=`<label for="${id}">${label}</label>`;
    const inp=document.createElement('input');inp.type='color';inp.id=id;
    inp.addEventListener('input',()=>onCustomInput());
    row.appendChild(inp);host.appendChild(row);inputs[key]=inp;
  };
  const basic=panel.querySelector('[data-basic]'),adv=panel.querySelector('[data-advanced]');
  FIELDS.forEach(([k,l])=>mkRow(k==='main'||k==='accent'?basic:adv,k,l));
  adv.parentElement.classList.add('adv');

  const status=panel.querySelector('.status');
  const syncInputs=()=>{const c=current();THEME_VARS.forEach(k=>{if(inputs[k])inputs[k].value=normalize(c[k]);});};
  const setPressed=id=>panel.querySelectorAll('.presets button').forEach((b,i)=>b.setAttribute('aria-pressed',String(siteThemes[i].id===id)));

  function applyPreset(id){
    clearSiteVars(d);d.dataset.siteTheme=id==='zelena'?'':id;
    // malá prodleva, ať se stihne přepočítat :root z CSS, pak natáhni do inputů
    requestAnimationFrame(()=>{syncInputs();});
    setPressed(id);write({id});status.textContent='Motív: '+(siteThemes.find(t=>t.id===id)?.label||id)+' (uložené)';
  }
  function onCustomInput(){
    const full=deriveSiteTheme({main:inputs.main.value,accent:inputs.accent.value,
      deep:dirty('deep'),dark:dirty('dark'),accentDeep:dirty('accent-deep'),accentLight:dirty('accent-light'),cream:dirty('cream')});
    const v=themeToVars(full);applySiteVars(d,v);
    // doplněné odstíny promítni zpět do rozšířených inputů (pokud je Lucia needitovala)
    THEME_VARS.forEach(k=>{if(inputs[k]&&document.activeElement!==inputs[k])inputs[k].value=normalize(v[k]);});
    setPressed(null);status.textContent='Vlastné farby – nezabudnite uložiť.';
    pending={id:'custom',vars:v};
  }
  let pending=null;
  // „dirty“ = Lucia ručně změnila rozšířené pole od posledního odvození (jinak necháme dopočítat)
  const edited=new Set();
  Object.entries(inputs).forEach(([k,inp])=>{if(k!=='main'&&k!=='accent')inp.addEventListener('input',()=>edited.add(k));});
  function dirty(k){return edited.has(k)?inputs[k].value:undefined;}

  panel.querySelector('.save').addEventListener('click',()=>{if(pending){write(pending);status.textContent='Uložené. Platí na celom webe.';}else{status.textContent='Uložené.';}});
  panel.querySelector('.reset').addEventListener('click',()=>{clearStore();clearSiteVars(d);d.dataset.siteTheme='';edited.clear();pending=null;requestAnimationFrame(syncInputs);setPressed('zelena');status.textContent='Predvolený motív (Lesná zelená).';});
  panel.querySelector('.close').addEventListener('click',()=>{panel.hidden=true;});

  // init: odrážej aktuální uloženou volbu
  const saved=read();
  if(saved&&saved.id&&saved.id!=='custom')setPressed(saved.id);else if(saved&&saved.id==='custom')setPressed(null);else setPressed('zelena');
  syncInputs();
  return panel;
}

function normalize(c){ // color input chce #rrggbb; rgb()/color-mix necháme na #000 fallback řeší prohlížeč přes computed
  c=(c||'').trim();
  if(/^#[0-9a-f]{6}$/i.test(c))return c;
  if(/^#[0-9a-f]{3}$/i.test(c))return '#'+c.slice(1).split('').map(x=>x+x).join('');
  const m=c.match(/rgba?\(([^)]+)\)/i);
  if(m){const p=m[1].split(',').map(s=>parseInt(s,10));if(p.length>=3)return '#'+p.slice(0,3).map(n=>Math.max(0,Math.min(255,n||0)).toString(16).padStart(2,'0')).join('');}
  return '#000000';
}
