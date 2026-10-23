# Testovacie predanie ANASTASIA – 23. 10. 2026

**Stav:** PARTIAL – zadané zmeny sú implementované a testovacie prostredie nasadené; úplná zhoda nie je potvrdená pre nedostupnú produktovú stránku a nepreložené dlhé texty z DB/CMS.  
**Vetva:** `codex/admin-pastel-reference`  
**Commity tejto práce:** `49e36c5`, `76842c0`, `4252e47`

## Katalóg (bod 1)

- Verejný web bol prehľadaný výhradne cez GET na `anastasiaoz.eu`, s odstupom 0,5 s. Bez sitemap sa inventár zostavil z 51 nájdených stránok, navigácie, kategórií, stránkovania a odkazov na produkty. Inventár a importný vstup sú v `backend/data-private/` (gitignored).
- Z 14 nájdených produktových odkazov bolo 13 detailov čitateľných. Detail `Mineralny-ochranny-krem-pre-citlivu-pokozku` vracal stránku `Server Error in '/' Application.`; cenu, popis ani galériu sa preto nedalo potvrdiť. Jeden obrázok produktu KO.001 vracal 404 a bol z importu vynechaný.
- Pred importom: 30 produktov a 7 kategórií v test DB. Po importe/read-back: 30 produktov a 9 kategórií. Všetkých 13 dostupných produktov z verejného webu je v test DB s rovnakou cenou s DPH; popis, dostupnosť, stav a dostupné obrázky boli zosúladené. Verejný web neukazuje presné skladové množstvo, preto množstvá neboli vymýšľané ani prepisované.
- Dve chýbajúce podkategórie pribudli. Štyri nezhodné kategórie z test DB (`Rituálna práca`, `TVOJ ODEV NOVÝ`, `VETERINA` a ich zachovaný stav) ani produkty bez potvrdeného verejného detailu neboli zmazané. V DB zostalo 17 produktov mimo 13 dostupných detailov; medzi nimi je aj produkt z nedostupnej stránky. Zoznam je v súkromnom exporte `backend/data-private/test-catalog-before.json`.
- `import-anastasia-catalog.ts`: dry-run pred apply, apply dokončený, následný apply bez zmien: kolekcie `+0 ~0 =1`, kategórie `+0 ~0 =6`, produkty `+0 ~0 =13`, sklad `+0 ~0 =6`, chyby 0. Obrázky sa načítavajú len z povolenej host domény, preflight validuje celú galériu; ukladanie medií je idempotentné.

## Sprievodca a účet (body 3 a 4)

- Admin sprievodca má požadovaných 11 slovenských krokov v poradí: Prehľad, Objednávky, Produkty, Kategórie, Zákazníci, Poukazy, Konzultácie, Obsah webu, Správy, Nastavenia, Pomoc. Vyká, používa neutrálny rod, zvýrazňuje navigáciu a má Ďalej/Späť/Preskočiť s minimálnou dotykovou výškou 44 px. Pomoc ponúka opätovné spustenie.
- Stav dokončenia sa ukladá do metadata prihláseného Medusa admin používateľa cez `GET/POST /admin/nexus/tour-state`; ostatné metadata sa zachovajú a zmena sa audituje. Nie je zdrojom stavu `localStorage`.
- Profilový obrázok vlastníka je spracovaný do štvorcového WebP 256×256 a zobrazuje sa v hlavičke adminu. Pozvánka na testovacom serveri už existuje a je aktívna; e-mail nebol odoslaný. V adminu ju možno otvoriť v **Nastavenia → Používatelia**, skopírovať pozvánkový odkaz a odoslať ho ručne. Heslo sa nevytvorilo.

## Preklady (bod 5)

- Prekladový audit teraz kontroluje slovníkové pokrytie a viditeľné textové uzly všetkých vygenerovaných stránok. Opravené/rozšírené sú EN/RU klíče pre cookie lištu a nastavenia, vyhľadávanie a názvy 13 dostupných produktov; známe chyby „Online zdravotná konzultácia“, „ZISTIŤ VIAC“ a ruský názov denného stacionára sú pokryté.
- Cookie lišta už nie je označená ako iba slovenský obsah a test kontroluje jej jazyk. Obsah mimo slovníka sa označuje poznámkou o slovenčine.
- Audit nepokrýva úplné preklady dlhých popisov produktov, všetkých CMS textov ani e-mailových šablón; tieto texty vyžadujú samostatnú jazykovú revíziu.

## Build, testy a nasadenie

- `npx tsc --noEmit` v `backend/`: PASS v predchádzajúcom overovacom behu. Záverečné opakovanie po presune údajov pozvánky do premenných prostredia nedobehlo ani po 3 minútach a bolo prerušené; aktualizovaný skript sa následne úspešne vykonal cez `medusa exec`.
- Cielené Jest testy importu katalógu a tour-state: 2 suites, 10/10 PASS.
- `node --test test/i18n.test.mjs test/cookie-consent.test.mjs` v `storefront-prototype/`: 11/11 PASS. Build vytvoril 43 stránok; deploy build 44 stránok.
- `npm test` v storefront prototype spustil NEXUS aj backend: NEXUS 97/97 súborov, 1268/1268 testov PASS; backend 153/155 suites, 1514/1517 testov PASS. Zlyhali dva existujúce ZeptoMail testy (chýbajúce testovacie URL a zastarané očakávanie hostu loga) a kontrola mapy API, ktorá po doplnení tour endpointu narazila na odlišný zoznam subscriber zdrojov v rozpracovanom strome. Tieto nesúvisiace moduly neboli menené.
- Testovací storefront aj admin boli nasadené. Posledné verzie: web `13a7e24f-e2c6-4440-9640-e1420fc5d37e`, admin `241fe5c7-b303-4880-89b4-c42099dc08af`.
- `ops/test-predani/deploy.sh --smoke`: `SMOKE_OK` po poslednom deployi (HTTP 200, noindex, CSP, robots.txt, testovací Stripe config). Produkčná doména, DNS a ostrý backend neboli menené.
- Finálne screenshoty storefrontu EN/RU/SK 390×844 a 1440×900 sú v `/tmp/anastasia-test-content-{sk,en,ru}-{390,1440}.png`; admin 390×844 a 1440×900 v `/tmp/anastasia-test-admin-{390,1440}.png`.

## Zmenené súbory

- `backend/src/scripts/import-anastasia-catalog.ts`, `backend/src/scripts/export-test-catalog-state.ts`, `backend/src/scripts/prepare-lucia-admin-invite.ts`
- `backend/src/api/admin/nexus/tour-state/route.ts` a jeho unit test; `backend/docs/wp/admin-function-map.json`
- `anastasia-admin/app.mjs`, `guide.mjs`, `index.html`, `reference.css`, `styles.css`, `assets/lucia.webp`
- `storefront-prototype/public/i18n.mjs`, `src/cookie-consent.mjs`, `test/i18n.test.mjs`

**Riziko / ďalší krok:** z verejného zdroja získať funkčný detail nedostupného produktu a potvrdiť skladové množstvá; vykonať jazykovú revíziu dlhých DB/CMS/e-mailových textov; opraviť vyššie uvedené regresné testy v ich vlastných moduloch. Zmena API mapy je zahrnutá, ale jej plošná kontrola v tomto rozpracovanom strome zostáva blokovaná zmenou zoznamu subscriber zdrojov.
