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
| **Entitlement / RESET 40+ (K3)** | 70 % | Modul funguje, migrace proběhla na DB. Chybí e2e s platbou |
| **Chráněná média (A-07)** | 55 % | Backend + Worker napsané a testované (18 unit testů). Nic neběželo na R2, chybí bucket, vodoznak, nahrání souborů |
| **Zákaznická migrace (C2)** | 85 % | Spuštěno naostro na reálném dumpu: 17 zákaznic, 10 objednávek, 18 entitlementů, `reconciled: true`, idempotentní |
| **Přihlášení / SSO (K6)** | **90 %** | Magic-link ověřen živě na serveru end-to-end, včetně propojení migrované zákaznice a opravy 3 reálných chyb |
| **QR kupóny / redirecty (C3)** | 55 % | Generátor a validace hotové a testované. Aktivace slevy přes NEXUS a edge nasazení 301 chybí |
| **Rezervace konzultací (K9)** | 75 % | Modul + API hotové, dvojitá rezervace ověřená přímo v Postgres. Chybí e2e přes HTTP a notifikace |
| **Inventář webu (C4)** | 100 % | Dokument hotový |
| **Zálohy a obnova (A-16/A-17 lokálně)** | **95 %** | Záloha i obnova ověřené živě (sha256, přesné počty po obnově do čisté DB). Chybí jen produkční hosting/monitoring |
| **Administrace (C5)** | 0 % | Nezačato, čeká na zelenou K5 |
| **i18n SK/EN/RU (C6)** | 0 % | Fáze 2, nezačato |
| **E2E scénáře (C8)** | 0 % | Nezačato |
| **Stripe webhook (K7)** | **55 %** | **Polovina ověřena živě 12. 10. 2026** (skutečný `@medusajs/payment-stripe` + skutečné Stripe SDK, dummy klíč, žádné volání sítě): platný podpis → správná akce/částka; špatný podpis → vyhodí chybu; manipulovaná částka po podpisu → HMAC to sám odhalí; platba bez našeho `session_id` (cizí Stripe integrace na stejném účtu) → bezpečně ignorována, nespadne. **Chybí už jen reálná platba kartou/Apple Pay/Google Pay — to potřebuje Luckyho testovací klíč** |
| **Voucher runtime (K8)** | 20 % | Worker routy existují, souběh a jednorázovost neověřené, produkt nerozhodnutý |
| **Storefront** | 0 % | Záměrně nezačato (pravidlo pořadí) |

**Celkový odhad Fáze 1 (bez storefrontu, bez red teamu): zhruba 65–70 % hotovo** (upřesněno 12. 10. 2026 po opravě reálné chyby v SafeOrder pricing kontraktu a ověření poloviny Stripe webhooku). Jádro (katalog, ceny, přihlášení, migrace, zálohy, SafeOrder) je silné a ověřené. Slabé místo zůstává produkční infrastruktura (monitoring, hosting, R2) a dokončení platby (potřeba Luckyho testovací Stripe klíč).

---

## 3. Co je DOKONČENÉ a OVĚŘENÉ (ne jen napsané)

Vše níže běželo proti reálné Postgres DB `anastasia_dev_wave1`, nebo proti skutečně běžícímu Medusa serveru (`medusa start`), ne jen v unit testech s mockem:

1. **Katalog:** 30 produktů importováno, ceny sedí na 29 ze 30 proti živému webu (1 nenalezen na webu vůbec, viz `PRODUKTY-SOUCASNY-STAV.md`).
2. **Migrace zákaznic:** 17 zákaznic, 12 adres, 10 objednávek, 18 entitlementů, `reconciled: true`, druhý běh beze změny.
3. **Přihlášení (magic-link):** vyžádání → potvrzení → JWT s reálným `actor_id` → propojení migrované zákaznice → `has_account` se přepne na `true`. Testováno na dvou různých migrovaných zákaznicích.
4. **Rezervace:** skutečný SQL insert dvou rezervací na stejný termín — druhý spadne na unikátním indexu; po zrušení jde termín znovu obsadit.
5. **Zálohy:** `pg_dump` vytvoří soubor s ověřeným sha256; obnova do čisté DB vrátí přesné počty řádků.
6. **Build a migrace:** `medusa build` a `db:migrate` prochází po každém sloučení větví.
7. **Celá testová sada backendu:** 18 souborů, 157 testů, zelené. Celá sada NEXUSu: 85 souborů, 1053 testů, zelené.

---

## 4. Co je napsané, ale NEOVĚŘENÉ (kód existuje, běh proti realitě ne)

- Chráněná média (Worker nad R2) — nikdy neběžel proti skutečnému R2 bucketu.
- QR kupóny — validace kódu funguje, ale aktivace slevy v košíku (napojení na NEXUS pricing) chybí.
- Stripe platby — podpis/integrita webhooku ověřena živě se skutečným SDK (viz výše, K7 55 %); samotná platba kartou/Apple Pay/Google Pay čeká na Luckyho testovací klíč.
- SafeOrder Worker route — nález o chybějící autentizaci z `codex/wave1-security`, oprava existuje na té větvi, ale není sloučená.
- Voucher runtime — Worker routy existují, souběh neotestován.

## 5. Co ještě VŮBEC NEZAČALO

Administrace (C5), i18n (C6), e2e scénáře (C8), ambasadorský program, AI asistent, storefront, produkční monitoring a hosting, DRM pro video.

---

## 6. Otevřené incidenty a rozhodnutí (podrobně v `REQUIREMENTS_MATRIX.md`)

- **Vyřešeno 12. 10.:** neschválená GH Action od Codexu (`codex/wave1-security`) odstraněna, falešný poplach u „rozbité Omegy" vyvrácen (9/9 a 1053/1053 testů zelených mimo přehnaně izolovaný sandbox). Bezpečnostní nález (SafeOrder bez auth) čeká na review a sloučení.
- **Vyřešeno 12. 10.:** kolize dvou nezávislých implementací K6 (Claude + Codex). Lepší SQL logika portována, obě nalezené chyby opravené, ověřeno živě.
- Otevřené: DPH sazby s účetní (živý web má i 20 % sazbu z roku 2022), e-mail provider, dobírka/osobní odběr v SafeOrder, produkt Voucher, repo rozpor (`L-Code-Dynamics-Dev/nexus` vs. skutečný `hlancaric-ship-it/anastasia-nexus`).
- Red team: posunut na bránu AŽ po Fázi 2 (upřesněno 12. 10. 2026), čeká na air-gapovaný staging od Opuse 5.5 a nezávislé ověření od Fable (viz matice bod 8). Mimo dosah tohoto backendového plánu a nepodmiňuje veřejné spuštění Fáze 1.

---

## 7. Jasný plán do úplného finále

### Krok 1 — Dokončit kritickou cestu plateb a bezpečnosti (K7, K8, review `wave1-security`)
1. Review a sloučení bezpečnostních oprav z `codex/wave1-security` (SafeOrder autentizace, COD limit, checkout bypass) — **jen diff mimo CI workflow**, s vlastním ověřením na reálné DB stejně jako u K6.
2. K7: Stripe webhook — ověřit podpis, idempotenci, částku. Potřeba testovací Stripe klíč (rozhodnutí Lucky).
3. K8: voucher runtime — ověřit souběh a jednorázovost proti reálné D1/Postgres.
4. Rozhodnout DPH sazby (účetní), e-mail provider (Resend/SMTP), dobírka/osobní odběr.

### Krok 2 — Dokončit média a QR (A-07, C3)
5. Vytvořit R2 bucket, nahrát placená média, ověřit Worker živě (ne jen unit testy).
6. Propojit QR aktivaci slevy s NEXUS pricing (K1).
7. Nasadit 301 mapu na Cloudflare Redirect Rules.

### Krok 3 — K4 finální integrace
8. Spojit všechny ověřené větve do jednoho běhu: katalog + migrace + entitlement + booking + auth + media + QR + voucher na jedné čisté DB od nuly.
9. Spustit celou e2e sadu (C8) proti tomuto integrovanému stavu — 14 scénářů z direktivy kap. 8.
10. Závěrečné bezpečnostní review (K-sec), `docs/SECURITY_REVIEW.md`.

### Krok 4 — K5 traceability, brána pro start storefrontu
11. Dokončit matici smlouva čl. 2 + příloha č. 1 → balík → test → stav se zelenou na všech položkách Fáze 1.
12. Teprve po zelené K5 smí začít storefront (C-storefront, mimo rozsah tohoto backendového plánu).

### Krok 5 — Administrace (C5)
13. Admin UI na správu produktů/cen/kupónů/objednávek/zákaznic/rezervací nad hotovým a ověřeným backendem.

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

- **Workerd neběží na macOS 12.6** — NEXUS Worker testy se musí spouštět ve vitest (funguje), ale ne v reálném `wrangler dev`/CI bez schváleného izolovaného prostředí.
- **Chybí produkční přístupy** (Cloudflare R2, Stripe živé klíče, hosting) — nutné rozhodnutí a součinnost Lucky.
- **Rozhodnutí čekající na Lucky/účetní:** DPH sazby, e-mail provider, dobírka, produkt Voucher, repo název.
