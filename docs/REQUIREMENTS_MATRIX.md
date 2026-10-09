# REQUIREMENTS_MATRIX: ANASTASIA × NEXUS

Stav k 9. 10. 2026, větev `wave1-base` (commit `1a2ddae`). Jediný zdroj pravdy o tom, co je hotové. Stavy: `NOT_IMPLEMENTED`, `PARTIAL`, `BLOCKED`, `IMPLEMENTED_UNVERIFIED`, `VERIFIED`, `ACCEPTED`, `FUTURE_SCOPE`. `VERIFIED` = spuštěné testy nebo reprodukovatelný důkaz; samotný build nebo existence kódu nestačí.

Zdroje: Smlouva `SMLOUVA-ANASTASIA-FINAL.html` (čl. 2, příloha č. 1), direktiva A-01..A-18 (Lucky, 9. 10. 2026).

## 1. Rozdíl mezi direktivou a smlouvou (rozhodnutí potřebuje Lucky)
Smlouva přiřazuje do **Fáze 2** (ne Fáze 1): jazyky SK/EN/RU (A-14), chráněná média video/audio (A-07), AI asistent s rezervací a úhradou konzultace v chatu (A-08 částečně), ambasadorský program, ComGate. Direktiva je řadí k základu. Plán: backend základ A-07/A-14 připravit teď (je to jádro), ale akceptace Fáze 1 je neváže. Audio EP.001 (A-06) je ve smlouvě nejmenovaný produkt; ověřit, že jde o produkt Fáze 1.

## 2. Smlouva čl. 2, Fáze 1 → balík → stav

| ID | Požadavek (smlouva) | Balík | Stav | Důkaz / blokátor |
|---|---|---|---|---|
| S1-01 | Nový e-shop, SK, bez šablony | storefront (až na závěr) | NOT_IMPLEMENTED | čeká na ověřený backend |
| S1-02 | Katalog: produkty, ceny, kategorie, značky, dostupnost, kupóny | C1 `catalog-import` | IMPLEMENTED_UNVERIFIED | 23 unit testů, import nespuštěn proti DB ani skutečnému dumpu |
| S1-03 | Košík, objednávky, Stripe (karta, Apple/Google Pay) | K2, K7 | PARTIAL | cart/checkout přes Medusa + NEXUS ověřeno jen unit testy; Stripe provider nezapojen lokálně (chybí klíč) |
| S1-04 | RESET 40+ zachován, zpřístupnění po zaplacení | K3 `entitlement` | IMPLEMENTED_UNVERIFIED | 11 unit testů, migrace proběhla na lokální DB; end-to-end s platbou neověřen |
| S1-05 | SSO a přenos zákaznic, objednávek, přístupů | K6 `auth`, C2 | NOT_IMPLEMENTED / C2 rozpracováno | C2 běží; K6 nezačato; hostovská objednávka nedostane přístup (viz K3) |
| S1-06 | Generátor QR v administraci (kupón → URL s automatickou slevou + QR) | C3 `qr-redirects` | PARTIAL (Codex pracuje) | |
| S1-07 | 301 přesměrování všech starých URL a vytištěných QR | C3 | PARTIAL (Codex pracuje) | |
| S1-08 | Administrace na míru, správa produktů/cen/kategorií/kupónů/objednávek/zákaznic | C5 `admin-ui` + Medusa Admin | NOT_IMPLEMENTED | až po K4/K5; Medusa Admin build prošel |
| S1-09 | Zabezpečení, odstranění rizik z auditu | K-sec review | PARTIAL | server-verified pricing a SafeOrder fail-closed (unit testy); audit rizik starého webu se týká starého systému, nový je řeší návrhem; SafeOrder Worker route bez autentizace (otevřené) |
| S1-10 | Potvrzovací e-mail objednávky | E-mail provider | NOT_IMPLEMENTED | rozhodnutí: Resend/SMTP |

## 3. Příloha č. 1, testovací scénáře Fáze 1

| ID | Scénář | Stav | Co chybí |
|---|---|---|---|
| T1-1 | Nákup: výběr, košík, kupón, Stripe, potvrzovací e-mail | NOT_IMPLEMENTED | e2e (C8), Stripe testovací klíč, e-mail |
| T1-2 | Nákup RESET 40+ a automatické zpřístupnění; bez nákupu nedostupné | IMPLEMENTED_UNVERIFIED | e2e proti DB (C8) |
| T1-3 | Přihlášení migrované zákaznice, historie, přístupy | NOT_IMPLEMENTED | C2, K6 |
| T1-4 | Staré URL a QR vedou na správné stránky (301) | PARTIAL | C3, test na sadě starých URL |
| T1-5 | Generátor QR: kupón, URL s automatickou slevou, stažení QR | PARTIAL | C3 |
| T1-6 | Administrace objednatelem | NOT_IMPLEMENTED | C5 |
| T1-7 | Ověření odstranění bezpečnostních rizik | NOT_IMPLEMENTED | závěrečné review |

## 4. Fáze 2 (smlouva), zatím mimo akceptaci Fáze 1

| ID | Požadavek | Stav |
|---|---|---|
| S2-01 | anastasia.academy + aianastasia.com na společném jádru, jedno přihlášení | NOT_IMPLEMENTED |
| S2-02 | SK/EN/RU, ruční přepínání, úprava překladu v administraci | NOT_IMPLEMENTED (C6) |
| S2-03 | Chráněné přehrávání jen pro oprávněné | PARTIAL: rozhraní `ProtectedMediaSigner` v `entitlement/types.ts`, implementace chybí |
| S2-04 | AI asistent, rezervace a úhrada v chatu | NOT_IMPLEMENTED; rezervační jádro (A-08, K9) se staví teď, chat ho jen volá; AI nikdy v cestě peněz |
| S2-05 | Ambasadorský program | NOT_IMPLEMENTED |
| S2-06 | ComGate (volitelně) | FUTURE_SCOPE |
| MIMO | Členský klub/předplatné, Zlatá brána (220 € samostatně) | FUTURE_SCOPE |

## 5. Direktiva A-01..A-18

| ID | Stav | Vlastník | Poznámka / důkaz |
|---|---|---|---|
| A-01 SSO/passwordless | NOT_IMPLEMENTED | K6 | Medusa customer auth; vlastní protokol nepsat |
| A-02 profil a knihovna | IMPLEMENTED_UNVERIFIED | K3 | `GET /store/entitlements` vyžaduje customer auth; test izolace změnou ID chybí |
| A-03 katalog/ceny EUR | IMPLEMENTED_UNVERIFIED | C1, K1 | cena se přepočítá serverově v nexus-cart |
| A-04 checkout/persistence | PARTIAL | K2/K4 | Medusa persistuje; e2e neověřeno |
| A-05 Stripe webhook | NOT_IMPLEMENTED (ověření) | K7 | používá Medusa Stripe provider; podpis/idempotence/částka neověřeny; nedělat vlastní webhook |
| A-06 produkt Nič nemusíš (EP.001, 38 €, 6 stop) | NOT_IMPLEMENTED | C1 seed + K3 | produkt a stopy nezaloženy; ověřit dostupnost a práva k souborům |
| A-07 chráněná média | PARTIAL | K3 | backend hotový a testovaný (9 unit testů): `POST /store/media-access` kontroluje nárok a vydá krátkodobý (max 15 min) HMAC odkaz s vodoznakem a auditem. Worker `nexus/workers/api/routes/mediaDelivery.ts` (ověření tokenu, Range, HLS, 9 unit testů, celá sada NEXUSu 1053/1053 zelená) napsán, na R2 neběžel. CHYBÍ: limit souběžných přehrávání, vytvoření bucketu a bindingu, nahrání médií, vodoznak v přehrávači, test neoprávněného přístupu e2e. Požadavky: soukromý bucket bez veřejné adresy, žádný přímý .mp4, HLS, vodoznak, limit přehrávání; DRM jen volitelně po ocenění. Video RESET 40+ (207 MB) je na starém webu veřejně dostupné; v novém systému jen v soukromém bucketu |
| A-08 rezervace | NOT_IMPLEMENTED, **V ROZSAHU (rozhodnutí Luckyho 9. 10. 2026: rezervace přímo v systému, žádná ruční domluva)** | K9 `booking` | konzultace L005 (69 €, 60 min): objednávka → termín → potvrzení; smlouva čl. 9 a příloha č. 1 to řadí do Fáze 2 (AI chat), základ rezervací se staví jako jádro |
| A-09 administrace | NOT_IMPLEMENTED | C5 | |
| A-10 SafeOrder | IMPLEMENTED_UNVERIFIED | K2 | fail-closed v checkoutu (5 unit testů); Worker route bez auth, logika inline, nepoužívá `RiskEngineRule` |
| A-11 Pricing + tenant | IMPLEMENTED_UNVERIFIED | K1 | tier z `metadata.nexus_tier` (4 unit testy); tenant izolace Workeru neauditována |
| A-12 voucher runtime | PARTIAL | K8 | Worker routy existují, souběh a jednorázovost neověřeny; produkt Voucher nerozhodnut |
| A-13 QR kampaně | PARTIAL | C3 | |
| A-14 SK/EN/RU | NOT_IMPLEMENTED | C6 | Fáze 2 |
| A-15 inventář a migrace | PARTIAL | C2, C4 | |
| A-16 migrace DB a obnova | PARTIAL | K4, C7 | migrace ověřena na lokální DB (čistá instalace); postup obnovy nezkoušen |
| A-17 monitoring/zálohy | BLOCKED | C7 | chybí přístupy a hosting; obnova neověřena |
| A-18 Zlatá brána | FUTURE_SCOPE | | |

## 6. Ověřeno 9. 10. 2026 (K4, lokálně)
- `medusa build` OK (backend 16,8 s, admin 69,2 s).
- `db:migrate` na čisté DB `anastasia_dev_wave1` OK, tabulka `entitlement` existuje.
- `anastasia-bootstrap` doběhl, druhý běh idempotentní, skupiny Bronze/Silver/Gold/VIP.
- Opraveno: bootstrap přesunut z `migration-scripts/` do `scripts/`, unikátní název digitální servisní zóny, odstraněn demo seed.
- Lokálně bez Redisu (`REDIS_URL=` prázdné) a bez Stripe klíče; produkčně nutné.

## 7. Otevřená rozhodnutí
DPH 23/19/5 % s účetní; e-mail provider; dobírka a osobní odběr (SafeOrder pozná jen text `cod`/`dobierk`); co je Voucher; zda posunout A-07/A-14 do Fáze 1; oprava autentizace SafeOrder Worker route (zásah do `nexus/`); rozpor repozitáře (`L-Code-Dynamics-Dev/nexus` vs. `hlancaric-ship-it/anastasia-nexus`).

## 8. Brána po Fázi 1: red team (rozhodnutí Luckyho 9. 10. 2026)

Po dokončení Fáze 1, kdykoliv a bez ohlášení, proběhne útočný test modelem s otevřenými váhami trénovaným na útoky. Cíl: dostat se do systému libovolným způsobem.

**Závazná pravidla rozsahu:**
1. **Cíl útoku je výhradně staging** — bit-for-bit kopie produkčního systému (stejná architektura, stejný kód, stejná konfigurace krom tajných klíčů), se syntetickými daty a Stripe v test módu. Produkce, starý web `anastasiaoz.eu`, Cloudflare/Stripe účty samotné a cokoli mimo náš staging nejsou cíl.
2. **Žádné oznámení, žádná domluvená hodina.** Model přichází kdykoliv po dokončení Fáze 1, nikdo z týmu neví kdy. Žádná výjimka ze strany testovaného systému (žádné "heads up", žádné pozastavení obrany na dobu testu).
3. **Metody neomezené.** Smí zkoušet cokoliv na staging cíli — SQL injection, obcházení autentizace, manipulaci cen a kupónů, replay útoky, manipulaci webhooku, cizí data změnou ID, obcházení chráněných médií, tenant izolaci, SafeOrder, upload, zatěžové/DoS útoky v rámci našich vlastních zdrojů.
4. **Před testem: záloha stagingu.** Po testu (bez ohledu na výsledek, včetně úplného pádu): obnova ze zálohy. Tím se zároveň ověří A-17 (zálohování a obnova).
5. **Výstup:** nálezy s klasifikací závažnosti a reprodukcí v `docs/SECURITY_REVIEW.md`. Veřejné spuštění je podmíněno uzavřením kritických a vysokých nálezů a retestem.

Staging se musí postavit jako věrná kopie dřív, než tento test může proběhnout — je to předpoklad, ne až poslední krok Fáze 1.
