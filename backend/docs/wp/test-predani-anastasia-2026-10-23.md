# Testovacie predanie ANASTASIA – 23. 10. 2026

**Stav:** PARTIAL  
**Větev:** `codex/admin-pastel-reference`

## Overené a nasadené

- Testovací storefront aj admin boli nasadené cez `ops/test-predani/deploy.sh --deploy`. Verzie: storefront `c2566b78-977d-4238-8a2c-e1826aec2064`, admin `bbe45c9a-37f1-4a93-973a-5e7a5ac4d6ef`.
- `ops/test-predani/deploy.sh --smoke`: `SMOKE_OK` (HTTP 200, noindex, CSP, testovací Stripe kľúč).
- Hlavné stránky `/`, `/eshop/`, `/o-lucii/`, `/denny-stacionar-vysna-slana/`, `/kontakt/`, `/vop/`, `/gdpr/`, `/reklamacie/`, `/zdravy-svet/`, `/konzultacie/` a `/reset-40/` vracajú 200.
- Médiá `/media/legacy-75110b14202a.png`, `/media/legacy-4b8bf0b4e9f0.png`, `/media/learning.jpg`, `/media/ambient/07.mp3` a `/media/ambient/08.mp3` vracajú 200. V `public/media` aj `dist/media` je 39 súborov.
- Vytvorené screenshoty úvodnej obrazovky pre SK/EN/RU v rozmeroch 390×844 a 1440×900 sú v `/tmp/anastasia-test-{sk,en,ru}-{390,1440}.png`. Zobrazujú úvod/preloader, preto nepotvrdzujú preklady obsahu po vstupe na web.
- Vytvorené screenshoty katalógovej stránky po vstupe na web v SK/EN/RU pri 390 a 1440 px sú v `/tmp/anastasia-test-content-{sk,en,ru}-{390,1440}.png`. Vizuálne potvrdené: EN/RU preklad nadpisu a úvodu funguje, nepreložený katalógový obsah je označený poznámkou v zvolenom jazyku. Toto nie je úplný audit ďalších stránok ani ich dynamických stavov.

## Testy a buildy

- `cd storefront-prototype && npm test && node build.mjs` – PASS; NEXUS 1268/1268, backend 1513/1513, storefront 43 stránok pred deployom.
- Deploy build storefrontu – PASS; 44 statických stránok, 34 legacy cieľových ciest pokrytých, katalóg načítaný z testovacieho Medusa API.
- `source /Users/lucky/.claude/jobs/8ebf6c40/tmp/build.env && export ANASTASIA_MEDIA_ORIGIN=${ANASTASIA_MEDIA_ORIGIN:-$ANASTASIA_API_ORIGIN} && node build.mjs >/dev/null` v `anastasia-admin` – PASS.

## Katalóg – rozdiely pred/po

Porovnanie 1:1 nebolo dokončené. Ostrý web na povolené GET požiadavky odpovedá, ale `/robots.txt` aj `/sitemap.xml` vracajú 404 a úvodná HTML odpoveď neobsahuje úplný katalóg ani kategórie. Testovací deploy build potvrdzuje načítanie katalógu z testovacieho API, nie však zhodu s ostrým webom. Nebol vykonaný žiadny import ani zápis do testovacej DB, pretože požadovaná záloha testovacej DB pred zápisom nebola vytvorená. Chýbajúci inventár a rozdiely je nutné doplniť až po bezpečnom exporte kategórií/produktov z oboch prostredí.

## Ďalšie požiadavky

- Existujúce `i18n.mjs` už obsahuje opravy „Online zdravotná konzultácia“, „ZISTIŤ VIAC“ a „Дневной стационар Вышна Слана“. V tomto behu sa nevykonal úplný audit prekladov, CMS textov ani názvov produktov/kategórií z DB. Prísny test pokrytia všetkých jazykov nebol doplnený.
- Prehliadka administrácie existuje, ale jej stav sa aktuálne ukladá do `localStorage` (`ana_tour_seen:*`). Serverové uloženie pri používateľovi a požadovaný obsah krokov po jednotlivých záložkách neboli implementované.
- Profil Lucie, jej fotografia ani pozvánka neboli vytvorené. Pozvánka mení testovaciu DB a pred týmto zápisom je potrebná jej záloha. Následné odoslanie e-mailu musí urobiť Lucia/Lucky ručne v sekcii **Nastavenia → Používatelia**: otvoriť alebo vytvoriť pozvánku, skopírovať odkaz a poslať ho Lucii vlastným kanálom. E-mail sa v tejto práci neposielal.
- Produkčná doména ani DNS neboli menené. Hero video, úvod ani preloader neboli upravované. Existujúce necommitnuté zmeny zostali nedotknuté.

## Zostáva

1. Získať zálohu testovacej DB do `~/db-backups/` na testovacom serveri a overiť ju.
2. Inventarizovať verejný katalóg vrátane stránkovania/dynamických endpointov, bezpečne načítať testovací katalóg a pripraviť rozdielový report. Potom spustiť najprv dry-run a až po kontrole apply.
3. Dokončiť audit stránok/CMS a SK/EN/RU vrátane produktov, e-mailov, checkoutu, účtu a knižnice; doplniť test pokrytí.
4. Uložiť stav administrátorského sprievodcu do metadata používateľa a dokončiť jednotlivé kroky.
5. Po zálohe pripraviť účet a neodoslanú pozvánku. Profilovú fotografiu spracovať až spôsobom, ktorý nevyžaduje zobrazenie pôvodného obrázka.
