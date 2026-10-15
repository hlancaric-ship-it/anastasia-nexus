# Přístup ke košíku při sjednocení větví

Stav: IMPLEMENTED_UNVERIFIED pro skutečné HTTP; cílené unit testy a TypeScript ověřeny lokálně. Plná regrese běží pouze na GitHub Actions. Starý záznam o blokaci fakturace CI již není aktuální.

## Chování

`POST /store/nexus-cart` a `POST /store/nexus-checkout` vyžadují ověřenou zákaznici přes standardní Medusa session/bearer middleware. Bez přihlášení vrací 401. Cizí i nepřiřazený košík vrací 403 CART_ACCESS_DENIED. Checkout ověří vlastníka ještě před čtením souhlasů a přeceněním. Interní workflow může stále provést přecenění bez zákaznického HTTP kontextu.

Zachována oprava přenosu serializovaných chyb SafeOrder a redigované provozní události. I chybějící košík má dohledatelnou událost checkout.failed s korelačním ID. Žádné ceny ani rezervace poukazu se na klienta nepřesouvají.

## Testovací zákazníci

Syntetické HTTP scénáře používají skutečnou zákaznici, lokálně podepsaný JWT ověřovaný skutečným middlewarem a nativní přiřazení košíku. Anonymní negativní sondy zůstávají anonymní. Zvlášť se kontroluje 401, 403 pro hosta/cizí zákaznici, vlastní přecenění a neměnnost cizího košíku i počtu objednávek. K8 má nadále vlastní produkt bez rezervace.

Samostatný lokální smoke skript nyní potřebuje také MEDUSA_TEST_CUSTOMER_TOKEN a košík přiřazuje. Token se nevypisuje. Tento skript nebyl lokálně spuštěn; úplné pokrytí zajišťuje izolovaný CI runner.

## Ověření

- Cílené Jest testy: ownership.unit.spec.ts, nexus-contract.unit.spec.ts, route-errors.unit.spec.ts.
- `cd backend && ./node_modules/.bin/tsc --noEmit`.
- Plné backend/NEXUS/workerd a HTTP/PostgreSQL běhy: workflow wave1-p0.yml, výsledek se doplní po dokončení.

## Zbývající rizika

Přihlášení není rate limit pro hádání kupónů. Nativní veřejné Medusa cesty mají vlastní pravidla; tato změna jim neslibuje plošnou kontrolu vlastnictví. Storefront integrace musí před voláním těchto dvou cest zajistit přihlášení a přiřazení košíku. Úspěch této regrese není důkazem úplné autonomní orchestrace, účetnictví ani dopravních konektorů.
