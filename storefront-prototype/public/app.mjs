import {createApi} from '/lib/api/index.mjs';
import {escape as e,card,arrow,button} from '/components.mjs';
let storage;try{storage=window.sessionStorage;}catch{}
const api=createApi(storage);
const $=(s,root=document)=>root.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
let toastTimeout;
function toast(message){const el=$('.toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{el.hidden=true;},4500);}
async function updateCount(){const count=(await api.getCart()).lines.reduce((sum,line)=>sum+line.quantity,0);$$('.cart-count').forEach(el=>el.textContent=String(count));}
updateCount();

// Preserve the existing focus trap and add inert background + scroll lock.
const panel=$('#main-menu'),triggers=$$('.menu-trigger'),closer=$('.menu-close'),backdrop=$('.menu-backdrop');
let previousFocus=null,savedOverflow='';
function toggleMenu(open){
  panel.inert=!open;panel.classList.toggle('active',open);panel.setAttribute('aria-hidden',String(!open));backdrop.hidden=!open;
  triggers.forEach(trigger=>{trigger.classList.toggle('active',open);trigger.setAttribute('aria-expanded',String(open));});
  const background=$('#page-shell');background.inert=open;
  if(open){previousFocus=document.activeElement;savedOverflow=document.body.style.overflow;document.body.style.overflow='hidden';window.previewLenis?.stop();closer.focus();}
  else{document.body.style.overflow=savedOverflow;window.previewLenis?.start();(previousFocus||triggers[0]).focus();}
}
triggers.forEach(t=>t.addEventListener('click',()=>toggleMenu(!panel.classList.contains('active'))));
closer.addEventListener('click',()=>toggleMenu(false));backdrop.addEventListener('click',()=>toggleMenu(false));
document.addEventListener('keydown',event=>{
  if(!panel.classList.contains('active'))return;
  if(event.key==='Escape'){event.preventDefault();toggleMenu(false);}
  if(event.key==='Tab'){
    const focusable=$$('a[href],button:not([disabled]),[tabindex="0"]',panel).filter(el=>el.getClientRects().length);
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});

const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const audio=$('.ambient-audio'),sound=$('.sound-switcher'),video=$('.hero-video'),videoSwitch=$('.video-switch');
if(sound)sound.addEventListener('click',async()=>{if(audio.paused){try{await audio.play();sound.innerHTML='Zvuk zapnutý <span aria-hidden="true">◎</span>';sound.setAttribute('aria-pressed','true');}catch{toast('Zvuk sa nepodarilo spustiť. Skúste to znova.');}}else{audio.pause();sound.innerHTML='Zvuk vypnutý <span aria-hidden="true">◎</span>';sound.setAttribute('aria-pressed','false');}});
function syncVideo(){if(!videoSwitch)return;videoSwitch.textContent=video.paused?'▷':'Ⅱ';videoSwitch.setAttribute('aria-pressed',String(video.paused));videoSwitch.setAttribute('aria-label',video.paused?'Prehrať video':'Pozastaviť video');}
if(video){video.muted=true;video.addEventListener('play',syncVideo);video.addEventListener('pause',syncVideo);videoSwitch.addEventListener('click',()=>{if(video.paused)video.play().catch(()=>toast('Video sa nepodarilo spustiť.'));else video.pause();});if(reducedMotion.matches){video.autoplay=false;video.pause();syncVideo();}}

if(window.gsap&&window.ScrollTrigger){
  gsap.registerPlugin(ScrollTrigger);
  const mm=gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)',()=>{
    let lenis,parallax;
    const tick=time=>lenis?.raf(time*1000);
    if(window.Lenis){lenis=new Lenis({anchors:true});window.previewLenis=lenis;lenis.on('scroll',ScrollTrigger.update);gsap.ticker.add(tick);}
    $$('.reveal').forEach(el=>gsap.from(el,{y:65,opacity:0,ease:'power4.out',scrollTrigger:{trigger:el,start:'top bottom',end:'top 78%',scrub:true}}));
    if($('.hero'))gsap.to('.hero-rail',{backgroundColor:'rgba(42,50,34,.65)',opacity:0,scrollTrigger:{trigger:'.hero',start:'top top',end:'bottom top',scrub:true}});
    if(window.simpleParallax&&$$('.parallax').length)parallax=new simpleParallax(document.querySelectorAll('.parallax'),{orientation:'down',scale:1.2,delay:.5});
    return()=>{lenis?.destroy();parallax?.destroy();gsap.ticker.remove(tick);window.previewLenis=null;};
  });
}
reducedMotion.addEventListener('change',event=>{if(event.matches&&video){video.pause();syncVideo();}});

document.addEventListener('click',async event=>{
  const add=event.target.closest('[data-add]');
  if(add){const result=await api.addToCart(add.dataset.add);updateCount();toast(result.message);return;}
  const a=event.target.closest('a[href]');
  if(!a||a.target||a.download||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
  const url=new URL(a.href,location.href);
  if(url.origin!==location.origin||url.pathname===location.pathname&&url.search===location.search&&url.hash||reducedMotion.matches)return;
  event.preventDefault();$('.page-transition').classList.add('active');setTimeout(()=>location.assign(url.href),220);
});
window.addEventListener('pageshow',()=>{$('.page-transition').classList.remove('active');if(panel.classList.contains('active'))toggleMenu(false);updateCount();});

const filterForm=$('.catalog-controls');
if(filterForm){
  const params=new URLSearchParams(location.search);
  for(const name of ['category','search','filter'])if(params.has(name))filterForm.elements[name].value=params.get(name);
  let renderSequence=0;const render=async()=>{const sequence=++renderSequence;const query=Object.fromEntries(new FormData(filterForm));const products=await api.getProducts(query);if(sequence!==renderSequence)return;$('#catalog-results').innerHTML=products.length?products.map(card).join(''):'<div class="empty-state"><h2>Nič sme nenašli.</h2><p>Skúste iný názov alebo kategóriu.</p><button class="button outline" type="button" id="reset-filters">Zobraziť všetko</button></div>';$('.result-count').textContent=`${products.length} produktov`;
    const search=new URLSearchParams(Object.entries(query).filter(([,v])=>v));history.replaceState(null,'',location.pathname+(search.size?'?'+search:''));
    $('#reset-filters')?.addEventListener('click',()=>{for(const name of ['search','category','filter'])filterForm.elements[name].value='';render();});
  };
  filterForm.addEventListener('input',render);filterForm.addEventListener('submit',ev=>{ev.preventDefault();render();});render();
}
$('.add-product')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const result=await api.addToCart(form.dataset.code,Number(form.elements.quantity.value));$('.form-status',form.parentElement).textContent=result.message;toast(result.message);updateCount();});

const summary=cart=>`<h2>Váš výber</h2>${cart.lines.map(l=>`<div class="summary-row"><span>${e(l.name)} × ${l.quantity}</span><strong>${e(l.priceLabel)}<small> / kus · ukážka</small></strong></div>`).join('')}<div class="summary-row"><span>Kupón</span><strong>${e(cart.discountLabel)}</strong></div><div class="summary-row"><span>Celkom</span><strong>${e(cart.totalLabel)}</strong></div><p class="fine-print">Finálne ceny, zľavy a dopravu určí server po napojení. V náhľade sa peniaze nepočítajú.</p>`;
async function renderCart(){
  const target=$('#cart-view');if(!target)return;
  const cart=await api.getCart();
  if(!cart.lines.length){target.innerHTML=`<div class="empty-state"><p class="eyebrow">PRIESTOR PRE VAŠE RITUÁLY</p><h2>Váš košík je zatiaľ prázdny.</h2><p>Vyberte si niečo, čo vám spraví radosť.</p>${button('/eshop','Objaviť obchod')}</div>`;return;}
  target.innerHTML=`<div class="cart-layout"><div>${cart.lines.map(l=>`<article class="cart-line"><img src="${l.image}" alt="" width="95" height="116"><div><h2><a href="/eshop/produkt/${e(l.slug)}">${e(l.name)}</a></h2><p>${e(l.priceLabel)} / kus · ukážka</p><div class="quantity"><button data-quantity="${l.quantity-1}" data-slug="${l.slug}" aria-label="Znížiť množstvo: ${e(l.name)}">−</button><span aria-label="Množstvo">${l.quantity}</span><button data-quantity="${l.quantity+1}" data-slug="${l.slug}" ${l.quantity>=99?'disabled':''} aria-label="Zvýšiť množstvo: ${e(l.name)}">+</button></div></div><button class="remove-line" data-quantity="0" data-slug="${l.slug}" aria-label="Odstrániť ${e(l.name)}">Odstrániť</button></article>`).join('')}<form class="coupon-form"><div class="coupon-input"><label>Zľavový kupón<input name="coupon" value="${e(cart.coupon)}" placeholder="Ukážkový kód DEMO10" maxlength="100" required></label><button class="button outline" type="submit">Použiť</button></div><p class="form-status" role="status"></p>${cart.coupon?'<button type="button" id="remove-coupon" class="text-link">Odstrániť kupón</button>':''}</form></div><aside class="order-summary">${summary(cart)}${button('/pokladna','Pokračovať na objednávku')}</aside></div>`;
  $$('[data-quantity]',target).forEach(btn=>btn.addEventListener('click',async()=>{const slug=btn.dataset.slug,q=Number(btn.dataset.quantity);const result=await api.setQuantity(slug,q);if(!result.ok){toast(result.message);return;}await renderCart();updateCount();const remaining=$$('[data-slug]',target).find(el=>el.dataset.slug===slug);(remaining||$('a',target))?.focus();}));
  $('.coupon-form',target).addEventListener('submit',async event=>{event.preventDefault();const result=await api.applyCoupon(event.currentTarget.elements.coupon.value);if(result.ok)await renderCart();$('.coupon-form .form-status',target).textContent=result.message;});
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
