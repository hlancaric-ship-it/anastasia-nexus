# Soupis pro přípravu administrace ANASTASIA

Stav: soupis připravený; **nový admin NOT_IMPLEMENTED**.

**Zadání Luckyho: celý admin se staví od nuly jako nové vlastní rozhraní.**
Existující Medusa stránky ani `admin-demo` nejsou jeho kódovým nebo vizuálním základem.
Zachováváme ověřený backend, API a obchodní pravidla. Existující UI slouží jen jako funkční reference.
Podmínky samostatné obsluhy a Claudeovy nezapomenutelné body: [samoobsluha a UX](ADMIN-UX-SAMOOBSLUHA.md).
Datum: 15. 10. 2026. Zdrojový základ: `codex/security-fixes@2ebda34`.
Bezpečnostní kód `6433343` prošel [plnou CI regresí](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38745406536):
533 backend unit, 1183 NEXUS, 46 workerd a 131 HTTP scénářů; oba TypeScript checky PASS.
[Důkaz](evidence/security-fixes-ci.json), [rozsah a omezení oprav](security-fixes.md).
Tento důkaz nepředstavuje akceptaci admin obrazovek, produkčního doručování ani skutečných plateb.
Bezpečnostní větev v okamžiku přípravy není sloučená ani nasazená; admin musí převzít její opravy.

Strojový [inventář](admin-implementation-inventory.json) mapuje **31 vlastních admin route souborů,
41 kombinací metoda/cesta a všech 5 vlastních stránek**. Je to kontrola zdrojového pokrytí.
Nativní Medusa rozhraní nejsou v těchto počtech. Podrobnosti kontraktů jsou v [API katalogu](../API-KATALOG.md).
Starší [mapa schopností](backend-admin-capabilities.md) a [audit samoobsluhy](../../../docs/ADMIN-SELFSERVICE-AUDIT.md)
jsou historické podklady; zejména starý odklad rezervací a původní auth cache nepopisují aktuální stav.
Rezervace jsou v rozsahu. QR generátor patří již do první fáze. Ambasadoři a provize do druhé.

## 1. Navigace a pokrytí

Názvy v menu mají být slovensky. Níže je cílové uspořádání, nikoli tvrzení o již zavedených URL.
Všechny cílové obrazovky vzniknou nově, včetně katalogu, objednávek a zákaznic nad nativními Medusa API.
Stav nového UI je všude `NOT_IMPLEMENTED`; existující podklad označuje pouze dostupné API/funkční reference.
Nové UI používá stejné backendové entity a workflows, nevytváří paralelní databázi nebo cenotvorbu.

| Agenda / položka | Existující backend / reference | Stav nového UI | Postavit |
|---|---|---|---|
| Objednávky | Medusa objednávky/platby/fulfillment | NOT_IMPLEMENTED | Nový seznam/detail a související rezervace, nároky, poukazy a odstoupení |
| Katalóg | Medusa produkty/varianty/kategorie/ceny/sklad | NOT_IMPLEMENTED | Nové formuláře; digitální obsah bez ruční editace JSON |
| Zákazníčky | Medusa zákazníci/skupiny + notes API | NOT_IMPLEMENTED | Nový přehled/detail, historie a poznámky |
| Rezervácie → Prehľad | Booking list/cancel API | NOT_IMPLEMENTED | Nový přehled a potvrzené storno |
| Rezervácie → Typy konzultácií | Booking types API; stará stránka jen reference | NOT_IMPLEMENTED | Nový editor názvu, délky, pauzy, ceny a formy |
| Rezervácie → Voľné termíny | Availability API; stará stránka jen reference | NOT_IMPLEMENTED | Nový týdenní kalendář s obsazeností a kopírováním |
| Digitálne prístupy | Entitlements API | NOT_IMPLEMENTED | Nový přehled a řízené grant/revoke |
| Správy | Chat API; stará stránka jen reference | NOT_IMPLEMENTED | Nové konverzace v kontextu zákaznice/objednávky |
| Darčekové poukazy | Vouchers API; stará stránka jen reference | NOT_IMPLEMENTED | Nové nastavení, seznam, detail/pohyby, void a vratky |
| QR kupóny | Coupon-links API; stará stránka jen reference | NOT_IMPLEMENTED | Nový generátor SVG/PNG + ověřený tok aktivace |
| Ochrana údajov | Erasure API | NOT_IMPLEMENTED | Nová evidence a potvrzení výmazu |
| Odstúpenia od zmluvy | Legal withdrawals API | NOT_IMPLEMENTED | Nová evidence a povolené změny stavu |
| Komunikácia → E-mailové šablóny | Templates API | NOT_IMPLEMENTED | Nový editor textů, náhled, reset a povolené vypnutí |
| Komunikácia → Newsletter | Newsletter consents API | NOT_IMPLEMENTED | Nová evidence/export; rozesílání vyžaduje doplnění backendu |
| Prevádzka → Udalosti / Audit zmien | Ops read API | NOT_IMPLEMENTED | Nové filtry, korelace a bezpečné detaily |
| Nastavenia obchodu | Medusa API + chybějící nastavovací kontrakty | NOT_IMPLEMENTED | Nové srozumitelné nastavení; žádné běžné změny přes deploy |

Pět existujících stránek je ve [zdrojovém adresáři](../../src/admin/routes).
`GET /admin/custom` je starter endpoint; **není položkou menu ani hotovým dashboardem**.
Menu se nesmí zobrazovat jako aktivní odkaz, dokud nemá existující cílovou obrazovku.
Přehled NEXUS domén neznamená, že pro ně ANASTASIA má objednané či zapojené admin API.

## 2. Co musí umět jednotlivé agendy

### Objednávky, zákazníčky a katalog

Postavit nové seznamy a detaily nad nativními Medusa API. Ceny, slevy, DPH, dopravu, dostupný kredit i finální stav platby
zobrazovat ze serveru; žádná nová klientská cenotvorba nebo přepínač „zaplaceno“.
Digitální přístup automaticky vzniká po skutečném capture, nikoli po návratu z platební stránky.
Nativní refund ani storno neobcházet přímým přepisem metadata.

Na nový detail objednávky navázat související nároky, rezervace a poukazové pohyby podle jejich ID.
Kde API neumí filtr objednávky, nepředstírat serverový filtr: bookings podporují jen
`customer_id`, `product_id`, `status`; notes pouze konkrétní zákaznici.
Nativní refund flow prověřit s payment providerem zvlášť; evidence tohoto soupisu nejsou reálné Stripe E2E.

Interní poznámky: `GET/POST /admin/customers/:id/notes`, `POST/DELETE .../notes/:note_id`.
Čistý neprázdný text do 5000 znaků, vazba na správnou zákaznici, editace a smazání s potvrzením.
Obsah nepatří do ops logů ani běžného exportu zákaznice. Audit obsahuje identitu operace, ne text poznámky.
Příloha, zdravotní karta, CRM segmentátor ani libovolný HTML editor tímto API nevznikají.

### Rezervácie

`GET /admin/bookings`: tabulka serverových stavů, začátek/konec, zákaznice, produkt a dostupné vazby.
Filtry zákaznice/produkt/stav, stránkování `limit/offset` (nejvýše 200).
`POST /admin/bookings/:id/cancel { reason? }`: potvrdit konkrétní termín a obnovit data ze serveru.
Zrušení potvrzené rezervace vyvolává notifikaci; UI nesmí slibovat doručený e-mail bez důkazu poskytovatele.
Ruční přebookování a ruční vytvoření rezervace nemají vlastní admin write API; zatím nenabízet.

Typy: `GET/POST /admin/booking/types`, `GET/POST /admin/booking/types/:id`.
Název, popis, délka, pauza, forma online/osobně, cena EUR a aktivní/archivní stav.
Server validuje délku 15–480 minut po pěti, pauzu 0–240; produkt a cena se mění serverově.
Archivaci nezaměňovat se smazáním historie.

Dostupnost: `GET/POST /admin/booking/availability`, týdenní pohled, zóna Europe/Bratislava,
kopie minulého týdne. Kolize jsou globální, nikoli zvlášť pro každý typ konzultace.
409 při zásahu do obsazeného úseku musí zachovat editaci a nabídnout načtení aktuálního stavu,
ne automatický opakovaný přepis. Nelze nastavovat povinnou rezervaci běžným produktům omylem přes sdílené metadata.

### Digitálne prístupy a média

`GET /admin/entitlements` má filtry `customer_id`, `product_id`, `order_id`, `status`, `limit/offset`.
Ukázat původ nároku, stav, udělení, expiraci a dostupnou vazbu na objednávku.
`POST /admin/entitlements` přijímá `customer_id`, `product_id`, volitelně `variant_id`, `expires_at`, `reason`.
`POST /admin/entitlements/:id/revoke` přijímá volitelný důvod.
UI může důvod vyžadovat pro obsluhu, ale **backend jej nyní povinně nevynucuje**.
Ruční grant vytváří nový záznam a nemá klientský idempotency key: po timeoutu nejprve znovu načíst přístupy,
ne automaticky opakovat POST. Další backend validaci varianty a opakovaných grantů zahrnout do review této agendy.

Média jsou chráněna entitlementem a krátkodobým podepsaným odkazem. Vydaný odkaz platí do expirace
(výchozí 600 s, maximum 900 s); odvolání nároku není okamžité zneplatnění již vydaného odkazu.
HLS grant platí pouze pro explicitně odkazované potomky playlistu; neslibovat přístup k celé složce.
Vlastní validovaný upload/přiřazení chráněného R2 objektu produktu **nemá hotové admin API/UI**.
Nativní veřejné S3 soubory nejsou náhradou privátního placeného média.
Před editorem doplnit serverovou validaci vazby a oddělení veřejných a soukromých objektů.

### Správy

Nové UI musí načítat seznam a detail, označovat přečtení, odpovídat, zavírat/otevírat,
ztlumovat a blokovat/odblokovávat zákaznici. Staré UI je pouze reference těchto funkcí. Přesné cesty jsou ve strojovém inventáři.
Zachovat serverový nárok, stav a blokování; nepřesouvat jejich rozhodování do prohlížeče.
Čistý text: zákaznice nejvýše 2000 znaků, admin 5000, předmět 120; počítadlo a bezpečné vykreslení.
Zákaznické limity 3 zprávy po sobě / 5 denně nejsou konfigurační formulář v adminu.
403/409/429 zobrazit srozumitelně slovensky; 429 respektuje případný Retry-After.
Odpověď správce sama neotevírá uzavřenou konverzaci. Obsah zpráv patří do této chráněné agendy, ne do ops.

### Darčekové poukazy

Nové UI zahrne seznam/filtry/stránkování, nastavení a zneplatnění s důvodem.
Detail použije `GET /admin/vouchers/:id/transactions`: typ, částka, zůstatek po pohybu,
čas, objednávka/košík, reference, aktér a případné obrácení transakce. Read-only finanční historie.
API historie záměrně nevrací kódy, příjemce ani poznámky; nevynucovat jejich zobrazení z jiného logu.

Vratka `POST /admin/vouchers/refund { order_id, amount, idempotency_key, note? }` vrací poukazovou
část objednávky zpět na poukaz; není to refund platební kartou. Částka vstupu je v EUR,
server kontroluje kladnou hodnotu a dosud nevrácený limit. UI nesmí samo počítat dostupnou vratku.
Pro jednu potvrzenou operaci zachovat tentýž klíč i při opakování po síťové chybě; respektovat `replayed`.
Zobrazit autoritativní částky a zůstatky odpovědi a znovu načíst historii.

`POST /admin/vouchers/:id/void` vyžaduje potvrzení konkrétního poukazu a důvod.
Nastavení `GET/POST /admin/vouchers/settings`: prodej zapnutý, hodnoty, platnost, rozsah/kategorie,
částečné čerpání a způsob doručení. Hodnoty **načíst z API**, nikoli pevné 50/100/200 v UI.
Vydaný poukaz nese snapshot pravidel; nastavení jej zpětně nepřepisuje.
Při 502 po sync produktu mohlo být nastavení již uložené: znovu GET a vysvětlit částečný výsledek,
ne hlásit automaticky rollback ani slepě opakovat změnu.

### QR kupóny

Backend pro generování QR **již existuje**, nové UI postavíme znovu: produktový kód, kupón, počet, SVG/PNG a stažení,
bez externí QR služby. `POST /admin/coupon-links` ověřuje vstup, produkt a kupón.
Aktuálně vrací `activation_status: PENDING_PRICING_INTEGRATION`; obrazovka také varuje před tiskem.
Generování obrázku proto není důkaz celého toku scan → košík → sleva → objednávka.

Po bezpečnostní opravě lze v NEXUS košíku použít běžné nepodmíněné procentní kupóny.
Zákaznické, produktové, množstevní a další nepodporované podmínky se odmítají i oprávněné zákaznici.
Generátor nemá deklarovanou shodnou validaci všech omezení checkoutu: před odstraněním varování sjednotit
serverový capability/preflight kontrakt a ověřit skutečný průchod od QR až po serverovou cenu.
422 znamená nedostupný produkt/kupón; 503 nedostupný generátor/konfiguraci.
Ambasadoři, osobní vlastníci kódů, atribuce objednávek a provize jsou druhá fáze, ne hotová správa kupónů.

### Ochrana údajov a odstoupení

Výmazy: `GET /admin/customer-erasures`, `POST /admin/customer-erasures/:id/execute`.
Vypsat pouze serverový DTO, stav a identifikátor zákaznice; nenačítat skrytě citlivé identity do logu.
Execute potřebuje `{ confirm: true, customer_id: <stejné ID> }`. Potvrdit identitu a nevratný dopad,
po výsledku zobrazit stav a `replayed`. Nejde o úplné odstranění povinné účetní evidence.
Bezpečnostní základ zahrnuje invalidaci nových PG přihlašovacích tokenů; nepoužít starou cache-only implementaci.
Seznam nyní nemá serverové vyhledávání podle libovolného zákazníka/stavu, pouze stránkování.

Odstoupení: `GET /admin/withdrawals`, `POST /admin/withdrawals/:id { status }`.
Serverová politika povoluje received → accepted nebo rejected; pouze accepted → refunded.
Stav `refunded` **sám neprovede finanční refund**; nepřipojit jej jako automatické tlačítko „vrátit peníze“.
UI musí odlišit evidenci rozhodnutí od skutečně provedené refundace a ukázat chybu neplatného přechodu.
Filtry nad všemi daty nelze předstírat filtrováním jedné stránky; chybějící filtry doplnit serverově až dle potřeby.

### E-mailové šablóny a newsletter

Templates list/detail/update/reset/preview mají API, vlastní stránka chybí.
UI vychází ze serverového seznamu slotů, povolených proměnných a příznaku povinné šablony.
Edituje texty, nikoli libovolný HTML layout. `texts` nahrazuje všechny uložené přepisy:
před uložením načíst a odeslat zamýšlený celý soubor, nenechat zmizet nezměněné sloty.
Náhled pracuje se syntetickými daty a nic neodesílá; vykreslit izolovaně, nikoli vložením do shellu administrace.
Povinné šablóny nejdou vypnout. Reset přes DELETE vrací výchozí texty a zapíná e-mail – potvrdit obě změny.
Server vrací validační chyby slotů; neskrýt je obecnou hláškou.

`GET /admin/newsletter` poskytuje evidenci souhlasů, jejich textovou verzi, zdroj, časy a stav.
`format=csv` exportuje aktuální stránku dle `limit/offset`, **nikoli garantovaně celou databázi**.
UI označí rozsah exportu; požadavek na kompletní export vyžaduje bezpečné stránkování nebo nový serverový export.
Není implementována správa kampaní, rozesílání ani statistiky otevření. Seznam obsahuje osobní údaje,
nepatří do veřejného downloadu ani trvalého browserového úložiště.

## 3. Logy a dohledatelnost

| Pohled | Existující zdroj | Ovládání a hranice |
|---|---|---|
| Prevádzkové udalosti | `GET /admin/ops/events` → `ops_event` | `request_id`, `order_id`, `cart_id`, `customer_id`, `entity_id`, `domain`, `level`, `event`, `from`, `to`, `limit`, `offset`; serverová validace |
| Audit zmien | `GET /admin/ops/audit` → `ops_audit_entry` | `entity_type`, `entity_id`, `actor_id`, `action`, `limit`, `offset`; actor/akce/čas/redigované změny |
| Pohyby poukazu | Transactions API → finanční deník | Samostatný detail poukazu, autoritativní peněžní pohyby; nesloučit s ops |
| Stav obchodní entity | Booking, entitlement, chat, order | Stav není úplná neměnná historie všech přechodů |
| Medusa / Worker stdout | Provozní infrastruktura | Není univerzální read API pro všechny výpisy v adminu |

Ops read API: user auth, `no-store`, nejvýše 100 řádků/stránku; explicitní časové okno událostí nejvýše 93 dní.
UI má nabídnout tabulku, filtr, detail bezpečných polí a korelaci podle skutečně vráceného request ID.
Propojit entity jen existujícím cílem; kde detail není, zobrazit kopírovatelné ID.
Prázdný seznam znamená „žádný záznam pro tento filtr“, nikoli automaticky „provoz je zdravý“.

`recordEvent` ukládá do PG best-effort. Přímý logger a `logEvent` mohou zůstat pouze ve stdout.
Selhání auditu nevrací automaticky již úspěšnou obchodní změnu; audit není všude atomický s transakcí.
Worker warn/error z Medusa cest má podepsaný ingest, info/debug a další zdroje nejsou celé centralizované.
Celý provozní Worker→PG řetěz nemá tímto soupisem doloženou úplnou runtime coverage.
Nezobrazovat auth tokeny, podepsané media URL, secrets, texty zpráv, poznámky ani neomezený raw payload.

**Backendové mezery pro požadavek „veškeré logy“:** jednotná historie běhů jobů, trvalé delivery/retry přehledy,
bezpečný retry API, stav záloh/obnovy a dostupnosti služeb, úplné napojení stdout zdrojů a role pro jejich čtení.
Dokud nemají podklad, nenabízet funkční tlačítka retry/restore ani zelené monitorovací karty.
Podrobná mapa existujících callerů zůstává ve [starším zdrojovém inventáři](backend-admin-inventory.json);
nové auth-security změny číst ze [security dodatku](security-fixes.md), ne předpokládat ve starém snapshotu.

## 4. Co se nastavuje kde

| Nastavení | Autorita dnes | Cílové ovládání / omezení |
|---|---|---|
| Produkty, varianty, základní ceny, sklad, daně, regiony, doprava | Nativní Medusa DB/API | Nové vlastní ovládání nad Medusa API; server je autoritou výpočtu |
| Typy konzultací a dostupnost | Vlastní booking API/PG + produkt | Nové stránky; nerozpojovat cenovou a booking část |
| Pravidla nových poukazů | `gift_voucher_settings` + settings API | Nové UI nad settings API; nenahrazovat klientskými defaulty |
| Texty e-mailů a povolené vypnutí | Email template overrides v PG/API | Nový editor nad sloty; secrets providera zůstanou mimo |
| Loyalty skupina zákaznice | Medusa group metadata `nexus_tier` | Přiřazování skupiny serverově; názvy/sazby potvrdit před editorem politik |
| NEXUS cenová politika | Worker `MEDUSA_PRICING_POLICY_JSON` | Dnes deployment; pro samoobsluhu doplnit validované tenantové settings API a nový editor |
| SafeOrder pravidla a limity | Aktuální serverový kód/politika | Doplnit bezpečný config kontrakt a nový editor povolených obchodních pravidel; žádný klientský bypass |
| Chat limity/délky | Konstanty v kódu | Dnes konstanty; pro samoobsluhu doplnit bezpečně omezené settings API |
| Retence chatu | `CHAT_RETENTION_DAYS` | Deployment, default 365 dní, 30–3650; neplatná hodnota zastaví mazání |
| Retence ops/auditu | `OPS_EVENT_RETENTION_DAYS` / `OPS_AUDIT_RETENTION_DAYS` | Deployment, default 90/1095 dní, rozsah 7–730 / 365–3650; finanční deník se nemaže tímto jobem |
| Magic-link limity a TTL | Kód + PG čítače | 60 pokusů/klient/15 min, 3 nové odkazy/adresát/15 min, TTL 15 min; není admin write API |
| Média, originy, CORS, DB, tenant credential, payment/mail provider | Deployment konfigurace | Nevypisovat hodnoty secretů; jejich změny nejsou běžné obchodní nastavení |
| Importy, redirect manifest, zálohy a obnova | CLI/runbook, kontrolované artefakty | Žádné hromadné destruktivní admin tlačítko bez samostatného backendu |

Doprava je nativní serverová konfigurace; bootstrap env nemusí přepsat již existující shipping options.
Manuální fulfillment není důkaz napojeného dopravce. Sazby, hranice dopravy a účetní hodnoty musí mít
schválený obchodní podklad; tento dokument je neurčuje.

## 5. Oprávnění, chyby a souběh

Dnes je doložená hranice Medusa `user` versus zákaznická autorita. Jemné role jednotlivých agend
nejsou hotové jen tím, že v menu skryjeme tlačítko. Návrh pro schválení: obsluha obchodu,
podpora, finance, správce osobních údajů a technický provoz. Před zpřístupněním takových rolí je musí
vynucovat backend pro čtení i zápis a musí vzniknout test zamítnutí cizí role.

Každý nový pohled musí mít loading, prázdný stav, chybu, stránkování podle reálného count a ztrátu přihlášení.
401 vede na přihlášení; 403 vysvětlí zákaz; 404 odstraněný/neexistující objekt; 409 vyžaduje kontrolu
aktuálních dat; 429 nepovolí okamžitý automatický retry; 5xx nesmí předstírat úspěch ani rollback.
Validační odpovědi zobrazit u polí slovensky. Peníze pouze formátovat, nikoli přepočítávat pravidla.

Zápisy chránit před dvojklikem; to nenahrazuje serverovou idempotenci. Po nejistém výsledku nejdřív
načíst stav. Idempotency key používat jen tam, kde jej konkrétní API podporuje (voucher refund).
Smazání, revoke, blokování, storno, reset a void musí potvrdit konkrétní cíl a dopad.
Výmaz zákaznice má navíc serverem vynucené potvrzení stejného ID.
Souběžné editace šablon/nastavení nemají plošně version-lock kontrakt; neslibovat ochranu před přepsáním
cizí změny, dokud ji API nezavede.

## 6. Pořadí práce po schválení soupisu

| Balík | Obsah | Podmínka dokončení |
|---|---|---|
| A0 | Schválit vizuální návrh nového adminu a úkoly samoobsluhy | Schválený pracovní přehled a nastavení; všechna běžná nastavení mají vlastníka/API nebo přiznanou mezeru |
| A1 | Nový základ, přihlášení, navigace, katalog/objednávky/zákaznice | Nové obrazovky nad ověřenými API; jednotné formuláře, SK, klávesnice, skutečné chybové stavy |
| A2 | Ops události a audit | Reálné filtry, stránkování, korelace, redakce, 401/403; žádný falešný monitoring |
| A3 | Přístupy, rezervace a poznámky v nových detailech zákaznice/objednávky | Grant/revoke/cancel/notes, potvrzení, timeout bez duplikace, správné vazby zákaznice |
| A4 | Nové poukazy včetně nastavení/pohybů/vratek a QR generátor | Serverové částky, replay refundu, nastavení po 502, QR scan až po cenu; nepodporované kupóny odmítnuty |
| A5 | Šablony, souhlasy, odstoupení a výmazy | Náhled nic neposílá, povinné šablóny, rozsah CSV, status není refund, potvrzení/replay výmazu |
| A6 | Samostatně doplnit chybějící backendové kontrakty | Privátní média, jemné role, konfigurace cen/rizik a provozní přehledy mají testované API před UI |

Každý balík ve vlastním worktree/větvi. Před editací přečíst konkrétní route, policy a testy.
Lokálně jen potřebné cílené kontroly; plné HTTP/PG a regresní běhy pouze GitHub Actions,
ne souběžně s koordinátorovým runnerem. Staré obrazovky ani `admin-demo` nepřebírat jako aplikaci. Browser testy nového adminu doplnit podle skutečného prostředí,
ne označit za hotové podle existence TSX souboru. Nic automaticky neslučovat ani nenasazovat.

**Mimo tento soupis jako hotové menu:** klub/předplatné, ambasadorské provize, obecné NEXUS B2B,
nákupní objednávky/procurement, Omega fakturace, AI automatizace, univerzální CMS. Obchodní akce a kampaně jsou požadavek samoobsluhy; jejich dosud chybějící backend
se nesmí zaměnit za hotový campaign modul nebo tento požadavek vynechat.
Samostatný obsahový editor, kurzy/lekce a SK/EN/RU publikace potřebují ověřený datový model/API;
produktová metadata nejsou důkaz kompletního CMS. Obchodní obsah, oprávnění a provozní přístupy
jsou vstupy pro příslušný budoucí balík, ne důvod blokovat tuto dokumentační přípravu.

## 7. Ověření tohoto soupisu

Provedena strukturální kontrola proti zdrojovému stromu základu `2ebda34`:
31/31 route souborů přiřazeno právě jedné agendě (včetně výslovně vyřazeného starteru),
41/41 exportovaných metod odpovídá cestám, 5/5 vlastních stránek má existující zdroj.
65 místních odkazů v soupisu, UX zadání a navazujících vstupních dokumentech existuje.
JSON odkazuje na skutečný CI důkaz se shodnou revizí bezpečnostního kódu; `git diff --check` PASS.

Změny jsou pouze dokumentace. Nové unit/HTTP/PG běhy nebyly spouštěny;
výše uvedené plné výsledky patří uvedené CI revizi backendu. Admin browser acceptance a implementace
nových pohledů teprve následují. Připravený soupis nemá dokumentační blocker; backendové mezery jsou
výslovně rozepsané u jednotlivých agend a nejsou označené za implementované funkce.
