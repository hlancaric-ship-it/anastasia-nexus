import {createApi} from '/lib/api/index.mjs';
import {escape as e,card,arrow,button} from '/components.mjs';
let storage;try{storage=window.sessionStorage;}catch{}
const api=createApi(storage);
const $=(s,root=document)=>root.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
let toastTimeout;
function toast(message){const el=$('.toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{el.hidden=true;},4500);}
async function updateCount(){const count=(await api.getCart()).lines.reduce((sum,line)=>sum+line.quantity,0);$$('.cart-count').forEach(el=>el.textContent=String(count));}
updateCount();

const customerCenter=$('.customer-center');
if(customerCenter){
  // Barva účtu: platné id přijdou z vyrenderovaných swatchů, první je výchozí (bez atributu). Uloženo jen v prohlížeči.
  const themeIds=[...new Set($$('[data-center-theme-pick]',customerCenter).map(btn=>btn.dataset.centerThemePick))];
  const markTheme=id=>$$('[data-center-theme-pick]',customerCenter).forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.centerThemePick===id)));
  const setTheme=id=>{if(!themeIds.includes(id))id=themeIds[0];if(id===themeIds[0])delete document.documentElement.dataset.centerTheme;else document.documentElement.dataset.centerTheme=id;markTheme(id);try{if(id===themeIds[0])localStorage.removeItem('ana-center-theme');else localStorage.setItem('ana-center-theme',id);}catch{}};
  markTheme(document.documentElement.dataset.centerTheme||themeIds[0]);
  $$('[data-center-theme-pick]',customerCenter).forEach(btn=>btn.addEventListener('click',()=>setTheme(btn.dataset.centerThemePick)));
  const titles={prehlad:'Vitajte vo svojom priestore.',programy:'Moje programy.',konzultacie:'Konzultácie.',chat:'Chat s Luciou.',objednavky:'Objednávky.',materialy:'Materiály.',profil:'Môj profil.'};
  const show=id=>{if(!Object.hasOwn(titles,id))id='prehlad';$$('[data-account-panel]',customerCenter).forEach(panel=>{panel.hidden=panel.dataset.accountPanel!==id;});$$('.center-sidebar [data-account-go]',customerCenter).forEach(btn=>btn.setAttribute('aria-current',btn.dataset.accountGo===id?'page':'false'));$('#account-title').textContent=titles[id];return id;};
  show(location.hash.slice(1));
  $$('[data-account-go]',customerCenter).forEach(btn=>btn.addEventListener('click',()=>{const id=show(btn.dataset.accountGo);history.pushState(null,'',`/ucet#${id}`);$('#account-title').focus({preventScroll:true});}));
  addEventListener('popstate',()=>show(location.hash.slice(1)));
  addEventListener('hashchange',()=>show(location.hash.slice(1)));
  $$('[data-material-filter]',customerCenter).forEach(btn=>btn.addEventListener('click',()=>{const filter=btn.dataset.materialFilter;$$('[data-material-filter]',customerCenter).forEach(item=>item.setAttribute('aria-pressed',String(item===btn)));$$('[data-material-category]',customerCenter).forEach(row=>{row.hidden=!!filter&&row.dataset.materialCategory!==filter;});}));
  $('#center-profile').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,send=$('button[type=submit]',form);if(send.disabled)return;send.disabled=true;try{$('.form-status',form).textContent=(await api.saveCustomerProfile(Object.fromEntries(new FormData(form)))).message;}catch{$('.form-status',form).textContent='Zmeny sa nepodarilo skontrolovať. Skúste to znova.';}finally{send.disabled=false;}});
}

const chatErrors={chat_not_eligible:'Chat je dostupný po nákupe produktu, programu alebo rezervácii služby.',chat_blocked:'Odosielanie správ je pre váš účet pozastavené. Kontaktujte nás cez kontaktný formulár.',chat_consecutive_limit:'Odoslali ste tri správy po sebe. Počkajte, prosím, na odpoveď Lucie.',chat_daily_limit:'Dosiahli ste denný limit správ. Skúste to znova zajtra.',conversation_closed:'Táto konverzácia je uzavretá. Môžete začať novú konverzáciu.',message_too_long:'Správa môže mať najviac 2000 znakov.',message_empty:'Napíšte správu pred odoslaním.'};
const chatForm=$('#chat-form');
if(chatForm){
  const body=chatForm.elements.body,send=$('button',chatForm),selection=$('#chat-conversation');
  let busy=false,status;
  const count=()=>{const length=Array.from(body.value).length;$('#chat-counter').textContent=`${length} / 2000 znakov`;send.disabled=busy||!status?.can_write||!body.value.trim()||length>2000;};
  const availability=async()=>{status=await api.getChatStatus();$('#chat-availability').textContent=chatErrors[status.reason]||'Lucii môžete napísať správu.';count();};
  const detail=async()=>{const id=selection.value;const data=id?await api.getChatConversation(id):{messages:[]};$('#chat-messages').replaceChildren(...data.messages.map(message=>{const article=document.createElement('article');article.className='chat-message';article.dataset.author=message.author;const author=document.createElement('strong');author.textContent=message.author==='lucia'?'Lucia':'Vy';const text=document.createElement('p');text.textContent=message.body;article.append(author,text);return article;}));if(id)await api.markChatRead(id);};
  const list=async(id)=>{const data=await api.getChatConversations();selection.replaceChildren(...data.conversations.map(c=>new Option(c.subject,c.id)));selection.append(new Option('Nová konverzácia',''));if(id!==undefined)selection.value=id;await detail();};
  body.addEventListener('input',count);
  selection.addEventListener('change',()=>{detail();$('.form-status',chatForm).textContent='';});
  $('#chat-new').addEventListener('click',async()=>{selection.value='';await detail();$('.form-status',chatForm).textContent='';body.focus();});
  $('#chat-preview').addEventListener('change',async event=>{await api.setChatPreview(event.target.value);await availability();$('.form-status',chatForm).textContent='';});
  chatForm.addEventListener('submit',async event=>{event.preventDefault();if(busy||send.disabled)return;busy=true;count();try{const result=await api.sendChatMessage({conversation_id:selection.value||undefined,body:body.value});$('.form-status',chatForm).textContent=result.ok?'Správa bola pridaná do ukážkovej konverzácie.':chatErrors[result.type]||'Správu sa nepodarilo odoslať. Skúste to znova.';if(result.ok){body.value='';await list(result.conversation.id);}await availability();}catch{$('.form-status',chatForm).textContent='Chat je dočasne nedostupný. Skúste to znova.';}finally{busy=false;count();}});
  await list();await availability();
}

const giftForm=$('#gift-voucher-form');
if(giftForm){
  const send=$('button',giftForm),select=giftForm.elements.variant_id;
  try{const product=await api.getGiftVoucherProduct();select.replaceChildren(...product.variants.map(v=>new Option(v.title,v.id)));select.disabled=!product.variants.length;send.disabled=select.disabled;if(select.disabled)$('.form-status',giftForm).textContent='Darčekové poukazy momentálne nie sú dostupné.';}
  catch{$('.form-status',giftForm).textContent='Hodnoty poukazu sa nepodarilo načítať. Skúste to znova.';}
  giftForm.addEventListener('submit',async event=>{event.preventDefault();if(send.disabled)return;send.disabled=true;try{const result=await api.addGiftVoucher({variant_id:select.value,recipient:{name:giftForm.elements.name.value,email:giftForm.elements.email.value,message:giftForm.elements.message.value}});$('.form-status',giftForm).textContent=result.ok?'Poukaz bol pridaný do ukážkového košíka.':result.message;if(result.ok){giftForm.elements.name.value='';giftForm.elements.email.value='';giftForm.elements.message.value='';await updateCount();}}catch{$('.form-status',giftForm).textContent='Poukaz sa nepodarilo pridať. Skúste to znova.';}finally{send.disabled=false;}});
}

// Chování převzaté z handoff návrhů (design/*.dc.html): menu, Lenis, reveal, parallax, tón lišty, text roll.
const root=document.documentElement,shell=$('#page-shell'),reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const MENU={side:{o:'--side-o',p:'--side-p',t:'--side-t',open:'translate(0,-50%)',closed:'translate(-24px,-50%)'},top:{o:'--top-o',p:'--top-p',t:'--top-t',open:'translateY(0)',closed:'translateY(-16px)'}};
let lenis=null,menuOpen=null,previousFocus=null;
function setMenu(kind){
  const prev=menuOpen;if(prev===kind)return;
  for(const [name,m] of Object.entries(MENU)){const on=name===kind;root.style.setProperty(m.o,on?'1':'0');root.style.setProperty(m.p,on?'auto':'none');root.style.setProperty(m.t,on?m.open:m.closed);const panel=$(`#dc-${name}-menu`);if(panel){panel.inert=!on;panel.setAttribute('aria-hidden',String(!on));}}
  root.style.setProperty('--ov-o',kind?'1':'0');root.style.setProperty('--ov-p',kind?'auto':'none');
  $$('[data-menu-open]').forEach(t=>t.setAttribute('aria-expanded',String(t.dataset.menuOpen===kind)));
  shell.inert=!!kind;$('#ana-rail')&&($('#ana-rail').inert=!!kind);$$('.skip-link').forEach(el=>{el.inert=!!kind;});
  menuOpen=kind;
  if(kind){if(!prev)previousFocus=document.activeElement;lenis?lenis.stop():root.style.overflow='hidden';const panel=$(`#dc-${kind}-menu`);requestAnimationFrame(()=>$('[data-menu-close],a[href]',panel)?.focus({preventScroll:true}));}
  else{lenis?lenis.start():root.style.overflow='';(previousFocus?.getClientRects().length?previousFocus:$('[data-menu-open]'))?.focus({preventScroll:true});previousFocus=null;}
}
document.addEventListener('click',event=>{
  const open=event.target.closest('[data-menu-open]');if(open){event.preventDefault();setMenu(menuOpen===open.dataset.menuOpen?null:open.dataset.menuOpen);return;}
  // Odkazy v menu (data-menu-close) menu zavřou a normálně navigují; zabrání se jen akci prvků bez cíle.
  const close=event.target.closest('[data-menu-close]');if(close){if(!close.matches('a[href]:not([href="#"])'))event.preventDefault();setMenu(null);return;}
  if(event.target.closest('a[href="#"]'))event.preventDefault();
  if(menuOpen&&event.target.closest('#dc-side-menu a[href],#dc-top-menu a[href]'))setMenu(null);
},true);
document.addEventListener('keydown',event=>{
  if(!menuOpen)return;
  if(event.key==='Escape'){event.preventDefault();setMenu(null);return;}
  if(event.key==='Tab'){
    const panel=$(`#dc-${menuOpen}-menu`);
    const focusable=$$('a[href],button:not([disabled]),input,[tabindex="0"]',panel).filter(el=>el.getClientRects().length);
    const first=focusable[0],last=focusable.at(-1);if(!first)return;
    // Fokus mimo panel (např. po kliknutí do prázdné plochy) se vrací do menu, nikdy ven ze stránky.
    if(!panel.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus();}
    else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});

// Text roll na odkazech a tlačítkách (initRoll).
const ROLL_EASE='cubic-bezier(.16,1,.3,1)';
function initRoll(){
  // Jen prvky z návrhu (stránky .dc-root a chrome .dc-chrome); starší obsah má dlouhé odkazy (URL), které by nowrap roll vytlačil mimo stránku.
  const scope=':is(.dc-root,.dc-chrome) :is(a, button)';
  const targets=$$(scope).map(el=>({el,host:el})).concat($$(':is(.dc-root,.dc-chrome) [data-roll-target]').map(el=>({el,host:el.closest('a, button')||el})));
  for(const {el,host} of targets){
    if(el.dataset.roll)continue;
    const tn=[...el.childNodes].find(n=>n.nodeType===3&&n.nodeValue.trim().length>1);if(!tn)continue;
    el.dataset.roll='1';
    const wrap=document.createElement('span');wrap.style.cssText='display:inline-block;position:relative;overflow:hidden;vertical-align:middle;line-height:inherit;padding-bottom:0.14em;margin-bottom:-0.14em';
    const a=document.createElement('span');a.className='roll-a';a.style.cssText='display:block;white-space:nowrap;transition:transform 650ms '+ROLL_EASE;
    const b=document.createElement('span');b.setAttribute('aria-hidden','true');b.style.cssText='position:absolute;left:0;top:100%;display:block;white-space:nowrap;transition:transform 650ms '+ROLL_EASE;
    el.insertBefore(wrap,tn);a.appendChild(tn);wrap.append(a,b);b.textContent=tn.nodeValue.trim();
    host.addEventListener('mouseenter',()=>{b.textContent=a.textContent.trim();a.style.transform='translateY(-105%)';b.style.transform='translateY(-100%)';});
    host.addEventListener('mouseleave',()=>{a.style.transform='';b.style.transform='';});
  }
}
const setLabel=(el,text)=>{const a=$('.sc-interp',el)||$('.roll-a',el);if(a)a.textContent=text;else{const tn=[...el.childNodes].find(n=>n.nodeType===3&&n.nodeValue.trim());if(tn)tn.nodeValue=text+' ';}};
initRoll();

// Videa: ztlumená, mimo obrazovku pauza.
const heroVideo=$('video[data-video="hero"]'),playBtn=$('[data-video-toggle]'),soundBtn=$('[data-sound-toggle]');
const mediaControls=$('[data-media-controls]'),mobileMedia=$('[data-mobile-media]'),wideMedia=matchMedia('(min-width:1000px)');
const placeMedia=()=>{if(mediaControls&&mobileMedia)(wideMedia.matches?$('#ana-rail'):mobileMedia).append(mediaControls);};
placeMedia();wideMedia.addEventListener('change',placeMedia);
// Ambient: skladba je rozsekaná na části (/media/ambient/NN.mp3) s 4s překryvem. Každá nová návštěva začne náhodnou
// částí, další části navazují s prolnutím a po poslední se pokračuje první. Pozice se drží v sessionStorage (čas běží
// dál i během přechodu mezi stránkami), vypnutí v localStorage. Bez gesta prohlížeč zvuk nepustí, proto se rozjede
// při první interakci se stránkou. Ovládá se tlačítky v boční liště (na mobilu pod hero).
const AMB_PARTS=10,AMB_XFADE=4,AMB_VOL=0.6,AMB_KEY='ana-ambient',AMB_OFF='ana-ambient-off';
const ambSrc=i=>`/media/ambient/${String(i+1).padStart(2,'0')}.mp3`;
const ambDecks=[0,1].map(()=>Object.assign(new Audio(),{preload:'none',volume:0}));
let ambCur=0,ambPart=0,ambStarted=false,ambSavedAt=0,ambXfading=false,ambPaused=true;
let ambOff=false;try{ambOff=localStorage.getItem(AMB_OFF)==='1';}catch{}
let ambState=null;try{ambState=JSON.parse(storage?.getItem(AMB_KEY)||'null');}catch{}
const videoLabel=()=>{if(!playBtn)return;const paused=heroVideo?heroVideo.paused:ambPaused,label=paused?(heroVideo?'Prehrať video':'Spustiť zvuk'):(heroVideo?'Pozastaviť video':'Pozastaviť zvuk');playBtn.setAttribute('aria-pressed',String(paused));playBtn.setAttribute('aria-label',label);playBtn.title=label;setLabel(playBtn,label);};
const soundLabel=()=>{if(!soundBtn)return;const on=!ambPaused,label=on?'Vypnúť zvuk':'Zapnúť zvuk';setLabel(soundBtn,on?'Zvuk zapnutý':'Zvuk vypnutý');soundBtn.setAttribute('aria-pressed',String(on));soundBtn.setAttribute('aria-label',label);soundBtn.title=label;if(!heroVideo)videoLabel();};
const ambFades=new WeakMap();
function ambFadeTo(el,target,ms){
  cancelAnimationFrame(ambFades.get(el));const from=el.volume,t0=performance.now();
  return new Promise(done=>{const step=now=>{const k=Math.min(1,(now-t0)/ms);el.volume=Math.min(1,Math.max(0,from+(target-from)*k));if(k<1)ambFades.set(el,requestAnimationFrame(step));else done();};ambFades.set(el,requestAnimationFrame(step));});
}
function ambSave(){
  const el=ambDecks[ambCur];
  if(!ambStarted||!Number.isFinite(el.currentTime))return;
  try{storage?.setItem(AMB_KEY,JSON.stringify({part:ambPart,pos:el.currentTime,at:Date.now()}));}catch{}
}
function ambLoad(el,part){
  el.src=ambSrc(part);el.preload='auto';
  return el.readyState>=1?Promise.resolve():new Promise((ok,fail)=>{el.addEventListener('loadedmetadata',ok,{once:true});el.addEventListener('error',()=>fail(new Error('AMBIENT_LOAD')),{once:true});});
}
async function ambPlay(){
  ambPaused=false;
  const el=ambDecks[ambCur];
  try{
    if(!ambStarted){
      let part=Math.floor(Math.random()*AMB_PARTS),pos=0;
      if(ambState&&Number.isInteger(ambState.part)&&ambState.part>=0&&ambState.part<AMB_PARTS&&Number.isFinite(ambState.pos)){
        part=ambState.part;pos=ambState.pos+Math.max(0,(Date.now()-(ambState.at||Date.now()))/1000);
      }
      await ambLoad(el,part);
      // Čas strávený mimo web může přeskočit i celou část – posuneme se o odpovídající počet částí.
      const len=Math.max(1,el.duration-AMB_XFADE);
      if(pos>=len){part=(part+Math.floor(pos/len))%AMB_PARTS;pos%=len;await ambLoad(el,part);}
      ambPart=part;el.currentTime=pos;ambStarted=true;
    }
    await el.play();
  }catch(error){ambPaused=true;soundLabel();throw error;}
  soundLabel();ambSave();ambFadeTo(el,AMB_VOL,900);
}
async function ambStop(){
  ambPaused=true;soundLabel();ambSave();
  await Promise.all(ambDecks.map(el=>ambFadeTo(el,0,400)));
  if(ambPaused)ambDecks.forEach(el=>el.pause());
}
async function ambNext(){
  // Přechod na další část: druhý přehrávač naběhne z ticha, aktuální dozní. Části se překrývají o AMB_XFADE sekund.
  if(ambXfading||ambPaused)return;ambXfading=true;
  const from=ambDecks[ambCur],to=ambDecks[1-ambCur],next=(ambPart+1)%AMB_PARTS;
  try{
    await ambLoad(to,next);to.currentTime=0;to.volume=0;await to.play();
    ambCur=1-ambCur;ambPart=next;ambSave();
    await Promise.all([ambFadeTo(to,AMB_VOL,AMB_XFADE*1000),ambFadeTo(from,0,AMB_XFADE*1000)]);
    from.pause();from.removeAttribute('src');from.load();
  }catch{
    // Další část se nenačetla – aktuální přehrajeme znovu, ať zvuk nevypadne.
    from.currentTime=0;
  }finally{ambXfading=false;}
}
ambDecks.forEach(el=>{
  el.addEventListener('timeupdate',()=>{
    if(el!==ambDecks[ambCur])return;
    if(Number.isFinite(el.duration)&&el.currentTime>=el.duration-AMB_XFADE)ambNext();
    const now=Date.now();if(now-ambSavedAt>2000){ambSavedAt=now;ambSave();}
  });
  el.addEventListener('ended',()=>{if(el===ambDecks[ambCur])ambNext();});
});
const ambUnlockEvents=['pointerdown','keydown','touchend'];
function ambUnlock(event){
  if(event.target.closest?.('[data-sound-toggle],[data-video-toggle]'))return;
  ambUnlockEvents.forEach(t=>document.removeEventListener(t,ambUnlock,true));
  if(!ambOff&&ambPaused)ambPlay().catch(()=>{});
}
const toggleAmbient=async()=>{
  if(!ambPaused){ambOff=true;try{localStorage.setItem(AMB_OFF,'1');}catch{}await ambStop();return;}
  ambOff=false;try{localStorage.removeItem(AMB_OFF);}catch{}
  try{await ambPlay();}catch(error){if(error.name!=='AbortError')toast('Zvuk sa nepodarilo spustiť. Skúste to znova.');}
};
heroVideo?.addEventListener('play',videoLabel);heroVideo?.addEventListener('pause',videoLabel);videoLabel();soundLabel();
let userPaused=false;
const vio=new IntersectionObserver(es=>es.forEach(en=>{const v=en.target;if(en.isIntersecting&&!(v===heroVideo&&userPaused)&&!reducedMotion.matches)v.play?.().catch(()=>{});else if(!en.isIntersecting)v.pause?.();}));
$$('video').forEach(v=>{v.muted=true;if(reducedMotion.matches){v.autoplay=false;v.pause();}vio.observe(v);});
playBtn?.addEventListener('click',()=>{if(!heroVideo){toggleAmbient();return;}if(heroVideo.paused){userPaused=false;heroVideo.play().catch(()=>toast('Video sa nepodarilo spustiť.'));}else{userPaused=true;heroVideo.pause();}videoLabel();});
soundBtn?.addEventListener('click',toggleAmbient);
addEventListener('pagehide',ambSave);
document.addEventListener('visibilitychange',()=>{if(document.hidden)ambSave();});
if(!ambOff)ambPlay().catch(()=>ambUnlockEvents.forEach(t=>document.addEventListener(t,ambUnlock,{capture:true,passive:true})));

// Newsletter: v náhľade sa nič neodosiela.
$$('form[data-newsletter]').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();if(form.elements.email.value.includes('@'))setLabel($('button',form),'Ďakujeme');}));

// Reveal, parallax, hero fade, tón lišty (initFx) + O Lucii linky (initTrust).
const motion=!reducedMotion.matches;
if(motion&&$('.dc-root')){
  const ease='cubic-bezier(.16,1,.3,1)';
  const els=$$('section h1, section h2, section h3, section p, section article, section li, section form, footer p, footer form').filter(el=>!el.closest('aside')&&!el.closest('article p'));
  const io=new IntersectionObserver(entries=>entries.forEach(en=>{if(!en.isIntersecting)return;const el=en.target;io.unobserve(el);el.style.willChange='opacity, transform';el.style.opacity='1';el.style.transform='translate3d(0,0,0)';setTimeout(()=>{el.style.willChange='auto';},1600);}),{rootMargin:'0px 0px -6% 0px',threshold:0.01});
  els.forEach(el=>{const i=[...el.parentElement.children].indexOf(el)%6;el.style.opacity='0';el.style.transform='translate3d(0,28px,0)';el.style.transition='opacity 1100ms '+ease+', transform 1300ms '+ease;el.style.transitionDelay=(i*80)+'ms';io.observe(el);});
  addEventListener('beforeprint',()=>els.forEach(el=>{el.style.opacity='1';el.style.transform='none';}));
  const trust=$('[data-screen-label="01b Dôvera"]');
  if(trust){
    const paths=$$('svg path, svg circle',trust);
    paths.forEach((p,i)=>{const L=(p.getTotalLength?p.getTotalLength():80)+2;p.style.strokeDasharray=L;p.style.strokeDashoffset=L;p.style.transition='stroke-dashoffset 1800ms cubic-bezier(.65,0,.35,1) '+(300+i*180)+'ms';});
    const tio=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){paths.forEach(p=>{p.style.strokeDashoffset='0';});tio.disconnect();}}),{threshold:0.3});tio.observe(trust);
    addEventListener('beforeprint',()=>paths.forEach(p=>{p.style.strokeDashoffset='0';}));
  }
}
{
  const hero=$('[data-screen-label="01 Hero"]'),heroContent=hero?.lastElementChild;
  if(heroContent&&motion)heroContent.style.willChange='opacity, transform';
  const pars=$$('[data-screen-label="04 RESET 40+"], [data-screen-label="07 Zdravý svet"], [data-screen-label="07 Vízia"]').map(el=>({el,layer:$('[data-par]',el),vid:$('video',el)}));
  if(motion)pars.forEach(p=>{if(p.layer)p.layer.style.transform='translate3d(0,0,0) scale(1.12)';});
  let tops=[],vh=innerHeight;
  const measure=()=>{vh=innerHeight;const sy=scrollY;tops=pars.map(p=>{const r=p.el.getBoundingClientRect();return{top:r.top+sy,h:r.height};});};
  measure();
  const rail=$('#ana-rail');let tone=null;
  const lum=c=>{const m=c.match(/[\d.]+/g);if(!m)return 0;const a=m[3]===undefined?1:+m[3];if(a<0.5)return -1;return(0.299*m[0]+0.587*m[1]+0.114*m[2])/255;};
  const setTone=t=>{
    if(!rail||t===tone)return;tone=t;const light=t==='light';
    rail.style.background=light?'linear-gradient(100deg,rgba(255,255,255,0.1) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.06) 100%)':'linear-gradient(100deg,rgba(255,255,255,0.16) 0%,rgba(255,255,255,0.05) 45%,rgba(255,255,255,0.02) 70%,rgba(255,255,255,0.09) 100%),rgba(30,38,25,0.16)';
    rail.style.color=light?'#283020':'#EFE5C7';rail.style.borderRightColor=light?'rgba(40,48,32,0.08)':'rgba(255,255,255,0.24)';
    $$('div',rail).forEach(d=>{if(d.style.borderBottom||d.style.borderTop)d.style.borderColor=light?'rgba(40,48,32,0.1)':'rgba(255,255,255,0.16)';});
  };
  const toneAt=y=>{
    let el=document.elementFromPoint(80,Math.max(0,Math.min(innerHeight-1,y)));
    while(el){if(!el.closest('aside')){const cs=getComputedStyle(el);if(el.tagName==='VIDEO'||el.hasAttribute('data-par')||/url\(/.test(cs.backgroundImage))return 'dark';const colors=(cs.backgroundImage.match(/rgba?\([^)]*\)/g)||[]).map(lum).filter(L=>L>=0);if(colors.length)return colors.reduce((a,b)=>a+b,0)/colors.length>0.62?'light':'dark';const L=lum(cs.backgroundColor);if(L>=0)return L>0.62?'light':'dark';}el=el.parentElement;}
    return 'dark';
  };
  const probe=()=>{
    if(!rail||!rail.getClientRects().length||menuOpen)return;
    setTone(toneAt(innerHeight/2));
    // Lišta může současně překrývat světlou i tmavou sekci.
    // Každá ikona a popisek proto čte pozadí ve své vlastní výšce.
    $$('a,button',rail).forEach(control=>{const r=control.getBoundingClientRect(),t=toneAt(r.top+r.height/2);if(control.dataset.railTone===t)return;control.dataset.railTone=t;control.style.color=t==='light'?'#283020':'#EFE5C7';$$('img',control).forEach(img=>{img.style.filter=t==='light'?'brightness(0.22) sepia(0.4)':'none';});});
  };
  const fxFrame=()=>{
    probe();
    if(!motion)return;
    const y=lenis?lenis.scroll:scrollY;
    if(hero&&heroContent&&y<vh*1.3){heroContent.style.opacity=Math.max(0,1-y/(vh*0.7)).toFixed(3);heroContent.style.transform='translate3d(0,'+(-y*0.12).toFixed(1)+'px,0)';}
    const prog=r=>Math.max(-1,Math.min(1,(r.top+r.height/2-vh/2)/(vh/2+r.height/2)));
    pars.forEach((p,i)=>{const t=tops[i];if(!t)return;const r={top:t.top-y,height:t.h,bottom:t.top-y+t.h};if(!p.layer||p.vid||r.bottom< -150||r.top>vh+150)return;const k=prog(r);p.layer.style.transform='translate3d(0,'+(-k*r.height*0.11).toFixed(2)+'px,0) scale('+(1.06+Math.max(0,k)*0.1).toFixed(4)+')';});
  };
  const onMeasure=()=>{measure();fxFrame();};
  addEventListener('resize',onMeasure);document.fonts?.ready.then(onMeasure);setTimeout(onMeasure,1500);
  let ticking=false;
  addEventListener('scroll',()=>{if(lenis||ticking)return;ticking=true;requestAnimationFrame(()=>{ticking=false;fxFrame();});},{passive:true});
  if(motion&&window.Lenis){
    lenis=new window.Lenis({lerp:0.09,smoothWheel:true,wheelMultiplier:1,touchMultiplier:1,syncTouch:false,autoRaf:false,anchors:{duration:1.8,easing:t=>(t<0.5?8*t*t*t*t:1-Math.pow(-2*t+2,4)/2)}});
    window.__anaLenis=lenis;lenis.on('scroll',fxFrame);
    const raf=time=>{lenis.raf(time);requestAnimationFrame(raf);};requestAnimationFrame(raf);
  }
  fxFrame();
}

document.addEventListener('click',async event=>{
  const add=event.target.closest('[data-add]');
  if(add){const result=await api.addToCart(add.dataset.add);updateCount();if(!add.closest('.dc-root')||result.ok===false)toast(result.message);else{const fg=add.style.color;setLabel(add,'Pridané');add.style.color='#C9A355';clearTimeout(add._t);add._t=setTimeout(()=>{setLabel(add,'Do košíka');add.style.color=fg;},1600);}return;}
  const a=event.target.closest('a[href]');
  if(!a||a.target||a.download||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
  const url=new URL(a.href,location.href);
  if(url.origin!==location.origin||url.pathname===location.pathname&&url.search===location.search&&url.hash||reducedMotion.matches)return;
  event.preventDefault();$('.page-transition').classList.add('active');setTimeout(()=>location.assign(url.href),220);
});
window.addEventListener('pageshow',()=>{$('.page-transition').classList.remove('active');if(menuOpen)setMenu(null);updateCount();});

const filterForm=$('.catalog-controls');
if(filterForm){
  const params=new URLSearchParams(location.search);
  for(const name of ['category','search','filter'])if(params.has(name))filterForm.elements[name].value=params.get(name);
  let renderSequence=0;const render=async()=>{const sequence=++renderSequence;const query=Object.fromEntries(new FormData(filterForm));const products=await api.getProducts(query);if(sequence!==renderSequence)return;$('#catalog-results').innerHTML=products.length?products.map(card).join(''):'<div class="empty-state"><h2>Nič sme nenašli.</h2><p>Skúste iný názov alebo kategóriu.</p><button class="button outline" type="button" id="reset-filters">Zobraziť všetko</button></div>';$('.result-count').textContent=`${products.length} produktov`;
    $$('[data-catalog-category]').forEach(link=>{if(link.dataset.catalogCategory===query.category)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    const search=new URLSearchParams(Object.entries(query).filter(([,v])=>v));history.replaceState(null,'',location.pathname+(search.size?'?'+search:''));
    $('#reset-filters')?.addEventListener('click',()=>{for(const name of ['search','category','filter'])filterForm.elements[name].value='';render();});
  };
  filterForm.addEventListener('input',render);filterForm.addEventListener('submit',ev=>{ev.preventDefault();render();});render();
}
$('.add-product')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const result=await api.addToCart(form.dataset.code,Number(form.elements.quantity.value));$('.form-status',form.parentElement).textContent=result.message;toast(result.message);updateCount();});

const summary=cart=>`<h2>Váš výber</h2>${cart.lines.map(l=>`<div class="summary-row"><span>${e(l.name)} × ${l.quantity}</span><strong>${e(l.priceLabel)}<small> / kus · ukážka</small></strong></div>`).join('')}<div class="summary-row"><span>Kupón</span><strong>${e(cart.discountLabel)}</strong></div>${cart.gift_voucher?`<div class="summary-row"><span>Poukaz ${e(cart.gift_voucher.masked_code)}</span><strong>${e(cart.gift_voucher.amountLabel)}</strong></div><p class="fine-print">Zostatok poukazu pred čerpaním: ${e(cart.gift_voucher.balanceLabel)}</p>`:''}<div class="summary-row"><span>Celkom</span><strong>${e(cart.totalLabel)}</strong></div><p class="fine-print">Finálne ceny, zľavy a dopravu určí server po napojení. V náhľade sa peniaze nepočítajú.</p>`;
async function renderCart(){
  const target=$('#cart-view');if(!target)return;
  const cart=await api.getCart();
  if(!cart.lines.length){target.innerHTML=`<div class="empty-state"><p class="eyebrow">PRIESTOR PRE VAŠE RITUÁLY</p><h2>Váš košík je zatiaľ prázdny.</h2><p>Vyberte si niečo, čo vám spraví radosť.</p>${button('/eshop','Objaviť obchod')}</div>`;return;}
  target.innerHTML=`<div class="cart-layout"><div>${cart.lines.map(l=>`<article class="cart-line"><img src="${l.image}" alt="" width="95" height="116"><div><h2><a href="${l.giftVoucher?'/darcekovy-poukaz':'/eshop/produkt/'+e(l.slug)}">${e(l.name)}</a></h2><p>${e(l.priceLabel)} / kus · ukážka</p><div class="quantity"><button data-quantity="${l.quantity-1}" data-slug="${l.slug}" aria-label="Znížiť množstvo: ${e(l.name)}">−</button><span aria-label="Množstvo">${l.quantity}</span><button data-quantity="${l.quantity+1}" data-slug="${l.slug}" ${l.quantity>=99?'disabled':''} aria-label="Zvýšiť množstvo: ${e(l.name)}">+</button></div></div><button class="remove-line" data-quantity="0" data-slug="${l.slug}" aria-label="Odstrániť ${e(l.name)}">Odstrániť</button></article>`).join('')}<form class="coupon-form"><div class="coupon-input"><label>Zľavový kupón<input name="coupon" value="${e(cart.coupon)}" placeholder="Ukážkový kód DEMO10" maxlength="100" required></label><button class="button outline" type="submit">Použiť</button></div><p class="form-status" role="status"></p>${cart.coupon?'<button type="button" id="remove-coupon" class="text-link">Odstrániť kupón</button>':''}</form><form id="redeem-voucher-form"><label>Kód darčekového poukazu<input name="code" required maxlength="100" placeholder="Ukážkový kód DEMO-GIFT" autocomplete="off"></label><button class="button outline" type="submit">Uplatniť poukaz</button><p class="form-status" role="status"></p></form>${cart.gift_voucher?'<button type="button" id="remove-voucher" class="text-link">Odstrániť poukaz</button>':''}</div><aside class="order-summary">${summary(cart)}${button('/pokladna','Pokračovať na objednávku')}</aside></div>`;
  $$('[data-quantity]',target).forEach(btn=>btn.addEventListener('click',async()=>{const slug=btn.dataset.slug,q=Number(btn.dataset.quantity);const result=await api.setQuantity(slug,q);if(!result.ok){toast(result.message);return;}await renderCart();updateCount();const remaining=$$('[data-slug]',target).find(el=>el.dataset.slug===slug);(remaining||$('a',target))?.focus();}));
  $('.coupon-form',target).addEventListener('submit',async event=>{event.preventDefault();const result=await api.applyCoupon(event.currentTarget.elements.coupon.value);if(result.ok)await renderCart();$('.coupon-form .form-status',target).textContent=result.message;});
  $('#redeem-voucher-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;if(form.dataset.busy)return;form.dataset.busy='1';try{const result=await api.applyGiftVoucher(form.elements.code.value);if(result.ok)await renderCart();$('#redeem-voucher-form .form-status').textContent=result.message;}finally{delete form.dataset.busy;}});
  $('#remove-voucher')?.addEventListener('click',async()=>{await api.removeGiftVoucher();await renderCart();});
  $('#remove-coupon')?.addEventListener('click',async()=>{await api.removeCoupon();await renderCart();});
}
if($('#cart-view')){
  if(location.pathname.replace(/\/$/,'')==='/eshop/kosik'){$('.qr-status').textContent=(await api.importQr(new URLSearchParams(location.search))).message;updateCount();}
  renderCart();
}

const checkoutForm=$('#checkout-form');
if(checkoutForm){
  const cart=await api.getCart();$('#checkout-summary').innerHTML=summary(cart);
  if(!cart.lines.length){checkoutForm.innerHTML=`<div class="empty-state"><h2>Najprv si niečo vyberte.</h2>${button('/eshop','Prejsť do obchodu')}</div>`;}
  else{
    const step=n=>{$$('fieldset[data-step]',checkoutForm).forEach(el=>{el.hidden=Number(el.dataset.step)!==n;el.disabled=el.hidden;});$$('[data-step-label]').forEach(el=>el.classList.toggle('current',Number(el.dataset.stepLabel)===n));const first=$(`fieldset[data-step="${n}"] input`,checkoutForm);first?.focus();};
    $$('[data-next]',checkoutForm).forEach(btn=>btn.addEventListener('click',()=>{if(checkoutForm.reportValidity())step(Number(btn.dataset.next));}));
    $$('[data-back]',checkoutForm).forEach(btn=>btn.addEventListener('click',()=>step(Number(btn.dataset.back))));
    $$('[name=delivery]',checkoutForm).forEach(el=>el.addEventListener('change',()=>{const shipping=checkoutForm.elements.delivery.value==='shipping';$('#address-fields').hidden=!shipping;$$('#address-fields input').forEach(input=>{input.required=shipping;input.disabled=!shipping;});}));
    checkoutForm.addEventListener('submit',async event=>{event.preventDefault();const current=$('fieldset:not([hidden])',checkoutForm);if(current.dataset.step!=='3'){if(checkoutForm.reportValidity())step(Number(current.dataset.step)+1);return;}
      const result=await api.checkout({scenario:checkoutForm.elements.scenario.value});const output=$('#checkout-result');output.dataset.state=result.status;output.textContent=result.messages;output.focus();
    });
  }
}
$('#login-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;$('.form-status',form).textContent=(await api.requestMagicLink(form.elements.email.value)).message;});
if($('#magic-confirm')){$('#magic-confirm').textContent=(await api.confirmMagicLink()).message;history.replaceState(null,'',location.pathname);}
$('#contact-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;$('.form-status',form).textContent=(await api.sendContact(Object.fromEntries(new FormData(form)))).message;});
const entitlementSelect=$('#entitlement-preview');
if(entitlementSelect){const render=async()=>{const access=await api.getEntitlements({preview:entitlementSelect.value});$('#library-view').innerHTML=access.active?`<p class="form-status">Ukážka aktívneho prístupu. Všetky lekcie sú iba zástupný obsah.</p><div class="library-grid">${access.weeks.map(w=>`<article class="lesson"><span class="eyebrow">TÝŽDEŇ ${String(w.number).padStart(2,'0')}</span><h2>${w.title}</h2><p>${w.description}</p><button class="button outline" data-lesson="${w.number}">Pozrieť náhľad ${arrow}</button></article>`).join('')}</div><div id="lesson-content" class="form-status" tabindex="-1" hidden></div>`:`<div class="empty-state"><p class="eyebrow">ZAMKNUTÁ KNIŽNICA</p><h2>Tento priestor čaká na vás.</h2><p>Program je dostupný len s aktívnym oprávnením.<br>Po napojení sa prístup overí na serveri.</p>${button('/prihlasenie','Prihlásiť sa')}${button('/reset-40','O programe','outline')}</div>`;
    $$('[data-lesson]').forEach(btn=>btn.addEventListener('click',()=>{const content=$('#lesson-content');content.hidden=false;content.textContent=`Týždeň ${btn.dataset.lesson} — náhľad. Sem patrí schválený obsah lekcie. Platené materiály nie sú súčasťou tejto kostry.`;content.focus();}));};entitlementSelect.addEventListener('change',render);render();}
$('#clear-demo')?.addEventListener('click',async()=>{for(const line of (await api.getCart()).lines)await api.setQuantity(line.slug,0);await api.removeCoupon();try{storage?.removeItem('anastasia.skeleton.v1');}catch{}updateCount();$('.form-status').textContent='Ukážkový košík bol vymazaný.';});

// A short ripple every twelve seconds, applied only to the logo.
const brandWave=document.querySelector('[data-brand-wave]');
if(brandWave){const start=performance.now();const ripple=now=>{const phase=((now-start)%12000)/12000;brandWave.setAttribute('scale',reducedMotion.matches?'0':String(phase>.72&&phase<.88?Math.sin((phase-.72)/.16*Math.PI)*10:0));requestAnimationFrame(ripple);};requestAnimationFrame(ripple);}
const skyWindow=document.querySelector('.sky-window'),skySpill=document.querySelector('.sky-spill video');
if(skyWindow&&skySpill){const original=skyWindow.querySelector('video');const sizeSky=()=>{const box=skyWindow.getBoundingClientRect(),section=skySpill.parentElement.getBoundingClientRect();const width=Math.max(box.width,box.height*(original.videoWidth/original.videoHeight||16/9));Object.assign(skySpill.style,{width:width+'px',height:box.height+'px',left:(box.left-section.left+(box.width-width)/2)+'px',top:(box.top-section.top)+'px'});};new ResizeObserver(sizeSky).observe(skyWindow);original.addEventListener('loadedmetadata',sizeSky);original.addEventListener('play',()=>{skySpill.currentTime=original.currentTime;});sizeSky();}
