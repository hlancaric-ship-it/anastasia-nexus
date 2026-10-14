import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const playwright=await import(process.env.PLAYWRIGHT_MODULE||pathToFileURL('/Users/lucky/hra-studio54/node_modules/playwright/index.mjs').href);
const base=process.env.STOREFRONT_URL||'http://127.0.0.1:4173';
const root=fileURLToPath(new URL('../test-results/',import.meta.url));await mkdir(root,{recursive:true});
const browser=await playwright.chromium.launch({channel:'chrome',headless:true});
const errors=[],apiCalls=[],failures=[],checks=[];
const watch=ctx=>{
  ctx.on('request',r=>{const url=new URL(r.url());if(url.origin!==base||/\/(store|auth|admin)\//.test(url.pathname))apiCalls.push(r.url());});
  ctx.on('page',p=>{p.on('pageerror',err=>errors.push(p.url()+' '+err.message));p.on('console',m=>{if(m.type()==='error')errors.push(p.url()+' '+m.text());});});
};
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});watch(context);
const page=await context.newPage();
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const goto=async(path,p=page)=>{const response=await p.goto(base+path,{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);return response;};
const loadImages=async(p=page)=>{await p.locator('img').evaluateAll(async images=>{await Promise.all(images.map(img=>{img.loading='eager';return img.decode().catch(()=>{});}));});};
const overflow=async(p=page,label='')=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow '+label);
const isActive=locator=>locator.evaluate(el=>el===document.activeElement);
const activeInside=(p,selector)=>p.evaluate(s=>document.querySelector(s).contains(document.activeElement),selector);
// Viditelný spouštěč menu v hlavičce (široká: pilulka „Menu“, úzká: tlačítko „Menu“ vlevo).
const headerTrigger=(p=page)=>p.locator('header [data-menu-open="top"]').locator('visible=true').first();
const menuState=(p,kind)=>p.evaluate(kind=>{const m=document.querySelector(`#dc-${kind}-menu`);return{hidden:m.getAttribute('aria-hidden'),inert:m.inert,opacity:getComputedStyle(m).opacity,pointer:getComputedStyle(m).pointerEvents,shellInert:document.querySelector('#page-shell').inert,railInert:document.querySelector('#ana-rail')?.inert??null,skipInert:document.querySelector('.skip-link').inert};},kind);
// Fokus musí zůstat v panelu: krajní body (Tab/Shift+Tab) i dlouhá smyčka Tabů.
const assertTrap=async(p,kind)=>{
  const panel=`#dc-${kind}-menu`;
  const items=p.locator(`${panel} :is(a[href],button:not([disabled]),input)`).locator('visible=true');
  const first=items.first(),last=items.last();
  await first.focus();await p.keyboard.press('Shift+Tab');assert.equal(await isActive(last),true,kind+': Shift+Tab z prvního skočí na poslední');
  await p.keyboard.press('Tab');assert.equal(await isActive(first),true,kind+': Tab z posledního skočí na první');
  const count=await items.count();
  for(let i=0;i<count+3;i++){await p.keyboard.press('Tab');assert.equal(await activeInside(p,panel),true,kind+': Tab #'+i+' zůstává v menu');}
  // Fokus mimo panel (klik do prázdna) se Tabem vrátí dovnitř, ne na skip-link ani za stránku.
  await p.evaluate(()=>document.activeElement.blur());await p.keyboard.press('Tab');assert.equal(await activeInside(p,panel),true,kind+': Tab z body se vrací do menu');
  await p.evaluate(()=>document.activeElement.blur());await p.keyboard.press('Shift+Tab');assert.equal(await activeInside(p,panel),true,kind+': Shift+Tab z body se vrací do menu');
};
const assertClosed=async(p,kind)=>{const s=await menuState(p,kind);assert.equal(s.hidden,'true');assert.equal(s.inert,true);assert.equal(s.shellInert,false);assert.equal(s.skipInert,false);if(s.railInert!==null)assert.equal(s.railInert,false);};
const assertOpen=async(p,kind)=>{await p.waitForFunction(k=>getComputedStyle(document.querySelector(`#dc-${k}-menu`)).opacity==='1',kind);const s=await menuState(p,kind);assert.equal(s.hidden,'false');assert.equal(s.inert,false);assert.equal(s.pointer,'auto');assert.equal(s.shellInert,true,'zbytek stránky je inert');assert.equal(s.skipInert,true,'skip-link je inert');if(s.railInert!==null)assert.equal(s.railInert,true,'lišta je inert');await p.waitForFunction(k=>document.querySelector(`#dc-${k}-menu`).contains(document.activeElement),kind);};
// Opakované malé posuny: tón lišty se sonduje každý ~6. snímek scrollu (jako v návrhu).
const settleScroll=async(p,y)=>{for(let i=0;i<8;i++){await p.evaluate(v=>scrollTo(0,v),y+(i%2));await p.waitForTimeout(40);}};
try{
 await check('hero: ztlumené video bez zvuku, CSP self, lokální assety, hlavička uvnitř hero',async()=>{
   const response=await goto('/');
   const csp=response.headers()['content-security-policy']||'';
   for(const directive of ["default-src 'self'","script-src 'self'","img-src 'self'","media-src 'self'","font-src 'self'","connect-src 'self'"])assert.ok(csp.includes(directive),'CSP '+directive);
   assert.equal(/https?:\/\//.test(csp),false,'CSP bez externích hostů');
   const external=await page.evaluate(()=>[...document.querySelectorAll('script[src],link[href],img[src],video source[src],video[poster],audio[src],iframe')].map(el=>el.getAttribute('src')||el.getAttribute('href')||el.getAttribute('poster')).filter(u=>/^(https?:)?\/\//.test(u)));
   assert.deepEqual(external,[],'všechny skripty, styly a média jsou lokální');
   const hero=page.locator('[data-screen-label="01 Hero"]'),video=hero.locator('video[data-video="hero"]');
   assert.equal(await hero.locator('header').count(),1,'hlavička je uvnitř hero');
   assert.equal(await video.evaluate(v=>v.muted&&v.defaultMuted),true,'hero video je ztlumené');
   assert.equal(await video.evaluate(v=>v.paused&&!v.autoplay),true,'reduced motion: hero video stojí');
   assert.ok(await video.evaluate(v=>[...v.querySelectorAll('source')].every(s=>s.getAttribute('src').startsWith('/media/'))));
   assert.equal(await page.locator('audio').count(),0,'žádný audio prvek se nevytvoří bez kliknutí');
   assert.equal(await page.locator('[data-sound-toggle]').getAttribute('aria-pressed'),'false');
   assert.match(await page.locator('[data-sound-toggle]').textContent(),/Zvuk vypnutý/);
   assert.ok(Math.abs(await hero.evaluate(el=>el.offsetHeight)-1000)<=1,'hero = výška okna');
   await overflow();await loadImages();await page.screenshot({path:root+'home-desktop.png',fullPage:true});
 });
 await check('top menu modal: focus trap, inert, Escape, overlay, návrat fokusu na spouštěč',async()=>{
   await goto('/');const trigger=headerTrigger();
   await assertClosed(page,'top');assert.equal(await trigger.getAttribute('aria-expanded'),'false');
   await trigger.click();await assertOpen(page,'top');assert.equal(await trigger.getAttribute('aria-expanded'),'true');
   assert.equal(await page.locator('#dc-top-menu').getAttribute('aria-modal'),'true');assert.equal(await page.locator('#dc-top-menu').getAttribute('role'),'dialog');
   const bounds=await page.locator('#dc-top-menu').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=1440&&bounds.y>=0&&bounds.y+bounds.height<=1000,'top menu v okně');
   await page.screenshot({path:root+'menu-desktop.png'});
   await assertTrap(page,'top');
   await page.keyboard.press('Escape');await assertClosed(page,'top');assert.equal(await isActive(trigger),true,'Escape vrací fokus na spouštěč');assert.equal(await trigger.getAttribute('aria-expanded'),'false');
   // Zavření tlačítkem a klikem na overlay.
   await trigger.click();await assertOpen(page,'top');await page.locator('#dc-top-menu button[data-menu-close]').click();await assertClosed(page,'top');assert.equal(await isActive(trigger),true);
   await trigger.click();await assertOpen(page,'top');await page.mouse.click(200,900);await assertClosed(page,'top');assert.equal(await isActive(trigger),true,'overlay vrací fokus');
   // Odkaz v menu zavře menu a naviguje (kotva na úvodu i jiná stránka).
   await trigger.click();await assertOpen(page,'top');await page.locator('#dc-top-menu a[href="#kolekcia"]').click();await assertClosed(page,'top');
   await page.waitForFunction(()=>Math.abs(document.querySelector('#kolekcia').getBoundingClientRect().top)<=2);assert.equal(new URL(page.url()).hash,'#kolekcia');
   await page.evaluate(()=>scrollTo(0,0));await trigger.click();await assertOpen(page,'top');
   await Promise.all([page.waitForURL(base+'/eshop'),page.locator('#dc-top-menu a[href="/eshop"]').click()]);
   assert.equal(await page.locator('#dc-top-menu').getAttribute('aria-hidden'),'true');
 });
 await check('side menu z lišty: focus trap, inert, Escape, návrat fokusu, umístění vedle lišty',async()=>{
   await goto('/');const opener=page.locator('#ana-rail [data-menu-open="side"]');
   await opener.click();await assertOpen(page,'side');assert.equal(await opener.getAttribute('aria-expanded'),'true');
   assert.equal(await page.locator('#dc-top-menu').getAttribute('aria-hidden'),'true','druhé menu zůstává zavřené');
   const bounds=await page.locator('#dc-side-menu').boundingBox();assert.ok(bounds.x>=52&&bounds.width<=300&&bounds.y>=0&&bounds.y+bounds.height<=1000,'side menu vpravo od lišty');
   await page.screenshot({path:root+'side-menu-desktop.png'});
   await assertTrap(page,'side');
   await page.keyboard.press('Escape');await assertClosed(page,'side');assert.equal(await isActive(opener),true,'Escape vrací fokus na tlačítko v liště');
   // Klávesnicí: Enter otevře, Escape zavře.
   await opener.focus();await page.keyboard.press('Enter');await assertOpen(page,'side');await page.keyboard.press('Escape');await assertClosed(page,'side');assert.equal(await isActive(opener),true);
   for(const path of ['/o-lucii','/eshop']){await goto(path);await page.locator('#ana-rail [data-menu-open="side"]').click();await assertOpen(page,'side');await page.keyboard.press('Escape');await assertClosed(page,'side');}
 });
 await check('lišta a hlavička při scrollu: lišta fixní, adaptivní tón, hlavička není sticky',async()=>{
   for(const path of ['/','/o-lucii','/eshop']){
     await goto(path);const rail=page.locator('#ana-rail');assert.equal(await rail.isVisible(),true,path+': lišta viditelná ≥1000px');
     const r0=await rail.boundingBox();assert.deepEqual([r0.x,r0.y,r0.width,r0.height],[0,0,52,1000],path+': lišta 52px přes celou výšku');
     const h0=await page.locator('header').first().boundingBox();
     await settleScroll(page,1500);
     const r1=await rail.boundingBox();assert.deepEqual([r1.x,r1.y,r1.height],[0,0,1000],path+': lišta zůstává fixní');
     const h1=await page.locator('header').first().boundingBox();assert.ok(h1.y<=h0.y-1400,path+': hlavička odjíždí se stránkou');
     assert.equal(await rail.evaluate(el=>getComputedStyle(el).position),'fixed');
   }
   // O Lucii má světlou sekci: lišta přepne na světlý tón a zpět na tmavý.
   await goto('/o-lucii');const rail=page.locator('#ana-rail');
   const lightY=await page.evaluate(()=>{for(const s of document.querySelectorAll('main section')){const m=getComputedStyle(s).backgroundColor.match(/[\d.]+/g);if(!m||(m[3]!==undefined&&+m[3]<0.5))continue;if((0.299*m[0]+0.587*m[1]+0.114*m[2])/255>0.62)return s.getBoundingClientRect().top+scrollY+s.offsetHeight/2-innerHeight/2;}return null;});
   assert.ok(lightY!==null,'O Lucii obsahuje světlou sekci');
   await settleScroll(page,Math.round(lightY));await page.waitForFunction(()=>document.querySelector('#ana-rail').style.color==='rgb(40, 48, 32)');
   await page.screenshot({path:root+'rail-light.png'});
   await settleScroll(page,0);await page.waitForFunction(()=>document.querySelector('#ana-rail').style.color==='rgb(239, 229, 199)');
   assert.equal(await rail.evaluate(el=>getComputedStyle(el).position),'fixed');
 });
 await check('reduced motion zobrazí veškerý obsah bez animací',async()=>{
   for(const path of ['/','/o-lucii','/zdravy-svet']){
     await goto(path);
     const H=await page.evaluate(()=>document.documentElement.scrollHeight);for(let y=0;y<H;y+=700)await page.evaluate(v=>scrollTo(0,v),y);await page.waitForTimeout(100);
     const hidden=await page.evaluate(()=>[...document.querySelectorAll('main h1, main h2, main h3, main p, main article, main li, footer p, footer form')].filter(el=>el.getClientRects().length).filter(el=>{for(let n=el;n&&n!==document.body;n=n.parentElement){const cs=getComputedStyle(n);if(+cs.opacity<0.5||cs.transform.startsWith("matrix(1, 0, 0, 1, 0, 28)")||cs.visibility==='hidden')return true;}return false;}).map(el=>el.tagName+':'+el.textContent.trim().slice(0,40)));
     assert.deepEqual(hidden,[],path+': nic není schované');
     assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('lenis')),false,path+': bez Lenis');
     assert.ok(await page.locator('video').evaluateAll(v=>v.every(x=>x.muted&&x.paused)),path+': videa stojí a jsou ztlumená');
   }
   await goto('/');await page.evaluate(()=>scrollTo(0,500));await page.waitForTimeout(80);
   const heroContent=await page.locator('[data-screen-label="01 Hero"]').evaluate(h=>getComputedStyle(h.lastElementChild).opacity);assert.equal(heroContent,'1','hero obsah nemizí');
 });
 await check('klávesnice: skip-link, všechny odkazy dosažitelné, viditelný fokus, text roll na hover',async()=>{
   for(const [path,width] of [['/',1440],['/o-lucii',1440],['/',390],['/eshop',1440]]){
     await page.setViewportSize({width,height:width===390?844:1000});await goto(path);
     await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'skip-link',path+': první Tab = skip-link');
     assert.ok(await page.evaluate(()=>document.activeElement.getBoundingClientRect().top>=0),'skip-link se po fokusu ukáže');
     await page.keyboard.press('Enter');await page.waitForFunction(()=>document.activeElement.id==='main');
     await page.evaluate(()=>{document.activeElement.blur();scrollTo(0,0);});
     const expected=await page.evaluate(()=>[...document.querySelectorAll('a[href],button:not([disabled]),input,select,textarea')].filter(el=>el.getClientRects().length&&!el.closest('[inert]')&&el.tabIndex>=0&&getComputedStyle(el).visibility!=='hidden').length);
     const seen=new Set();let noRing=[];
     for(let i=0;i<expected+6;i++){
       await page.keyboard.press('Tab');
       const info=await page.evaluate(()=>{const a=document.activeElement;if(!a||a===document.body)return null;a.dataset.kbSeen??=Math.random().toString(36).slice(2);const cs=getComputedStyle(a);return{id:a.dataset.kbSeen,ring:cs.outlineStyle!=='none'&&parseFloat(cs.outlineWidth)>0||cs.boxShadow!=='none',inert:!!a.closest('[inert]'),visible:a.getClientRects().length>0,tag:a.tagName+' '+(a.getAttribute('href')||a.getAttribute('aria-label')||a.textContent.trim().slice(0,30))};});
       if(!info)continue;assert.equal(info.inert,false,path+': fokus nevstoupí do inert části '+info.tag);assert.equal(info.visible,true,path+': fokus na neviditelný prvek '+info.tag);
       if(!info.ring)noRing.push(info.tag);seen.add(info.id);
     }
     assert.ok(seen.size>=expected,`${path} @${width}: Tabem dosažitelných ${seen.size}/${expected}`);
     assert.deepEqual(noRing,[],path+': fokus je vždy viditelný');
     const closedMenuFocusable=await page.evaluate(()=>[...document.querySelectorAll('#dc-side-menu a, #dc-top-menu a')].some(el=>el.dataset.kbSeen));
     assert.equal(closedMenuFocusable,false,path+': zavřená menu nejsou v pořadí Tabu');
   }
   await page.setViewportSize({width:1440,height:1000});await goto('/');
   const link=page.locator('header a[href="#kolekcia"]');
   assert.equal(await link.getAttribute('data-roll'),'1');
   assert.equal(await link.locator('[aria-hidden="true"]').textContent(),'Obchod','duplikát pro roll je skrytý čtečkám');
   assert.equal(await page.getByRole('link',{name:'Obchod',exact:true}).first().evaluate(el=>el.getAttribute('href')),'#kolekcia','přístupný název beze zdvojení');
   await link.hover();await page.waitForTimeout(700);
   assert.match(await link.locator('.roll-a').evaluate(el=>el.style.transform),/translateY\(-105%\)/);
   assert.equal(await link.locator('.roll-a').evaluate(el=>Math.round(el.getBoundingClientRect().top)<Math.round(el.parentElement.getBoundingClientRect().top)),true,'text roll odjede nahoru');
   await page.mouse.move(700,700);await page.waitForTimeout(700);assert.equal(await link.locator('.roll-a').evaluate(el=>el.style.transform),'');
   const rollCount=await page.locator('[data-roll="1"]').count();assert.ok(rollCount>=40,'text roll na odkazech a tlačítkách ('+rollCount+')');
 });
 await check('pôvodný obsah zachovaný naprieč verejnými sekciami',async()=>{
   const original=JSON.parse(await readFile(new URL('../src/legacy-content.json',import.meta.url),'utf8'));
   const normalize=text=>text.replace(/\s+/g,' ').trim();
   for(const [path,source] of Object.entries(original)){
     if(!source.blocks.length)continue;
     await goto(path);
     const texts=source.blocks.filter(b=>b.type!=='image').map(b=>normalize(b.text));
     if(await page.locator('.story-copy').count()){
       const actual=normalize((await page.locator('.story-copy').evaluateAll(elements=>elements.flatMap(e=>[...e.children].map(child=>{const c=child.cloneNode(true);c.querySelectorAll('[aria-hidden="true"]').forEach(n=>n.remove());return c.textContent;})))).join(' '));
       assert.equal(actual,normalize(texts.join(' ')),path+' retains all source wording');
     }else{
       // Zdravý svet je nová kompozice (bloky rozdělené do sekcí): každá původní věta musí být doslova přítomna.
       // Jediná povolená odchylka: oprava překlepu „Ligth“ → „Light“ z původního webu.
       const main=(await page.locator('main').evaluate(el=>[...el.querySelectorAll('h1,h2,h3,p')].map(n=>{const c=n.cloneNode(true);c.querySelectorAll('[aria-hidden="true"]').forEach(x=>x.remove());return c.textContent;}).join(' '))).replace(/\s/g,'');
       for(const text of texts)for(const sentence of text.split(/(?<=[.?!…])\s+/))assert.ok(main.includes(sentence.replace('Ligth','Light').replace(/\s/g,'')),`${path}: chýba „${sentence.slice(0,60)}“`);
     }
     assert.ok(await page.locator('video').evaluateAll(videos=>videos.every(v=>v.muted&&v.paused)),'reduced motion pauses supplemental videos');
   }
   await goto('/');assert.equal(await page.locator('header a[aria-label="Môj účet"]').count(),0);
   for(const kind of ['side','top']){assert.equal(await page.locator(`#dc-${kind}-menu a[aria-label="Košík"][href="/kosik"]`).count(),1);assert.equal(await page.locator(`#dc-${kind}-menu a[aria-label="Môj účet"][href="/prihlasenie"]`).count(),1);}
 });
 await check('catalog filters and empty state',async()=>{await goto('/eshop');await page.getByRole('searchbox').fill('nenajdeny-produkt');assert.equal(await page.locator('.product-card').count(),0);await page.getByRole('button',{name:'Zobraziť všetko'}).click();assert.equal(await page.locator('.product-card').count(),16);await page.locator('[name=category]').selectOption('Kozmetika');assert.equal(await page.locator('.product-card').count(),4);await page.screenshot({path:root+'catalog-desktop.png',fullPage:true});});
 await check('home: Do košíka z kolekcie zvýši počet v hlavičke aj menu',async()=>{await page.evaluate(()=>sessionStorage.clear());await goto('/');const add=page.locator('[data-add]').first();await add.click();await page.waitForFunction(()=>[...document.querySelectorAll('.cart-count')].every(el=>el.textContent==='1'));assert.match(await add.textContent(),/Pridané/);await page.evaluate(()=>sessionStorage.clear());});
 await check('product add, cart quantity, remove and coupon states',async()=>{await goto('/eshop/produkt/bio-sprchovy-gel');await page.locator('[name=quantity]').fill('2');await page.getByRole('button',{name:'Pridať do košíka'}).click();await goto('/kosik');assert.equal(await page.locator('.quantity>span').textContent(),'2');await page.getByRole('button',{name:'Zvýšiť množstvo: Bio sprchový gél'}).click();assert.equal(await page.locator('.quantity>span').textContent(),'3');await page.locator('[name=coupon]').fill('INVALID');await page.getByRole('button',{name:'Použiť',exact:true}).click();assert.match(await page.locator('.coupon-form .form-status').textContent(),/nie je/);await page.locator('[name=coupon]').fill('DEMO10');await page.getByRole('button',{name:'Použiť',exact:true}).click();assert.match(await page.locator('.order-summary').textContent(),/DEMO10/);await page.screenshot({path:root+'cart-desktop.png',fullPage:true});});
 await check('checkout steps, validation and four outcomes',async()=>{await goto('/pokladna');await page.getByRole('button',{name:'Pokračovať na doručenie'}).click();assert.equal(await page.locator('[data-step="1"]').isVisible(),true);await page.locator('#checkout-form [name=firstName]').fill('Demo');await page.locator('#checkout-form [name=lastName]').fill('Ukazka');await page.locator('#checkout-form [name=email]').fill('demo@example.test');await page.getByRole('button',{name:'Pokračovať na doručenie'}).click();await page.getByRole('button',{name:'Pokračovať na platbu'}).click();await page.locator('[name=consent]').check();for(const scenario of ['ALLOW','REVIEW','BLOCK','ERROR']){await page.locator('[name=scenario]').selectOption(scenario);await page.getByRole('button',{name:'Vyskúšať dokončenie'}).click();assert.equal(await page.locator('#checkout-result').getAttribute('data-state'),scenario);}await page.screenshot({path:root+'checkout-desktop.png',fullPage:true});});
 await check('QR product + quantity + coupon; refresh is idempotent',async()=>{await page.evaluate(()=>sessionStorage.clear());await goto('/eshop/kosik?produkt=DEMO-GEL&kupon=DEMO10&ks=2');assert.equal(await page.locator('.quantity>span').textContent(),'2');assert.match(await page.locator('.order-summary').textContent(),/DEMO10/);await page.reload();assert.equal(await page.locator('.quantity>span').textContent(),'2');await goto('/eshop/kosik?produkt=DEMO-GEL&ks=bad');assert.match(await page.locator('.qr-status').textContent(),/neplatné/);});
 await check('magic-link forms are mock only; token removed from URL',async()=>{await goto('/prihlasenie');await page.locator('#login-form [name=email]').fill('demo@example.test');await page.getByRole('button',{name:'Poslať prihlasovací odkaz'}).click();assert.match(await page.locator('#login-form .form-status').textContent(),/Ak účet existuje/);await goto('/prihlasenie/potvrdit?email=demo@example.test&token=fake');assert.equal(new URL(page.url()).search,'');assert.match(await page.locator('#magic-confirm').textContent(),/neprihlasuje/);});
 await check('entitlements remain locked until explicit preview selection',async()=>{await goto('/reset-40/knihovna');assert.equal(await page.locator('.lesson').count(),0);await page.locator('#entitlement-preview').selectOption('unlocked');assert.equal(await page.locator('.lesson').count(),16);await page.locator('[data-lesson="1"]').click();assert.match(await page.locator('#lesson-content').textContent(),/Platené materiály nie sú/);await page.reload();assert.equal(await page.locator('.lesson').count(),0);});
 await check('contact form validates without sending or storing values',async()=>{await goto('/kontakt');await page.locator('#contact-form [name=name]').fill('Demo');await page.locator('#contact-form [name=email]').fill('demo@example.test');await page.locator('#contact-form [name=message]').fill('Toto je testovacia sprava.');await page.locator('#contact-form input[type=checkbox]').check();await page.getByRole('button',{name:'Vyskúšať formulár'}).click();assert.match(await page.locator('#contact-form .form-status').textContent(),/neodosiela/);assert.equal(await page.evaluate(()=>JSON.stringify(sessionStorage).includes('example.test')),false);});
 await check('newsletter v patičke nič neodosiela',async()=>{await goto('/');const form=page.locator('form[data-newsletter]');await form.locator('[name=email]').fill('demo@example.test');const before=page.url();await form.locator('button').click();await page.waitForTimeout(150);assert.equal(page.url(),before);assert.match(await form.locator('button').textContent(),/Ďakujeme/);assert.equal(await page.evaluate(()=>JSON.stringify(sessionStorage).includes('example.test')),false);});
 const routes=JSON.parse(await readFile(new URL('../dist/routes.json',import.meta.url),'utf8'));
 const csv=await readFile(new URL('../../backend/docs/wp/redirects-map.csv',import.meta.url),'utf8');
 const legacyRaw=[...new Set(csv.trim().split(/\r?\n/).slice(1).map(row=>new URL(row.split(',')[1]).pathname))];
 const legacyTargets=[...new Set(legacyRaw.map(p=>p.replace(/\/$/,'')||'/'))];
 await check(`all ${routes.length} static routes (${legacyRaw.length} legacy targets), chrome, images and internal link targets`,async()=>{
   assert.equal(legacyRaw.length,34,'34 legacy cieľov (vrátane variantov s lomkou)');
   for(const raw of legacyRaw){const r=await context.request.get(base+raw,{maxRedirects:0});assert.equal(r.status(),200,'legacy '+raw);}
   const paths=new Set(routes.map(p=>p.replace(/\/$/,'')||'/'));for(const t of legacyTargets)assert.ok(paths.has(t),'legacy route '+t);
   for(const required of ['/','/o-lucii','/zdravy-svet','/eshop','/kosik','/eshop/kosik','/pokladna','/prihlasenie','/ucet','/reset-40/knihovna','/kontakt','/gdpr'])assert.ok(paths.has(required),'route '+required);
   let links=new Set();
   for(const path of routes){
     const before=errors.length;const response=await page.goto(base+path,{waitUntil:'load'});assert.equal(response.status(),200,path);
     assert.equal(await page.locator('h1').count(),1,path);await overflow(page,path);
     assert.equal(await page.locator('#ana-rail').count(),1,path+': lišta');assert.equal(await page.locator('header').count(),1,path+': hlavička');assert.equal(await page.locator('footer').count(),1,path+': patička');
     assert.equal(await page.locator('#dc-side-menu[aria-hidden="true"][inert]').count()+await page.locator('#dc-top-menu[aria-hidden="true"][inert]').count(),2,path+': menu zavřená');
     const broken=await page.locator('img').evaluateAll(images=>images.filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src));assert.deepEqual(broken,[],path);
     assert.deepEqual(errors.slice(before),[],path+': bez chyb');
     for(const href of await page.locator('a[href]').evaluateAll(els=>els.map(el=>el.getAttribute('href'))))if(href.startsWith('/'))links.add(new URL(href,'http://local').pathname.replace(/\/$/,'')||'/');
   }
   for(const link of links)assert.ok(paths.has(link),`Link target exists: ${link}`);
   await page.setViewportSize({width:390,height:844});
   for(const path of routes){const before=errors.length;await page.goto(base+path,{waitUntil:'load'});await overflow(page,path+'@390');assert.deepEqual(errors.slice(before),[],path+'@390: bez chyb');}
   await page.setViewportSize({width:1440,height:1000});
   const missing=await page.goto(base+'/neexistuje-xyz');assert.equal(missing.status(),404);
   // Očekávaná hláška prohlížeče k zamýšlené 404 – jen přesně tato, ostatní chyby zůstávají.
   await page.waitForTimeout(150);for(let i=errors.length-1;i>=0;i--)if(errors[i]===base+'/neexistuje-xyz Failed to load resource: the server responded with a status of 404 (Not Found)')errors.splice(i,1);assert.equal(await page.locator('#ana-rail').count(),1);
 });
 await check('responsive: overflow + menu na 320, 360, 390, 768, 1024; lišta jen ≥1000px',async()=>{
   for(const width of [320,360,390,768,1024]){
     await page.setViewportSize({width,height:844});
     for(const path of ['/','/o-lucii','/zdravy-svet','/eshop','/eshop/produkt/bio-sprchovy-gel','/kosik','/pokladna','/kontakt','/reset-40/knihovna']){await goto(path);await overflow(page,path+'@'+width);}
     await goto('/');
     assert.equal(await page.locator('#ana-rail').isVisible(),width>=1000,`lišta @${width}`);
     assert.equal(await page.locator('header a[href="#kolekcia"]').isVisible(),width>=1000,`odkazy hlavičky @${width}`);
     await loadImages();await page.screenshot({path:root+`home-${width}.png`,fullPage:true});
     const trigger=headerTrigger();await trigger.click();await assertOpen(page,'top');await overflow(page,'menu@'+width);
     const box=await page.locator('#dc-top-menu').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=844,`top menu v okně @${width}`);
     const inner=await page.locator('#dc-top-menu').evaluate(el=>{const p=el.getBoundingClientRect(),c=el.querySelector('button[data-menu-close]').getBoundingClientRect();return{fits:el.scrollWidth<=el.clientWidth+1,close:c.left>=p.left&&c.right<=p.right&&c.top>=p.top&&c.bottom<=p.bottom};});
     assert.equal(inner.fits,true,`menu bez vodorovného scrollu @${width}`);assert.equal(inner.close,true,`tlačidlo Zavrieť viditeľné v menu @${width}`);
     const scrollable=await page.locator('#dc-top-menu').evaluate(el=>el.scrollHeight<=el.clientHeight+1||getComputedStyle(el).overflowY==='auto');assert.ok(scrollable,'obsah menu je dosažitelný');
     await page.screenshot({path:root+`menu-${width}.png`});
     await page.keyboard.press('Escape');await assertClosed(page,'top');assert.equal(await isActive(trigger),true);
   }
   await page.setViewportSize({width:1440,height:1000});
 });
 await check('no backend, third-party requests or JavaScript errors',async()=>{assert.deepEqual(apiCalls,[]);assert.deepEqual(errors,[]);});
 const motion=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});watch(motion);const mp=await motion.newPage();
 await check('Lenis + reveal + parallax + hero fade aktívne pri povolenom pohybe',async()=>{
   await goto('/',mp);await mp.waitForFunction(()=>!!window.__anaLenis);assert.equal(await mp.evaluate(()=>document.documentElement.classList.contains('lenis')),true);
   const video=mp.locator('video[data-video="hero"]');assert.equal(await video.evaluate(v=>v.muted),true);await mp.waitForFunction(()=>!document.querySelector('video[data-video="hero"]').paused);assert.equal(await mp.locator('audio').count(),0);
   const target=mp.locator('[data-screen-label="05 Konzultácie"] h2').first();assert.equal(await target.evaluate(el=>el.style.opacity),'0','reveal čeká mimo obrazovku');
   const par=mp.locator('[data-screen-label="04 RESET 40+"] [data-par]');assert.match(await par.evaluate(el=>el.style.transform),/scale/);
   await mp.mouse.move(700,500);for(let i=0;i<8;i++){await mp.mouse.wheel(0,250);await mp.waitForTimeout(60);}await mp.waitForTimeout(600);
   assert.ok(await mp.evaluate(()=>window.__anaLenis.scroll>500),'Lenis posúva stránku');
   assert.ok(Number(await mp.locator('[data-screen-label="01 Hero"]').evaluate(h=>h.lastElementChild.style.opacity))<1,'hero obsah sa stráca pri scrolle');
   const t0=await par.evaluate(el=>el.style.transform);
   await mp.evaluate(()=>window.__anaLenis.scrollTo('[data-screen-label="05 Konzultácie"]',{immediate:true}));await mp.waitForTimeout(150);await mp.mouse.wheel(0,10);
   await mp.waitForFunction(()=>getComputedStyle(document.querySelector('[data-screen-label="05 Konzultácie"] h2')).opacity==='1',null,{timeout:5000});
   await mp.evaluate(()=>window.__anaLenis.scrollTo('[data-screen-label="04 RESET 40+"]',{immediate:true}));await mp.waitForTimeout(200);
   assert.notEqual(await par.evaluate(el=>el.style.transform),t0,'parallax vrstva sa hýbe so scrollom');
   await goto('/o-lucii',mp);await mp.waitForFunction(()=>!!window.__anaLenis);await mp.evaluate(()=>window.__anaLenis.scrollTo(700,{immediate:true}));await mp.waitForTimeout(800);await mp.screenshot({path:root+'about-motion.png'});
 });
 await check('pohyb: menu zastaví Lenis, v nízkom okne sa dá rolovať, Escape obnoví',async()=>{
   await mp.setViewportSize({width:900,height:500});await goto('/',mp);await mp.waitForFunction(()=>!!window.__anaLenis);
   await headerTrigger(mp).click();await assertOpen(mp,'top');assert.equal(await mp.evaluate(()=>document.documentElement.classList.contains('lenis-stopped')),true,'Lenis stojí');
   await mp.locator('#dc-top-menu').hover();await mp.mouse.wheel(0,600);await mp.waitForTimeout(200);
   assert.ok(await mp.locator('#dc-top-menu').evaluate(el=>el.scrollTop>0),'menu sa roluje');assert.equal(await mp.evaluate(()=>window.__anaLenis.scroll),0,'stránka pod menu stojí');
   await mp.keyboard.press('Escape');await assertClosed(mp,'top');assert.equal(await mp.evaluate(()=>document.documentElement.classList.contains('lenis-stopped')),false);
 });
 await check('zvuk sa spustí až po kliknutí a dá sa vypnúť; video pauza',async()=>{
   await mp.setViewportSize({width:1440,height:1000});await goto('/',mp);const sound=mp.locator('[data-sound-toggle]');
   await sound.click();await mp.waitForFunction(()=>document.querySelector('[data-sound-toggle]').getAttribute('aria-pressed')==='true');assert.match(await sound.textContent(),/Zvuk zapnutý/);
   await sound.click();assert.equal(await sound.getAttribute('aria-pressed'),'false');assert.match(await sound.textContent(),/Zvuk vypnutý/);
   const video=mp.locator('video[data-video="hero"]');await mp.waitForFunction(()=>!document.querySelector('video[data-video="hero"]').paused);
   await mp.locator('[data-video-toggle]').click();assert.equal(await video.evaluate(v=>v.paused),true);await mp.locator('[data-video-toggle]').click();await mp.waitForFunction(()=>!document.querySelector('video[data-video="hero"]').paused);
   assert.equal(await video.evaluate(v=>v.muted),true,'video zostáva stlmené');
 });
 const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});watch(touch);const tp=await touch.newPage();
 await check('touch cards expose purchase controls without hover',async()=>{await tp.goto(base+'/eshop');const card=tp.locator('.product-card').first();assert.equal(await card.locator('[data-add]').isVisible(),true);await card.locator('[data-add]').tap();await tp.goto(base+'/kosik');await tp.locator('.cart-line').waitFor();assert.equal(await tp.locator('.cart-line').count(),1);await tp.goto(base+'/eshop');await tp.locator('.product-card').first().scrollIntoViewIfNeeded();await tp.screenshot({path:root+'catalog-touch.png'});const touchInfo=await tp.locator('.product-info').first().evaluate(el=>({hoverNone:matchMedia('(hover:none)').matches,opacity:getComputedStyle(el).opacity,visibility:getComputedStyle(el).visibility}));assert.equal(touchInfo.opacity,'1');assert.equal(touchInfo.visibility,'visible');});
 await check('touch: menu na úvode sa otvorí ťuknutím a zavrie tlačidlom',async()=>{await tp.goto(base+'/');await headerTrigger(tp).tap();await assertOpen(tp,'top');await tp.locator('#dc-top-menu button[data-menu-close]').tap();await assertClosed(tp,'top');});
 await touch.close();
 assert.deepEqual(apiCalls,[]);assert.deepEqual(errors,[]);await motion.close();
 console.log(`${checks.length}/${checks.length} browser groups PASS`);
}catch(error){failures.push(error.stack);await page.screenshot({path:root+'failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await writeFile(root+'results.json',JSON.stringify({checks,failures,errors,apiCalls},null,2));await browser.close();}
