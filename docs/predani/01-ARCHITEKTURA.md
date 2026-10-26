# 01 – Architektúra systému

**Pre:** Mgr. Lucia Rogožanová, LUCRAT spol. s r.o.
**Vypracoval:** L-Code Dynamics
**Verzia:** 22. 10. 2026

---

## 1. Ako tomu rozumieť bez technického vzdelania

Systém má štyri poschodia. Prvé poschodie je **brána** – Cloudflare. Cez ňu ide každý návštevník a cez ňu sa doručuje aj web, administrácia a obrázky. Druhé poschodie je **web a administrácia** – dve samostatné aplikácie v prehliadači, ktoré nič dôležité nerozhodujú, iba zobrazujú a posielajú požiadavky. Tretie poschodie je **jadro obchodu (backend)** – jediné miesto, kde sa počíta cena, kontroluje sklad, vzniká objednávka a sprístupňuje sa platený obsah. Štvrté poschodie sú **dáta a externé služby** – databáza, úložisko súborov, platobná brána a e-mailová služba.

Zásada je jednoduchá a zámerná: **prehliadač nikdy nerozhoduje o peniazoch.** Ak by niekto v prehliadači zmenil cenu alebo sľúbil zľavu, backend ju neprijme, pretože si cenu vypočíta znova sám.

---

## 2. Diagram systému

```
                  zákazníci, návštevníci, Vy
                              |
                              v
        +---------------------------------------------+
        |  CLOUDFLARE - jedna vstupná brána           |
        |  DNS, TLS, WAF, DDoS, cache, 301 presmerovania |
        |  Pages: web a administrácia                 |
        |  R2: zálohy databázy a médiá                |
        +---------------------+-----------------------+
                              |
              +---------------+----------------+
              |                                |
              v                                v
   +---------------------+          +-----------------------+
   |  WEB (Pages)        |          |  ADMINISTRÁCIA        |
   |  statické stránky   |          |  samostatná aplikácia |
   |  katalóg, košík,    |          |  objednávky, produkty,|
   |  pokladňa, účet     |          |  obsah, newsletter    |
   +----------+----------+          +-----------+-----------+
              |  Store API                      |  Admin API
              +---------------+----------------+
                              |
                              v
        +-----------------------------------------------+
        |  BACKEND - Medusa 2.19 na Medusa Cloud         |
        |  produkty, ceny, košíky, objednávky, platby,   |
        |  sklad, zákazníci, súhlasy, prístupy, moduly   |
        +---+--------------+--------------+-------------+
            |              |              |
            v              v              v
   +----------------+  +---------------------+  +----------------------+
   | PostgreSQL     |  | NEXUS Worker        |  | Externé služby       |
   | obchodné dáta  |  | cena (pricing)      |  | Stripe - platby      |
   | regióny, dane  |  | SafeOrder - riziko  |  | Resend - e-maily     |
   | objednávky     |  | rezervácie, QR,     |  +----------------------+
   | zákazníci      |  | prevádzkové udalosti|
   +----------------+  +----------+----------+
                                  |
                     +------------+-------------+
                     |                          |
                     v                          v
            +------------------+      +----------------------+
            | D1 nexus-voucher |      | R2 anastasia-media   |
            | stav poukazov    |      | chránené súbory      |
            +------------------+      +----------------------+
                                  |
                                  v
                     +-----------------------------+
                     | R2 anastasia-db-backups     |
                     | šifrované denné zálohy      |
                     +-----------------------------+
```

---

## 3. Jednotlivé časti a ich úloha

| Časť | Kde beží | Úloha | Čo nesie |
|---|---|---|---|
| Cloudflare – brána | Cloudflare | DNS, TLS, ochrana proti zneužitiu, cache, presmerovania starých adries | žiadne obchodné dáta |
| Web | Cloudflare Pages, projekt `anastasia-web` | zobrazuje katalóg, košík, pokladňu, účet a obsahové stránky | iba verejné dáta |
| Administrácia | Cloudflare Pages, projekt `anastasia-admin` | pracovné prostredie obchodu | prístup do Admin API |
| Backend | Medusa Cloud, plán Develop, región `eu-central-1` | rozhoduje o cene, sklade, objednávke, platbe a prístupe k obsahu | PostgreSQL, všetky obchodné dáta |
| Databáza | spravuje Medusa Cloud | jediný zdroj pravdy o produktoch, objednávkach a zákazníkoch | osobné údaje zákazníkov |
| NEXUS Worker | Cloudflare Workers, `nexus-api-production` | výpočet ceny, posúdenie rizika, rezervácie, QR a presmerovania, prevádzkové udalosti | D1 `nexus-voucher`, Durable Object `VOUCHER_SECURITY` |
| Úložisko médií | Cloudflare R2: `anastasia-media` (verejné obrázky a ukážka) a súkromný bucket plateného obsahu | obrázky a ukážky verejne, videá, audia a PDF len súkromne | chránený platený obsah |
| Úložisko záloh | Cloudflare R2, `anastasia-db-backups`, jurisdikcia EU | šifrované denné zálohy databázy | šifrované kópie obchodných dát |
| Platby | Stripe, účet LUCRAT | prijatie platby, Apple Pay a Google Pay, vrátenie peňazí | platobné údaje drží výhradne Stripe |
| E-maily | Resend cez notification modul | odosielanie e-mailov zákazníkom a Vám | adresy a texty e-mailov |

---

## 4. Backend

Backend je aplikácia Medusa 2.19 bežiaca v Node.js. **Nebeží vo Workeri na Cloudflare** – je to samostatná služba, ktorú Cloud spravuje. To je dobré rozhodnutie, pretože jadro obchodu potrebuje databázu, transakcie a plánované úlohy, čo je prostredie Node s PostgreSQL prirodzenejšie než edge.

- **PostgreSQL** uchováva katalóg, košíky, objednávky, platby, zákazníkov, súhlasy, poukazy, rezervácie a prístupy k digitálnemu obsahu.
- **Redis** by v prípade potreby zabezpečil spoločné udalosti, workflow engine, cache a zámky. Plán Develop ho neobsahuje, preto sa používajú pamäťové varianty. Na jednej inštancii to funguje, pri reštarte sa stratia iba rozpracované udalosti v pamäti. Doručenie udalostí do NEXUS a e-maily objednávok sú nastavené ako obnoviteľné úlohy. Viac inštancií bez Redis nie je overený bezpečný režim a v Fáze 1 sa nevyužíva.
- **Migrácie a bootstrap** spúšťa Cloud pri každom nasadení. Bootstrap je idempotentný, takže opakované nasadenie nič nezdvojí.
- **Plánované úlohy** bežia v procese backendu (napríklad údržba poukazov, čistenie limitov, dávkové upozornenia na chat, retencia prevádzkových udalostí, odosielanie newslettera).

Zoznam modulov a ich tabuliek je v `03-API.md`, časť Doménové moduly.

---

## 5. Cloudflare – brána, web, úložisko, presmerovania

Cloudflare pokrýva štyri úlohy:

1. **Vstupná brána a ochrana.** DNS, TLS, Always Use HTTPS, HSTS, WAF a ochrana proti preťaženiu. Administrácia môže byť navyše chránená pravidlom Cloudflare Access (overenie e-mailom), čo je druhá vrstva pred prihlásením do administrácie.
2. **Hosting webu a administrácie.** Obe sú statické výstupy z buildu, doručované z Cloudflare Pages. Nemajú vlastný server, ktorý by mohol spadnúť.
3. **Úložisko.** R2 drží chránené médiá a šifrované zálohy databázy. K zálohám sa nedostane nikto bez šifrovacieho kľúča, ani s prístupom do bucketu.
4. **Edge presmerovania.** NEXUS Worker vracia trvalé presmerovanie 301 pre staré adresy, aby sa nestratila návštevnosť ani vytlačené QR kódy. Podrobnosti v `05-PREVADZKOVA-PRIRUCKA.md`.

Worker NEXUS sa **neroutuje na `www`**. Neobsluhuje stránky webu, iba presmerovania a svoje API. Keby sa na `www` routoval, vrátil by na stránky chybu 404.

---

## 6. Web (storefront)

Web je statický výstup, ktorý sa generuje pri zostavení. To znamená, že stránky sú hotové súbory, nie aplikácia, ktorá by sa skladala pri každom kliknutí. Výhody sú rýchlosť, nízke náklady a malá plocha na útok.

Web pozná iba štyri verejné konfiguračné hodnoty: adresu API, adresu úložiska obrázkov, verejný kľúč obchodu a identifikátor regiónu. **Tajné kľúče vo webe nikdy nie sú.** Neplatný tvar niektorej hodnoty build zastaví, takže sa nedá omylom nasadiť web s cudzou konfiguráciou.

Web obsahuje aj stránky, ktoré spravujete z administrácie (texty, nadpisy, obrázky, odkazy). Zmena v administrácii sa prejaví na webe bez zásahu programátora.

---

## 7. Administrácia

Administrácia je samostatná aplikácia, ktorá sa prihlasuje do Admin API backendu. **Nie je to administrácia Medusy.** Tá zostáva dostupná len pre servisné zásahy dodávateľa.

Administrácia má vlastné zabezpečenie: prihlásenie e-mailom a heslom, voliteľne dvojfaktorové overenie kódom z telefónu, role (vlastník a asistent) a záznam zmien. Podrobný návod je v `06-NAVOD-ADMINISTRACIA.md`.

---

## 8. NEXUS moduly

NEXUS je naša platforma obchodnej logiky. V tomto obchode sa používa v piatich konkrétnych úlohách:

| Modul | Čo robí | Ako sa prejaví |
|---|---|---|
| Pricing | počíta cenu podľa cenníka, kategórií, značiek a vernostnej úrovne | cena v košíku a v pokladni |
| SafeOrder | posúdi riziko objednávky a vráti rozhodnutie povoliť, prekontrolovať, obmedziť alebo blokovať | objednávka s podozrivými znakmi sa nedokončí automaticky |
| Booking sync | synchronizuje rezerváciu konzultácie medzi webom a backendom | potvrdený termín a e-mail |
| QR a presmerovania | generuje QR odkazy na kupóny a obsluhuje 301 presmerovania | tlačiteľné letáky a staré adresy |
| Ops events | prijíma podpísané prevádzkové udalosti z okraja | dohľadateľnosť incidentu |

NEXUS má širšie doménové jadro, ale **zapojenie do ANASTASIE používa iba tieto adaptéry**. Existence inej časti NEXUS neznamená, že je v tomto obchode dostupná.

Väzba na obchod nie je v prehliadači. Worker dostane od backendu serverové povolenie a identifikátor obchodu (tenant), preto nejde o prepínač, ktorý by mohol ovplyvniť návštevník.

---

## 9. Platby cez Stripe

- Provider v Meduse je `pp_stripe_stripe`. Web používa Stripe Payment Element, takže Apple Pay a Google Pay sa zobrazia automaticky na zariadeniach, ktoré ich podporujú.
- Webhook pre platby je na adrese `<API>/hooks/payment/stripe_stripe`. Spracúva minimálne udalosti `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.amount_capturable_updated` a `payment_intent.canceled`.
- Sumu určuje výhradne backend. Ak by sa suma zmenila po vytvorení platobnej relácie, systém objednávku nedokončí a vráti konflikt namiesto tichej chyby.
- Stav `PAID` vzniká iba zo skutočného potvrdenia platby. Prijatie objednávky ani rozhodnutie SafeOrder nie sú dôkazom zaplatenia.
- Testovací režim a ostrý režim majú **každý vlastný webhook a vlastný podpisový kľúč**. Pri prechode na ostrú prevádzku sa mení iba kľúč a webhook, nie adresa.

Podrobný postup nastavenia je v `02-NASADENIE.md`.

---

## 10. E-maily

E-maily doručuje Resend cez notification modul. Ak kľúč nie je nastavený, systém beží ďalej, ale e-maily sa iba zapíšu do logu bez adresáta a bez obsahu. To je užitočné pri vývoji, pri ostrom obchode to však znamená, že zákazníkom nič nechodí.

- Texty e-mailov sa dajú upravovať v administrácii. Rozloženie, odkazy a výpočty zostávajú v kóde, mení sa iba text.
- Sledovanie otvorení a preklikov je vypnuté. Dôvod je praktický: prepisovanie odkazov by pokazilo jednorazové prihlasovacie odkazy.
- Neúspešné odoslanie sa automaticky neopakuje, aby zákazník nedostal e-mail dvakrát. Chyba sa zapíše do logu.
- Newsletter má vlastné limity a vlastný odhlasovací odkaz, pozri `05-PREVADZKOVA-PRIRUCKA.md`.

---

## 11. Kde sú aké dáta

| Dáta | Kde sú | Poznámka |
|---|---|---|
| Produkty, ceny, sklad, objednávky, zákazníci, súhlasy | PostgreSQL na Medusa Cloud | jediný zdroj pravdy |
| Stav darčekových poukazov v NEXUS | D1 `nexus-voucher` | zálohuje sa exportom a Time Travel |
| Chránené videá, audia, PDF | súkromný R2 bucket plateného obsahu (na teste `anastasia-paid-content-test`) | prístup iba cez krátkodobý podpísaný odkaz, súbory nemajú verejnú adresu |
| Obrázky produktov | úložisko, ktoré spravuje Medusa Cloud | originály má objednávateľ |
| Zálohy databázy | R2 `anastasia-db-backups` | šifrované, retencia podľa pravidiel |
| Prevádzkové udalosti a audit | PostgreSQL, tabuľky `ops_event` a `ops_audit_entry` | retencia 90 a 1095 dní |
| Obsah stránok a texty e-mailov | PostgreSQL | spravuje sa v administrácii |

---

## 12. Bezpečnostné hranice

Systém rozlišuje tri úrovne prístupu a nikdy ich nemieša:

1. **Verejný kľúč webu (publishable key).** Označuje, pre ktorý obchod a kanál sa požiadavka posiela. **Nie je to prihlásenie zákazníka.** Kde sa pracuje s osobnými údajmi, vyžaduje sa navyše identita zákazníka.
2. **Identita zákazníka.** Vzniká prihlásením jednorazovým odkazom z e-mailu. Vlastníctvo košíka, objednávky, konverzácie a prístupu k obsahu overuje server. Pri cudzom objekte vracia 404, aby neprezradil, že existuje.
3. **Identita správcu.** Admin API vyžaduje prihlásenie typu správca. Zákaznícky token sa do administrácie nedostane.

Ďalšie pravidlá:

- **Predvolené odmietnutie.** Čo nie je výslovne povolené, je zakázané. Každá citlivá trasa má vlastnú kontrolu, nielen skryté tlačidlo v administrácii.
- **Ceny, zľavy a DPH iba na serveri.** Rovnako rezervácia skladu a výpočet rizika.
- **Podpísané správy medzi službami.** Webhooky medzi backendom a NEXUS sa overujú podpisom a časovou pečiatkou, nie prihlasovaním zákazníka.
- **Tajomstvá mimo kódu.** Všetky kľúče sú v nastavení hostingu, nikdy v repozitári ani v administrácii obchodu.
- **Chránené médiá.** Backend podpíše odkaz na konkrétny súbor pre konkrétneho zákazníka. Platnosť je predvolene 600 sekúnd, maximum 900 sekúnd. Priama adresa do úložiska sa nikdy neukáže. Toto nie je DRM a neobmedzuje počet súčasne prehrávaných zariadení. Už vydaný odkaz po odobratí prístupu nevyprší okamžite, platí do konca svojej krátkej platnosti.
- **Logy bez osobných údajov.** Každá požiadavka má identifikátor `x-request-id`, podľa ktorého sa dá dohľadať priebeh. Tokeny, adresy a obsah správ sa do logov nepíšu.

---

## 13. Ako prejde objednávka systémom

1. Web založí košík a mení jeho položky. Cenu neurčuje.
2. Backend si vyžiada cenu z NEXUS, overí katalóg, množstvo, región a skupinu zákazníka a uloží záväzný snapshot ceny do košíka.
3. Zákazník vyberie dopravu. Vznikne platobná relácia na presnú sumu.
4. Zákazník uloží súhlas s obchodnými podmienkami a so spracovaním údajov. Verzie textov dodáva server, nie web.
5. Pri dokončení backend znova skontroluje súhlas, snapshot ceny, sumu a menu platby, riziko, prípadnú rezerváciu konzultácie, dopravu, sklad a väzby poukazov.
6. Vznikne objednávka a rezervácia skladu. Nadväzujúce úlohy pripravia súhlasy, poukazy, rezerváciu, prístupy a potvrdenie.
7. Po potvrdení platby sa sprístupní digitálny obsah. Pri storne alebo vrátení peňazí sa prístup podľa pravidiel odoberie.

---

## 14. Hranice, ktoré si treba uvedomovať

Tieto body nie sú chyby, sú to vlastnosti zvoleného riešenia a je fér ich pomenovať:

- **Jedna inštancia backendu zodpovedá jednému obchodu.** Zákaznícke tabuľky nie sú overená zdieľaná databáza pre viac obchodov.
- **Plán Develop nemá Redis ani vlastné zálohy Cloud** a má výpočtový limit 600 hodín mesačne na prostredie. Zálohy preto rieši vlastný workflow, ktorý je popísaný v `04-ZALOHY-A-OBNOVA.md`. Výpočtový limit je otvorená blokácia, ktorú treba potvrdiť u poskytovateľa, pozri `05-PREVADZKOVA-PRIRUCKA.md`.
- **Klub (predplatné) nie je súčasťou Fázy 1.** V administrácii je preto skrytý, API však existuje.
- **Chránené médiá sú pripravené, ale finálne priradenie súborov k produktom po importe katalógu patrí do ďalšej etapy.**
- **Nie všetko, čo existuje v kóde, je zapnuté v administrácii.** Ak niektorá obrazovka pri odovzdaní chýba, doplní dodávateľ pri odovzdaní.
