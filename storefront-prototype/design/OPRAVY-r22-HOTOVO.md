# OPRAVY r22 – HOTOVO (nálezy QA z pokladne a úvodu)

Opravené body 1–4. Bod 5 (CSP / Cloudflare beacon) je zistenie, nie zmena – politika
sa podľa zadania nemení. Commit: `fix(storefront): vstup na úvode, predvolená karta,
pokladňa čaká na načítanie` (nepushnutý).

## 1. „Vstúpte“ na úvode sa nedal kliknúť myšou

Príčina: `.lh-intro__meta` má `pointer-events:none` (aby vrstva nechytávala kliky
mimo tlačidla) a `.lh-enter` túto vlastnosť dedil — tlačidlo nebolo cieľom
hit-testu, klik končil na maske `.lh-intro__mask`.

- `src/home-lh.mjs`: `.lh-enter` má `pointer-events:auto` (kategórie `.lh-cat` to mali
  už skôr, `.lh-brand` tiež).
- Overené v prehliadači (Playwright, Chrome): na **1440 px aj 390 px** je
  `pointer-events: auto`, `document.elementFromPoint()` v strede tlačidla vracia
  prvok **vnútri tlačidla** a skutočný klik myšou úvod zavrie (na mobile odomkne
  `lh-locked`).
- `test/browser-checkout-stripe.mjs`: obchodný obchod (skok na koniec úvodu) nahradený
  skutočným klikom na `#lh-scroll-cue`; test prejde.

## 2. Predvolená platba v pokladni je „Kartou online“

- Nový modul `public/checkout-ui.mjs` (čisté funkcie, bez DOM):
  `availablePaymentMethods()` vracia len dostupné spôsoby a **„Kartou online“
  (`card`) presúva na prvú pozíciu**; poradie ostatných ostáva ako ho poslal server.
  `defaultPaymentMethod()` vracia kód predvolene zvolenej platby.
- `public/app.mjs`: `renderPayment()` vykreslí zoznam z `availablePaymentMethods()` a
  označí `checked` podľa `defaultPaymentMethod()` (predtým sa označil prvý zoznamový
  prvok, teda dobírka, ak ju server poslal prvú).
- Overené v prehliadači: server posiela `[cod, card, bank_transfer]` → v pokladni je
  poradie `card, cod, bank_transfer` a **zaškrtnutá je karta**.
- Ceny ani poplatky si klient nepočíta – mení sa iba výber, údaje majú naďalej
  server.

## 3. Tlačidlo „Pokračovať“ v pokladni

Predtým sa klik do tlačidla počas načítania košíka a možností platby ticho zahodil
(handlery sa pripájali až po `await`).

- `src/pages.mjs`: obe tlačidlá „Pokračovať“ sú v HTML **neaktívne** (`disabled`) a
  vedľa nich je `<p id="checkout-loading" role="status">Načítavam košík…</p>`
  (aj `<noscript>` poznámka, že pokladňa potrebuje JavaScript).
- `public/app.mjs`: `setNextState()` preplína stav tlačidiel a text stavu
  („Načítavam košík…“ → „Načítavam dopravu a platbu…“ → bez textu). Tlačidlá naskočia
  až po `GET /store/nexus-checkout/options`. Formulať je počas načítavania
  `aria-busy="true"`.
- Pri chybe servera ostávajú tlačidlá neaktívne, zobrazí sa **správa zo servera**
  (napr. „Pre dokončenie objednávky sa prihláste.“) a tlačidlo „Skúsiť znova“
  (pri 401 sa retry nezobrazí). Chyba sa nikdy nezatíši.
- `public/checkout-ui.mjs`: `nextButtonState({cartReady,optionsReady})` – čistý stav
  pre obe tlačidlá.

## 4. 404 `GET /store/content/pokladna`

Obsah pokladne v administrácii neexistuje (v semene nie je stránka `pokladna`) a
runtime hádal stránku podľa adresy – server vrátil 404 a v konzole svietila chyba.

- `public/content.mjs`: nová `contentPageKeys(root)` vracia **predpony kľúčov, ktoré
  stránka naozaj používa** (`global`, `eshop`, `kontakt`, …).
- `public/app.mjs`: runtime načíta obsah iba pre tieto predpony namiesto pevnej dvojice
  `['global', pageKeyOf(location.pathname)]`.
- Výsledok: pokladňa si `/store/content/pokladna` **nežiada** (žiadny 404 v konzole),
  zabudované texty ostávajú. Bonus: kategórie v eshope si teraz načítajú obsah
  `eshop` namiesto 404 na vymyslený slug (`eshop-kategoria-…`).
- `pageKeyOf()` zostáva exportovaná (slug pravidlo backendu, používa `test/content.test.mjs`).

## 5. CSP a Cloudflare Web Analytics – zistenie bez zmeny

- **V našom HTML beacon nie je.** Grep celého `storefront-prototype` (vzory
  `cloudflareinsights|beacon|insights|analytics`) nájde jediný výskyt – QA report
  `design/qa-21-10/REPORT.md`. `index.html`, `src/pages.mjs`, `src/dc.mjs`,
  `src/home-lh.mjs`, `public/*.mjs` ani `edge/worker.mjs` žiadny analytics skript
  neobsahujú (worker dopĺňa iba `meta[name="ana-country"]`).
- **Beacon vkláda Cloudflare na hrane** (Web Analytics / Browser Insights sa dopĺňa
  do HTML odpovede automaticky) – preto sa adresa `https://static.cloudflareinsights.com/beacon.min.js`
  objavuje v konzole na teste `anastasia-test.l-code-dynamics.com`.
- Naša politika (`build.mjs` → `dist/_headers`, `serve.mjs`) je
  `script-src 'self' https://js.stripe.com`; beacon origin dovolený nie je, preto
  prehliadač vypíše `Loading the script '…beacon.min.js…' violates the following
  Content Security Policy` a následne `404` (beacon sa načítať nedokáže).
- **Riešenie:** politika sa nemení (zadanie: CSP nerozvolňujeme). Chyba v konzole je
  kozmetická, meranie na webe neprebieha a obchod to neovplyvňuje. Rozhodnutie pre
  vlastníka hostingu: vypnúť Web Analytics pre testovaciu zónu, alebo (ak sa analýza
  má používať) započítať `https://static.cloudflareinsights.com` do `script-src` –
  to je zmena bezpečnostnej politiky a patrí do samostatného rozhodnutia.

## Overenie

- `node build.mjs` → `Built 72 static pages; all 34 legacy target paths covered`.
- `node --test test/*.test.mjs` → **127/127 pass** (predtým 117; pridaných 10 v
  `test/checkout-ui.test.mjs`).
- `node test/browser-checkout-stripe.mjs` → **PASS** (E2E pokladňa so Stripe test
  režimom; úvod sa teraz zaviera skutočným klikom na „Vstúpte“).
- Prehliadačová kontrola (Playwright + lokálny stub API, syntetické údaje):
  „Vstúpte“ kliknuteľný na 1440 px aj 390 px; pokladňa: tlačidlo neaktívne so stavom
  → aktívne po načítaní; predvolená platba karta; žiadny `GET /store/content/pokladna`
  a žiadna chyba 404 v konzole; pri chybe servera tlačidlo ostáva neaktívne so správou
  a tlačidlom „Skúsiť znova“.
