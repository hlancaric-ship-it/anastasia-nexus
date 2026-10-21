# PROGRESS_LOG: ANASTASIA × NEXUS

Jediný zdroj pravdy o tom, **kde skutečně jsme**. Doplňuje `docs/REQUIREMENTS_MATRIX.md` (detailní stav každého požadavku A-01..A-18 a S1-xx/T1-xx). Aktualizováno: 12. 10. 2026, větev `wave1-base`.

Pravidlo tohoto logu: procenta a stavy vycházejí jen z toho, co bylo **spuštěno a ověřeno** (unit testy, běh proti reálné Postgres, HTTP volání na živém serveru, skutečné SQL). Nic se sem nezapisuje jako hotové na základě existence kódu nebo tvrzení agenta.

---

## 1. V jaké jsme fázi

**Fáze: Fáze 1 — backend a doménové jádro.** Storefront (frontend) je v této session a v procentech níže veden jako 0 %, protože tady se na něm nepracovalo — **Jose ho ale souběžně staví s Codexem mimo tuto session**, takže reálný celkový stav Fáze 1 je lepší, než říká tabulka v bodě 2. Tento dokument sleduje jen backend; stav storefrontu sem zapisovat nebudu, dokud ho sem Jose/Lucky výslovně nedoplní.

Uvnitř Fáze 1 jsme ve stavu: **jádro hotové a ověřené na lokální DB, integrace mezi částmi a produkční infrastruktura chybí.**

Red team (bod 8 v matici) je samostatná **brána AŽ po Fázi 2** (upřesněno 12. 10. 2026 — příprava air-gapovaného stagingu by se po Fázi 1 nestihla pořádně), běží na ní nezávisle Opus 5.5 (síťová izolace) a Fable (nezávislé ověření); veřejné spuštění Fáze 1 na něm nečeká a nespadá do procenta Fáze 1 níže.

---

## 2. Hotovo v procentech podle oblasti

Měřítko: 0 % nic, 50 % kód existuje a má unit testy, 80 % ověřeno na reálné Postgres/serveru, 100 % % ověřeno end-to-end včetně produkční konfigurace.

| Oblast | % | Stav |
|---|---|---|
| **Katalog (C1)** | **90 %** | 30 produktů v DB, ceny ověřené proti živému webu i dumpu. Chybí: obrázky nenahrané do úložiště, DPH 20 % s účetní |
| **Pricing/tenant (K1)** | 70 % | Tier z metadat funguje, unit testy. Tenant izolace Workeru neauditovaná |
| **SafeOrder (K2 + review)** | **95 %** | **Sloučeno a ověřeno živě 12. 10. 2026, včetně e2e přes HTTP:** Worker vyžaduje autentizaci (Bearer + tenant), COD limit je pevný na serveru, standardní Medusa `completeCartWorkflow` i custom route jdou obě ověřit přes skutečné HTTP volání na reálném izolovaném Postgres clusteru (`verify-safeorder-local.py`) — **všech 38 scénářů PASS** (unauthorized/unavailable/malformed/REVIEW/BLOCK/pricing-redirect/pricing-malformed/pricing-tenant/pricing-change, oba completion paths). Cestou odhalena a opravena **reálná kritická chyba**: Worker posílal `appliedRules` ve špatném tvaru, což by shodilo úplně každé přidání do košíku proti živému Workeru (viz matice bod A-04/A-11). Chybí už jen produkční Stripe klíč |
| **Entitlement / RESET 40+ (K3)** | **80 %** | **Lokální digitální lifecycle ověřen přes HTTP a skutečné payment workflows 14. 10. 2026:** bez nákupu/neuhrazená objednávka bez přístupu, capture → aktivní knihovna, izolace zákazník/médií, replay bez duplikace, částečný refund zachová přístup, plný refund/storno jej odebere. Syntetický produkt a `pp_system_default`; skutečný RESET obsah a Stripe ještě neověřeny. Viz `backend/docs/wp/integrated-checkout.md`. |
| **Chráněná média (A-07)** | 55 % | Backend + Worker napsané a testované (18 unit testů). Nic neběželo na R2, chybí bucket, vodoznak, nahrání souborů |
| **Zákazníková migrace (C2)** | 85 % | Spuštěno naostro na reálném dumpu: 17 zákazník, 10 objednávek, 18 entitlementů, `reconciled: true`, idempotentní |
| **Přihlášení / SSO (K6)** | **90 %** | Magic-link ověřen živě na serveru end-to-end, včetně propojení migrované zákazník a opravy 3 reálných chyb |
| **QR kupóny / redirecty (C3)** | **90 %** | **Atomické použití ověřeno živě 13. 10. 2026** — `completeCartWorkflow.hooks.validate` po všech SafeOrder ALLOW volá Medusa `registerUsage`; chyba limitu zastaví dokončení a pozdější selhání má kompenzaci `revertUsage`. Dva paralelní HTTP checkouty se stejným jednorázovým kupónem: standardní i NEXUS cesta vždy **1× 200, 1× 400, právě jedna objednávka, used = 1**, cena 45 místo 50 EUR. Ověřeno proti skutečné Medusa 2.19.0 a izolovanému PostgreSQL. Celá backend unit sada **203/203**, HTTP **40 scénářů PASS**, TypeScript PASS. Jen procentuální kupóny; edge nasazení 301 map stále chybí. Implementace ve větvi `codex/coupon-usage`, bez nasazení. |
| **Rezervace konzultací (K9)** | **80 %** | **HTTP a checkout ověřeny lokálně 13. 10. 2026** na skutečné Medusa/PostgreSQL: souběh stejného i překrývajícího se termínu 201/409, izolace zákazník, přihlášené přiřazení ke košíku, odmítnutí chybějící/cizí/prošlé rezervace na obou completion cestách, kompenzace při chybě platby, capture → potvrzení, storno → uvolnění → nový hold. Platba přes lokální `pp_system_default`, nikoli Stripe. Chybí Stripe E2E, notifikace a admin kalendář. Větev `codex/booking-verification`, bez nasazení; důkazy v [booking-verification.md](../backend/docs/wp/booking-verification.md). **14. 10. 2026 (větev feat/booking-availability):** společný kalendář Lucie (zámek + překryv přes všechny typy včetně bufferu), týdenní volné úseky (tabulka `booking_availability`, fail-closed), admin API `/admin/booking/types` a `/admin/booking/availability` (409 při zásahu do aktivní rezervace). Admin UI stránky „Typy konzultací“ a „Volné termíny“ hotové; **HTTP běh nad novým modelem ověřen 14. 10. 2026** (souběh dvou různých typů přes sebe 409/201, buffer 409/201, zkrácení úseku s rezervací 409, archivace typu). Chybí Stripe E2E a notifikace |
| **Inventář webu (C4)** | 100 % | Dokument hotový |
| **Zálohy a obnova (A-16/A-17 lokálně)** | **95 %** | Záloha i obnova ověřené živě (sha256, přesné počty po obnově do čisté DB). Chybí jen produkční hosting/monitoring |
| **Administrace (C5)** | 10 % | **Chat zákazník ↔ Lucia hotový a ověřený lokálně 14. 10. 2026** (větev feat/booking-availability, bez nasazení): limity vynucené serverem pod zámkem (3 po sobě, 5/den, 2000 znaků, jen text), vazba na vlastní objednávku/rezervaci, admin stránka „Zprávy“ (odpověď, uzavřít/ztlumit/blokovat vratně), souhrn Lucii max 1×/h. HTTP: 5 souběžných → 3×201 + 2×429. Viz [chat.md](../backend/docs/wp/chat.md). Chybí storefront UI chatu, produkční e-mailové šablony, GDPR retence. Zbytek C5 nezačatý |
| **i18n SK/EN/RU (C6)** | 0 % | Fáze 2, nezačato |
| **E2E scénáře (C8)** | — | **PARTIAL:** 14 nových technických kontrol digitálního nákupu, celkem 65 HTTP scénářů PASS na jedné čerstvé syntetické DB (SafeOrder + QR + booking + digitální přístupy). Nejde o splnění všech 14 akceptačních scénářů direktivy; chybí Stripe, e-mail, R2 a zbytek akceptace. |
| **Stripe webhook (K7)** | **55 %** | **Polovina ověřena živě 12. 10. 2026** (skutečný `@medusajs/payment-stripe` + skutečné Stripe SDK, dummy klíč, žádné volání sítě): platný podpis → správná akce/částka; špatný podpis → vyhodí chybu; manipulovaná částka po podpisu → HMAC to sám odhalí; platba bez našeho `session_id` (cizí Stripe integrace na stejném účtu) → bezpečně ignorována, nespadne. **Chybí už jen reálná platba kartou/Apple Pay/Google Pay — to potřebuje Luckyho testovací klíč** |
| **Voucher runtime (K8)** | **90 %** | **Souběh a jednorázovost ověřeny živě 12. 10. 2026** proti skutečnému workerd + D1 + Durable Object (ne mocku) — dvě souběžná čerpání stejného poukazu: jen jedno uspěje, zůstatek nejde do záporu, přesně jeden transakční záznam; replay stejného tokenu zamítnut. 5/5 opakovaných běhů bez nestability. **Rozhodnuto (Lucky, 14. 10. 2026): Voucher = dárkový poukaz**, který si kdokoli koupí jako dárek pro někoho jiného. Parametry (hodnoty, na co platí, platnost, postupné čerpání, způsob doručení, vratky) určí klientka — stavět jako nastavitelné v adminu, ne natvrdo. Výchozí nastavení (Lucky, 14. 10. 2026): hodnoty 50 / 100 / 200 €, platnost 12 měsíců od vystavení. **Dárkový poukaz postaven 14. 10. 2026 (větev `feat/gift-voucher`, VERIFIED lokálně):** Medusa modul `gift-voucher` (PostgreSQL, ne Worker — jedna transakce s objednávkou, EUR, vratky/storno/zneplatnění), admin nastavení + produkt s variantami podle hodnot + přehled se zneplatněním, obdarovaní ověření na serveru, vystavení až po zaplacení (kryptografický kód, idempotentně), `voucher.issued` s doručením za rozhraním, atomické čerpání v checkoutu s kompenzací (bez záporu, bez dvojího čerpání, poukaz neplatí poukaz), vratka na poukaz a obnovení při stornu. 87 nových unit testů + 10 HTTP scénářů proti skutečné Medusa/PG. Detail: `backend/docs/wp/gift-voucher.md`. Chybí: storefront UI, e-mail provider, DPH (účetní), rate limit na uplatnění kódu, automatika při refundu kartou |
| **Storefront** | 0 % | Záměrně nezačato (pravidlo pořadí) |

**Celkový odhad Fáze 1 (bez storefrontu, bez red teamu): zhruba 70–75 % hotovo** (upřesněno 12. 10. 2026 — workerd blocker vyřešen, Worker strana SafeOrderu a K8 voucher souběh ověřeny naživo). Jádro (katalog, ceny, přihlášení, migrace, zálohy, SafeOrder, voucher souběh) je silné a ověřené. Slabé místo zůstává produkční infrastruktura (monitoring, hosting, R2) a dokončení platby (potřeba Luckyho testovací Stripe klíč).

---

## 3. Co je DOKONČENÉ a OVĚŘENÉ (ne jen napsané)

Vše níže běželo proti reálné Postgres DB `anastasia_dev_wave1`, nebo proti skutečně běžícímu Medusa serveru (`medusa start`), ne jen v unit testech s mockem:

1. **Katalog:** 30 produktů importováno, ceny sedí na 29 ze 30 proti živému webu (1 nenalezen na webu vůbec, viz `PRODUKTY-SOUCASNY-STAV.md`).
2. **Migrace zákazník:** 17 zákazník, 12 adres, 10 objednávek, 18 entitlementů, `reconciled: true`, druhý běh beze změny.
3. **Přihlášení (magic-link):** vyžádání → potvrzení → JWT s reálným `actor_id` → propojení migrované zákazník → `has_account` se přepne na `true`. Testováno na dvou různých migrovaných zákazníkovch.
4. **Rezervace:** 13. 10. 2026 navíc skutečné HTTP požadavky na Medusa/PostgreSQL: souběh i překryv termínů, vlastnictví a autorizace košíku, odmítnutí neplatného holdu, kompenzace platební chyby, lokální capture, potvrzení a storno s opětovným obsazením. Nejde o ověření reálného Stripe ani notifikací.
5. **Zálohy:** `pg_dump` vytvoří soubor s ověřeným sha256; obnova do čisté DB vrátí přesné počty řádků.
6. **Build a migrace:** `medusa build` a `db:migrate` prochází po každém sloučení větví.
7. **Celá testová sada backendu:** poslední integrovaná regrese: **23 souborů, 218/218 unit testů, 65 HTTP scénářů (11 K9 + 14 digitální lifecycle), TypeScript PASS**. Podrobnosti v `backend/docs/wp/integrated-checkout.md`. Poslední dříve zaznamenaná sada NEXUSu: 85 souborů, 1053 testů, zelené; při tomto K9 ověření nebyla znovu spuštěna.

---

## 4. Co je napsané, ale NEOVĚŘENÉ (kód existuje, běh proti realitě ne)

- K4/C8 digitální nákup — lokální payment/entitlement lifecycle a HTTP vydání podepsaného odkazu ověřeny v rámci 65 scénářů. Neověřeny skutečná Stripe platba, R2 doručení, reálný RESET obsah a e-maily. Důkaz a přesné hranice: [integrated-checkout.md](../backend/docs/wp/integrated-checkout.md).

- K9 rezervace — HTTP/checkout a lokální platební lifecycle již ověřeny; admin UI (typy, volné termíny) a HTTP nad společným kalendářem hotové 14. 10. 2026; zbývá skutečná Stripe platba, notifikace a frontend návaznost. Viz [booking-verification.md](../backend/docs/wp/booking-verification.md).

- Chráněná média (Worker nad R2) — nikdy neběžel proti skutečnému R2 bucketu.
- QR kupóny — **atomické navýšení již OVĚŘENO 13. 10. 2026** na skutečné Medusa + PostgreSQL pro obě HTTP checkout cesty (souběh 200/400, právě jedna objednávka, `used = 1`). Celá unit sada 203/203, HTTP runner 40 scénářů, `npx tsc --noEmit` PASS. `npm test` v backendu neexistuje (`Missing script: test`); spuštěny celé existující unit testy a izolovaný HTTP runner. První běhy narazily na timeout QR a původní časový limit rozšířeného HTTP testu; konečné opakované běhy prošly. C3 sloučeno do `origin/wave1-base` jako `44dbf33`; zbývá edge nasazení redirectů; podrobnosti v [coupon-usage.md](../backend/docs/wp/coupon-usage.md).
- Stripe platby — podpis/integrita webhooku ověřena živě se skutečným SDK (viz výše, K7 55 %); samotná platba kartou/Apple Pay/Google Pay čeká na Luckyho testovací klíč.
- SafeOrder Worker route — nález o chybějící autentizaci z `codex/wave1-security`, oprava existuje na té větvi, ale není sloučená.
- Voucher runtime — Worker routy (D1) ověřeny živě 12. 10.; dárkový poukaz K8 postaven jako Medusa modul a ověřen HTTP scénáři 14. 10. (`feat/gift-voucher`).

## 5. Co ještě VŮBEC NEZAČALO

Administrace (C5), i18n (C6), ambasadorský program, AI asistent, storefront, produkční monitoring a hosting, DRM pro video.

---

## 6. Otevřené incidenty a rozhodnutí (podrobně v `REQUIREMENTS_MATRIX.md`)

- **Vyřešeno 12. 10.:** neschválená GH Action od Codexu (`codex/wave1-security`) odstraněna, falešný poplach u „rozbité Omegy" vyvrácen (9/9 a 1053/1053 testů zelených mimo přehnaně izolovaný sandbox). Bezpečnostní nález (SafeOrder bez auth) čeká na review a sloučení.
- **Vyřešeno 12. 10.:** kolize dvou nezávislých implementací K6 (Claude + Codex). Lepší SQL logika portována, obě nalezené chyby opravené, ověřeno živě.
- Otevřené: DPH sazby s účetní (živý web má i 20 % sazbu z roku 2022), e-mail provider (i pro doručení poukazů), dobírka/osobní odběr v SafeOrder, DPH režim dárkového poukazu (jedno- vs. víceúčelový), repo rozpor (`L-Code-Dynamics-Dev/nexus` vs. skutečný `hlancaric-ship-it/anastasia-nexus`).
- Red team: posunut na bránu AŽ po Fázi 2 (upřesněno 12. 10. 2026), čeká na air-gapovaný staging od Opuse 5.5 a nezávislé ověření od Fable (viz matice bod 8). Mimo dosah tohoto backendového plánu a nepodmiňuje veřejné spuštění Fáze 1.

---

## 7. Jasný plán do úplného finále

### Krok 1 — Dokončit kritickou cestu plateb a bezpečnosti (K7, K8, review `wave1-security`)
1. Review a sloučení bezpečnostních oprav z `codex/wave1-security` (SafeOrder autentizace, COD limit, checkout bypass) — **jen diff mimo CI workflow**, s vlastním ověřením na reálné DB stejně jako u K6.
2. K7: Stripe webhook — ověřit podpis, idempotenci, částku. Potřeba testovací Stripe klíč (rozhodnutí Lucky).
3. ~~K8: voucher runtime — ověřit souběh a jednorázovost proti reálné D1/Postgres.~~ Hotovo (D1 12. 10., dárkový poukaz v PG 14. 10., `feat/gift-voucher`); zbývá storefront UI a merge.
4. Rozhodnout DPH sazby (účetní), e-mail provider (Resend/SMTP), dobírka/osobní odběr.

### Krok 2 — Dokončit média a QR (A-07, C3)
5. Vytvořit R2 bucket, nahrát placená média, ověřit Worker živě (ne jen unit testy).
6. ~~Propojit QR aktivaci slevy s NEXUS pricing (K1) a atomicky navýšit použití při objednávce.~~ **OVĚŘENO 13. 10. 2026 (procentuální kupóny)** — souběh obou HTTP checkout cest prošel, změna na větvi `codex/coupon-usage` (viz sekce 2, C3 90 %).
7. Nasadit 301 mapu na Cloudflare Redirect Rules.

### Krok 3 — K4 finální integrace
8. Spojit všechny ověřené větve do jednoho běhu: katalog + migrace + entitlement + booking + auth + media + QR + voucher na jedné čisté DB od nuly.
9. Spustit celou e2e sadu (C8) proti tomuto integrovanému stavu — 14 scénářů z direktivy kap. 8.
10. Závěrečné bezpečnostní review (K-sec), `docs/SECURITY_REVIEW.md`.

### Krok 4 — K5 traceability, brána pro start storefrontu
11. Dokončit matici smlouva čl. 2 + příloha č. 1 → balík → test → stav se zelenou na všech položkách Fáze 1.
12. Teprve po zelené K5 smí začít storefront (C-storefront, mimo rozsah tohoto backendového plánu).

### Krok 5 — Administrace (C5)
13. Admin UI na správu produktů/cen/kupónů/objednávek/zákazník/rezervací nad hotovým a ověřeným backendem.

**Rozhodnutí Lucky, 13. 10. 2026: admin (C5) se staví KOMPLETNĚ ZNOVU, od nuly.** `admin-demo` (`/Users/lucky/anastasia-nexus/admin-demo`, Cloudflare Worker + D1 + R2) byl jen rychlý jednorázový náhled, aby klientka (Lucia) viděla vizuální směr — **není to základ, na kterém se bude reálně stavět**, nerozšiřovat ani na něj nenavazovat kódem. Reálný C5 se staví nad hotovým a ověřeným backendem (viz sekce 2-3 výše) jako nová věc, se vším, co je zapsané v sekcích 8-9 (self-service princip, editor tier úrovní, newsletter/odstoupenie/reklamácie/fakturace/e-maily, doprava/sklad/storno/refund/souhlas, klub/předplatné — poslední bod čeká na rozhodnutí o rozsahu smlouvy).

**Prioritní sekce v C5 — Lucky 13. 10. 2026, tyhle dvě mají dostat nejvíc péče ze všech:**
1. **Digitální produkty** (RESET 40+ a další budoucí digitální obsah, napojené na entitlement modul `backend/src/modules/entitlement` a chráněná média/R2) — správa přístupů, obsahu, odemykání.
2. **Zákazníkov účet** — a to oboustranně:
   - **Zákazníková zóna na storefrontu** (`/ucet`) musí mít OPRAVDU všechno: objednávky, digitální produkty/entitlementy, rezervace (konzultace/booking, K9), faktury, osobní údaje — ne jen útržek.
   - **Z adminu musí jít se zákazníkov přímo pracovat a komunikovat** — Lucia potřebuje z admin rozhraní vidět a případně i psát/reagovat zákazníci k její objednávce/rezervaci/produktu, ne jen číst data. **Tohle zatím nikde neexistuje** (`contact_messages` v `INVENTAR-A-AKCEPTACE.md` je jen jednosměrný kontaktní formulář, ne obousměrná komunikace vázaná na konkrétní zákazníci/objednávku) — potřeba navrhnout jako nový požadavek pro C5, ne odvozovat z existujícího kódu.
   - **Volné termíny konzultací zadává Lucia ručně po týdnech (požadavek Lucky, 13. 10. 2026):** na začátku každého týdne vyplní v adminu volné časy a uloží. Žádná automatická týdenní pravidla; nevyplněný den = zavřeno (fail-closed). Backend `generateSlots` už umí rozsahy pro konkrétní datum (`exceptions.ranges`) — chybí vlastní tabulka dostupnosti místo `product.metadata.booking`, admin týdenní kalendář (zadání/uložení, „zkopírovat minulý týden“, zobrazení obsazených termínů, obsazený čas nelze smazat) a volitelně pondělní připomínka, když týden není vyplněný.
   - **Chat zákazník ↔ Lucia (Lucky, 13. 10. 2026):** v zákazníkové zóně („ráj“) chat s Luciou, v adminu Lucia odpovídá; konverzace volitelně navázaná na objednávku/rezervaci. Anti-spam (vše vynucuje server): psát smí jen přihlášená zákazník s objednávkou/rezervací/předplatným; max 2–3 zprávy po sobě bez Lucčiny odpovědi; denní strop (~5 zpráv, 2000 znaků); zatím bez příloh a odkazů; Lucia může konverzaci uzavřít / ztlumit / zablokovat (vratně); notifikace Lucii souhrnně max 1×/h, zákazníci e-mail při odpovědi; obsah jen plain text. Potvrzeno (Lucky): psát smí jen zákazník s objednávkou/rezervací/předplatným (varianta a).
   - **Typy konzultací plně modulární (Lucky, 13. 10. 2026):** Lucia si v adminu sama vytváří typy (název, délka, pauza, cena, popis, online/osobně); každý typ = produkt s výběrem termínu. Volné časy zadává jednou, společně pro všechny typy; sloty se generují podle délky typu. Obsazenost a zámek musí být nad celým jejím kalendářem (ne per produkt), jinak by šly překrývající se rezervace různých typů.
Objednávkový formulář a rezervační formulář (K9 booking) musí být na tohle napojené stejně pečlivě — jasné, srozumitelné, ne obecný placeholder.

### Krok 6 — Produkční infrastruktura (A-17)
14. Produkční hosting Medusa (~29 USD/měsíc dle direktivy), Redis, produkční Postgres.
15. Strukturované logování, monitoring dostupnosti, alerty.
16. Produkční zálohování (stejný mechanismus jako lokálně ověřený, nasazený na produkční DB) + ověřený recovery postup v produkčním prostředí.

### Krok 7 — Veřejné spuštění Fáze 1 (NEČEKÁ na red team)
17. Report `READY/BLOCKED/NOT READY` podle kap. 12 direktivy.
18. Písemné schválení klientky (Lucia Rogožanová) — nikdy automatické spuštění.

### Fáze 2 (po spuštění Fáze 1)
anastasia.academy + aianastasia.com na společném jádru, i18n SK/EN/RU, AI asistent, ambasadorský program, ComGate, Zlatá brána (samostatná objednávka).

### Krok 8 — Red team (brána AŽ po Fázi 2, upřesněno 12. 10. 2026)
19. Air-gapovaný staging (Opus 5.5) + nezávislé ověření izolace (Fable) musí být hotové dřív, než test může proběhnout — viz matice bod 8. Příprava je natolik náročná, že by se nestihla pořádně hned po Fázi 1, proto test čeká až na dokončenou Fázi 2.
20. Po testu: oprava kritických a vysokých nálezů, retest.

---

## 8. Co blokuje rychlejší postup

- ~~Workerd neběží na macOS 12.6~~ **VYŘEŠENO 12. 10. 2026** — Jose postavil Ubuntu 26.04 ve VirtualBoxu na stejném Macu (Docker i workerd na Linuxu běží nativně bez problémů). `npm run test:workers` teď prochází naživo (38/38 testů), včetně nově napsaného K8 souběhového testu. VM je zatím živá relace (nic se po restartu neuloží) — pokud bude potřeba opakovaně, doporučuju Jose dokončit trvalou instalaci.
- **Chybí produkční přístupy** (Cloudflare R2, Stripe živé klíče, hosting) — nutné rozhodnutí a součinnost Lucky.
- **Rozhodnutí čekající na Lucky/účetní:** DPH sazby (vč. režimu dárkového poukazu), e-mail provider, dobírka, repo název. Produkt Voucher rozhodnut 14. 10. (dárkový poukaz).
- **Věrnostní tier systém (K1) se mění — Lucky 12. 10. 2026: ANASTASIA nebude používat Bronze/Silver/Gold/VIP→ZR1-4 z `anastasia-bootstrap.ts`/`customer-tier.ts`, bude mít vlastní.** Pracovní návrh (zatím "podle mě", NE finální): 3 úrovně — Bronzový/Strieborný/Zlatý, bez VIP. **Upřesnění Lucky 13. 10. 2026: slevové % se zatím vědomě nechávají na 0 % — nerozhodovat, nedomýšlet.** Navíc **názvy úrovní nemají být natvrdo v kódu — klientka (Lucia) si je musí umět sama přejmenovat v administraci** (C5), až bude admin existovat. Dokud se tier systém nepřepíše, kód s Bronze/Silver/Gold/VIP zůstává nedotčený (neměnit bez finálního potvrzení názvů i procent) — K1 status "HOTOVO"/70 % výše se týká jen mechanismu čtení tieru, ne konkrétních tierů samotných, které se budou měnit. **Požadavek pro C5 (admin, zatím 0 %, nezačato): editor úrovní věrnostního programu (název + sleva %) musí být součástí rozsahu admin UI, ne pevně zadrátovaný.**
- **Obecný princip pro C5 (admin) — Lucky 13. 10. 2026: klientka (Lucia) si musí být schopná VŠECHNO běžné provozní nastavení udělat sama přes administraci, bez zásahu vývojáře.** Konkrétně zmíněno jako příklad, ne vyčerpávající seznam: marketingové akce/kampaně, slevy a jejich pravidla, produktové/kategoriové flagy (novinka, bestseller, doporučujeme...), výprodej/clearance (nastavení i ukončení), názvy věrnostních úrovní (viz výše). Důsledek pro návrh C5: žádná z těchto věcí nesmí být natvrdo v kódu, konfiguračním souboru nasazovaném přes deploy, ani vyžadovat zásah do backendu — musí to být editovatelné přes admin UI a NEXUS pricing/rule engine se musí umět chovat podle toho, co si tam klientka nastaví.
- **Doplnění stejného seznamu — Lucky 13. 10. 2026, zatím NEOVĚŘENO jako hotové/pokryté, jen zapsáno ať se neztratí:**
  - **Newsletter** — přihlášení/odhlášení, evidence souhlasu (GDPR), klientka musí umět spravovat/odesílat sama z administrace. (Pozn.: v `INVENTAR-A-AKCEPTACE.md` je newsletter zatím veden jen pod Academy/AI Anastasia entitami, Fáze 2 — potvrdit, jestli hlavní e-shop Fáze 1 vlastní newsletter signup/správu potřebuje taky, nebo stačí jen sběr e-mailu.)
  - **Formulář odstúpenia od kúpnej zmluvy** (zákonná 14denní lhůta, SR spotřebitelské právo) — není v `STOREFRONT-POZADAVKY-FAZE1.md` ani v redirect mapě veden jako funkční formulář, jen `/vop` jako statická stránka. Potřeba: formulář na storefrontu (podání) + evidence/správa žádostí v adminu (stav vyřízení).
  - **Reklamácie** — na starém webu i v redirect mapě existuje jen statická stránka `/reklamacie`. Potřeba ověřit/rozhodnout, jestli má Fáze 1 obsahovat i funkční reklamační formulář + workflow správy v adminu, nebo zůstává jen informační text (jako teď).
  - **Fakturace** — vystavování faktur se zákonným číslováním (SK účetnictví), ne jen Medusa order confirmation. Navazuje na otevřený bod "DPH sazby s účetní" v `PROGRESS_LOG.md` sekci 6/8 — potřeba rozhodnutí s účetní, jestli fakturaci řeší Medusa/vlastní modul, nebo externí účetní systém.
  - **Transakční e-maily** (notifikační, registrační/vítací, potvrzení objednávky, změna stavu) — potvrzovací e-mail objednávky je už v testovacích scénářích (příloha č. 1), ale registrační/vítací a obecné notifikační e-maily zatím nejsou nikde jako samostatný požadavek. E-mail provider (Resend/SMTP) je už veden jako otevřené rozhodnutí — tohle je navíc konkrétní seznam, JAKÉ e-maily se přes něj mají posílat.
  - Všechny tyhle položky platí stejný princip jako výše: obsah šablon/textů e-mailů a stav/nastavení (zapnuto/vypnuto, texty) musí jít měnit z administrace, ne jen v kódu.

---

## 9. Checklist pokrytí celé nákupní cesty a provozu e-shopu (13. 10. 2026)

Lucky 13. 10. 2026: "co se týká nákupní cesty a flow e-shopu, musíme mít pokryté úplně vše" — projeto systematicky proti příloze č. 1 (7 scénářů) a `INVENTAR-A-AKCEPTACE.md`, ne jen reaktivně dopisováno.

**Pokryto / sledováno (viz sekce 2-4 výše):** výběr produktu → košík → kupón → platba → potvrzovací e-mail (scénář 1); RESET 40+ auto-odemčení (scénář 2); přihlášení + historie objednávek migrované zákazník (scénář 3); staré adresy/QR → 301 (scénář 4); QR generátor kupónů (scénář 5); admin správa produktů/cen/kategorií/kupónů/objednávek/**zákazník** (scénář 6, C5 zatím 0 %); SafeOrder stavy ALLOW/REVIEW/BLOCK/chyba; tier pricing; newsletter/odstoupenie/reklamácie/fakturace/transakční e-maily (viz výše).

**Nově zjištěné mezery — nikde netrackované, potřeba rozhodnutí/zadání:**
- **Doprava** — výběr dopravce, cena dopravy, pravidla (např. doprava zdarma od částky X). Starý web měl 2 způsoby dopravy (`INVENTAR-A-AKCEPTACE.md`), v Fázi 1 scope to zatím nikde není rozpracované.
- **Osobní odběr** — zmíněno jen jako otevřené rozhodnutí vedle dobírky (Krok 1, bod 4), bez detailu.
- **Skladové zásoby** — stav "skladem/vypredané", jak se synchronizuje a zobrazuje zákazníkovi; chybí úplně.
- **Stornování objednávky zákazníkem** (ne jen adminem) — netrackováno.
- **Vrácení peněz (refund)** po reklamaci/odstoupení — navazuje na nově přidané body výše, konkrétní mechanismus přes Stripe nikde zmíněný.
- **Souhlas s VOP/GDPR při checkoutu** (zákonná povinnost, checkbox) — netrackováno jako požadavek.
- **Správa zákazníkov dat (CRM)** — scénář 6 už formálně zahrnuje "správu zákazník", ale potvrdit rozsah: zobrazení historie, poznámky k zákazníci, GDPR export/výmaz na vyžádání.
- **Zařazení zákazník do klubu/předplatného — Lucky 13. 10. 2026, KONFLIKT SE SMLOUVOU:** `INVENTAR-A-AKCEPTACE.md` řádek 149 výslovně říká "Členský Klub a předplatné jsou mimo smlouvu" (Fáze 2/FUTURE_SCOPE). Potřeba rozhodnutí Lucky/Jose: (a) jen admin tag/segmentace zákazník bez skutečného opakovaného fakturování — dá se přidat do C5 bez zásahu do smlouvy, nebo (b) skutečné předplatné s opakovanou platbou — to je vědomé rozšíření rozsahu Fáze 1 mimo aktuální smlouvu, ne tichý doplněk.
