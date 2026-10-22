# ANASTASIA – prehľad systému (Fáza 1)

**Pre:** Mgr. Lucia Rogožanová, LUCRAT spol. s r.o.
**Vypracoval:** L-Code Dynamics
**Verzia dokumentácie:** 22. 10. 2026
**Rozsah:** Fáza 1 podľa čl. 2 zmluvy, dokumentácia podľa čl. 4 odst. 4

---

## 1. Čo je ANASTASIA

ANASTASIA je nový e-shop a zákaznícke zázemie, ktoré nahradzuje pôvodný obchod na platforme Umbraco. Skladá sa zo štyroch častí, ktoré spolu komunikujú cez zabezpečené rozhrania:

1. **Web (storefront)** – to, čo vidí návštevník. Katalóg, produkt, košík, pokladňa, zákaznícky účet, členská zóna RESET 40+.
2. **Administrácia** – Vaše pracovné prostredie. Objednávky, produkty a ceny, kupóny, QR kódy, zákazníci, obsah webu, e-maily, newsletter.
3. **Backend (jadro obchodu)** – server, ktorý rozhoduje o cene, sklade, objednávke, platbe a prístupoch. Beží na platforme Medusa 2.19 s databázou PostgreSQL.
4. **NEXUS** – naše vlastné moduly pre výpočet ceny, posúdenie rizika objednávky, rezervácie konzultácií a prevádzkové udalosti.

K tomu patria externé služby: **Cloudflare** (DNS, ochrana, hosting webu a administrácie, úložisko záloh a médií), **Stripe** (platby kartou, Apple Pay, Google Pay) a **Resend** (doručovanie e-mailov).

Dve veci, ktoré sú pre systém kľúčové a ktoré si zaslúžia jednu vetu na úvod:

- **Cenu, zľavu, DPH a riziko objednávky počíta výhradne server.** Web nikdy neposiela cenu do pokladne, iba ju zobrazuje. Nedá sa teda upraviť cena v prehliadači ani obísť zľavové pravidlo.
- **Systém je Váš.** Zdrojové kódy, dokumentácia a prístupy sa odovzdávajú Vám, aby systém mohol prevziať aj iný dodávateľ. Zoznam účtov a ich stav je v dokumente `07-PRISTUPY-A-UCTY.md`.

---

## 2. Z čoho sa systém skladá

| Časť | Technológia | Čo robí |
|---|---|---|
| Web (storefront) | statické HTML, CSS a JavaScript, generované pri zostavení | katalóg, produkt, košík, pokladňa, účet, RESET 40+, texty stránok |
| Administrácia | samostatná aplikácia v prehliadači, prihlasuje sa do Admin API | každodenná práca obchodu, celá v slovenčine |
| Backend | Medusa 2.19 (Node.js) | produkty, ceny, košíky, objednávky, platby, sklad, zákazníci, súhlasy, prístupy k obsahu |
| Databáza | PostgreSQL 14 a novšia | všetky obchodné dáta |
| NEXUS moduly | Cloudflare Worker, D1, Durable Object | výpočet ceny, SafeOrder, rezervácie, QR a presmerovania, prevádzkové udalosti |
| Edge a hosting webu | Cloudflare (DNS, TLS, WAF, Pages, Workers, R2) | jedna vstupná brána, ochrana, doručenie webu a obrázkov, zálohy |
| Platby | Stripe | karta, Apple Pay, Google Pay, potvrdenie a vrátenie platby |
| E-maily | Resend cez notification modul | prihlásenie odkazom, potvrdenia objednávok, poukazy, odpovede z chatu, newsletter |
| Zálohy databázy | GitHub Actions a Cloudflare R2 | denná šifrovaná záloha a obnova |

Podrobný popis vrstiev, tokov a hraníc je v `01-ARCHITEKTURA.md`.

---

## 3. Kde čo beží

Adresy sú návrh podľa plánu spustenia. Ich skutočný stav overte pri odovzdaní, prípadné zmeny doplní dodávateľ.

| Časť | Kde beží | Adresa |
|---|---|---|
| Web | Cloudflare Pages, projekt `anastasia-web` | `https://www.anastasiaoz.eu` |
| Administrácia | Cloudflare Pages, projekt `anastasia-admin`, odporúčame chrániť Cloudflare Access | `https://admin.anastasiaoz.eu` |
| Backend | Medusa Cloud, plán Develop, región `eu-central-1` | adresa pridelená Cloudom, tvar `https://<subdoména>.medusajs.app` |
| NEXUS | Cloudflare Workers, `nexus-api-production`, D1 `nexus-voucher` | `https://nexus.anastasiaoz.eu` |
| Zálohy databázy | Cloudflare R2, bucket `anastasia-db-backups`, jurisdikcia EU | bez verejnej adresy |
| Obrázky produktov | úložisko súborov, ktoré spravuje Medusa Cloud | adresu prideľuje Cloud |
| Platby | Stripe, účet LUCRAT | `dashboard.stripe.com` |

DNS všetkých domén je na Cloudflare. Pošta (MX a SPF záznamy) zostáva na Active24, pribúdajú iba záznamy potrebné pre doručovanie e-mailov.

**Testovacie prostredie:** počas prípravy sa testovalo na adresách `anastasia-test.l-code-dynamics.com` a `anastasia-test-admin.l-code-dynamics.com`. Podľa kontrolného záznamu z 19. 10. 2026 tieto adresy v tom čase neboli z verejnej siete dostupné, preto treba stav testovacieho prostredia overiť pri odovzdaní. Ak nie je dostupné, doplní dodávateľ pri odovzdaní.

---

## 4. Ako to funguje v skratke

1. Návštevník si vyberie produkt. Web pošle košík backendu, backend si vyžiada cenu z NEXUS a cenu uloží ako záväzný snapshot.
2. Pri pokladni sa overí súhlas s obchodnými podmienkami, doprava, sklad a riziko objednávky. Až potom vznikne platobná relácia na presnú sumu.
3. Stripe potvrdí platbu. Tým sa sprístupní digitálny obsah, odošle sa potvrdenie a objednávka sa objaví vo Vašej administrácii.
4. Vy objednávku pripravíte, odošlete a prípadne vrátite peniaze. Každý z týchto krokov má v administrácii svoje tlačidlo a zákazník dostane e-mail.

---

## 5. Zoznam dokumentov

| Dokument | Čo v ňom nájdete | Pre koho |
|---|---|---|
| `00-PREHLAD.md` | tento dokument, orientácia a kontakty | všetci |
| `01-ARCHITEKTURA.md` | z čoho sa systém skladá, diagram, dátové toky, bezpečnostné hranice | technické prevedenie aj laik |
| `02-NASADENIE.md` | ako sa nasadzuje backend, web a administrácia, názvy premenných prostredia | technický správca |
| `03-API.md` | prehľad rozhraní, ktoré systém používa a ponúka | technický správca, integrátor |
| `04-ZALOHY-A-OBNOVA.md` | denné zálohy, kde sú, ako dlho, presný postup obnovy a test obnovy | prevádzka |
| `05-PREVADZKOVA-PRIRUCKA.md` | monitoring, postup pri výpadku, priority, limity služieb, kontakty | Vy a prevádzka |
| `06-NAVOD-ADMINISTRACIA.md` | ako pracovať s administráciou krok za krokom | Vy a Vaši spolupracovníci |
| `07-PRISTUPY-A-UCTY.md` | zoznam účtov a služieb, kto ich má vlastniť, čo overiť pri odovzdaní | Vy a dodávateľ |

Súvisiace interné dokumenty dodávateľa (technické detaily, história vývoja) sa odovzdávajú spolu so zdrojovým kódom. Táto sada je určená na každodenné používanie a na prevzatie systému.

---

## 6. Kontakty na podporu

| | |
|---|---|
| E-mail | **ceo@l-code-dynamics.com** |
| Telefón | **+420 776 880 075** |
| Web dodávateľa | https://l-code-dynamics.com |

Pri hlásení problému napíšte, čo ste robili, čo sa zobrazilo a kedy to nastalo. Ak ide o objednávku, priložte jej číslo. Podrobnosti k reakčným časom a prioritám sú v `05-PREVADZKOVA-PRIRUCKA.md`.

---

## 7. Čo treba vedieť pred akceptáciou

Táto dokumentácia opisuje systém tak, ako bol postavený a overený. Neznamená to, že všetky externé služby sú už ostré. Pred verejným spustením treba mať doložené a potvrdené:

1. skúšobnú platbu cez Stripe vrátane webhooku a jednu skutočnú malú platbu s vrátením,
2. doručenie e-mailu z overenej domény,
3. vlastníctvo a nastavenie úložiska R2 na strane objednávateľa,
4. priradenie chránených médií k produktom po importe katalógu,
5. schválených dopravcov a ceny dopravy,
6. daňový a účtovný režim,
7. vlastníka produkčného monitoringu a vlastníka obnovy zo zálohy.

Stav týchto bodov k dátumu odovzdania doplní dodávateľ pri odovzdaní.
