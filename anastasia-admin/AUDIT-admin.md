# AUDIT administrace ANASTASIA (testovací prostředí)

**Kdy:** 21. 10. 2026 · **Prostředí:** `https://anastasia-test-admin.l-code-dynamics.com` (testovací předání, jadro `https://anastasia-test-api.l-code-dynamics.com`)
**Metoda:** průchod všemi 12 sekcemi vlevo v postupníku, podstránky v záložkách, detail objednávky / produktu / kategorie / zákazníčky / kupónu / e-mailu, kontrola konzoly a HTTP stavov.
**Omezení:** v tomto prostředí sa nepodarilo spraviť snímky obrazovky (prehrávač ich zablokoval) — audit je založený na DOM-e, texte a kóde. Viz `Metóda a obmedzenia` na konci.

Referenčný vizuál: `~/Downloads/Centrální správa produktů OKfish.png` (tabuľky s miniaturami, farebné stavy, panely, záložky, bočný panel s prepojenými kanálmi).

---

## 1. Čo nefunguje (overené v prehliadači)

### P0-1 — Záložky v „Nastavenia“ a „Obsah“ sa neprepínajú (obsah zostáva na predchádzajúcej sekcii)

Overené: v „Nastavenia → Používatelia“ sa po kliknutí na „Účtovníctvo“ zobrazili stále *Správcovia / Pozvať ďalšieho správcu*. V „Obsah“ po kliknutí na „Stránky a texty“, „Médiá“ a „Preklady“ zostal zobrazený zoznam *Newsletter — súhlasy*.

Príčina (`anastasia-admin/app.mjs`):

```js
function subnav(view, items, idx = 0) { ... items[idx].run(view); }   // view = pôvodný uzol
function freshView(view) {           // ostatné pohľady: vymieňajú uzol
  let cur = view; while (cur && cur._next) cur = cur._next;
  if (!cur || !cur.isConnected) return document.createElement('div');
  const next = cur.cloneNode(false); cur._next = next; cur.replaceWith(next); return next;
}
function stub(view, title, note) { view.innerHTML = `...`; }           // ← chýba freshView()
```

`subnav` si drží *pôvodný* uzol `#view`. Všetky ostatné pohľady volajú `freshView()`, ktorý po reťazí `_next` nájde živý uzol a kreslí doň. `stub()` je jediný pohľad, ktorý `freshView()` **nevolá** — kreslí teda do odpojeného uzlu a na obrazovke sa nezmení nič. Kliknutie na „Účtovníctvo“ / „Preklady“ / „Médiá“ / „Stránky a texty“ je ticho bez účinku.

Dopad: štyri sekcie sa nedajú otvoriť vôbec; používateľka si myslí, že admin zamrzol.

### P0-2 — Objednávky: chýba stránkovanie (po 100 objednávkach ich Lucia neuvidí)

`vOrders` načítava pevne `limit=100` a `order=-created_at`. Staršie objednávky nie sú v zozname ani v detailoch — nedajú sa vybaliť, ani nájsť. Rovnaké obmedzenie platí pre **Produkty** (`limit=100`). Pri reálnom obchode (a pri migrácii starých objednávok) je to obmedzenie na predaj.

### P0-3 — Tlač štítka a dodacieho listu neexistuje

`anastasia-admin/print.mjs` (štítok A6, dodací list A4, `openPrintWindow` / `fillPrintWindow` / `PRINT_FIELDS`) je napísaný, ale:
- nie je zapojený do `build.mjs` (súbor sa nekopíruje do `dist/`),
- nie je importovaný v `app.mjs`,
- v zozname objednávky ani v detaile objednávky nie je žiadne tlačidlo.

Bez tlače sa nedá zabaliť zásielka. `print.mjs` navyše volá `window.open` — bez včasného kliknutia prehliadač okno zablokuje, takže otvorenie musí byť synchronne v kliknutí.

### P0-4 — Chýbajú produktové feedy (Heureka, Google Merchant)

V backende ani v admine nie je žiadny XML feed. V obchode s 30 produktami a 8 kategóriami to znamená nulovú viditeľnosť v Heurike a Google Shopping. Feed musí byť **verejný GET** (portál si ho sťahuje sám), len zverejnené produkty, cena **s DPH** cez `calculated_price` s region kontextom, URL podľa `STOREFRONT_URL` / `ANASTASIA_SITE_URL`.

### P0-5 — Chýba Správa dopravcov

„Nastavenia → Doprava a platby“ je len prehľad *na čítanie* („Platobné brány a dopravcov s prístupovými kľúčmi zapája náš tím bezpečne na serveri“). Konkrétny dopravca (Packeta / SPS / GLS / DPD) sa nedá zvoliť, kľúč sa nedá uložiť, nedá sa zistiť, či je dopravca pripojený. Pre prepravu hmotného tovaru (krémy, doplnky, sviečky) je to blokujúce.

### Overené: chyby v konzole a neúspešné HTTP požiadavky

Žiadne. Prechod všetkými 12 sekciami a ich podstránkami nevykázal ani jednu chybu konzoly, ani jednu odpoveď 4xx/5xx (okrem favicon).

---

## 2. Čo chýba oproti Shoptet / Shopify adminu

| Oblast | Shoptet / Shopify | ANASTASIA admin | Priorita |
|---|---|---|---|
| Tlač štítkov a dodacích listov | ✅ viac šablón, hromadná tlač | ❌ chýba (P0-3) | P0 |
| Produktové feedy (Heureka, Google) | ✅ generátor + URL na kopírovanie | ❌ chýba (P0-4) | P0 |
| Pripojenie dopravcu (API, kľúč, stav) | ✅ Packeta/SPS/GLS/DPD | ❌ chýba (P0-5) | P0 |
| Hromadné akcie nad objednávkami | ✅ vyber viacerých, hromadná tlač, hromadné odoslanie | ❌ len jedna objednávka naraz | P1 |
| Export objednávok do CSV/XLSX | ✅ | ❌ chýba | P1 |
| Stránkovanie zoznamov | ✅ | ❌ limit 100 (P0-2) | P0 |
| Filter produktov (stav, kategória, sklad) | ✅ bohaté filtre | ❌ len textové hľadanie | P1 |
| Zobrazenie ceny s DPH | ✅ cena + DPH + cena bez DPH | ⚠️ len cena bez DPH | P1 |
| Skladové množstvá v zozname produktov | ✅ stĺpec „sklad“ | ❌ chýba (len v detaile) | P1 |
| Hromadná úprava produktov | ✅ | ❌ | P2 |
| Prehľad tržieb (graf, obdobie, porovnanie) | ✅ | ❌ len 3 čísla | P1 |
| Prehľad nízkeho skladu / upozornenia | ✅ | ❌ | P1 |
| Automatické notifikácie (e-mail/SMS/Push) | ✅ pravidlá | ❌ len manuálne e-maily | P2 |
| Šablóny odpovedí v chate | ✅ | ❌ len voľný text | P2 |
| Export/kalendár konzultácií | ✅ (.ics) | ❌ | P2 |
| História zmien (kto čo zmenil) v UI | ✅ audit log | ❌ existuje len na serveri v audit tabuľke | P1 |
| Roly a oprávnenia (RBAC) | ✅ | ⚠️ každý správca má plný prístup | P1 |
| Dvojfaktorové prihlásenie | ✅ | ❌ | P1 |
| Detail členky Klubu | ✅ | ⚠️ iba zoznam bez detailu | P2 |
| EAN a hmotnosť pri produkte | ✅ | ❌ | P2 |
| Tmavý režim, skratky, notifikácie v prehliadači | ✅ | ❌ | P2 |

---

## 3. UX problémy

**Zoznamy a tabuľky**
- Objednávky: chýba stĺpec **doprava** a **adresa**. Pri desiatich objednávkach sa nedá porovnať, čo kam ide.
- Objednávky: hľadanie sa zobrazí až pri **viac ako 6 objednávkach** (`rows.length > 6`). Pri 1 objednávke hľadanie chýba, pri 7 existuje — nekonzistentné a nepredvídateľné.
- Objednávky: stav platby sa zobrazuje, ale **chýba spôsob platby** v zozname (v detaile je). Pri dobierke a prevode sa v zozname nepozná, čo prijať.
- Produkty: chýba stĺpec **sklad** a **kategória**; 30 produktov v jednom辩 zozname bez triedenia.
- Produkty: chýba filtrovanie podľa stavu (zverejnený / koncept) — pri 30 produktoch je 21 konceptov.
- Všetky zoznamy: **žiadne stránkovanie ani počet celkom** (vidz. P0-2); používateľka nevie, či vidí všetko.
- Kategórie: nie je viditeľný počet produktov v kategórii.

**Formuláre a detaily**
- Objednávka: chýba pole **poznámka k objednávke** (obchodník musí poslat odkaz na podmienky).
- Objednávka: v záložke „Odoslanie“ je číslo zásielky ručne vypísané — bez integrácie dopravcu sa nedá overiť, či zásielka existuje.
- Objednávka: v záložke „Platby“ chýba viditeľný **spôsob platby** pre objednávky, kde provider nepoznáme.
- Produkt: kontrola úplnosti zobrazuje ✓ pre všetko, ale **nehovorí, čo chýba** (chýba rozlišenie „nastavené / chýba“).
- Produkt: chýba **množstvo na sklade** a upozornenie na nízky zásobný stav.
- Kupon: editor umožní zmeniť iba stav; **typ zľavy a hodnotu zľavy nemožno zmeniť** po vytvorení.
- Kupon: chýba údaj, koľkokrát bol použitý a koľko zostalo k dispozícii (limit).

**Navigácia a prehľad**
- „Prehľad“ má tri čísla a kartu Pripravenosť; **chýbajú tržby** (dnes / týždeň / mesiac) a prehľad najpredávanejších produktov.
- Karta „Pripravenosť obchodu“ (10 z 10) nepovie, **čo konkrétne** sa má skontrolovať, keď niečo nie je v poriadku.
- Bočný panel nemá **vyhľadávanie**; pri 30 produktoch a stovkách objednávok je nutné prepínať sekcie.
- „Obsah → Médiá / Stránky a texty / Preklady“ a „Nastavenia → Účtovníctvo“ sú len texty „pripravujeme“ (a kvôli P0-1 sa ani nezobrazia).
- Chýba **jednotné označenie** zákazníčky v celom UI — v tabuľke je email, v detailoch email, v Klube meno; bez jedného ID sa to nedá skutočne prepojiť.

**Prístupnosť a drobnosti**
- Tlačidlá v tabuľkách sú `<span class="btn">Otvoriť</span>`, nie skutočné tlačidlá — nepracujú s klávesnicou a neoznamujú sa čítačkám obrazovky.
- Riadok tabuľky má `tabindex="0"`, ale bez `role="link"` a bez oznámenenia, že sa otvorí.
- Jazyk dokumentu je správne (`<html lang="sk">`) — drobnosť, ktorá prešla.
- Filter v „Konzultácie“ a „Klub“ sa prepína cez záložky, ktoré **nie sú v `#actions`** (na rozdiel od ostatných podstránok) — nekonzistentné umiestnenie.

---

## 4. Odporúčané poradie práce

**P0 — urobiť teraz (blokuje obchod)**

| # | Vecnosť | Kde | Stav 21. 10. 2026 |
|---|---|---|---|
| P0-1 | Opraviť prepínanie záložiek (`stub()` musí použiť `freshView()`) | `anastasia-admin/app.mjs` | **opravené** – `subnav()` posiela živý uzol, `stub()` kreslí cez `freshView()` |
| P0-2 | Stránkovanie objednávok aj produktov (serverové, nie cez limit) | `anastasia-admin/app.mjs` | **opravené** – objednávky: načítanie po stránkach (cap 1 000) + stránkovanie po 50, hľadanie viditeľné vždy; produkty: serverové stránkovanie, vyhľadávanie a filter stavu |
| P0-3 | Zapnúť tlač: štítok + dodací list (zoznam aj detail), `print.mjs` do buildu | `anastasia-admin/app.mjs`, `build.mjs` | **opravené** – tlačidlá v riadku aj v hlavičke detailu, hromadná tlač pri filtri „Na vybavenie“ |
| P0-4 | Verejné feedy Heureka + Google Merchant | `backend/src/api/store/feeds/*` | **opravené** – `GET /feeds/heureka.xml` a `GET /feeds/google.xml` (správne: `backend/src/api/feeds/*`) |
| P0-5 | Správa dopravcov (výber, kľúč šifrovaný serverom, stav „nepripojené“) | `backend/src/api/admin/carriers/*`, `anastasia-admin/app.mjs` | **opravené** – `GET/POST /admin/carriers`, kľúč šifrovaný (AES-256-GCM) v metadátach obchodu |

**P1 — stav 21. 10. 2026**

| Vecnosť | Stav |
|---|---|
| Hromadné akcie a CSV export objednávok | **hotovo** – označenie viacerých objednávok, hromadná tlač štítkov a dodacích listov, export CSV |
| Filtre produktov a stĺpec skladu | **hotovo** – filter typu a stavu, stĺpec skladu zo zásob, hromadné zverejnenie / uloženie ako koncept |
| Cena s DPH v zoznamoch | **hotovo** – hlavičky „Cena s DPH“ a „Suma s DPH“ (ceny v obchode sú hrubé) |
| Prehľad tržieb a nízkeho skladu | **hotovo** – tržby dnes/týždeň/mesiac, najpredávanejšie produkty, upozornenie na nízky sklad |
| Audit log v UI | **hotovo** – Nastavenia → História zmien |
| Údaj „Doprava“ a „Adresa“ a spôsob platby v zozname objednávok | **hotovo** |
| Úprava kupónu (typ zľavy, hodnota, limit) | **hotovo** + počet použití |
| Poznámka k objednávke | **hotovo** |
| Metódy dopravy s cenovými hladinami | **hotovo** – cena podľa regiónu v doprave |
| RBAC (roly) a 2FA | **odložené** – roly aj dvojfaktorové prihlásenie vyžadujú zapnúť RBAC/MFA provider v `medusa-config.ts`, ktorý patrí inému agentovi; polovica hotového riešenia by bola horšia než žiadne. Kto smie čo, ostáva na rozhodnutí majiteľa obchodu |

**P2 — stav 21. 10. 2026**

| Vecnosť | Stav |
|---|---|
| Hromadná úprava produktov | **hotovo** – hromadné zverejnenie / uloženie ako koncept (s kontrolou úplnosti pred zverejnením) |
| Notifikácie a pravidlá | **hotovo** – upozornenia v prehliadači na novú objednávku a správu; e-mailové šablóny a ich zapínanie už boli v E-mailoch |
| Šablóny odpovedí v chate | **hotovo** – Správy → Šablóny odpovedí, vloženie jedným kliknutím |
| Export konzultácií (.ics) | **hotovo** |
| Detail členky Klubu | **hotovo** (detail už existoval; doplnené ID zákazníčky a posledná objednávka) |
| EAN a hmotnosť | **hotovo** – polia v editore produktu, ukladajú sa na variant |
| Tmavý režim, skratky, prehliadačové notifikácie | **hotovo** – tmavý režim v Nastaveniach, skratky („/“ hľadanie, „g“ + písmeno sekcia, „?“ nápoveda), upozornenia v prehliadači |

---

## 5. Metóda a obmedzenia

- Průchod urobený prihlásením do testovacieho adminu (heslá v `backend/data-private/test-admin.env`, **nikdy nevypísané ani nezapísané do repozitára**).
- Overené v prehliadači: 12 hlavných sekcií, 15 podstránok v záložkách, 6 detailných obrazoviek; pri každom kroku sa kontrolovala konzola prehliadača, zlyhané požiadavky a HTTP stavy.
- **Opravené po audite (21. 10. 2026):** záložky v podsekciách, stránkovanie objednávok aj produktov, tlač štítka a dodacieho listu, produktové feedy, správa dopravcov. Overené v prehliadači (tlač 17 kontrol, záložky a stránkovanie 22 kontrol, pripojenia 18 kontrol) a na reálnych dátach cez `medusa exec`.
- Overené proti kódu: `anastasia-admin/app.mjs`, `build.mjs`, `print.mjs`; `backend/src/api/**` (feed ani dopravcovo API neexistujú).
- **Nepodarilo sa:** snímky obrazovky (prehrávač v tomto prostredí zablokoval `page.screenshot` po 8–30 s) a testovanie na reálnom dátach väčšieho objemu (testovacie prostredie má 1 objednávku, 30 produktov, 3 zákazníčky, 1 kupón, 0 konzultácií, 0 členiek Klubu, 0 správ). Stránkovanie sa preto overilo na lokálnom jadre s 10 objednávkami (4 na stranu).
- **Nedoverené:** správanie pri >1 000 objednávkach (cap načítania) a pri reálnom toku dopravcu – overí sa až po nasadení.
- Ceny: feed musí používať `calculated_price` s region kontextom (vzor `backend/src/api/store/nexus-cart/route.ts`, riadky ~140–152), nie klientský výpočet.
