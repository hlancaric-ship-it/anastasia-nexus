# Storefront Fáze 1 — jasné podmínky akceptace

Zdroj: smlouva čl. 2 (rozsah Fáze 1) + Příloha č. 1 (testovací scénáře Fáze 1). Toto je to, co musí storefront umět, aby prošel předáním k testování **23. 10. 2026** a následně schválením Objednatelem (Lucia Rogožanová). Nic nad tento rozsah není pro Fázi 1 podmínkou — i18n, chráněná média, AI asistent, ambasadorský program a ComGate jsou výslovně Fáze 2 (čl. 2).

Doplňuje `docs/PROGRESS_LOG.md` (backend) — tento dokument popisuje jen to, co musí dodat storefront, aby mohl volat už hotové/ověřené backendové API.

---

## 1. Sedm testovacích scénářů z přílohy č. 1 — musí projít doslova

1. **Nákup produktu:** výběr produktu → košík → uplatnění slevového kupónu → platba kartou / Apple Pay / Google Pay přes Stripe → potvrzovací e-mail.
2. **Nákup RESET 40+:** po zaplacení se obsah automaticky zpřístupní; bez zaplacení není dostupný.
3. **Přihlášení migrované zákaznice:** účet, historie objednávek a dřívější přístupy (entitlementy) jsou po přihlášení vidět a zachované.
4. **Staré adresy a vytištěné QR kódy** vedou na správné stránky nového webu (301).
5. **Generátor QR kódů v administraci:** vytvoření kupónu → URL s automatickou slevou v košíku → stažitelný QR kód.
6. **Administrace:** správa produktů, cen, kategorií, kupónů, objednávek a zákaznic Objednatelem.
7. **Bezpečnostní rizika z auditu** prokazatelně odstraněna (to je backendová/infra položka, ne storefront — ale storefront nesmí žádné z nich znovu zavádět, např. klientský výpočet ceny/slevy).

Scénář 6 (administrace) je samostatný balík C5, **0 %, ještě nezačatý** — není podmínkou pro 23. 10., ale je podmínkou finálního schválení Fáze 1 před veřejným spuštěním. Pokud na 23. 10. nebude hotový, musí to být v hlášení Lucii jasně napsané jako chybějící část, ne zamlčené.

---

## 2. Konkrétní backendové API, na které se storefront musí napojit (hotové a ověřené)

Base URL Medusa serveru (lokálně `http://localhost:9100`, v NODE_ENV=development). Standardní Medusa Store API (produkty, kategorie, carts, customers, orders) je dostupné beze změny — storefront ho používá normálně podle Medusa dokumentace.

### Přihlášení (K6 — magic-link, HOTOVO, ověřeno živě)
- `POST /auth/customer/magic-link` s `{ "email": "..." }` → vždy odpoví `{ success:false, error:"LINK_SENT" }` (storefront to zobrazí jako „pokud účet existuje, poslali jsme odkaz" — **nikdy neukazovat, jestli účet existuje**).
- Odkaz z e-mailu vede na stránku storefrontu (`/prihlasenie/potvrdit?email=...&token=...`) — tu stránku musí storefront vytvořit; po načtení zavolá `POST /auth/customer/magic-link` s `{ email, token }`, dostane JWT, uloží ho a přihlásí zákaznici.
- Žádné heslo. Staré heslo se nepřenáší nikdy (viz migrace).

### Entitlementy / přístupy k RESET 40+ (K3, HOTOVO)
- `GET /store/entitlements` (přihlášená zákaznice) → vrátí seznam jejích aktivních oprávnění. Storefront podle toho ukazuje/skrývá obsah RESET 40+ — **nikdy nerozhodovat o přístupu jen podle toho, že produkt je v historii objednávek; vždy se ptát tohoto endpointu.**

### Cena podle tier (K1, HOTOVO)
- Tier se počítá server-side z `customer.metadata`/skupiny, storefront ho nikde sám nepočítá ani neukazuje slevu, kterou si sám spočítal — konečnou cenu vždy vrátí `/store/nexus-cart` (viz níže).

### Košík a SafeOrder (K2 HOTOVO, bezpečnostní oprava z `codex/wave1-security` ČEKÁ na sloučení)
- `POST /store/nexus-cart` — přepočet košíku se zohledněním tier ceny/kupónu, server-side.
- `POST /store/nexus-checkout` — SafeOrder: ALLOW/REVIEW(409)/BLOCK(403)/chyba(503). **Storefront musí každý z těchto čtyř stavů ukázat zákaznici srozumitelně** (např. REVIEW = „objednávku ještě ověřujeme, ozveme se"), ne jen generickou chybu.
- Upozornění: Worker route pro SafeOrder dnes (12. 10.) **nemá autentizaci** — oprava existuje na `codex/wave1-security`, ale ještě není sloučená do `wave1-base`. Storefront na to nemusí čekat, ale nasazení do testovacího prostředí 23. 10. by mělo počkat, až bude sloučená (jinak jde o known security gap v testovacím prostředí).

### QR kupóny (C3, HOTOVO až na jednu věc)
- `GET /store/coupon-links/:code` — ověří kupón, vrátí info (read-only, nikdy sám neaplikuje slevu na klientovi).
- **Chybí:** propojení ověřeného kupónu s `/store/nexus-cart`, aby se sleva opravdu uplatnila v košíku — to je otevřený bod z backendu (Krok 2 v `PROGRESS_LOG.md`), storefront na něj počká nebo si o prioritu řekne.
- Admin generátor: `POST /admin/coupon-links` (vytvoření), vrací URL + data pro QR — QR obrázek samotný (vykreslení/stažení) je na storefrontu/adminu, backend dává jen data a URL.
- 301 mapa (`redirects-map.csv`, 44 řádků) se nasazuje na úrovni Cloudflare Redirect Rules, ne v kódu storefrontu — to je infra úkol, ne úkol pro Codex na storefrontu.

### Objednávky a historie (standardní Medusa)
- `GET /store/customers/me/orders` — standardní, funguje, protože C2 migrace naplnila objednávky s `customer_id`.

### Rezervace konzultace (K9, HOTOVO na backendu, NENÍ v rozsahu Fáze 1 dle smlouvy)
- `GET /store/booking-slots`, `POST /store/bookings`, `POST /store/bookings/:id/cancel` existují a jsou otestované, ale **rezervace konzultací je formálně Fáze 2** (čl. 9 — AI asistent + rezervace v chatu). Storefront je v Fázi 1 nepotřebuje, pokud se mezitím nerozhodne jinak (byla řeč o tom, že se manuální domlouvání nemá dít — to je ale otázka pro Lucky/Jose, ne blokující podmínka z této smlouvy).

### Stripe platby (K7, 10 % — NEJVĚTŠÍ RIZIKO)
- Standardní Medusa Stripe provider je nakonfigurovaný, ale **nikdy neběžel proti reálnému/testovacímu Stripe klíči** a webhook (podpis, idempotence, částka) není ověřený. Bez tohoto nejde splnit scénář 1 a 2 z přílohy č. 1 (platba kartou/Apple Pay/Google Pay, potvrzovací e-mail). **Toto je společná blokace pro backend i storefront** — potřebujeme testovací Stripe klíč co nejdřív, jinak celé předání 23. 10. nemá na čem stát.

---

## 3. Co storefront NESMÍ dělat (bezpečnostní pravidlo platformy)

- Nikdy nepočítat cenu, slevu ani limit (např. COD limit) na klientovi — vždy jen zobrazit to, co vrátí backend/NEXUS. Backend je jediný zdroj pravdy pro peníze (organizační pravidlo L-Code Dynamics, platí bez výjimky).
- Nikdy neukazovat rozdílnou odpověď podle toho, jestli e-mail v systému existuje (magic-link enumerace).
- Nikdy nerozhodovat o přístupu k RESET 40+ jinak než dotazem na `/store/entitlements`.

---

## 4. Co chybí a kdo na tom pracuje

| Co | Stav | Kdo |
|---|---|---|
| Storefront samotný | mimo tuto session, staví Jose + Codex | Jose |
| SafeOrder Worker auth fix | hotovo na `codex/wave1-security`, čeká na review+merge | Claude (Krok 1) |
| QR kupón → reálná sleva v košíku | chybí propojení | Claude (Krok 2) nebo Codex, podle domluvy |
| Stripe testovací klíč | čeká na Lucky | Lucky |
| Admin (C5) | nezačato | nerozhodnuto |
| 301 redirecty na Cloudflare | mapa hotová, nasazení chybí | infra, ne storefront kód |

---

## 5. Hlavní menu — ZÁVAZNÝ mockup nalezen a uložen (12. 10. 2026)

**`docs/design-reference/hero-menu-mockup.png` je ZÁVAZNÁ vizuální reference pro hero + menu.** Soubor dodal Lucky (`~/Documents/Luxusní menu v mlžném lese.png`), uložen do repa. Tím padá předchozí „otevřeno, Codex navrhne variantu" — barvy, logo i tvar panelu jsou dané tímto obrázkem, ne návrhem od Codexe.

**Co obrázek přesně ukazuje (popsáno, ne vymyšleno):**
- Pozadí heru: mlžný les s řekou/jezerem, ranní/večerní světlo — fotografické/renderované pozadí, nálada k replikaci (viz 6.1 pro technické provedení videa).
- Logo: zlatá lineární značka — kruh se 4 menšími kroužky v bodech kompasu, uvnitř rostlina/list vyrůstající z kořenů, sluníčko na jedné straně. Pod ním nápis „ANASTASIA" (tenké, široce prostrkané velké písmo) a podnadpis „LIGHT FOR THE FUTURE" (menší prostrkaná kapitálka).
- Barvy: panel menu tmavě olivová zelená `#2a3222` a krémové/bílé pilulkovité tlačítko `#ecf3e7` (vzorkované přímo z obrázku, orientační). **Závazné, zadal Lucky: zlatý akcent `#C9A355`, text `#EFE5C7`** (teplá krémová/pergamenová na tmavém panelu i přes hero video) — tyhle dvě hodnoty nahrazují odhad z obrázku a odpovídají oficiální barevné paletě paralleluniverse.com.ua (awwwards.com/sites/parallel-universe#color-typography) — typografie tam ale uvedená není, font pro ANASTASIA zůstává k výběru (viz historická poznámka výše).
- Tlačítko „Menu" vpravo nahoře: plná pilulka (`border-radius` = polovina výšky), krémové pozadí, tmavý text, hamburger ikona vpravo, šipka zpět vlevo od něj.
- **Panel menu je ZAOBLENÝ** (velký `border-radius`, plovoucí karta s odstupem od okrajů obrazovky — NE hranatý panel na celou výšku jako leilsaunas.com). V hlavičce panelu: malé logo + ANASTASIA/LIGHT FOR THE FUTURE vlevo, pilulkovité tlačítko „Close ×" vpravo.
- Tři sloupce menu oddělené tenkou svislou linkou:
  - **Obchod:** Všetky produkty, Kategórie, Novinky, Bestsellery
  - **Programy:** RESET 40+, Všetky programy, Pre firmy, Individuálne programy
  - **Služby:** Konzultácie, Supervízia, AI ANASTASIA, Pre odborníkov
- Pod sloupci: větší řádky Zdravý svet / O Lucii / Kontakt, pod nimi jazykový přepínač „SK / EN / RU", a vpravo náhledová fotka (interiér/sauna) se **zaobleným jen levým horním rohem** — přesně technika ze sekce 6.6, aplikovat tady doslova.
- Logo je koncept/raster, ne vektor — pro reálné nasazení ho bude potřeba předělat jako čisté SVG; font v obrázku není doslovně zjistitelný (je to render/koncept, ne živý web) — Codex/grafik má vybrat reálný webfont vizuálně odpovídající tenkému prostrkanému řezu z obrázku, ne hádat jinam.

**Fáze 2 upozornění (beze změny):**
- **Přepínač jazyků SK / EN / RU** — jazykové verze e-shopu jsou výslovně Fáze 2 (čl. 2). V menu zůstává vizuálně (je v mockupu), ale **nesmí se v Fázi 1 od něj očekávat funkční překlad obsahu**.
- **„AI ANASTASIA"** pod Službami — AI asistent je formálně Fáze 2 (čl. 9). Smí být v menu jako odkaz, ale **nesmí 23. 10. vypadat jako hotová funkce** — označit „již brzy", ne nechat vypadat rozbité při testování s Lucií.

Technika/mechanika (fade/slide chování panelu, hover text-reveal na odkazech, fullscreen video v hero) zůstává podle sekce 6.1/6.2 (leilsaunas.com) — obrázek dává vzhled, leilsaunas dává kód/chování.

---

## 6. Vizuální efekty a interakce — technický návod podle referenčních webů (12. 10. 2026)

Rozebráno přímo z HTML/CSS/JS referenčních webů (leilsaunas.com, vita-travel.webflow.io, paralleluniverse.com.ua) na žádost Jose. Jde výhradně o **techniku/postup**, ne o kopii cizího obsahu, fotek ani brandingu — to si Codex staví vlastní, jen podle téhož principu. Vše níže je ověřené čtením skutečného zdrojového kódu dané stránky, ne odhad.

### 6.1 Hero — fullscreen video na pozadí (leilsaunas.com)

**Vzhled (barvy, logo, tvar panelu, fonty) = `docs/design-reference/hero-menu-mockup.png`, viz sekce 5 — to je teď ZÁVAZNÉ, ne otevřené.** Leilsaunas.com dává jen **techniku/chování** (jak video a panel fungují v kódu), ne vzhled — barvy a font z leilsaunas.com (viz Noah/Sogo níže) se **nepoužívají**, byla to jen průzkumná informace z doby, než se našel skutečný mockup. Stejně tak fialovo-zlatý `NAVRH-eshop` koncept se pro hero/menu nepoužívá — platí jen mockup.

Rozdíl oproti leilsaunas.com, na který si dát pozor: jejich panel menu je hranatý, na celou výšku obrazovky. **Mockup chce zaoblený, plovoucí panel s odstupem od okrajů** (viz sekce 5) — tvar/zaoblení podle mockupu, mechaniku zobrazení (fixed pozice, fade/aktivní třída) podle leilsaunas kódu níže.

```html
<video class="w-full h-screen object-cover" autoplay muted loop playsinline>
  <source src="...">
</video>
```
- `max-height: 768px` i při `100vh` — na velkých monitorech se video neroztáhne do nekonečna.
- Tmavý gradient přes spodní část pro čitelnost textu: `linear-gradient(transparent 70%, rgba(0,0,0,.6))`.
- Text je `position: absolute`, `flex flex-col justify-end`, bílý, `z-index: 10`.
- **Zvuk nikdy neautoplayuje** — ambient audio (viz 6.3) se spouští jen tlačítkem.

**Historická poznámka k fontům — NEPOUŽÍVAT, jen pro přehled (nahrazeno mockupem v sekci 5):** zkoumaly se fonty „Noah"/„Sogo" z leilsaunas.com (Noah je koupitelná rodina od Fontfabric, Sogo naopak není veřejně prodejná a její `.otf` se nesmí převzít) a paleta `NAVRH-eshop/index.html` (Cormorant Garamond + Inter, `--gold:#c9a84c`, `--bg:#0b0912`). Žádná z nich se pro hero/menu nepoužije — závazný je mockup ze sekce 5. Reálný font k tenkému prostrkanému písmu z mockupu ještě vybrat (viz sekce 5, poslední bod).

### 6.2 Vyjížděcí menu (leilsaunas.com)
- Tlačítko „Menu": `<button class="menu-trigger"><span data-open="Menu" data-close="Close"></span></button>` — text se mění čistě CSS (`content: attr(data-open)`, po `.active` přepne na `attr(data-close)`).
- Panel menu defaultně `opacity: 0; z-index: -1; transition: opacity .5s`. Klik přidá `.active` → `opacity: 1; z-index: 1010`. Žádný posun, jen fade — ale protože je `position: fixed; right: 0`, vizuálně to je „vyjetí zprava".
- JS: 2 řádky — klik na trigger přidá `classList.add("active")`, klik na close ho odebere.
- Položky v menu mají `data-text` atribut a při hoveru se zespodu vysune duplicitní popisek (`:before{content:attr(data-text); transform:translateY(100%)}` → na hover `translateY(0)`, originál dostane `opacity:0`) — „scroll swap" efekt textu.

### 6.3 Ambient zvuk — bezpečný vzor (paralleluniverse.com.ua)
```js
$(".sound-switcher").on('click', function() {
  $(this).toggleClass("is-play");
  var audio = $(".audio")[0];
  audio.paused ? audio.play() : audio.pause();
});
```
Žádný autoplay se zvukem (prohlížeče by ho stejně zablokovaly) — jen přepínací tlačítko. **Použít přesně takhle, ne jinak.**

### 6.4 Produktová/karta s hover-reveal info panelem + skleněný efekt (vita-travel.webflow.io)
- Fotka na pozadí s diagonálním tmavým gradientem dole (`linear-gradient(194deg, transparent 31%, rgba(0,0,0,.5) 85%)`) kvůli čitelnosti jména/popisku vždy viditelného přes fotku.
- Info panel defaultně `opacity: 0`, na `:hover` karty `opacity: 1; pointer-events: all` — čistý CSS fade, žádný JS.
- **Skleněný efekt** pro ten panel (recept, ne doslovná kopie — zdrojový web používá `backdrop-filter: blur(12px)` jinde na stránce):
```css
.product-card-info {
  background: rgba(20, 20, 20, 0.35);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```
Pro produkt: fotka dole gradient, název+cena vždy viditelné, na hover se „rozsvítí" skleněný panel s popisem/dostupností/tlačítkem Do košíku.

### 6.5 Scroll-reveal vázaný na pozici scrollu + parallax (paralleluniverse.com.ua/en/about/)
- **Smooth scroll:** knihovna Lenis, napojená na GSAP ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)`).
- **Odkrývání obsahu podle scrollu** (ne jednorázový fade-in, ale plynule vázaný na scroll pozici — `scrub: true`):
```js
gsap.from(element, 1, {
  scrollTrigger: { trigger: element, start: "top-=0px bottom-=15%", end: "top bottom", scrub: true },
  y: "80px", opacity: 0, ease: "Quint.easeOut"
});
```
- **Parallax obrázky/video** — jen knihovna, žádný vlastní kód:
```js
new simpleParallax(document.getElementsByClassName('parallax'), { orientation: 'down', scale: 1.2, delay: 0.5 });
```
- **ZÁVAZNÉ (potvrzeno Lucky 12. 10. 2026): stránka „O Lucii" se staví v tomhle stylu** — stejná technika scroll-reveal + parallax jako paralleluniverse.com.ua/en/about/ (postup/kompozice, ne kopie textu/fotek/brandingu té firmy). Stejná technika se hodí i na „Zdravý svet".

### 6.6 Signature ořez fotek — jeden zaoblený roh jako vizuální „linie" (leilsaunas.com)
```css
.photo-signature {
  border-radius: 0;
  border-top-left-radius: 200px;   /* jen jeden roh, zbytek ostrý */
  overflow: hidden;
}
```
Použít **konzistentně stejný roh** (nebo pravidelně střídat podle pozice v gridu) na všech produktových/hero fotkách napříč webem — vytváří to opakující se vizuální rukopis. Velikost poloměru škálovat podle velikosti fotky (60–100px na kartách, 200px+ na hero).

### 6.7 Přechod mezi stránkami/sekcemi — „glass wipe" (leilsaunas.com)
```css
.page-transition {
  position: fixed; inset: 0; z-index: 9999;
  background-color: #ffffffc9;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  opacity: 0; pointer-events: none;
  transition: opacity 1s;
}
.page-transition.active { opacity: 1; pointer-events: all; }
```
Před načtením nové stránky/sekce se přidá `.active` (obrazovka zabělí a rozmlží), po načtení obsahu se třída odebere. Plynulejší než ostrý střih nebo prostý fade.

### 6.8 Hover s rotující šipkou (leilsaunas.com — blog/novinky)
```css
.more { transition: transform .8s cubic-bezier(.4,0,.2,1); }
a:hover .more { transform: rotate(90deg); }
```
Čistě CSS, žádný JS. Pomalé, hladké otočení ikony při hoveru na celý odkaz — hezké na „více info"/„zobrazit produkt" odkazy.

### 6.9 Hover swap dvou fotek přes clip-path (leilsaunas.com — kategorie na homepage)
Dvě fotky na sobě (např. zavřená/otevřená sauna), **wipe efekt, ne crossfade**:
```css
.image-below { position: relative; width: 100%; height: 100%; object-fit: cover; }
.image-above {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;
  clip-path: inset(0);
  transition: clip-path .5s;
}
.img-link:hover .image-above { clip-path: inset(0 0 100% 0); }
```
Horní fotka se při hoveru „odkrajuje" zespodu nahoru a odkrývá spodní — ne prolnutí, ale postupné odhalení. Vhodné na produktové varianty (např. produkt zavřený/otevřený, s příslušenstvím/bez).

### 6.10 Produktová karta s pomalým odkrytím popisu (biofarma.com.ar)
Alternativa k 6.4 — místo opacity fade používá `max-height` na dlouhé, honosné odkrytí (2 sekundy):
```css
.product-card {
  position: relative; overflow: hidden;
  aspect-ratio: .85/1; border-radius: 1rem; padding: 2rem;
}
.product-card-img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
}
.product-card:before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(to bottom, transparent 0%, black 100%);
  opacity: .6;
}
.product-card-info {           /* popis/cena/CTA — schované defaultně */
  max-height: 0; overflow: hidden;
  transition: max-height 2s;
}
.product-card:hover .product-card-info { max-height: 100%; }
```
Fotka produktu na pozadí, název/cena vždy viditelné dole, na hover se pomalu (2s) odkryje popis/varianty/tlačítko „Do košíku". Dá se zkombinovat se skleněným pozadím z 6.4, pokud se `.product-card-info` dá vlastní poloprůhledné pozadí.

---

## 7. Zadání pro Codex — hero, hlavní menu a kostra celého storefrontu (12. 10. 2026)

**POSTUP PRÁCE (potvrzeno Lucky 12. 10. 2026): nejdřív kompletní kostra, teprve pak napojení.** Codex má postavit **statickou/mock kostru všech stránek** storefrontu najednou — layout, routing, komponenty, obsah jako placeholder — a **zatím nic nenapojovat** na backendové API (žádné reálné volání `/store/nexus-cart`, `/store/entitlements`, magic-link, Stripe atd.). Napojení na API ze sekce 2 přijde až jako další krok, po schválení kostry. Stránky, které kostra musí obsahovat:

- Hero + hlavní menu (viz body 1–2 níže).
- Katalog / výpis produktů + detail produktu (karty podle sekce 6.4/6.9/6.10).
- Košík a checkout (kroky scénářů 1–2 z přílohy č. 1 — jen UI, bez reálné platby).
- Přihlášení (magic-link UI, bez reálného volání).
- RESET 40+ / entitlementy (zámek/odemčený stav jako UI stav, ne reálná kontrola).
- O Lucii — scroll-reveal + parallax styl podle sekce 6.5 (potvrzeno Lucky).
- Zdravý svet, Konzultácie, Astrológia, Kontakt, GDPR (viz sekce 8 — obsahové stránky ze starého webu).

Teprve na tomhle UI kostry se bude dál stavět — nic z toho se nemá tvářit jako hotová funkce, dokud není napojené.

Současný stav na branchi `codex/anastasia-storefront-visual-foundation` (`storefront-prototype/index.html`) nesplňuje ani vzhled (jiný font, olivová/krémová paleta bez zdroje), ani rozsah (chybí zbytek stránek) — přepracovat kompletně podle bodů níže. **Závazný vzhled hero/menu = `docs/design-reference/hero-menu-mockup.png` (sekce 5), ne žádná vlastní varianta.**

**0. Technický stack a routing — rozhodnout, než se začne stavět**
- Tento dokument nepředepisuje framework. Než Codex začne, musí být jasné: SSR/SSG (kvůli SEO — staré URL mají mít 301, viz níže) vs. čistě klientský SPA, a kam se nasazuje (Cloudflare Pages/Workers, konzistentně se zbytkem NEXUS infrastruktury, nebo jinam) — to je rozhodnutí pro Jose/Lucky, ne pro Codexe improvizovat.
- **Routy vycházet z `backend/docs/wp/redirects-map.csv`** (sloupec `target_url`, branch `codex/qr-redirects`, už sloučeno/k dispozici) — to je autoritativní seznam skutečných cest starého webu (`/konzultacie`, `/eshop/produkt/{slug}`, `/zdravy-svet/`, `/kosik`, `/gdpr` atd.), ne odhad. Routa `/eshop/kosik?produkt={kod}&kupon={kod}&ks={mnozstvi}` musí fungovat (vložit produkt + zkusit kupón v košíku), ne jen redirectovat na homepage — to je dnešní chyba, kterou nový web nesmí zopakovat (viz sekce 8).
- i18n (SK/EN/RU) je Fáze 2 — routing stavět tak, aby šel později rozšířit o jazykový prefix, ale **nenuceně retrofitovat už teď** (žádné `/sk/...` prefixy navíc, pokud to nikdo nepožaduje pro Fázi 1).
- **„Nic nenapojovat" (bod 0 výše v této sekci) = jedna API vrstva s mock adaptérem**, ne rozházené natvrdo zapsané placeholder hodnoty po komponentách. Komponenty volají jedno rozhraní (např. `lib/api/*`), které teď vrací mock data; napojení na skutečné `/store/...` endpointy (sekce 2) pak bude výměna JEN téhle vrstvy, ne přepis komponent.

**1. Hero**
- Fullscreen `<video autoplay muted loop playsinline preload="metadata" poster="...">` se 3 zdroji podle šířky (desktop/tablet/mobil) + webm variantou — pozadí/nálada podle `hero-menu-mockup.png` (mlžný les/voda), technické provedení (gradient, max-height, zvuk) podle bodů níže.
- `max-height: 768px` i při `100vh` — na velkých monitorech se video neroztáhne do nekonečna.
- Tmavý gradient přes spodní třetinu pro čitelnost textu: `linear-gradient(transparent 70%, rgba(0,0,0,.6))`.
- Text kopie: `position:absolute`, `flex-col justify-end`, `z-index:10`.
- Video nikdy nemá vlastní zvukovou stopu — zvuk je samostatný smyčkový `<audio loop preload="none">`, spouští se JEN tlačítkem (sound-switcher), nikdy autoplay.
- Assety (zpracované, bez zvuku ve videu + samostatné mp3) jsou na `~/Documents/anastasia-hero-video/` (`hero-1080p.mp4`, `hero-720p.mp4`, `hero-480p.mp4`, `hero-1080p.webm`, `poster.jpg`, `nature-ambient.mp3`) — **NEDÁVAT do gitu** (~57 MB dohromady), nahrát do R2/CDN nebo předat mimo repo a odkazovat URL.

**2. Vyjížděcí menu**
- Vzhled (zaoblený plovoucí panel, barvy, logo, tři sloupce) přesně podle `hero-menu-mockup.png`, viz sekce 5.
- Mechanika zobrazení z leilsaunas.com: tlačítko „Menu" vpravo nahoře, text přepínaný čistě CSS (`content: attr(data-open)` / `attr(data-close)` podle `.active` třídy); panel `position:fixed`, defaultně `opacity:0; visibility:hidden`, po kliknutí `.active` → `opacity:1` (fade, ne posun) — ale **tvar panelu zaoblený a s odstupem od okrajů podle mockupu**, ne hranatý na celou výšku jako leilsaunas.
- Položky menu: hover text-reveal (`:before{content:attr(data-text); transform:translateY(100%)}` → na hover `translateY(0)`, originál `opacity:0`).
- Accessibility (v současném prototypu už udělané dobře, zachovat): `aria-expanded`/`aria-hidden`, focus trap (Tab cyklí mezi prvním a posledním prvkem v panelu), Escape zavírá, focus se po zavření vrací na trigger tlačítko, `prefers-reduced-motion` vypíná transitions.
- Náhledová fotka v panelu: zaoblit jen levý horní roh (technika 6.6), přesně jak je v mockupu.

**3. Zvuk — žádný jiný vzorec**
- Jen klik-to-toggle (`play()`/`pause()` na tlačítko), nikdy autoplay.

**4. Obsah menu** (viz sekce 5 — teď s přesnými položkami ze zdrojového mockupu): Obchod (Všetky produkty, Kategórie, Novinky, Bestsellery), Programy (RESET 40+, Všetky programy, Pre firmy, Individuálne programy), Služby (Konzultácie, Supervízia, AI ANASTASIA, Pre odborníkov), + Zdravý svet/O Lucii/Kontakt. SK/EN/RU přepínač a „AI ANASTASIA" = Fáze 2 — vizuálně přítomné, označené „již brzy", ne jako hotová funkce.

---

## 8. Obsahové stránky ze starého webu — MUSÍ se taky migrovat, ne jen e-shop/checkout

Tenhle dokument se zatím soustředil na nákupní tok a vizuál hero/menu. Storefront ale není jen e-shop — podle `backend/docs/wp/INVENTAR-A-AKCEPTACE.md` (balík C4, už sloučeno do `wave1-base`, **povinné čtení pro Codex před stavbou struktury stránek**) musí nový web obsahovat i tyhle reálné obsahové části ze starého `anastasiaoz.eu`:

- **Konzultácie** — `/konzultacie`, `/konzultacie/astrologicky-profil-zdravia-a-vitality/`, `/online-zdravotna-konzultacia/` — odborný obsah, ne obecná produktová landing page.
- **Astrológia** — `/astrologia/`, propojeno i jako produkt (`/eshop/produkt/astrologia`).
- **Zdravý svet** — `/zdravy-svet/` — obsahová sekce (články/odborný obsah), součást webu, ne samostatný projekt.
- **O Lucii** / hlavní stránka — osobní a odborný obsah, ne jen hero.
- **Kontakt** (`/kontakt/`) s formulářem a **GDPR** (`/gdpr`).
- Konkrétní produktové detaily, co mají zůstat dohledatelné na stejné nebo ekvivalentní URL: `bio-sprchovy-gel`, `kava-zdrava`, `telove-maslo`, `lanova-sukna`, `ritualne-sviecky`, `pletova-voda`, `saty-lanove`, `supervizia`, `astrologia`.
- **Stará QR/kupón URL** `/eshop/kosik?produkt={kod}&kupon={kod}&ks={mnozstvi}` — nový ekvivalent musí vložit produkt a uplatnit kupón v košíku, **ne jen přesměrovat na homepage** (to je dnešní chyba, kterou nesmí nová QR cesta zopakovat).

Akademie (`anastasia.academy`) a AI Anastasia (`aianastasia.com`) jsou podle smlouvy čl. 2 **Fáze 2**, do Fáze 1 storefrontu se nestaví.

Úplný seznam včetně rolí, cookies a otevřených bodů je v `INVENTAR-A-AKCEPTACE.md` — Codex ho má číst celý, tohle je jen výtah nejdůležitějšího pro plánování struktury stránek.

---

**Shrnutí pro Codexe v jedné větě:** postav scénáře 1–5 z přílohy č. 1 nad API výše, nikdy nepočítej peníze ani přístup sám, a scénáře 1–2 (platba) nepůjdou doopravdy dotáhnout do konce, dokud nedorazí testovací Stripe klíč.
