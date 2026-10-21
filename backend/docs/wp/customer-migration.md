# C2: Migrace zákazník, objednávek a starých přístupů

## Stav a rozsah

IMPLEMENTED / VERIFIED syntetickými unit testy a TypeScriptem. Skutečný import přes Medusa CLI do PostgreSQL nebyl proveden. Akceptace reálné migrace patří do K4; tento balík neposílá e-maily a neaktivuje přihlášení.

Větev `codex/customer-migration` vznikla z `codex/catalog-import` (`7d55f7f`), následně byla sloučena `wave1-base` s entitlement modulem (`e0cdb36`). Změny C2 jsou pouze skript, jeho unit testy a tento dokument. Bez nových závislostí; využívá existující Medusa 2.19.0, Zod a Node crypto/fs. Entitlement modul zůstává beze změn.

Implementace: `src/scripts/migrate-legacy-customers-orders.ts`. Pokrývá A-15 a přenos účtů/historie/přístupů ze smlouvy čl. 2 a přílohy č. 1. Autentizace a skutečné nastavení hesla jsou návaznost K6.

## Ověřený vstup a příprava JSON

C1 v této revizi vytváří **jen katalog** (`catalog.json`), nikoli zákazníkov export. Adresář `data-private/legacy/` nebyl při převzetí ve worktree přítomen. C2 proto používá exportované funkce `decodeDump` a `parseInserts` z C1 a přidává vlastní explicitní export `--prepare-sql`. Parser C1 není upraven.

Zdrojové mapování bylo ověřeno proti C# ve `~/Downloads/anozeu/dufeksoft.ecommerce.web/dufeksoft.ecommerce-lib/`:

| Zdroj | Přenos |
|---|---|
| `Repositories/EcCustomerRepository.cs`, `ecCustomer` | E-mail, jméno, telefon, fakturační a případná doručovací adresa; `ownerId` kontroluje soulad s členem |
| `Repositories/EcMemberRepository.cs`, `cmsMember` | Alias `member-<nodeId>` a e-mail; žádná hesla ani role |
| `Repositories/CountryRepository.cs`, `ecCountry` | Kód země a překlad starého názvu země na kód |
| `Repositories/QuoteRepository.cs`, `ecQuote` | Jen řádky s `dateFinished`; ostatní jsou rozpracované košíky a report uvádí jejich počet |
| `Repositories/User2QuoteRepository.cs`, `ecUser2Quote` | Kontaktní e-mail a historické adresy objednávky |
| `Repositories/Product2QuoteRepository.cs`, `ecProduct2Quote` | Množství, jednotková cena s DPH, sazba, název, produkt; také doprava, platba a záporné slevové řádky |
| `Repositories/User2ProductRepository.cs`, `ecUser2Product` | Explicitní starý přístup podle `productKey` a `userLoginName` |
| `Models/Ecommerce/User2ProductModel.cs` | Potvrzuje, že `userLoginName` pochází z e-mailu objednávky a tabulka přístupů neobsahuje ID objednávky |

Export používá pouze vyjmenovaná pole. Nepřenáší hash hesla, cookies, poznámky zákazník/objednávek, zdravotní údaje ani administrátorské role. Celé původní jméno zachovává v `first_name`; neodhaduje rozdělení jmen. Změnu e-mailu mezi členem a zákazníkov odmítne. Země se řeší přes číselník; neznámá země je chyba. Chybějící kontakt objednávky, osiřelé řádky, duplicitní ID, prázdný export a nesouhlas částek zastaví přípravu.

### Spuštění přípravy bez Medusy

Příkazy se spouštějí z `backend/`. Používej pouze syntetický dump a lokální soubory podle AGENTS.md. Příprava neotevírá DB ani nenačítá konfiguraci Medusy:

```sh
npx ts-node src/scripts/migrate-legacy-customers-orders.ts \
  --prepare-sql=data-private/legacy/synthetic.sql \
  --catalog=data-private/legacy/catalog.json \
  --file=data-private/legacy/customers-orders.json
```

Explicitní příprava zapisuje nový soukromý JSON, existující soubor odmítne přepsat. Při opakovaném exportu použij nové jméno přes `--file`. Importovaný JSON a katalog musejí být pod `backend/data-private/`; symlinky nejsou povolené. Soubory jsou vytvářeny s právy `0600`, nové adresáře `0700`; celý adresář je již v `.gitignore`. Zdrojový SQL dump ani výsledný JSON se nikdy nepřidávají do Gitu.

### Formát `customers-orders.json`, verze 1

Všechny objekty mají uzavřené schéma: neznámá pole (včetně hesel) jsou odmítnuta. ID obsahují jen písmena, číslice, `_` a `-`. E-mail se normalizuje trimem a převodem na malá písmena. Částky a množství jsou **desetinné řetězce** s nejvýše čtyřmi desetinnými místy, měna pouze `eur` podle katalogu C1.

| Pole | Obsah |
|---|---|
| `version` | `1` |
| `customers[]` | `legacy_id`, `email`, `first_name`, `last_name`, `phone`, `addresses[]` |
| `addresses[]` | `legacy_id`, `first_name`, `last_name`, `company`, `address_1`, `address_2`, `city`, `postal_code`, `country_code`, `phone` |
| `orders[]` | `legacy_id`, `customer_legacy_id`, `email`, `placed_at`, `number`, `status`, `payment_status`, `currency_code`, `total`, `items[]`, `billing_address`, `shipping_address` |
| `orders[].items[]` | `legacy_id`, `product_legacy_id` nebo `null`, `title`, `quantity`, `unit_price`, `vat_rate` |
| Adresy objednávky | Stejný objekt jako zákazníková adresa, nebo `null` |
| `accesses[]` | `legacy_id`, `customer_legacy_id`, `product_legacy_id`, `legacy_order_id` nebo `null`, `expires_at` (ISO datum s časovým pásmem nebo `null`) |
| `excluded_unfinished_quotes` | Počet rozpracovaných košíků vynechaných při exportu |

Původní SQL datum bez časového pásma zůstává v `placed_at` beze změny. Medusa `created_at` označuje okamžik importu; původní čas je v metadatech objednávky. Stav a platební stav zdroje jsou historický text, nejsou důkazem nově provedené platby.

## Dry-run a zápis

Medusa musí být spuštěna s konfigurací lokálního PostgreSQL `anastasia_dev_wave1` a importovaným katalogem C1. `medusa exec` inicializuje moduly ještě před zavoláním skriptu, proto musí být lokální konfigurace nastavena již před spuštěním CLI. C2 navíc kontroluje `projectConfig.databaseUrl`: pouze localhost/127.0.0.1/::1, dané jméno DB, žádné URL query přesměrování ani produkční režim.

```sh
# Výchozí režim: načítání a kontrola, bez DB a souborových zápisů
npx medusa exec ./src/scripts/migrate-legacy-customers-orders.ts

# Jiný privátní vstup
npx medusa exec ./src/scripts/migrate-legacy-customers-orders.ts -- \
  --file=data-private/legacy/customers-orders.json

# Explicitní zápis; pouze schválená lokální DB a syntetická data
npx medusa exec ./src/scripts/migrate-legacy-customers-orders.ts -- --apply
```

Neznámé nebo opakované argumenty jsou chyba. Samotné `apply` bez pomlček neaktivuje zápis. Přípravu SQL nelze kombinovat s `--apply`.

Dry-run čte všechny stránky cílových dat a provede stejné předběžné kontroly jako zápis. Vypíše `source`, `target_before` a `planned`. `target_after` je `null`, `reconciled` je `false`: plán není důkaz provedené migrace. Návrhy e-mailů se při dry-run vytvoří pouze v paměti a zahodí, jejich obsah ani tokeny se nelogují.

### Zákazník a adresy

- Shodný normalizovaný e-mail sjednotí aliasy původních ID na jednu Medusa zákazníci. Alias `customer-<pk>` má přednost při výběru profilu před samotným členem; adresy všech aliasů se zachovají.
- Existující zákazník se hledá podle e-mailu nebo uloženého původního ID. Více kandidátů či změna e-mailu u stejného ID je chyba; nevytváří se automatické rizikové propojení účtů.
- Metadata `legacy_customer_migration.legacy_ids` tvoří trvalou mapu. Při připojení existující zákazník se zachovají její profil, `has_account` a ostatní metadata.
- Nová zákazník má `has_account: false`, dokud autentizaci nepropojí K6. Nezakládá se auth identity s převzatým ani náhodným heslem.
- Adresy používají původní ID a otisk obsahu v metadatech. Opakovaný import je nepřepisuje. Konflikt ID, vlastníka nebo obsahu je chyba. Nenastavují se nové výchozí adresy existujícího účtu.

### Historické objednávky a částky

Objednávky se vytvářejí přímo přes `order.createOrders`, ve stavu `archived`, s `no_notification: true`. Běžný checkout, platby, skladové rezervace a workflow `order.placed` se nespouštějí. Modul může emitovat standardní událost `order.created`; před použitím po integraci dalších subscriberů musí K4 zkontrolovat jejich chování.

Původní číslo, datum, stav, platební stav, částka a otisk vstupu jsou v `metadata.legacy_customer_migration`. Položky zachovávají názvy, množství a ceny s DPH včetně historických poplatků a záporných slev. Nejsou znovu naceněny NEXUSem. Sazba DPH je historický údaj v metadatech; Medusa tax lines se neodhadují. Tyto archivy nejsou nově vystavené daňové doklady ani nové platební transakce.

Produkt se připojuje přes C1 `product.metadata.legacy_id`. Chybějící produkt u historické položky ponechá čitelný snapshot bez vazby; udělení přístupu naopak vyžaduje jednoznačně nalezený digitální produkt katalogu C1.

Součet `quantity × unit_price` se počítá pomocí celočíselné aritmetiky a porovnává s `total` na eurocent. Report uvádí součty EUR za všechny importované objednávky včetně historicky zrušených, počet zdrojových zákazníkov řádků i sjednocených zákazník, adres, objednávek, položek a přístupů. Zaokrouhlení se provádí až na součtu objednávky. Převod do nativních Medusa čísel probíhá přes desetinné řetězce.

Po zápisu se zákazník, adresy, objednávky a oprávnění nezávisle znovu načtou. Kontrolují se skutečné částky, měna, vlastníci, počty i obsah položek a adres. Report `target_after` tedy vychází z uložených dat. Při neshodě skript skončí chybou. Cizí data mimo vstupní dávku se do kontrolních součtů nezahrnují.

### Přístupy pouze přes entitlement

Každý zápis používá přesně veřejnou službu:

```ts
container.resolve("entitlement").grant({
  customer_id,
  product_id,
  source: "migration",
  dedupe_key: `migration:${legacyOrderId}:${productId}`,
  order_id,
  expires_at,
  metadata: { legacy_access_id, legacy_order_id },
})
```

Export přiřadí původní objednávku jen tehdy, když existuje právě jedna objednávka stejného e-mailu s daným produktem. Jinak `legacy_order_id` zůstane `null` a klíč používá dokumentovaný náhradní identifikátor `access-<legacyAccessId>`, např. `migration:access-g1:prod_target`. Medusa `order_id` v takovém případě zůstane `null`. Nevytváří se fiktivní objednávka.

Přístup se nikdy neodvozuje jen z platebního stavu objednávky. Před zápisem se kontrolují vlastníci existujících dedupe klíčů a digitální typ produktu. Stejný klíč pro více zdrojových řádků se sjednotí jen při shodném vlastníkovi a expiraci. Dříve zrušené nebo expirované oprávnění služba neoživuje; report je uvádí v `inactive_entitlements_preserved`.

### Příprava „nastav si heslo“

Po úspěšné kontrole zápisu vznikne pro každou sjednocenou zákazníci jeden soukromý koncept v `data-private/legacy/password-drafts/<otisk-customer-id>.json`:

- Slovenský předmět a text s placeholderem `{{SET_PASSWORD_URL}}`.
- Náhodný token z `crypto.randomBytes(32)`, jeho SHA-256, čas vytvoření a expirace za 24 hodin.
- `send: false`, `status: draft_requires_auth_binding`.

Opakovaný běh ponechá stejný koncept a token, ani expirovaný token automaticky neobnovuje. Změnu adresáta odmítne. Tokeny nejsou v zákazníkov metadatech, logu ani Gitu.

Jde o přípravu kampaně, **nikoli platný Medusa reset token**. C2 nepřidává vlastní autentizační endpoint a nemá mailer. K6 musí propojit účet s Medusa auth a při později schváleném odeslání vydat skutečný jednorázový token; připravený token se nesmí sám přijímat jako oprávnění ke změně hesla. Funkčnost přihlášení/odeslání se tímto balíkem netvrdí.

## Idempotence, souběh a obnova

Před mutacemi se kontroluje celá dávka. Zápis drží PostgreSQL transakční advisory lock `(1869898851, 2)` pro tento importér v dané DB, včetně ověření `current_database()`. Druhý proces skončí kódem `CUSTOMER_MIGRATION_MIGRATION_ALREADY_RUNNING`. Lock není lokální soubor ani závislý na in-memory locking provideru.

Modulové zápisy nejsou součástí jedné společné DB transakce; lock pouze serializuje procesy C2. Při chybě mohou zůstat dílčí dokončené záznamy. Po odstranění příčiny spusť stejný neměnný vstup znovu: ID/metadata a entitlement dedupe umožní pokračovat bez duplikátů. Žádný záznam se nemaže a automatický rollback není implementován. Změněný obsah již importované objednávky/adresy vyžaduje samostatné posouzení, nikoli automatické přepsání.

Předpoklad prostředí: vyhrazená lokální ANASTASIA DB, jedna neměnná dávka a žádné souběžné ruční změny importovaných dat. Medusa zde nemá obecný tenant sloupec. Skript není importér do sdílené databáze více obchodů. Lock koordinuje pouze tento skript; K4 musí plánovat migrační okno pro ostatní zapisující procesy.

Chyby skriptu mají pevné kódy `CUSTOMER_MIGRATION_*`. Nevracejí původní SQL výjimky, cesty, e-maily, ID zákazník, obsah validace ani tokeny. Diagnostika zdrojového konfliktu probíhá soukromou kontrolou vstupu; PII se nesmí kopírovat do ticketů či logu. Běžné chyby inicializace CLI/modulů nastávající před spuštěním skriptu nejsou touto hranicí zachytitelné.

## Ověření a předání

Syntetické testy: `src/scripts/__tests__/customer-migration.unit.spec.ts`. Pokrývají parserový most, vynechání hesel a poznámek, vazby a kolize identit, úplný dry-run bez zápisu, grant pouze přes službu, idempotenci, pokračování po selhání, zrušené přístupy, chybějící produkt, kontrolní součty přes instalovaný Medusa total calculator, desetinné množství a slevy, čtení více stran, změnu skutečných cílových dat, oprávnění souborů, stabilitu konceptů a ochranu databáze/locku/chybového logu.

```sh
npx tsc --noEmit
npm run test:unit -- --runTestsByPath src/scripts/__tests__/customer-migration.unit.spec.ts
npm run test:unit
```

Výsledky 9. 10. 2026: `npx tsc --noEmit` exit 0; zaměřená sada C2 **36/36 PASS**; kompletní `npm run test:unit` **70/70 PASS v 8 sadách**. Samostatný smoke test přes `node -r ts-node/register src/scripts/migrate-legacy-customers-orders.ts --prepare-sql=…` ověřil nový export a odmítnutí přepsání: **2/2 PASS**, pouze dočasná syntetická data. `git diff --cached --check` bez nálezů.

Ověření proti skutečnému PostgreSQL, běžící Meduse, finálnímu auth flow a kompletnímu schválenému exportu patří do K4/K6. V tomto balíku nebyla použita žádná produkční služba, produkční DB ani skutečná zákazníková data. Další krok: integrátor převezme větev a provede lokální integrační dry-run/apply/re-run se syntetickými daty, potom akceptaci migrace podle pravidel projektu.
