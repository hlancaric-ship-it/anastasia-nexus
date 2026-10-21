import {isMediaUrl} from '/lib/media-url.mjs';
import {initDigitalProduct} from '/digital-product.mjs';
import {bindProductPurchase} from '/purchase.mjs';
import '/config.mjs';
import {createApi} from '/lib/api/index.mjs';
import {escape as e,card,arrow,button} from '/components.mjs';
import {createAmbient} from '/ambient.mjs';
import {init as i18nInit} from '/i18n.mjs';
import {initCookieConsent,requireDecision,hasConsentDecision} from '/consent.mjs';
import {initWithdrawalForm} from '/withdrawal-form.mjs';
// Lišta cookies a panel nastavení: bez rozhodnutia zákazníka sa nenačíta žiadny skript tretej strany.
// Beží pred pripojením k obchodu – súhlas nesmie závisieť od dostupnosti backendu.
initCookieConsent();
// Stripe je jediný skript tretej strany na webe (platobná brána). Načíta sa až potom,
// čo zákazník rozhodne o cookies – do tej chvíle web nenačíta nič cudzie.
const loadStripeScript=async()=>{
  if(window.Stripe)return window.Stripe;
  await requireDecision();
  return new Promise((res,rej)=>{if(window.Stripe)return res(window.Stripe);const s=document.createElement('script');s.src='https://js.stripe.com/v3';s.onload=()=>res(window.Stripe);s.onerror=()=>rej(new Error('STRIPE_LOAD'));document.head.appendChild(s);});
};
let storage;try{storage=window.sessionStorage;}catch{}
const api=createApi(storage);
const $=(s,root=document)=>root.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
let toastTimeout;
function toast(message){const el=$('.toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{el.hidden=true;},4500);}
async function updateCount(){const count=(await api.getCart()).lines.reduce((sum,line)=>sum+line.quantity,0);$$('.cart-count').forEach(el=>el.textContent=String(count));}
updateCount().catch(()=>{});
for(const link of $$('[data-global-account]')) {
  Promise.resolve().then(()=>typeof api.isLoggedIn==='function'&&api.isLoggedIn()).then(logged=>{if(logged){link.href='/ucet';link.querySelector('span').textContent='Môj účet';}}).catch(()=>{});
}
// Kolekcia na úvode: karty z buildu sú prázdne, plníme ich produktmi z backendu; čo nemá produkt, skryjeme.
const kolTrack=$('.kol-track');
if(kolTrack)(async()=>{
  let products=[];try{products=(await api.getProducts()).slice(0,kolTrack.children.length);}catch{products=[];}
  [...kolTrack.children].forEach((cardEl,i)=>{
    const p=products[i];if(!p){cardEl.remove();return;}
    const f=$$('.sc-interp',cardEl);if(f[1])f[1].textContent=p.category;if(f[2])f[2].textContent=p.category;if(f[3])f[3].textContent=p.priceLabel;if(f[4])f[4].textContent=p.name;
    const img=$$('[style*="background-image"]',cardEl)[0];if(img)img.style.backgroundImage=`url("${encodeURI(p.image)}")`;
    const add=$('[data-add]',cardEl);if(add)add.dataset.add=p.code;
  });
  kolTrack.dataset.ready='';
  if(!products.length)kolTrack.closest('section')?.querySelector('.kol-tabs')?.insertAdjacentHTML('afterend','<p class="form-status">Produkty sa teraz nepodarilo načítať.</p>');
})();

const customerCenter=$('.customer-center');
if(customerCenter){
  // Barva účtu: platné id přijdou z vyrenderovaných swatchů, první je výchozí (bez atributu). Uloženo jen v prohlížeči.
  const themeIds=[...new Set($$('[data-center-theme-pick]',customerCenter).map(btn=>btn.dataset.centerThemePick))];
  const markTheme=id=>$$('[data-center-theme-pick]',customerCenter).forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.centerThemePick===id)));
  const setTheme=id=>{if(!themeIds.includes(id))id=themeIds[0];if(id===themeIds[0])delete document.documentElement.dataset.centerTheme;else document.documentElement.dataset.centerTheme=id;markTheme(id);try{if(id===themeIds[0])localStorage.removeItem('ana-center-theme');else localStorage.setItem('ana-center-theme',id);}catch{}};
  markTheme(document.documentElement.dataset.centerTheme||themeIds[0]);
  $$('[data-center-theme-pick]',customerCenter).forEach(btn=>btn.addEventListener('click',()=>setTheme(btn.dataset.centerThemePick)));
  const titles={prehlad:'Vitajte vo svojom priestore.',programy:'Moje programy.',konzultacie:'Konzultácie.',chat:'Chat s Luciou.',klub:'Klub ANASTASIA.',objednavky:'Objednávky.',materialy:'Materiály.',profil:'Môj profil.'};
  const show=id=>{if(!Object.hasOwn(titles,id))id='prehlad';$$('[data-account-panel]',customerCenter).forEach(panel=>{panel.hidden=panel.dataset.accountPanel!==id;});$$('.center-sidebar [data-account-go]',customerCenter).forEach(btn=>btn.setAttribute('aria-current',btn.dataset.accountGo===id?'page':'false'));$('#account-title').textContent=titles[id];requestAnimationFrame(()=>{const active=$('.center-sidebar [aria-current=page]',customerCenter),nav=active?.parentElement;if(active&&nav&&nav.scrollWidth>nav.clientWidth){const a=active.getBoundingClientRect(),n=nav.getBoundingClientRect(),style=getComputedStyle(nav),left=n.left+parseFloat(style.paddingLeft),right=n.right-parseFloat(style.paddingRight);if(a.left<left)nav.scrollLeft+=a.left-left;else if(a.right>right)nav.scrollLeft+=a.right-right;}});return id;};
  show(location.hash.slice(1));
  $$('[data-account-go]',customerCenter).forEach(btn=>btn.addEventListener('click',()=>{const id=show(btn.dataset.accountGo);history.pushState(null,'',`/ucet#${id}`);$('#account-title').focus({preventScroll:true});}));
  addEventListener('popstate',()=>show(location.hash.slice(1)));
  addEventListener('hashchange',()=>show(location.hash.slice(1)));
  $$('[data-material-filter]',customerCenter).forEach(btn=>btn.addEventListener('click',()=>{const filter=btn.dataset.materialFilter;$$('[data-material-filter]',customerCenter).forEach(item=>item.setAttribute('aria-pressed',String(item===btn)));$$('[data-material-category]',customerCenter).forEach(row=>{row.hidden=!!filter&&row.dataset.materialCategory!==filter;});}));
  $('#center-profile').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,send=$('button[type=submit]',form);if(send.disabled)return;send.disabled=true;try{$('.form-status',form).textContent=(await api.saveCustomerProfile(Object.fromEntries(new FormData(form)))).message;}catch{$('.form-status',form).textContent='Zmeny sa nepodarilo skontrolovať. Skúste to znova.';}finally{send.disabled=false;}});
  // Údaje účtu len z backendu (pri builde sa nič negeneruje). Bez prihlásenia ani pri chybe nič nevymýšľame.
  (async()=>{
    const put=(sel,html)=>$$(sel,customerCenter).forEach(el=>{el.innerHTML=html;});
    const note=text=>`<p class="form-status">${e(text)}</p>`;
    if(!(typeof api.isLoggedIn==='function'&&await api.isLoggedIn())){put('#center-next-booking,#center-last-order,#center-bookings,#center-orders',note('Pre zobrazenie účtu sa prihláste.'));$('.center-content',customerCenter).insertAdjacentHTML('afterbegin',`<div class="empty-state"><h2>Pre zobrazenie účtu sa prihláste.</h2>${button('/prihlasenie','Prihlásiť sa')}</div>`);return;}
    let account,data;
    try{[account,data]=await Promise.all([api.getAccount(),api.getCustomerCenter()]);}catch{account={ok:false,orders:[]};data={ok:false,bookings:[],reorder:[]};}
    const unavailable=note('Údaje sa teraz nepodarilo načítať. Skúste stránku obnoviť.');
    if(data.ok&&data.profile){
      const pr=data.profile;$('#center-name').textContent=pr.name||pr.email;
      const form=$('#center-profile');Object.entries(pr).forEach(([k,v])=>{if(form.elements[k])form.elements[k].value=v||'';});
    }
    if(account.ok){
      const o=account.orders;
      put('#center-last-order',o.length?`<h2>${e(o[0].number)}</h2><p>${e(o[0].status)}</p>`:note('Zatiaľ nemáte žiadnu objednávku.'));
      put('#center-orders',o.length?o.map(order=>`<article class="center-order"><div><strong>${e(order.number)}</strong><small>${e(order.date)}</small></div><span>${e(order.product)}</span><span>${e(order.totalLabel)}</span><span class="center-chip">${e(order.status)}</span><a class="text-link" href="/kontakt">Otázka k objednávke ${arrow}</a></article>`).join(''):note('Zatiaľ nemáte žiadnu objednávku.'));
    }else put('#center-last-order,#center-orders',unavailable);
    if(data.ok&&data.bookingsOk){
      const b=data.bookings,next=b.filter(x=>x.upcoming).at(-1);
      put('#center-next-booking',next?`<div class="center-date"><span>${e(next.day)}<small>${e(next.month)}</small></span><h2>${e(next.title)}</h2></div><p>${e(next.date)}</p>`:note('Nemáte naplánovanú konzultáciu.'));
      put('#center-bookings',b.length?b.map(c=>`<article class="center-card"><div class="center-date"><span>${e(c.day)}<small>${e(c.month)}</small></span><h2>${e(c.title)}</h2></div><p>${e(c.date)} · ${e(c.status)}</p><button type="button" class="button outline" data-account-go="chat">Napísať Lucii ${arrow}</button></article>`).join(''):note('Nemáte naplánovanú konzultáciu.'));
      $$('#center-bookings [data-account-go]',customerCenter).forEach(btn=>btn.addEventListener('click',()=>{const id=show(btn.dataset.accountGo);history.pushState(null,'',`/ucet#${id}`);}));
    }else put('#center-next-booking,#center-bookings',unavailable);
    put('#center-materials',(data.materials||[]).length?(data.materials||[]).map(m=>`<article class="center-material" data-material-category="${e(m.category)}"><h2>${e(m.title)}</h2><span>${e(m.type)}</span></article>`).join(''):note('Zatiaľ tu nemáte žiadne materiály.'));
    put('[data-center-reorder]',(data.reorder||[]).map(p=>`<article class="center-reorder"><img src="${e(p.image)}" alt="" width="60" height="75"><div><h3>${e(p.name)}</h3><p>${e(p.priceLabel)}</p></div><button type="button" class="button outline" data-add="${e(p.code)}">Do košíka</button></article>`).join(''));
  })();
}

const chatErrors={chat_unavailable:'Chat je dočasne nedostupný. Skúste to znova o chvíľu.',chat_not_eligible:'Chat je dostupný po nákupe produktu, programu alebo rezervácii služby.',chat_blocked:'Odosielanie správ je pre váš účet pozastavené. Kontaktujte nás cez kontaktný formulár.',chat_consecutive_limit:'Odoslali ste tri správy po sebe. Počkajte, prosím, na odpoveď Lucie.',chat_daily_limit:'Dosiahli ste denný limit správ. Skúste to znova zajtra.',conversation_closed:'Táto konverzácia je uzavretá. Môžete začať novú konverzáciu.',message_too_long:'Správa môže mať najviac 2000 znakov.',message_empty:'Napíšte správu pred odoslaním.'};
const chatForm=$('#chat-form');
if(chatForm){
  const body=chatForm.elements.body,send=$('button',chatForm),selection=$('#chat-conversation');
  let busy=false,status;
  const count=()=>{const length=Array.from(body.value).length;$('#chat-counter').textContent=`${length} / 2000 znakov`;send.disabled=busy||!status?.can_write||!body.value.trim()||length>2000;};
  const availability=async()=>{status=await api.getChatStatus();const message=chatErrors[status.reason]||'';$('#chat-availability').textContent=message;$('#chat-availability').hidden=!message;count();};
  const detail=async()=>{const id=selection.value;const data=id?await api.getChatConversation(id):{messages:[]};$('#chat-messages').replaceChildren(...data.messages.map(message=>{const article=document.createElement('article');article.className='chat-message';article.dataset.author=message.author;const author=document.createElement('strong');author.textContent=message.author==='lucia'?'Lucia':'Vy';const text=document.createElement('p');text.textContent=message.body;article.append(author,text);return article;}));if(id)await api.markChatRead(id);};
  const list=async(id)=>{const data=await api.getChatConversations();selection.replaceChildren(...data.conversations.map(c=>new Option(c.subject,c.id)));selection.append(new Option('Nová konverzácia',''));if(id!==undefined)selection.value=id;await detail();};
  body.addEventListener('input',count);
  selection.addEventListener('change',()=>{detail();$('.form-status',chatForm).textContent='';});
  $('#chat-new').addEventListener('click',async()=>{selection.value='';await detail();$('.form-status',chatForm).textContent='';body.focus();});
  chatForm.addEventListener('submit',async event=>{event.preventDefault();if(busy||send.disabled)return;busy=true;count();try{const result=await api.sendChatMessage({conversation_id:selection.value||undefined,body:body.value});$('.form-status',chatForm).textContent=result.ok?'Správa bola pridaná do konverzácie.':chatErrors[result.type]||'Správu sa nepodarilo odoslať. Skúste to znova.';if(result.ok){body.value='';await list(result.conversation.id);}await availability();}catch{$('.form-status',chatForm).textContent='Chat je dočasne nedostupný. Skúste to znova.';}finally{busy=false;count();}});
  // Account data must never block the shared menu and page controls.
  void (async()=>{try{await list();await availability();}catch{status={can_write:false};count();$('#chat-availability').hidden=false;$('#chat-availability').textContent=chatErrors.chat_unavailable;}})();
}

const giftForm=$('#gift-voucher-form');
if(giftForm){
  const send=$('button',giftForm),select=giftForm.elements.variant_id;
  try{const product=await api.getGiftVoucherProduct();select.replaceChildren(...product.variants.map(v=>new Option(v.title,v.id)));select.disabled=!product.variants.length;send.disabled=select.disabled;if(select.disabled)$('.form-status',giftForm).textContent='Darčekové poukazy momentálne nie sú dostupné.';}
  catch{$('.form-status',giftForm).textContent='Hodnoty poukazu sa nepodarilo načítať. Skúste to znova.';}
  giftForm.addEventListener('submit',async event=>{event.preventDefault();if(send.disabled)return;send.disabled=true;try{const result=await api.addGiftVoucher({variant_id:select.value,recipient:{name:giftForm.elements.name.value,email:giftForm.elements.email.value,message:giftForm.elements.message.value}});$('.form-status',giftForm).textContent=result.ok?'Poukaz bol pridaný do košíka.':result.message;if(result.ok){giftForm.elements.name.value='';giftForm.elements.email.value='';giftForm.elements.message.value='';await updateCount();}}catch{$('.form-status',giftForm).textContent='Poukaz sa nepodarilo pridať. Skúste to znova.';}finally{send.disabled=false;}});
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
// Ambient (public/ambient.mjs): části s prolínáním, pozice v sessionStorage, vypnutí v localStorage. Bez gesta prohlížeč
// zvuk nepustí, proto se rozjede při první interakci se stránkou. Ovládá se tlačítky v boční liště (na mobilu pod hero).
const AMB_OFF='ana-ambient-off';
let ambOff=false;try{ambOff=localStorage.getItem(AMB_OFF)==='1';}catch{}
const amb=createAmbient({createAudio:()=>new Audio(),raf:f=>requestAnimationFrame(f),caf:id=>cancelAnimationFrame(id),now:()=>performance.now(),storage,onChange:()=>soundLabel()});
const videoLabel=()=>{if(!playBtn)return;const paused=heroVideo?heroVideo.paused:amb.paused,label=paused?(heroVideo?'Prehrať video':'Spustiť zvuk'):(heroVideo?'Pozastaviť video':'Pozastaviť zvuk');playBtn.setAttribute('aria-pressed',String(paused));playBtn.setAttribute('aria-label',label);playBtn.title=label;setLabel(playBtn,label);};
const nextBtn=$('[data-sound-next]');
const soundLabel=()=>{if(nextBtn)nextBtn.hidden=amb.paused;if(!soundBtn)return;const on=!amb.paused,label=on?'Vypnúť zvuk':'Zapnúť zvuk';setLabel(soundBtn,on?'Zvuk zapnutý':'Zvuk vypnutý');soundBtn.setAttribute('aria-pressed',String(on));soundBtn.setAttribute('aria-label',label);soundBtn.title=label;if(!heroVideo)videoLabel();};
const ambUnlockEvents=['pointerdown','keydown','touchend'];
function ambUnlock(event){
  if(event.target.closest?.('[data-sound-toggle],[data-video-toggle]'))return;
  ambUnlockEvents.forEach(t=>document.removeEventListener(t,ambUnlock,true));
  if(!ambOff&&amb.paused)amb.play().catch(()=>{});
}
const toggleAmbient=async()=>{
  if(!amb.paused){ambOff=true;try{localStorage.setItem(AMB_OFF,'1');}catch{}await amb.stop();return;}
  ambOff=false;try{localStorage.removeItem(AMB_OFF);}catch{}
  try{await amb.play();}catch(error){if(error.name!=='AbortError')toast('Zvuk sa nepodarilo spustiť. Skúste to znova.');}
};
heroVideo?.addEventListener('play',videoLabel);heroVideo?.addEventListener('pause',videoLabel);videoLabel();soundLabel();
let userPaused=false;
const vio=new IntersectionObserver(es=>es.forEach(en=>{const v=en.target;if(en.isIntersecting&&!(v===heroVideo&&userPaused)&&!reducedMotion.matches)v.play?.().catch(()=>{});else if(!en.isIntersecting)v.pause?.();}));
$$('video').forEach(v=>{v.muted=true;if(reducedMotion.matches){v.autoplay=false;v.pause();}vio.observe(v);});
playBtn?.addEventListener('click',()=>{if(!heroVideo){toggleAmbient();return;}if(heroVideo.paused){userPaused=false;heroVideo.play().catch(()=>toast('Video sa nepodarilo spustiť.'));}else{userPaused=true;heroVideo.pause();}videoLabel();});
soundBtn?.addEventListener('click',toggleAmbient);
nextBtn?.addEventListener('click',()=>{amb.next(1500);});
addEventListener('pagehide',amb.save);
document.addEventListener('visibilitychange',()=>{if(document.hidden)amb.save();});
if(!ambOff)amb.play().catch(()=>ambUnlockEvents.forEach(t=>document.addEventListener(t,ambUnlock,{capture:true,passive:true})));

// Newsletter: súhlas sa ukladá na backende (POST /store/newsletter s aktuálnou verziou textu súhlasu).
$$('form[data-newsletter]').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const button=$('button',form),status=form.parentElement?.querySelector('.newsletter-status');if(button.disabled)return;button.disabled=true;let r;try{r=await api.subscribeNewsletter({email:form.elements.email.value.trim()});}catch{r={ok:false,message:'Prihlásenie sa nepodarilo. Skúste to prosím znova.'};}if(status)status.textContent=r.message;if(r.ok){setLabel(button,'Ďakujeme');form.reset();}else button.disabled=false;}));

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
  for(const name of ['category','search','filter','type'])if(params.has(name))filterForm.elements[name].value=params.get(name);
  // Digitálne produkty idú do skupín podľa kategórie (ACADEMY kurzy, Audio a meditácie, E-knihy…).
  const digitalSections=items=>{const groups=new Map();for(const item of items){const label=item.digitalGroup||'Digitálne produkty';if(!groups.has(label))groups.set(label,[]);groups.get(label).push(item);}return [...groups.entries()].map(([label,list])=>`<section class="catalog-group"><h2 class="catalog-group-title">${e(label)}</h2><div class="product-grid">${list.map(card).join('')}</div></section>`).join('');};
  let renderSequence=0;const render=async()=>{const sequence=++renderSequence;const query=Object.fromEntries(new FormData(filterForm));const products=await api.getProducts(query);if(sequence!==renderSequence)return;const digital=products.filter(p=>p.digital),physical=products.filter(p=>!p.digital);const empty='<div class="empty-state"><h2>Nič sme nenašli.</h2><p>Skúste iný názov alebo kategóriu.</p><button class="button outline" type="button" id="reset-filters">Zobraziť všetko</button></div>';$('#catalog-results').innerHTML=products.length?(digital.length?digitalSections(digital):'')+(physical.length?`<div class="product-grid catalog-grid">${physical.map(card).join('')}</div>`:''):empty;$('.result-count').textContent=`${products.length} produktov`;
    $$('[data-catalog-category]').forEach(link=>{if(link.dataset.catalogCategory===query.category)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    const search=new URLSearchParams(Object.entries(query).filter(([,v])=>v));history.replaceState(null,'',location.pathname+(search.size?'?'+search:''));
    $('#reset-filters')?.addEventListener('click',()=>{for(const name of ['search','category','filter','type'])filterForm.elements[name].value='';render();});
  };
  filterForm.addEventListener('input',render);filterForm.addEventListener('submit',ev=>{ev.preventDefault();render();});render();
}
// Živý detail produktu: názov, cena, obrázok a popis vždy z jadra (aj pre produkty založené v administrácii).
const detail=$('[data-product-slug]');
if(detail&&api.mode==='http'){
  const slug=decodeURIComponent(location.pathname.replace(/\/+$/,'').split('/').pop()||'');
  const p=slug&&slug!=='produkt-detail'?await api.getProduct(slug):null;
  const section=detail.closest('section');
  // Konzultácia nemá detail v obchode: odkaz na jej „produkt“ vedie na výber termínu.
  const bookable=!p&&slug&&typeof api.getBookingTypes==='function'?(await api.getBookingTypes()).types?.some(t=>t.handle===slug):false;
  if(bookable)location.replace(`/konzultacie/rezervacia?typ=${encodeURIComponent(slug)}`);
  else if(!p){document.title='Produkt sa nenašiel';section.innerHTML=`<div class="empty-state"><h1>Produkt sa nenašiel.</h1><p>Mohol byť vypredaný alebo stiahnutý z ponuky.</p>${button('/eshop','Prejsť do obchodu')}</div>`;}
  else{
    document.title=document.title.replace(/^[^|–-]*/,p.name+' ');
    const img=$('.detail-image img',detail);img.src=p.image;img.alt=p.name;
    $('.detail-copy .eyebrow',detail).textContent=p.category;$('.detail-copy h1',detail).textContent=p.name;
    $('.detail-copy .lead',detail).textContent=p.description;$('.detail-price',detail).textContent=p.priceLabel;
    const crumb=$$('.breadcrumbs span',section).pop();if(crumb)crumb.textContent=p.name;
    $('.add-product',detail).dataset.code=p.code;
    const text=p.descriptionHtml?new DOMParser().parseFromString(p.descriptionHtml,'text/html').body.textContent.trim():'';
    const about=$('details p',detail);if(about)about.textContent=text||p.description||'';
    const related=$('[data-related]',section);if(related){const others=(await api.getProducts()).filter(x=>x.slug!==p.slug).slice(0,4);related.innerHTML=others.map(card).join('');}
  }
}

const productDetail=document.querySelector('[data-product-detail]');
if(productDetail){
  const productHandle=productDetail.dataset.productHandle;
  api.getProduct(productHandle).then(product=>{
    if(!product)return;
    const put=(selector,value)=>{const node=productDetail.querySelector(selector);if(node&&value!=null&&String(value).trim())node.textContent=String(value);};
    put('[data-product-title]',product.name);
    put('[data-product-price]',product.priceLabel);
    put('[data-product-category]',product.category);
    const purchase=productDetail.querySelector('.add-product');if(purchase)purchase.dataset.code=product.code;
    put('[data-product-availability]',product.availability);
    // The original legacy description must stay complete, without unverified marketing copy.
    const html=product.descriptionHtml;const complete=String(product.longDescription||(html?new DOMParser().parseFromString(html.replace(/<br\s*\/?\s*>|<\/(?:p|h[1-6]|li)>/gi,'\n'),'text/html').body.textContent:product.description)||'').trim();
    if(complete&&complete!=='Podrobnosti a podmienky nájdete v detaile produktu.'){
      put('[data-product-full-description]',complete);
      const intro=productDetail.querySelector('[data-product-intro]');
      if(intro){intro.hidden=false;const brief=complete.replace(/\s+/g,' ').trim();intro.textContent=brief.length>220?brief.slice(0,220).replace(/\s+\S*$/,'')+'…':brief;}
    }
    const pic=productDetail.querySelector('[data-product-main-image]');
    if(pic&&typeof product.image==='string'&&isMediaUrl(product.image))pic.src=product.image;
    const gallery=(Array.isArray(product.images)?product.images:[]).map(v=>typeof v==='string'?v:v?.url).filter(v=>typeof v==='string'&&isMediaUrl(v));
    if(pic&&gallery.length>1){
      const urls=[...new Set([product.image,...gallery].filter(Boolean))];let active=0;
      const bar=productDetail.querySelector('[data-product-thumbnails]');
      const arrows=productDetail.querySelector('[data-gallery-actions]');
      const choose=i=>{active=(i+urls.length)%urls.length;pic.src=urls[active];bar?.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-current',String(j===active)));};
      if(bar){bar.hidden=false;urls.forEach((uri,i)=>{const btn=document.createElement('button');btn.type='button';btn.setAttribute('aria-label', 'Fotografia '+(i+1));const thumb=document.createElement('img');thumb.src=uri;thumb.alt='';thumb.loading='lazy';btn.appendChild(thumb);btn.addEventListener('click',()=>choose(i));bar.appendChild(btn);});}
      if(arrows){arrows.hidden=false;arrows.querySelector('[data-gallery-previous]')?.addEventListener('click',()=>choose(active-1));arrows.querySelector('[data-gallery-next]')?.addEventListener('click',()=>choose(active+1));}
      choose(0);
    }
  }).catch(()=>{});
}

bindProductPurchase($('.add-product'), { addToCart: (...args)=>api.addToCart(...args), onResult: result=>{ const status=$('.form-status',$('.add-product').parentElement);if(status)status.textContent=result.message;toast(result.message);return updateCount().catch(()=>{}); } });

const summary=cart=>`<h2>Váš výber</h2>${cart.lines.map(l=>`<div class="summary-row"><span>${e(l.name)} × ${l.quantity}</span><strong>${e(l.priceLabel)}<small> / kus</small></strong></div>`).join('')}<div class="summary-row"><span>Kupón</span><strong>${e(cart.discountLabel)}</strong></div>${cart.gift_voucher?`<div class="summary-row"><span>Poukaz ${e(cart.gift_voucher.masked_code)}</span><strong>${e(cart.gift_voucher.amountLabel)}</strong></div><p class="fine-print">Zostatok poukazu pred čerpaním: ${e(cart.gift_voucher.balanceLabel)}</p>`:''}${cart.shippingLabel?`<div class="summary-row"><span>${e(cart.shippingTitle||'Doprava')}</span><strong>${e(cart.shippingLabel)}</strong></div>`:''}<div class="summary-row"><span>Celkom</span><strong>${e(cart.totalLabel)}</strong></div>${cart.taxLabel?`<p class="fine-print">Vrátane DPH ${e(cart.taxLabel)}</p>`:''}`;
async function renderCart(){
  const target=$('#cart-view');if(!target)return;
  const cart=await api.getCart();
  if(!cart.lines.length){target.innerHTML=`<div class="empty-state"><p class="eyebrow">PRIESTOR PRE VAŠE RITUÁLY</p><h2>Váš košík je zatiaľ prázdny.</h2><p>Vyberte si niečo, čo vám spraví radosť.</p>${button('/eshop','Objaviť obchod')}</div>`;return;}
  target.innerHTML=`<div class="cart-layout"><div>${cart.lines.map(l=>`<article class="cart-line"><img src="${l.image}" alt="" width="95" height="116"><div><h2><a href="${l.giftVoucher?'/darcekovy-poukaz':l.booking?'/konzultacie/rezervacia?typ='+encodeURIComponent(l.slug):'/eshop/produkt/'+e(l.slug)}">${e(l.name)}</a></h2>${l.booking?`<p>${l.booking.label?`Termín: ${e(l.booking.label)}`:'Termín vyberiete v rezervácii.'}</p><p>${e(l.priceLabel)}</p>`:`<p>${e(l.priceLabel)} / kus</p><div class="quantity"><button data-quantity="${l.quantity-1}" data-slug="${l.slug}" aria-label="Znížiť množstvo: ${e(l.name)}">−</button><span aria-label="Množstvo">${l.quantity}</span><button data-quantity="${l.quantity+1}" data-slug="${l.slug}" ${l.quantity>=99?'disabled':''} aria-label="Zvýšiť množstvo: ${e(l.name)}">+</button></div>`}</div><button class="remove-line" data-quantity="0" data-slug="${l.slug}" aria-label="Odstrániť ${e(l.name)}">Odstrániť</button></article>`).join('')}<form class="coupon-form"><div class="coupon-input"><label>Zľavový kupón<input name="coupon" value="${e(cart.coupon)}" placeholder="Zadajte kód kupónu" maxlength="100" required></label><button class="button outline" type="submit">Použiť</button></div><p class="form-status" role="status"></p>${cart.coupon?'<button type="button" id="remove-coupon" class="text-link">Odstrániť kupón</button>':''}</form><form id="redeem-voucher-form"><label>Kód darčekového poukazu<input name="code" required maxlength="100" placeholder="Zadajte kód poukazu" autocomplete="off"></label><button class="button outline" type="submit">Uplatniť poukaz</button><p class="form-status" role="status"></p></form>${cart.gift_voucher?'<button type="button" id="remove-voucher" class="text-link">Odstrániť poukaz</button>':''}</div><aside class="order-summary">${summary(cart)}${button('/pokladna','Pokračovať na objednávku')}</aside></div>`;
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

// Digitálny produkt smie kúpiť len prihlásený zákazník (rovnaké pravidlo má server).
const cartHasDigitalProduct=async cart=>{try{const products=await api.getProducts();const digital=new Set(products.filter(p=>p.digital).map(p=>p.slug));return cart.lines.some(line=>digital.has(line.slug));}catch{return false;}};
const checkoutForm=$('#checkout-form');
if(checkoutForm){
  const cart=await api.getCart();$('#checkout-summary').innerHTML=summary(cart);
  if(!cart.lines.length){checkoutForm.innerHTML=`<div class="empty-state"><h2>Najprv si niečo vyberte.</h2>${button('/eshop','Prejsť do obchodu')}</div>`;}
  else if(!api.isLoggedIn()&&await cartHasDigitalProduct(cart)){checkoutForm.innerHTML=`<div class="empty-state"><h2>Prihláste sa, aby ste si mohli kúpiť digitálny produkt.</h2><p>Digitálne produkty — programy, nahrávky a dokumenty — kupuje prihlásený zákazník. Po prihlásení nájdete kúpený obsah v časti Môj účet → Knižnica.</p>${button('/prihlasenie','Prihlásiť sa alebo založiť účet')}</div>`;}
  else{
    const step=n=>{$$('fieldset[data-step]',checkoutForm).forEach(el=>{el.hidden=Number(el.dataset.step)!==n;el.disabled=el.hidden;});$$('[data-step-label]').forEach(el=>el.classList.toggle('current',Number(el.dataset.stepLabel)===n));const first=$(`fieldset[data-step="${n}"] input`,checkoutForm);first?.focus();};
    // Doprava a platba: možnosti a ceny vracia server (/store/nexus-checkout/options), klient len vyberá.
    // Karta = Stripe Payment Element (Apple/Google Pay cez Payment Element); dobierka a prevod bez brány.
    const cfg=(()=>{try{return globalThis.__ANASTASIA_CONFIG__||null;}catch{return null;}})();
    let stripe,elements,paymentReady=false,paymentRequired=true,options=null,selected=null,selecting=0;
    const el=checkoutForm.elements;
    const contact=()=>({firstName:el.firstName?.value||'',lastName:el.lastName?.value||'',email:el.email?.value||'',street:el.street?.value||'',city:el.city?.value||'',postalCode:el.postalCode?.value||'',country:el.country?.value||'sk'});
    const deliveryValue=()=>options?.requiresDelivery?(checkoutForm.querySelector('[name=delivery]:checked')?.value||''):'digital';
    const loadStripe=()=>loadStripeScript();
    const toggleAddress=()=>{const courier=deliveryValue()==='courier';$('#address-fields').hidden=!courier;$$('#address-fields input').forEach(input=>{input.required=courier;input.disabled=!courier;});};
    const renderDelivery=()=>{
      const box=$('#delivery-options');if(!box)return;
      if(!options){box.innerHTML='<p class="fine-print">Spôsoby doručenia sa nepodarilo načítať.</p>';return;}
      if(!options.requiresDelivery){box.innerHTML='<p class="radio-label"><strong>Digitálny obsah – bez dopravy.</strong> Prístup nájdete vo svojom účte hneď po zaplatení.</p>';toggleAddress();return;}
      const current=checkoutForm.querySelector('[name=delivery]:checked')?.value||options.delivery[0]?.code;
      box.innerHTML=options.delivery.map(d=>`<label class="radio-label"><input type="radio" name="delivery" value="${e(d.code)}" ${d.code===current?'checked':''} required> <span><strong>${d.code==='pickup'?'Osobný odber':'Kuriér'}</strong> · ${e(d.priceLabel)}${d.freeFromLabel?` <small>(${e(d.freeFromLabel)})</small>`:''}${d.address?`<br><small>Adresa vyzdvihnutia: ${e(d.address)}</small>`:''}</span></label>`).join('')||'<p class="fine-print">Pre tento košík teraz nie je dostupné doručenie. Kontaktujte nás, prosím.</p>';
      $$('[name=delivery]',box).forEach(input=>input.addEventListener('change',toggleAddress));toggleAddress();
    };
    const PAY_INFO={cod:'Platíte pri prevzatí zásielky kuriérovi.',bank_transfer:'Platobné údaje (IBAN a variabilný symbol) zobrazíme po dokončení objednávky a pošleme ich aj e-mailom. Kúpna cena je splatná do 48 hodín; tovar odošleme a digitálny obsah sprístupníme po pripísaní platby.',card:'Platba kartou online cez zabezpečenú bránu Stripe (aj Apple Pay a Google Pay).'};
    const renderPayment=()=>{
      const box=$('#payment-options');if(!box||!options)return;
      const delivery=deliveryValue();
      // Dobierka len pri doručení kuriérom (fyzický tovar); server to overí znova.
      const list=options.payment.filter(p=>p.available&&(p.code!=='cod'||delivery==='courier'));
      if(!list.some(p=>p.code===selected))selected=list.find(p=>p.code==='card')?.code||list[0]?.code||null;
      box.innerHTML=list.map(p=>`<label class="radio-label"><input type="radio" name="payment" value="${e(p.code)}" ${p.code===selected?'checked':''}> <span><strong>${e(p.label)}</strong>${p.feeLabel?` · ${e(p.feeLabel)}`:''}</span></label>`).join('')||'<p class="fine-print">Žiadny spôsob platby nie je dostupný.</p>';
      $$('[name=payment]',box).forEach(input=>input.addEventListener('change',()=>{selected=input.value;choosePayment();}));
    };
    const choosePayment=async()=>{
      const ticket=++selecting;paymentReady=false;stripe=null;elements=null;
      const info=$('#payment-info');let host=$('#stripe-payment-element',checkoutForm);
      if(!host){host=document.createElement('div');host.id='stripe-payment-element';host.style.cssText='margin:16px 0;width:100%;max-width:560px;grid-column:1/-1';info.after(host);}
      host.textContent='';info.textContent='Pripravujem platbu…';
      if(!selected){info.textContent='Zvoľte spôsob platby.';return;}
      const delivery=deliveryValue();
      const r=await api.selectCheckout({delivery:delivery==='digital'?null:delivery,payment:selected});
      if(ticket!==selecting)return;
      if(!r.ok){info.textContent=r.message;return;}
      $('#checkout-summary').innerHTML=summary(r.cart);paymentRequired=r.paymentRequired!==false;
      if(!paymentRequired){info.textContent='Objednávka je pokrytá. Platobné údaje nie sú potrebné.';paymentReady=true;return;}
      info.textContent=PAY_INFO[r.payment]||'';
      if(r.payment!=='card'){paymentReady=true;return;}
      if(!cfg?.stripePublishableKey||!r.clientSecret){info.textContent='Platobná brána nie je nakonfigurovaná.';return;}
      if(!hasConsentDecision())info.textContent='Pred platbou kartou dokončite nastavenia cookies.';
      try{const Stripe=await loadStripe();if(ticket!==selecting)return;stripe=Stripe(cfg.stripePublishableKey);elements=stripe.elements({clientSecret:r.clientSecret});elements.create('payment',{defaultValues:{billingDetails:{email:el.email?.value||undefined,address:{country:(el.country?.value||'sk').toUpperCase()}}}}).mount(host);paymentReady=true;}
      catch{info.textContent='Platobnú bránu sa nepodarilo načítať.';}
    };
    // Krok 2: kontakt a krajina sa uložia do košíka, server vráti dopravu s cenou.
    const initDelivery=async()=>{
      if(typeof api.prepareCheckout!=='function')return;
      $('#delivery-options').innerHTML='<p class="fine-print">Načítavam spôsoby doručenia…</p>';
      const c=contact();const prep=await api.prepareCheckout({...c,delivery:'digital',street:'',city:'',postalCode:''});
      options=prep.ok?prep.options:null;if(!prep.ok)$('#delivery-options').innerHTML=`<p class="fine-print">${e(prep.message)}</p>`;else renderDelivery();
    };
    // Krok 3: uloží adresu, znova načíta možnosti (cena dopravy podľa košíka) a pripraví zvolenú platbu.
    const initPayment=async()=>{
      if(typeof api.prepareCheckout!=='function'||typeof api.selectCheckout!=='function')return;
      paymentReady=false;$('#payment-options').innerHTML='<p class="fine-print">Načítavam spôsoby platby…</p>';$('#payment-info').textContent='';
      const prep=await api.prepareCheckout({...contact(),delivery:deliveryValue()});
      if(!prep.ok){$('#payment-info').textContent=prep.message;return;}
      options=prep.options;$('#checkout-summary').innerHTML=summary(prep.cart);renderPayment();await choosePayment();
    };
    const go=n=>{step(n);if(n===2)initDelivery();if(n===3)initPayment();};
    $$('[data-next]',checkoutForm).forEach(btn=>btn.addEventListener('click',()=>{if(checkoutForm.reportValidity())go(Number(btn.dataset.next));}));
    $$('[data-back]',checkoutForm).forEach(btn=>btn.addEventListener('click',()=>step(Number(btn.dataset.back))));
    let checkoutBusy=false;
    const showTransfer=r=>{const box=$('#bank-transfer-result');if(!box)return;const bt=r.bankTransfer;if(!bt&&!r.pickupAddress){box.hidden=true;return;}
      box.hidden=false;box.innerHTML=`${bt?`<h2>Platobné údaje</h2><dl class="summary-list"><div class="summary-row"><dt>Príjemca</dt><dd>${e(bt.beneficiary)}</dd></div><div class="summary-row"><dt>Banka</dt><dd>${e(bt.bank)}</dd></div><div class="summary-row"><dt>IBAN</dt><dd><strong>${e(bt.iban)}</strong></dd></div>${bt.swift?`<div class="summary-row"><dt>SWIFT/BIC</dt><dd>${e(bt.swift)}</dd></div>`:''}<div class="summary-row"><dt>Variabilný symbol</dt><dd><strong>${e(bt.variable_symbol)}</strong></dd></div><div class="summary-row"><dt>Suma</dt><dd><strong>${e(bt.amountLabel)}</strong></dd></div></dl><p class="fine-print">Prosíme o úhradu do 48 hodín. Údaje sme vám poslali aj e-mailom.</p>`:''}${r.pickupAddress?`<p class="fine-print">Objednávku si vyzdvihnete na adrese: ${e(r.pickupAddress)}. Ozveme sa vám, keď bude pripravená.</p>`:''}`;};
    checkoutForm.addEventListener('submit',async event=>{event.preventDefault();if(checkoutBusy)return;const current=$('fieldset:not([hidden])',checkoutForm);if(current.dataset.step!=='3'){if(checkoutForm.reportValidity())go(Number(current.dataset.step)+1);return;}
      const output=$('#checkout-result'),submit=checkoutForm.querySelector('[type=submit]');checkoutBusy=true;if(submit)submit.disabled=true;
      try{
      if(typeof api.acceptCheckoutTerms==='function'){if(!paymentReady){output.dataset.state='ERROR';output.textContent='Platba ešte nie je pripravená. Skontrolujte údaje v predchádzajúcich krokoch.';output.focus();return;}
        const ok=await api.acceptCheckoutTerms({terms_accepted:el.terms.checked,privacy_acknowledged:el.privacy.checked});if(!ok.ok){output.dataset.state='ERROR';output.textContent=ok.message;output.focus();return;}}
      if(typeof api.verifyCartBooking==='function'){const term=await api.verifyCartBooking();if(!term.ok){output.dataset.state='ERROR';output.innerHTML=`${e(term.message)}${term.expired?` <a class="text-link" href="/konzultacie/rezervacia">Vybrať termín</a>`:''}`;output.focus();return;}}
      if(paymentRequired&&selected==='card'){if(!stripe||!paymentReady){output.dataset.state='ERROR';output.textContent='Platba ešte nie je pripravená.';output.focus();return;}output.dataset.state='REVIEW';output.textContent='Spracúvam platbu…';const {error}=await stripe.confirmPayment({elements,redirect:'if_required'});if(error){output.dataset.state='ERROR';output.textContent=error.message||'Platba zlyhala. Skontrolujte údaje karty.';output.focus();return;}}
      const result=await api.checkout();output.dataset.state=result.status;output.textContent=result.messages;if(result.status==='ALLOW'||result.status==='PENDING'){showTransfer(result);$$('fieldset[data-step]',checkoutForm).forEach(f=>{f.hidden=true;f.disabled=true;});}output.focus();
      }catch{output.dataset.state='ERROR';output.textContent='Objednávku sa nepodarilo dokončiť. Skontrolujte jej stav v účte pred ďalším pokusom.';output.focus();}finally{checkoutBusy=false;if(submit)submit.disabled=false;}
    });
  }
}
$('#login-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;$('.form-status',form).textContent=(await api.requestMagicLink(form.elements.email.value)).message;});
if($('#magic-confirm')){
  const r=await api.confirmMagicLink();$('#magic-confirm').textContent=r.message;history.replaceState(null,'',location.pathname);
  // Návrat len na vlastnú stránku (cesta začínajúca jedným „/“), uložený pred prihlásením.
  let back='';try{back=localStorage.getItem('anastasia.return')||'';localStorage.removeItem('anastasia.return');}catch{}
  if(r.ok&&/^\/(?!\/)[\w\-\/]*(\?[\w\-=&%]*)?$/.test(back))$('#magic-confirm').insertAdjacentHTML('afterend',`<div class="actions">${button(back,'Pokračovať v rezervácii')}</div>`);
}
$('#contact-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=$('button[type=submit]',form),status=$('.form-status',form);if(button.disabled)return;button.disabled=true;status.textContent='Odosielam…';let r;try{r=await api.sendContact(Object.fromEntries(new FormData(form)));}catch{r={ok:false,message:'Správu sa nepodarilo odoslať. Skúste to prosím znova o chvíľu.'};}status.textContent=r.message;if(r.ok)form.reset();button.disabled=false;});
// Online odstúpenie od zmluvy: prihlásenému zákazníkovi predvyplníme e-mail a meno z účtu.
initWithdrawalForm(api);
// Klub ANASTASIA: ponuka a cena len zo servera; Payment Element iba autorizuje, zachytenie robí backend po SafeOrder.
const runtimeConfig=()=>{try{return globalThis.__ANASTASIA_CONFIG__||null;}catch{return null;}};
const loadStripeJs=()=>loadStripeScript();
const loggedInNow=async()=>typeof api.isLoggedIn==='function'&&Boolean(await api.isLoggedIn());
const loginPrompt=text=>`<div class="empty-state"><h2>${e(text)}</h2>${button('/prihlasenie','Prihlásiť sa')}</div>`;
if($('#klub-view')){
  const view=$('#klub-view'),form=$('#klub-form'),offerBox=$('#klub-offer'),payBox=$('#klub-payment'),result=$('#klub-result'),submit=$('#klub-submit');
  let stripe=null,elements=null,paying=false;
  const say=(text,state='')=>{result.dataset.state=state;result.textContent=text;result.focus();};
  const choose=async variantId=>{
    form.hidden=true;view.innerHTML='<p class="form-status">Pripravujem ponuku…</p>';
    const r=await api.prepareMembership(variantId);
    if(!r.ok){view.innerHTML=r.status===401?loginPrompt('Pre členstvo sa prihláste.'):`<p class="form-status" data-state="ERROR">${e(r.message)}</p>`;return;}
    const o=r.offer;view.innerHTML='';
    offerBox.innerHTML=`<article class="center-card"><p class="eyebrow">Vaše členstvo</p><h2>${e(o.title)}</h2><p><strong>${e(o.amount_label)}</strong> · ${e(String(o.period_days))} dní prístupu</p></article>`;
    payBox.hidden=true;payBox.textContent='';stripe=null;elements=null;submit.textContent='Pokračovať na platbu';form.hidden=false;
  };
  const render=async()=>{
    if(!(await loggedInNow())){view.innerHTML=loginPrompt('Pre členstvo v Klube sa najprv prihláste.');return;}
    const products=await api.getMembershipProducts();
    const offers=products.flatMap(p=>p.variants.map(v=>({p,v})));
    if(!offers.length){view.innerHTML='<div class="empty-state"><h2>Členstvo pripravujeme.</h2><p>Ponuku Klubu zverejníme čoskoro.</p></div>';return;}
    view.innerHTML=`<div class="library-grid">${offers.map(({p,v})=>`<article class="lesson"><span class="eyebrow">${p.period_days?`${e(String(p.period_days))} DNÍ`:'ČLENSTVO'}</span><h2>${e(p.title)}</h2><p>${e(p.variants.length>1?v.label:p.description)}</p><p><strong>${e(v.priceLabel)}</strong></p><button type="button" class="button" data-klub-variant="${e(v.id)}">Vybrať ${arrow}</button></article>`).join('')}</div>`;
    $$('[data-klub-variant]',view).forEach(btn=>btn.addEventListener('click',()=>choose(btn.dataset.klubVariant)));
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(paying||!form.reportValidity())return;paying=true;submit.disabled=true;
    try{
      if(!elements){
        const cfg=runtimeConfig();if(!cfg?.stripePublishableKey){say('Platobná brána nie je dostupná.','ERROR');return;}
        say('Pripravujem platbu…','REVIEW');
        if(!hasConsentDecision())say('Pred platbou kartou dokončite nastavenia cookies.','REVIEW');
        const r=await api.startMembershipCheckout({terms_accepted:form.elements.terms.checked,privacy_acknowledged:form.elements.privacy.checked,auto_renew:form.elements.auto_renew.checked});
        if(!r.ok){say(r.message,'ERROR');return;}
        try{const Stripe=await loadStripeJs();stripe=Stripe(cfg.stripePublishableKey);elements=stripe.elements({clientSecret:r.clientSecret});payBox.hidden=false;payBox.textContent='';const email=typeof api.getCustomerEmail==='function'?await api.getCustomerEmail().catch(()=>''):'';elements.create('payment',{defaultValues:{billingDetails:{...(email?{email}:{}),address:{country:'SK'}}}}).mount(payBox);}
        catch{say('Platobnú bránu sa nepodarilo načítať.','ERROR');return;}
        $$('input[type=checkbox]',form).forEach(input=>{input.disabled=true;});
        submit.textContent='Zaplatiť a aktivovať';say('Zadajte platobné údaje.','');return;
      }
      say('Overujem platbu…','REVIEW');
      const {error}=await stripe.confirmPayment({elements,redirect:'if_required'});
      if(error){say(error.message||'Platba zlyhala. Skontrolujte údaje karty.','ERROR');return;}
      say('Aktivujem členstvo…','REVIEW');
      const done=await api.completeMembership();
      say(done.message,done.status==='SETTLED'?'ALLOW':done.status);
      if(done.ok){payBox.hidden=true;submit.hidden=true;result.insertAdjacentHTML('afterend',`<div class="actions">${button('/ucet#klub','Moje členstvo')}</div>`);}
    }finally{paying=false;submit.disabled=false;}
  });
  render();
}
// Rezervácia konzultácie: typ → voľný termín (server) → podržanie a naviazanie na košík → pokladňa.
// Obsadený alebo už neponúkaný termín: hláška a nová ponuka termínov, nič sa neúčtuje.
const RETURN_KEY='anastasia.return';
const rememberReturn=path=>{try{localStorage.setItem(RETURN_KEY,path);}catch{}};
if($('#booking-view')){
  const view=$('#booking-view'),TZ='Europe/Bratislava',RANGE=28,MAX_RANGES=7;
  const ymd=d=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  const addDays=(day,n)=>{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const fmt=(iso,o)=>new Intl.DateTimeFormat('sk-SK',{timeZone:TZ,...o}).format(new Date(iso));
  const status=(text,state='')=>`<p class="form-status" role="status"${state?` data-state="${state}"`:''}>${e(text)}</p>`;
  const today=ymd(new Date());
  let types=[],type=null,from=today,busy=false;
  const head=()=>`<div class="booking-head"><div><p class="eyebrow">Konzultácia</p><h2>${e(type.title)}</h2><p>${[type.durationMinutes?`${type.durationMinutes} minút`:'',type.form==='online'?'online':type.form==='in_person'?'osobne':'',type.priceLabel].filter(Boolean).map(e).join(' · ')}</p></div>${types.length>1?'<button type="button" class="text-link" data-booking-change>Iná konzultácia</button>':''}</div>`;
  const wireChange=()=>$('[data-booking-change]',view)?.addEventListener('click',()=>{type=null;history.replaceState(null,'',location.pathname);renderTypes();});
  const renderTypes=()=>{
    view.innerHTML=`<div class="library-grid booking-types">${types.map(t=>`<article class="lesson"><span class="eyebrow">${t.durationMinutes?`${e(String(t.durationMinutes))} MINÚT`:'KONZULTÁCIA'}</span><h2>${e(t.title)}</h2>${t.description?`<p>${e(t.description)}</p>`:''}<p><strong>${e(t.priceLabel)}</strong></p><button type="button" class="button" data-booking-type="${e(t.handle)}">Vybrať termín ${arrow}</button></article>`).join('')}</div>`;
    $$('[data-booking-type]',view).forEach(btn=>btn.addEventListener('click',()=>{type=types.find(t=>t.handle===btn.dataset.bookingType)||null;if(!type)return;from=today;history.replaceState(null,'',`${location.pathname}?typ=${encodeURIComponent(type.handle)}`);renderSlots();}));
  };
  const renderSlots=async(note='',noteState='')=>{
    view.innerHTML=head()+(note?status(note,noteState):'')+status('Hľadám voľné termíny…');wireChange();
    // Prvé voľné termíny: posúvame sa po 28 dňoch (limit servera je 31), najviac ~pol roka dopredu.
    let r,start=from;
    for(let i=0;i<MAX_RANGES;i++){r=await api.getBookingSlots(type.id,start,addDays(start,RANGE-1));if(!r.ok||r.slots.length)break;start=addDays(start,RANGE);}
    from=start;
    const noteHtml=note?status(note,noteState):'';
    if(!r.ok){view.innerHTML=head()+noteHtml+status(r.message,'ERROR')+'<div class="actions"><button type="button" class="button outline" data-booking-retry>Skúsiť znova</button></div>';wireChange();$('[data-booking-retry]',view).addEventListener('click',()=>renderSlots());return;}
    if(!r.slots.length){view.innerHTML=head()+noteHtml+`<div class="empty-state"><h2>Momentálne nie sú voľné termíny.</h2><p>Napíšte nám a dohodneme termín spolu.</p>${button('/kontakt','Kontakt')}</div>`;wireChange();return;}
    const days=new Map();for(const s of r.slots){const k=ymd(new Date(s.start));if(!days.has(k))days.set(k,[]);days.get(k).push(s);}
    const until=addDays(from,RANGE-1);
    view.innerHTML=head()+noteHtml+`<p class="booking-range">${e(fmt(`${from}T12:00:00Z`,{day:'numeric',month:'long'}))} – ${e(fmt(`${until}T12:00:00Z`,{day:'numeric',month:'long',year:'numeric'}))}</p><div class="booking-days">${[...days].map(([day,slots])=>`<section class="booking-day"><h3>${e(fmt(slots[0].start,{weekday:'long',day:'numeric',month:'long'}))}</h3><div class="booking-slots">${slots.map(s=>`<button type="button" class="booking-slot" data-slot="${e(s.start)}" data-label="${e(s.label)}" aria-label="${e(s.label)}">${e(fmt(s.start,{hour:'2-digit',minute:'2-digit'}))}</button>`).join('')}</div></section>`).join('')}</div><div class="actions">${from>today?'<button type="button" class="button outline" data-booking-prev>Skoršie termíny</button>':''}<button type="button" class="button outline" data-booking-next>Ďalšie termíny ${arrow}</button></div>`;
    wireChange();
    $('[data-booking-prev]',view)?.addEventListener('click',()=>{const prev=addDays(from,-RANGE);from=prev<today?today:prev;renderSlots();});
    $('[data-booking-next]',view).addEventListener('click',()=>{from=addDays(from,RANGE);renderSlots();});
    $$('[data-slot]',view).forEach(btn=>btn.addEventListener('click',()=>pick(btn.dataset.slot,btn.dataset.label)));
  };
  const pick=async(slot,label)=>{
    if(!(await loggedInNow())){
      rememberReturn(`/konzultacie/rezervacia?typ=${encodeURIComponent(type.handle)}`);
      view.innerHTML=head()+loginPrompt('Pre rezerváciu termínu sa prihláste.')+'<p class="fine-print">Po prihlásení sa sem vrátite a termín si vyberiete znova.</p>';wireChange();return;
    }
    view.innerHTML=head()+`<article class="center-card booking-confirm"><p class="eyebrow">Vybraný termín</p><h2>${e(label)}</h2><p>${e(type.priceLabel)}</p><div class="actions"><button type="button" class="button" data-booking-reserve>Rezervovať a pokračovať ${arrow}</button><button type="button" class="button outline" data-booking-back>Vybrať iný termín</button></div><p class="form-status" role="status"></p></article>`;wireChange();
    const out=$('.booking-confirm .form-status',view),go=$('[data-booking-reserve]',view);
    $('[data-booking-back]',view).addEventListener('click',()=>renderSlots());
    go.addEventListener('click',async()=>{
      if(busy)return;busy=true;go.disabled=true;out.dataset.state='REVIEW';out.textContent='Rezervujem termín…';
      try{
        const r=await api.reserveBooking({productId:type.id,variantId:type.variantId,startsAt:slot,title:type.title});
        if(r.ok){out.dataset.state='ALLOW';out.textContent='Termín je podržaný. Pokračujeme na objednávku…';await updateCount();location.assign('/pokladna');return;}
        if(r.status===401){rememberReturn(`/konzultacie/rezervacia?typ=${encodeURIComponent(type.handle)}`);view.innerHTML=head()+loginPrompt('Prihlásenie vypršalo. Prihláste sa znova.');wireChange();return;}
        if(r.status===409||r.status===404){await renderSlots(r.message,'ERROR');return;}
        out.dataset.state='ERROR';out.textContent=r.message;
      }finally{busy=false;if(go.isConnected)go.disabled=false;}
    });
  };
  (async()=>{
    const r=typeof api.getBookingTypes==='function'?await api.getBookingTypes():{ok:false,types:[]};
    types=r.types||[];
    if(!r.ok){view.innerHTML=status('Ponuku konzultácií sa nepodarilo načítať. Skúste to znova o chvíľu.','ERROR');return;}
    if(!types.length){view.innerHTML=`<div class="empty-state"><h2>Termíny konzultácií pripravujeme.</h2><p>Napíšte nám a dohodneme termín spolu.</p>${button('/kontakt','Kontakt')}</div>`;return;}
    const wanted=new URLSearchParams(location.search).get('typ');
    type=types.find(t=>t.handle===wanted)||(types.length===1?types[0]:null);
    if(type)renderSlots();else renderTypes();
  })();
}
if($('#membership-view')){
  const view=$('#membership-view');
  const STATUS={active:'Aktívne',renewing:'Obnovuje sa',unknown:'Overujeme platbu',needs_review:'Overujeme'};
  const date=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('sk-SK');};
  const render=async(note='')=>{
    if(!(await loggedInNow())){view.innerHTML=loginPrompt('Pre prehľad členstva sa prihláste.');return;}
    const [list,products]=await Promise.all([api.listMemberships(0),api.getMembershipProducts()]);
    if(!list.ok){view.innerHTML=`<p class="form-status" data-state="ERROR">${e(list.message)}</p>`;return;}
    const titles=new Map(products.map(p=>[p.id,p.title]));
    view.innerHTML=(note?`<p class="form-status" role="status">${e(note)}</p>`:'')+(list.memberships.length?list.memberships.map(m=>`<article class="center-card" data-membership="${e(m.id)}"><p class="eyebrow">${e(STATUS[m.status]||'Overujeme')}</p><h2>${e(titles.get(m.product_id)||'Klub ANASTASIA')}</h2><p>Prístup do ${e(date(m.period_end))} · ${m.renew?'automatická obnova zapnutá':'bez automatickej obnovy'}</p><div class="actions">${m.status==='renewing'?`<button type="button" class="button" data-membership-confirm="${e(m.id)}">Potvrdiť platbu v banke</button>`:''}${m.renew?`<button type="button" class="button outline" data-membership-stop="${e(m.id)}">Zastaviť obnovu</button>`:''}</div><div class="form-status" role="status"></div></article>`).join(''):`<div class="empty-state"><h2>Zatiaľ nemáte členstvo.</h2>${button('/klub','Pozrieť Klub')}</div>`);
    $$('[data-membership-stop]',view).forEach(btn=>btn.addEventListener('click',async()=>{
      if(!confirm('Zastaviť automatickú obnovu? Prístup vám zostane do konca zaplateného obdobia.'))return;
      btn.disabled=true;const r=await api.stopMembership(btn.dataset.membershipStop);
      if(r.ok)render(r.message);else{btn.disabled=false;$('.form-status',btn.closest('article')).textContent=r.message;}
    }));
    $$('[data-membership-confirm]',view).forEach(btn=>btn.addEventListener('click',async()=>{
      const id=btn.dataset.membershipConfirm,status=$('.form-status',btn.closest('article'));btn.disabled=true;
      try{
        const cfg=runtimeConfig();if(!cfg?.stripePublishableKey){status.textContent='Platobná brána nie je dostupná.';return;}
        const pay=await api.getMembershipPayment(id);if(!pay.ok){status.textContent=pay.message;return;}
        status.textContent='Otváram overenie v banke…';
        const Stripe=await loadStripeJs();const {error}=await Stripe(cfg.stripePublishableKey).handleNextAction({clientSecret:pay.clientSecret});
        if(error){status.textContent=error.message||'Overenie sa nepodarilo. Skúste to znova.';return;}
        const r=await api.reconcileMembership(id);
        if(r.ok)render(r.status==='SETTLED'||r.status==='ACTIVE'?'Platba je potvrdená. Ďakujeme.':'Platbu ešte overujeme. Stav sa čoskoro aktualizuje.');else status.textContent=r.message;
      }catch{status.textContent='Overenie sa nepodarilo. Skúste to znova.';}
      finally{btn.disabled=false;}
    }));
  };
  render();
}
if($('#library-view')){const {mountLibrary}=await import('/library.mjs');void mountLibrary($('#library-view'),api);}

// A short ripple every twelve seconds, applied only to the logo.
const brandWave=document.querySelector('[data-brand-wave]');
if(brandWave){const start=performance.now();const ripple=now=>{const phase=((now-start)%12000)/12000;brandWave.setAttribute('scale',reducedMotion.matches?'0':String(phase>.72&&phase<.88?Math.sin((phase-.72)/.16*Math.PI)*10:0));requestAnimationFrame(ripple);};requestAnimationFrame(ripple);}
const skyWindow=document.querySelector('.sky-window'),skySpill=document.querySelector('.sky-spill video');
if(skyWindow&&skySpill){const original=skyWindow.querySelector('video');const sizeSky=()=>{const box=skyWindow.getBoundingClientRect(),section=skySpill.parentElement.getBoundingClientRect();const width=Math.max(box.width,box.height*(original.videoWidth/original.videoHeight||16/9));Object.assign(skySpill.style,{width:width+'px',height:box.height+'px',left:(box.left-section.left+(box.width-width)/2)+'px',top:(box.top-section.top)+'px'});};new ResizeObserver(sizeSky).observe(skyWindow);original.addEventListener('loadedmetadata',sizeSky);original.addEventListener('play',()=>{skySpill.currentTime=original.currentTime;});sizeSky();}

// Kolekcia na mobile: pás kariet sa sám posúva o jednu kartu; dotyk, hover, fokus alebo skrytá karta ho pozastaví.
for(const track of document.querySelectorAll('[data-carousel]')){
  const reduce=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width:699.98px)');
  let hold=false,timer=0,resume=0;
  const step=()=>{
    if(hold||document.hidden||reduce.matches||!mobile.matches)return;
    const card=track.firstElementChild;if(!card)return;
    const w=card.getBoundingClientRect().width+parseFloat(getComputedStyle(track).columnGap||0);
    const end=track.scrollLeft+track.clientWidth>=track.scrollWidth-4;
    track.scrollTo({left:end?0:track.scrollLeft+w,behavior:'smooth'});
  };
  const start=()=>{clearInterval(timer);timer=setInterval(step,3800);};
  const pause=()=>{hold=true;clearTimeout(resume);};
  const later=()=>{clearTimeout(resume);resume=setTimeout(()=>{hold=false;},6000);};
  track.addEventListener('pointerdown',pause);track.addEventListener('pointerup',later);track.addEventListener('pointercancel',later);
  track.addEventListener('mouseenter',pause);track.addEventListener('mouseleave',later);
  track.addEventListener('focusin',pause);track.addEventListener('focusout',later);
  track.addEventListener('touchstart',pause,{passive:true});track.addEventListener('touchend',later,{passive:true});
  new IntersectionObserver(([en])=>{if(en.isIntersecting)start();else clearInterval(timer);},{threshold:.3}).observe(track);
}

// Picker vzhledu pro Luciu: na vyžádání (?vzhlad-editor=1) nebo window.anaOpenThemePicker() z adminu.
window.anaOpenThemePicker=()=>import('/theme-picker.mjs').then(m=>m.openThemePicker());
if(new URLSearchParams(location.search).has('vzhlad-editor'))window.anaOpenThemePicker().catch(()=>{});

// Menu Obchod: doplní za běhu kategorie z jádra, které nejsou ve statickém buildu (např. nově
// přidané v adminu). Jen přidává, nic neodebírá; odkaz na /eshop, aby na prototypu nevznikl 404.
async function syncCategories(){
  try{
    const cats=await api.getCategories?.();
    if(!Array.isArray(cats)||!cats.length)return;
    const existing=[...document.querySelectorAll('a[href^="/eshop/kategoria/"]')];
    if(!existing.length)return;
    const have=new Set(existing.map(a=>a.textContent.trim().toLowerCase()));
    const anchor=existing[existing.length-1];
    for(const name of cats){
      const label=String(name||'').trim();
      if(!label||have.has(label.toLowerCase()))continue;
      const a=anchor.cloneNode(false);a.setAttribute('href','/eshop');a.removeAttribute('data-menu-close');a.setAttribute('data-menu-close','');a.textContent=label;
      anchor.parentNode.insertBefore(a,anchor.nextSibling);have.add(label.toLowerCase());
    }
  }catch{}
}

// Jazyky SK/EN/RU: zapojí přepínače a aplikuje uloženou volbu (EN/RU zatím náhled, viz i18n.mjs).
syncCategories().finally(()=>i18nInit());

initDigitalProduct();
