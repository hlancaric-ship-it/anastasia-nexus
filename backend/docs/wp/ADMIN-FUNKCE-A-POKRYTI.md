# Úplná mapa funkcí pro nový admin ANASTASIA

Stav mapování: **VERIFIED jako zdrojový soupis**. Stav nového adminu: **PARTIAL**; osobní theming je implementovaný, šest agend C5 ještě ne. Celé řešení: **PARTIAL**.

Datum: 16. 10. 2026. Základ `master@891297d15d31ff244d155743da37b7e83355e60b` ověřený přes fetch. Tato mapa doplňuje [původní soupis](ADMIN-SOUPIS.md), neprohlašuje existující prototyp za nové hotové rozhraní. Nový admin se staví od nuly, nad existujícími obchodními vlastníky a API.

## Co je skutečně zmapované

Zahrnuto všech **50 agend** z Luckyho požadavků, Claudeových poznámek a backendu. [Strojový soupis](admin-function-map.json) obsahuje **61 vlastních route souborů / 74 metod**, **259 nativních admin route souborů / 405 metod** instalované Medusy **2.19.0**, Worker router a prefix chráněných médií. Dále 8 jobů, 23 subscriberů, 5 workflow souborů, 20 modelů, 12 modulových vstupů, 68 souborů NEXUS domén, 95 konektorových souborů a odkazy na testové zdroje. Počet souborů není počet hotových obchodních funkcí.

Nativní routy jsou zdrojový povrch instalované verze, nikoli tvrzení, že jsou všechny moduly/feature flagy/role zapnuté v konkrétní instanci. Existence testového souboru není jeho úspěšný běh. Pomocné knihovny/skripty jsou uvedené u agend, nikoli vydávané za samostatné API.

Přečtené zdroje pravdy: [architektura schválená přes PR #8](../../../docs/NEXUS_AUTONOMY_SPEC.md), [smluvní matice](../../../docs/REQUIREMENTS_MATRIX.md), [aktuální ověřené balíky](../../../docs/AUTONOMY_PROGRESS.md), [Claudeovy poznámky](ADMIN-UX-SAMOOBSLUHA.md) a společné předání `/Users/lucky/CODEX-CLAUDE-BACKEND-ADMIN.md`. Smlouva příloha 1, scénář 6 jmenuje produkty, ceny, kategorie, kupóny, objednávky a zákaznice. Původní `/Users/lucky/nexus@bbb2a7d` a jeho architektura/migrační plán byly porovnány jako historická reference; jeho rozpracované změny zůstaly nedotčené.

Poslední doložená plná regrese patří [konkrétnímu dřívějšímu kódu a CI](../../../docs/evidence/order-email-recovery-20261016.json): 672 backend, 1230 NEXUS, 139 skutečný workerd/D1 a 151 HTTP/PG scénářů. Tento průchod nepřisuzuje tyto testy novému UI ani nenahrává produkční konfiguraci. Stripe E2E a PR #26 jsou hlášení Clauda v předání, nikoli vlastní nově spuštěný test této mapy.

## Pořadí práce a úplnost rozsahu

**C5** = první implementační balík dle Clauda: šest agend scénáře 6 a přehled s pravdivými odkazy. **NEXT** = evidovaný požadavek Luckyho nebo návaznost systému; neznamená odložit či vynechat, ani automatický závazek dodat vše do 23. 10. **PHASE2** a **OUTSIDE_CONTRACT** vycházejí z výslovného členění smlouvy. Mapování nic potichu nepřesouvá mezi fázemi; chybějící funkce zůstává pojmenovaným úkolem.

Každý kódový balík vlastní PR do master s testem; sloučení dělá Jose. Žádný self-merge, storefront ani deploy. Plné sady pouze CI; lokálně jen související cílené kontroly. Ceny/rizika/platby se rozhodují na serveru. Cílem je deterministické automatické zpracování a obsluha výjimek, nikoli ruční přepisování stavu každé objednávky nebo všemocný AI agent.

## Menu a záložky

| Hlavní položka | Záložky / detaily |
|---|---|
| Prehľad | Úlohy, dnešné termíny, upozornenia; každá karta má přesný cíl a filtr |
| Objednávky | Nové, na vybavenie, zásielky, osobný odber, storná a vratky, reklamácie; detail má platbu a související doklady |
| Produkty | Produkty a varianty, kategórie a značky, ceny, štítky, sklad |
| Zákazníčky | Profily, objednávky, prístupy, rezervácie, poznámky, pomoc s prihlásením |
| Konzultácie | Kalendár, voľné termíny, typy, rezervácie |
| Správy | Otvorené, zatvorené, neprečítané; vazba na zákaznici/objednávku |
| Poukazy a zľavy | Kupóny, darčekové poukazy, QR, staré kódy, vernostné úrovne |
| Obsah a weby | Stránky, programy, médiá, menu, vzhľad, preklady; web jako zvolený kontext |
| Kampane a e-maily | Akcie, newsletter, texty e-mailov, tri vzhľady, doručovanie |
| Sklad a nákup | Zásoby, rezervácie, príjem, dodávatelia, feedy, nákupca |
| Doklady | Faktúry, dobropisy, účtovný systém, stav predania |
| Prevádzka | Automatické spracovanie, udalosti, história zmien, kontroly, zálohy |
| Nastavenia | Obchod, platby, doprava/odber, pripojenia, oprávnenia, súhlasy |
| Môj účet | Heslo/prihlásenie, vlastný vzhľad adminu, odhlásenie |

Toto je cílová informační architektura, nikoli hotové menu. V první C5 verzi se zobrazí jen existující obrazovky a jejich skutečné akce. Neimplementované připojení lze uvést v přehledu přípravy s pravdivým stavem, nikoli jako nefunkční odkaz nebo falešné tlačítko Uložiť.

## Matice funkcí, podkladu a mezery

Nové vlastní UI je `NOT_IMPLEMENTED`, kromě osobního vzhledu adminu (`IMPLEMENTED_UNVERIFIED` před novým CI důkazem). Backendový status celých agend je `PARTIAL`, u chybějícího kontraktu `NOT_IMPLEMENTED`; stav jednotlivých ověřených podtoků viz jejich CI důkazy. Nativní API se znovu neimplementují. Sloupec testu je **akceptační kritérium pro budoucí implementaci**, ne právě provedený test.

| ID / obrazovka | Pořadí / podklad | Požadavek | Co zbývá |
|---|---|---|---|
| overview — **Prehľad** | C5; Nativní Medusa; nové UI a vazby chybí | Klikací informační karty vedou přesně na zobrazené objednávky, zprávy nebo termíny. | Agregace skutečných počtů a konkrétních cílů; nenahrazovat chybu nulou. |
| products — **Produkty a varianty** | C5; Nativní Medusa; nové UI a vazby chybí | Vytvoření, úprava, archivace, varianty, značky, obrázky, fyzické a digitální zboží. | Nové formuláře nad Medusou; zachovat prodejní kanál, profil dopravy, varianty a digitální pravidla. |
| prices — **Ceny a zľavy** | C5; Nativní Medusa; nové UI a vazby chybí | Bezpečné zadání cen a zobrazení konečné ceny ze serveru. | Editor základní ceny nesmí smazat ostatní měny/pravidla; publikovaná cena musí projít NEXUSem. |
| categories — **Kategórie a značky** | C5; Nativní Medusa; nové UI a vazby chybí | Přidat, upravit a řadit kategorie; správa značek a vazeb produktů. | Nový strom kategorií; značka nemá automaticky samostatný ANASTASIA model jen tím, že existuje product-type/tag. |
| coupons — **Kupóny** | C5; Nativní Medusa; nové UI a vazby chybí | Správa kupónu, platnosti, použití a kombinací s další slevou. | Nativní promotion není automaticky podporovaný kupón NEXUSu; sjednotit capability/preflight a ukázat omezení. |
| orders — **Objednávky** | C5; Nativní Medusa; nové UI a vazby chybí | Seznam, detail, historie, kontakt, položky, platba, doprava, vazby a vyřízení. | Nové seznamy/detail; skutečné návaznosti na platbu, rezervaci, přístup, zásilku a poukaz. |
| customers — **Zákazníčky** | C5; Nativní Medusa; nové UI a vazby chybí | Profil, historie, adresy, skupiny, přístupy, rezervace a poznámky. | Vyhledání podle jména/e-mailu, lidský detail nad nativními a vlastními API. |
| stock — **Sklad a rezervovaný tovar** | NEXT; Nativní Medusa; nové UI a vazby chybí | Sklad lékárny, zásoby po variantách, rezervace posledního kusu, příjem a pohyby. | Medusa inventory je autorita; doplnit obsluhu skladu a trvalý přehled pohybů; NEXUS wrapper neprovádí přesuny. |
| flags — **Štítky a zobrazenie produktov** | NEXT; Nativní Medusa; nové UI a vazby chybí | Novinka, bestseller, doporučujeme a obchodní přepínače; produktové flagy. | Product-tags existují, ale vazbu štítku na skutečné zobrazení webu je třeba definovat; framework flags jsou jiné. |
| loyalty — **Vernostné úrovne a osobné ceny** | NEXT; Vlastní backend; úplná agenda částečná | Zákaznice po přihlášení uvidí ceny pro svou úroveň; obsluha nastaví názvy, slevy a členství. | Skupinové nexus_tier se čte; chybí běžný editor verzované politiky a autoritativní personalizovaná cena katalogu. |
| booking — **Konzultácie a voľné termíny** | NEXT; Vlastní backend; úplná agenda částečná | Typy, délka, cena, forma, pauza, týden, kopírování, obsazení a storno. | Nový společný kalendář; vlastní ruční vytvoření/přebookování nemá dokázaný write kontrakt. |
| access — **Programy a prístupy** | NEXT; Vlastní backend; úplná agenda částečná | RESET 40+, Nič nemusíš, platnost přístupů, ruční přidání/odebrání s důvodem. | Editor obsahu/lekcí a bezpečný upload nejsou totožné s existujícím oprávněním. |
| media — **Súbory a chránený obsah** | NEXT; Vlastní backend; úplná agenda částečná | Správa obrázků, videa/audio, přiřazení k produktu bez JSON, oddělení veřejných a placených souborů. | Chybí vlastní validovaný privátní upload/přiřazení; veřejné Medusa uploads nestačí pro placený obsah. |
| chat — **Správy zákazníčok** | NEXT; Vlastní backend; úplná agenda částečná | Inbox, odpověď, přečtení, zavření/otevření, ztlumení a blokace. | Nové UI; limity dnes v kódu, žádný neexistující konfigurační přepínač. |
| vouchers — **Darčekové poukazy** | NEXT; Vlastní backend; úplná agenda částečná | Hodnoty, platnost, prodej, použití, doručení, zůstatky, pohyby, zneplatnění a vratky. | Nové UI nad skutečnými settings a deníkem; částky i dostupná vratka pochází ze serveru. |
| qr — **QR kupóny a staré odkazy** | NEXT; Vlastní backend; úplná agenda částečná | Generování SVG/PNG v adminu v první fázi; evidence již vydaných QR i z původního obchodu. | Generátor nemá registr vydaných QR; stále vrací PENDING_PRICING_INTEGRATION. Redirect mapa není evidence držitelů a uplatnění. |
| lost-code — **Stratený QR alebo poukaz** | NEXT; Vlastní backend; úplná agenda částečná | Dohledat vydání a obnovit přístup k zakoupenému kódu, případně bezpečně nahradit ukradený kód. | Chybí chráněný admin resend/download/replace a registr starých QR; maskovaný seznam nesmí být obcházen logy. |
| campaigns — **Kampane a plánované akcie** | NEXT; Jádro/prototyp; napojení není hotové | Naplánovat akci od/do, produkty/kategorie, rozpočet, slevy, priority, spuštění/pozastavení/ukončení. | Existuje NEXUS kompozice a nativní Medusa campaigns; chybí doložené propojení konfigurace, plánovače a NEXUS ceny. |
| email-text — **Texty e-mailov** | NEXT; Vlastní backend; úplná agenda částečná | Editace předmětu a textů, proměnné, náhled, reset a povolené vypnutí. | Nový editor slotů; reset mění i enabled; texts nahrazuje celý set přepisů. |
| email-design — **Vzhľad e-mailov: tri návrhy** | NEXT; Chybí vlastní kontrakt | Uživatelka vybírá ze tří vizuálních návrhů e-mailů. | Textové sloty nejsou volba layoutu; doplnit tři šablony, persistovanou volbu, náhled a použít ji při odeslání. |
| newsletter — **Newsletter a súhlasy** | NEXT; Vlastní backend; úplná agenda částečná | Kontakty, souhlasy, odhlášení, segmenty, rozesílka a přehled výsledků. | Existuje evidence a stránkovaný CSV export; hromadné kampaně/segmentace/rozesílka nejsou hotové. |
| cms — **Stránky, texty a menu webu** | NEXT; Chybí vlastní kontrakt | Upravit všechny stránky, texty, menu, patičku, kontakty, SEO a náhled před publikací. | Není vlastní CMS API/model s koncepty, verzemi, publikací a vazbami domén; produktová metadata nejsou CMS. |
| multi-site — **Ďalšie weby** | PHASE2; Chybí vlastní kontrakt | Společná správa anastasia.academy a aianastasia.com bez druhé databáze zákaznic. | Doplnit registr webů, oprávnění, obsah a přepnutí kontextu; sjednané ve fázi 2. |
| translations — **Jazyky a preklady** | PHASE2; Nativní Medusa; nové UI a vazby chybí | SK/EN/RU, ruční oprava překladů a stav úplnosti, žádné prázdné povinné texty. | Medusa locales/translations neřeší automaticky celý web, CMS a média; doplnit publikaci a překlady obsahu. |
| branding — **Farby a vzhľad webov** | NEXT; Chybí vlastní kontrakt | Sama změnit barvy, loga a texty jednotlivých webů; jednotná konzistentní pole bez modrého autofillu. | Bezpečné tokeny vzhledu a uložení po webech nejsou implementované; žádný libovolný script/CSS editor. |
| admin-preferences — **Môj vzhľad administrácie** | NEXT; Chybí vlastní kontrakt | Barva adminu a osobní nastavení; kompaktní karty/záložky, minimum scrollování. | Definovat uživatelské preference a napojit je na nový shell; native layouts/views nejsou důkaz hotového tématu. |
| admin-account — **Môj účet a heslo** | NEXT; Nativní Medusa; nové UI a vazby chybí | Změnit vlastní heslo, odhlásit se, ztracené heslo a bezpečný přístup obsluhy. | Native emailpass reset/update existuje; chybí doložené vlastní UI a doručení reset-password události. |
| customer-recovery — **Pomoc s prihlásením zákazníčky** | NEXT; Vlastní backend; úplná agenda částečná | Admin pomůže zákaznici obnovit heslo nebo přihlašovací odkaz; nesmí znát její heslo. | Rozlišit passwordless a emailpass; chybí chráněný admin postup obnovy se souhlasem a auditem. |
| roles — **Prístupy spolupracovníkov** | NEXT; Nativní Medusa; nové UI a vazby chybí | Pozvánky a role pro obsluhu, podporu, finance a provoz; nejmenší potřebná práva. | Nativní rbac/invites existují, ale zapnutí a vynucení na vlastních routách není doloženo; skrytí tlačítka nestačí. |
| payments — **Platby a pripojenie brán** | NEXT; Vlastní backend; úplná agenda částečná | Nastavení Stripe, karty/Apple Pay/Google Pay, stav spojení, bezpečně ComGate. | Stripe provider je podmíněn konfigurací; chybí samoobslužný průvodce credentials/test/webhook. ComGate je fáze 2 a provider chybí. |
| cod-risk — **Dobierka a rizikové objednávky** | NEXT; Vlastní backend; úplná agenda částečná | Dobírka, nepřebírači, historie výsledků, limity a vysvětlení rozhodnutí SafeOrderu. | Živá route má základní scoring a limit 120 EUR; není propojená s historií dopravce/nepřevzetím. Chybí COD provider a bezpečný settings kontrakt. |
| shipping — **Doprava a osobný odber** | NEXT; Nativní Medusa; nové UI a vazby chybí | Ceníky, oblasti, hranice zdarma, osobní odběr v lékárně, adresa a výdejní doba. | Existuje manual courier/digital bootstrap; chybí plný pickup proces a samoobslužné nastavení. |
| carriers — **Dopravcovia a štítky zásielok** | NEXT; Nativní Medusa; nové UI a vazby chybí | API dopravců, vytvoření/tisk štítku, tracking, svoz, předání, doručení a nepřevzetí. | Nativní fulfillment není smlouva s dopravcem; chybí konkrétní konektory, credentials, tisk a callback/reconciliation. |
| returns — **Storná, vratky a reklamácie** | NEXT; Vlastní backend; úplná agenda částečná | Zákaznické i admin storno, kartová/poukazová vratka, odstoupení, reklamace a výměny. | Native returns/claims/exchanges existují; vlastní workflow musí propojit stav, skutečné peníze, sklad, nároky a oznámení. |
| invoices — **Faktúry a dobropisy** | NEXT; Jádro/prototyp; napojení není hotové | Doklady k objednávkám, číselné řady, PDF, dobropisy a opravy bez změny historického dokladu. | Chybí obchodní fakturační služba s pravidly, perzistencí, PDF a číslováním; confirmation e-mail není faktura. |
| accounting — **Účtovný systém** | NEXT; Jádro/prototyp; napojení není hotové | Napojení účetnictví a viditelný stav předání dokladů, chyby a bezpečné opakování. | POHODA/Money S3 mají injektované transporty a kontrakty; Omega legacy je oddělená. Chybí ověřené tenantové připojení a příjem účetním programem. |
| feeds — **Feedy a dovoz dát** | NEXT; Jádro/prototyp; napojení není hotové | Připojit dodavatelský feed/API, mapovat sloupce, ceny, dostupnost, pravidelnou obnovu a chyby. | Legacy parser/import CLI a shadow feed nejsou samoobslužná importní služba; chybí URL/file jobs, mapování, náhled změn a historie. |
| buyer — **Chytrý nákupca a dodávatelia** | NEXT; Jádro/prototyp; napojení není hotové | Hlídání zásob, nabídky dodavatelů, návrh/nákup zboží, příjem, výjimky a pravidla automatické objednávky. | Deterministické plan/receive jádro existuje; chybí runtime nabídky, trvalé nákupní objednávky, autorizovaný executor a Medusa skladový příjem. |
| availability — **Dostupnosť a nákupné balenia** | NEXT; Jádro/prototyp; napojení není hotové | Skladová dostupnost, dodavatelská dostupnost, dodací lhůty, balení a množstevní omezení. | Medusa vlastní zásobu; širší NEXUS dostupnost/dodavatelé/balení nejsou jednotně napojené do runtime. |
| privacy — **Osobné údaje a súhlasy** | NEXT; Vlastní backend; úplná agenda částečná | Souhlasy, export, výmaz, interní poznámky, historie požadavků a účetní výjimky. | Nové UI a kontrola identity/dopadu; pouze povolené přechody a zachování zákonné evidence. |
| operations — **Automatické spracovanie** | NEXT; Vlastní backend; úplná agenda částečná | NEXUS nahrazuje rutinní obchodní práci deterministicky; člověk řeší výjimky, ne ručně každý krok. | Read-only přehled existuje; ne všechny domény mají consumer a celý ověřovaný cyklus; bezpečné admin retry/cancel API chybí. |
| logs — **Udalosti a história zmien** | NEXT; Vlastní backend; úplná agenda částečná | Veškeré potřebné logy, kdo co změnil, bezpečný detail a dohledání související objednávky. | Ne každý stdout se ukládá do PG; best-effort audit není všude transakční; doplnit chybějící zdroje, role a filtry. |
| notifications — **Doručovanie e-mailov** | NEXT; Vlastní backend; úplná agenda částečná | Vidět skutečný stav odeslání, důvod selhání a bezpečnou obnovu. | Potvrzení objednávky má uloženou obnovu; ostatní oznámení ještě nemají shodný cyklus. Native notifications není plný dashboard doručení do schránky. |
| jobs-backups — **Kontroly, zálohy a obnova** | NEXT; Vlastní backend; úplná agenda částečná | Historie běhů, chyby, expirace, zálohy, datum poslední úspěšné obnovy a alarmy. | Lokální runbook není produkční backup služba; chybí jednotné job/backup status API a řízená obnova s oprávněním. |
| connections — **Pripojenia a prístupové údaje** | NEXT; Nativní Medusa; nové UI a vazby chybí | Přehled všech API/služeb, připojení, kontrola spojení, odpojení a chyby bez programátora. | Nativní API keys nejsou univerzální úložiště credentials dopravců/ERP; chybí secret-store a ověřené konektory. |
| migration — **Prenos starých údajov** | NEXT; Vlastní backend; úplná agenda částečná | Staré zákaznice, objednávky, přístupy, QR a odkazy dohledatelné v novém systému. | CLI pro migraci existuje; chybí obslužný report s vazbami, doplnění registru QR a schválená migrační akce. |
| ambassadors — **Ambasádorky a provízie** | PHASE2; Chybí vlastní kontrakt | Osobní QR/odkazy, atribuce objednávek a přehled provizí. | Generátor kupónu není atribuce ani provizní účetnictví; doplnit doménu a pravidla ve fázi 2. |
| club — **Klub a predplatné** | OUTSIDE_CONTRACT; Jádro/prototyp; napojení není hotové | Nezaměnit věrnostní skupinu za placené předplatné; zapsat existenci, nikoli vydávat za dodané. | Worker route obsahuje prototyp Stripe subscription s placeholder price ID, bez doloženého úplného autorizačního/idempotentního toku; SaaS billing je jiná agenda. |
| ai — **Poradca v chate** | PHASE2; Jádro/prototyp; napojení není hotové | AI není autorita ceny, platby, přístupu ani rozhodnutí o automatickém obchodním kroku. | Existuje prototyp gateway; nikoli ověřený znalostní/konverzní/rezervační tok podle smlouvy. |
| b2b — **Firemní zákazníci a obchodné údaje** | NEXT; Jádro/prototyp; napojení není hotové | Správné firemní/fakturační údaje a případné obchodní podmínky bez míchání se soukromou osobou. | NEXUS kontext/validace nejsou celé B2B nabídky, schvalování ani speciální ceníky ANASTASIA. |

## Zdroj a důkaz požadovaný pro každou funkci

| ID | Autoritativní zdroj / současná implementace | Akceptační test celé funkce |
|---|---|---|
| overview | [route.ts](../../../backend/src/api/admin/ops/nexus/route.ts), [route.ts](../../../backend/src/api/admin/chat/conversations/route.ts) | Klik na kartu otevře správný filtrovaný seznam; změna dat aktualizuje počet. |
| products | [import-anastasia-catalog.ts](../../../backend/src/scripts/import-anastasia-catalog.ts) | Uložený produkt se znovu načte z API; běžné zboží nemá povinnou rezervaci. |
| prices | [route.ts](../../../backend/src/api/store/nexus-cart/route.ts), [hooks.ts](../../../backend/src/workflows/hooks.ts) | Server odmítne neplatnou částku/měnu; změna ceny vyžádá novou platební relaci; zachová se ostatní ceník. |
| categories | [import-anastasia-catalog.ts](../../../backend/src/scripts/import-anastasia-catalog.ts) | Vnořená kategorie se uloží, má správné produkty a nemůže obsahovat sama sebe. |
| coupons | [route.ts](../../../backend/src/api/store/nexus-cart/route.ts), [validation.ts](../../../backend/src/api/admin/coupon-links/validation.ts) | Podporovaný kupón změní serverovou cenu; nepodporovaná podmínka se odmítne před zveřejněním, nikdy se neignoruje. |
| orders | [route.ts](../../../backend/src/api/store/nexus-checkout/route.ts), [hooks.ts](../../../backend/src/workflows/hooks.ts) | Uživatelka najde objednávku, upraví dovolený kontakt a načte serverový stav; žádný ruční přepínač zaplaceno. |
| customers | [route.ts](../../../backend/src/api/admin/customers/[id]/notes/route.ts), [route.ts](../../../backend/src/api/admin/entitlements/route.ts) | Správná zákaznice má pouze vlastní vazby; poznámky se neobjeví v provozním logu. |
| stock | [stock-availability-http-checks.ts](../../../backend/integration-tests/http/stock-availability-http-checks.ts), [WarehouseStockFlow.ts](../../../nexus/domains/warehouse/WarehouseStockFlow.ts) | Souběžné objednávky posledního kusu nevydají dva kusy; storno uvolní rezervaci; úprava má aktéra/důvod. |
| flags | [route.ts](../../../backend/src/api/store/nexus-cart/route.ts) | Uložený štítek ovlivní správný produkt; uživatelka nemůže vypnout cenovou či platební ochranu. |
| loyalty | [customer-tier.ts](../../../backend/src/api/store/nexus-cart/customer-tier.ts), [nexusPricing.ts](../../../nexus/workers/api/routes/nexusPricing.ts) | Dvě zákaznice mají své serverové ceny v katalogu i košíku; anonymní uživatel nevidí cizí cenu; žádná rybářská výchozí politika. |
| booking | [route.ts](../../../backend/src/api/admin/booking/types/route.ts), [route.ts](../../../backend/src/api/admin/booking/availability/route.ts), [route.ts](../../../backend/src/api/admin/bookings/[id]/cancel/route.ts) | Souběh a změna obsazeného času se odmítnou; Bratislava/DST; změna typu zachová ceny a budoucí rezervace. |
| access | [route.ts](../../../backend/src/api/admin/entitlements/route.ts), [order-sync.ts](../../../backend/src/modules/entitlement/order-sync.ts) | Zaplacený program zpřístupní server; neověřená platba nikoli; ruční operace má důvod a kontrolu po timeoutu. |
| media | [route.ts](../../../backend/src/api/store/media-access/route.ts), [mediaDelivery.ts](../../../nexus/workers/api/routes/mediaDelivery.ts) | Placený soubor není veřejný; cizí/sousední soubor je odmítnut; UI přizná platnost vydaného odkazu do expirace. |
| chat | [route.ts](../../../backend/src/api/admin/chat/conversations/route.ts), [policy.ts](../../../backend/src/modules/chat/policy.ts) | Čistý text; 2000 znaků zákaznice/5000 admin; 403/409/429 slovensky; počítadlo a zachování rozepsané odpovědi. |
| vouchers | [route.ts](../../../backend/src/api/admin/vouchers/settings/route.ts), [route.ts](../../../backend/src/api/admin/vouchers/[id]/transactions/route.ts), [route.ts](../../../backend/src/api/admin/vouchers/refund/route.ts) | Hodnoty z API; vydané poukazy zachovají pravidla; refund replay nezvýší zůstatek dvakrát; po 502 znovu ověřit uložení. |
| qr | [route.ts](../../../backend/src/api/admin/coupon-links/route.ts), [export-edge-redirects.ts](../../../backend/src/scripts/export-edge-redirects.ts), [edgeRedirects.ts](../../../nexus/workers/api/edgeRedirects.ts) | Naskenování nového i starého QR otevře správný cíl a server uplatní správnou slevu; výstup se stáhne bez externí QR služby. |
| lost-code | [delivery.ts](../../../backend/src/modules/gift-voucher/delivery.ts), [route.ts](../../../backend/src/api/admin/vouchers/route.ts) | Ověří se držitel a oprávnění; opětovné doručení nevydá další kredit; případná náhrada zneplatní starý kód atomicky a auditovaně. |
| campaigns | [CampaignFlows.ts](../../../nexus/domains/campaign/CampaignFlows.ts), [CampaignLifecycleRule.ts](../../../nexus/domains/campaign/CampaignLifecycleRule.ts) | Akce začne i skončí serverovým časem; konflikt slev má jednoznačné pravidlo; restart nezopakuje účinek. |
| email-text | [route.ts](../../../backend/src/api/admin/email-templates/[template]/route.ts), [route.ts](../../../backend/src/api/admin/email-templates/[template]/preview/route.ts) | Povinný e-mail nelze vypnout; chybná proměnná je odmítnuta; náhled izolovaný a nic neodesílá. |
| email-design | [templates.ts](../../../backend/src/modules/notification-zeptomail/templates.ts) | Tři odlišitelné náhledy; uložený vzhled používá skutečný renderer; funkční mobilní i prostý textový e-mail. |
| newsletter | [route.ts](../../../backend/src/api/admin/newsletter/route.ts), [route.ts](../../../backend/src/api/store/newsletter/unsubscribe/route.ts) | Žádné odeslání bez souhlasu; odhlášení platí pro další dávku; UI správně označí rozsah exportu. |
| cms | [INVENTAR-A-AKCEPTACE.md](../../../backend/docs/wp/INVENTAR-A-AKCEPTACE.md) | Uložení konceptu nemění živý web; publikace mění správnou stránku; odkaz menu má existující cíl. |
| multi-site | [NEXUS_AUTONOMY_SPEC.md](../../../docs/NEXUS_AUTONOMY_SPEC.md) | Přepnutí webu nemíchá obsah; zákaznice/platby/přístupy zůstávají u jednoho vlastníka. |
| translations | [INVENTAR-A-AKCEPTACE.md](../../../backend/docs/wp/INVENTAR-A-AKCEPTACE.md) | Prázdný překlad se odliší od chybějícího; náhled i publikace ukáží vybraný jazyk. |
| branding | [ADMIN-UX-SAMOOBSLUHA.md](../../../backend/docs/wp/ADMIN-UX-SAMOOBSLUHA.md) | Kontrast zůstane čitelný; náhled před uložením; změna přetrvá a projeví se pouze na správném webu. |
| admin-preferences | [ADMIN-UX-SAMOOBSLUHA.md](../../../backend/docs/wp/ADMIN-UX-SAMOOBSLUHA.md) | Nastavení přežije přihlášení; kontrast i fokus čitelné; při 200% zoomu a malé obrazovce lze scrollovat k obsahu. |
| admin-account | [medusa-config.ts](../../../backend/medusa-config.ts) | Původní přístup nelze převzít; reset je časově omezený; ověření backendu a skutečného doručení v testu. |
| customer-recovery | [service.ts](../../../backend/src/modules/auth-magic-link/service.ts), [index.ts](../../../backend/src/modules/auth-security/index.ts) | Obnova nepřepne identitu, nevytvoří druhý účet, neodhalí heslo; rate-limit a jedna spotřeba odkazu. |
| roles | [middlewares.ts](../../../backend/src/api/middlewares.ts) | Zakázaná role nedokáže číst ani zapsat agendu přímým HTTP požadavkem. |
| payments | [medusa-config.ts](../../../backend/medusa-config.ts), [anastasia-bootstrap.ts](../../../backend/src/scripts/anastasia-bootstrap.ts) | Zapnutá metoda skutečně funguje v regionu; neověřený webhook neoznačí platbu za přijatou; klíč není vrácen do prohlížeče. |
| cod-risk | [nexusSafeOrder.ts](../../../nexus/workers/api/routes/nexusSafeOrder.ts), [OutcomeEngineRule.ts](../../../nexus/domains/safeorder/OutcomeEngineRule.ts) | Nepřevzetí vytvoří ověřený výsledek, další hodnocení jej použije; neznámý výsledek nic nevymyslí; admin nemůže obejít platbu. |
| shipping | [anastasia-bootstrap.ts](../../../backend/src/scripts/anastasia-bootstrap.ts), [shipping-settings-http-checks.ts](../../../backend/integration-tests/http/shipping-settings-http-checks.ts) | Fyzický košík nelze dokončit s digitální dopravou; osobní odběr ukáže správnou lékárnu; pravidla dopravy počítá server. |
| carriers | [email-shipment-created.ts](../../../backend/src/subscribers/email-shipment-created.ts), [anastasia-bootstrap.ts](../../../backend/src/scripts/anastasia-bootstrap.ts) | Dvojklik/timeout nevytvoří dvě zásilky; štítek patří správné objednávce; doručení a nepřevzetí vychází z poskytovatele. |
| returns | [cancel.ts](../../../backend/src/lib/order-self-cancel/cancel.ts), [route.ts](../../../backend/src/api/admin/withdrawals/[id]/route.ts), [compensation-payment-refunded.ts](../../../backend/src/subscribers/compensation-payment-refunded.ts) | Změna statusu odstoupení neposílá peníze; duplicitní refund nic nezdvojí; rozlišit kartu a kredit poukazu. |
| invoices | [OrderInvoiceOmegaFlow.ts](../../../nexus/domains/invoice/OrderInvoiceOmegaFlow.ts), [README.md](../../../nexus/connectors/accounting/README.md) | Souběh nevydá stejné číslo; opakování nevystaví druhý doklad; peněžní hodnoty a DPH odsouhlasí autoritativní data. |
| accounting | [README.md](../../../nexus/connectors/accounting/README.md), [registry.ts](../../../nexus/connectors/accounting/registry.ts), [OmegaExecutor.ts](../../../nexus/connectors/omega/legacy/agent/OmegaExecutor.ts) | Doklad je předán až po ověřeném cílovém potvrzení; timeout jde do kontroly, ne slepého opakování. |
| feeds | [SupplierCsvRule.ts](../../../nexus/domains/supplier-csv/SupplierCsvRule.ts), [feed.ts](../../../nexus/tools/shadow/feed.ts), [import-anastasia-catalog.ts](../../../backend/src/scripts/import-anastasia-catalog.ts) | Náhled nic nepřepíše; chybná měna/cena/množství zastaví řádek; feed nemůže volat interní síť; replay nezduplikuje produkty. |
| buyer | [ProcurementRule.ts](../../../nexus/domains/procurement/ProcurementRule.ts), [SupplierSelectionRule.ts](../../../nexus/domains/procurement/SupplierSelectionRule.ts) | Stejný vstup dává stejný plán; limit/rozpočet určí pravidla; dvojí běh neobjedná podruhé; nejasný výsledek vyžádá ověření. |
| availability | [AvailabilityRule.ts](../../../nexus/domains/availability/AvailabilityRule.ts), [OrderQuantityValidationRule.ts](../../../nexus/domains/availability/OrderQuantityValidationRule.ts) | Dostupnost vychází z platného zdroje; balení nemůže vytvořit záporné/necelé nepovolené množství; checkout stav ověří znovu. |
| privacy | [route.ts](../../../backend/src/api/admin/customer-erasures/[id]/execute/route.ts), [route.ts](../../../backend/src/api/admin/withdrawals/route.ts), [route.ts](../../../backend/src/api/store/customers/me/export/route.ts) | Výmaz vyžaduje confirm a stejné ID; nevratné kroky s potvrzením; audit bez citlivého obsahu; replay bezpečný. |
| operations | [route.ts](../../../backend/src/api/admin/ops/nexus/route.ts), [intent-recovery.ts](../../../nexus/workers/api/intent-recovery.ts), [booking-inbox.ts](../../../nexus/workers/api/booking-inbox.ts) | Vstup → uložený záměr → provedení → nezávislé ověření → výsledek; nejistota se neoznačí za úspěch ani slepě neopakuje. |
| logs | [route.ts](../../../backend/src/api/admin/ops/events/route.ts), [route.ts](../../../backend/src/api/admin/ops/audit/route.ts), [edge-ingest.ts](../../../backend/src/modules/ops-audit/edge-ingest.ts) | Request/operation/objednávka se propojí bez tokenů, zpráv, hesel a raw payloadů; prázdný log není zelený healthcheck. |
| notifications | [send.ts](../../../backend/src/lib/email/send.ts), [order-email-recovery.ts](../../../backend/src/workflows/order-email-recovery.ts), [email-payment-captured.ts](../../../backend/src/subscribers/email-payment-captured.ts) | Pending/failed není sent; provider acceptance není mailbox delivery; nejasný výsledek se automaticky neposílá znovu. |
| jobs-backups | [backup-local.mjs](../../../backend/src/scripts/backup-local.mjs), [restore-local.mjs](../../../backend/src/scripts/restore-local.mjs), [ops-retention.ts](../../../backend/src/jobs/ops-retention.ts) | Neúspěšný job není hotový; záloha přijata až po restore testu; žádné neomezené restore/retry tlačítko. |
| connections | [medusa-config.ts](../../../backend/medusa-config.ts), [Connector.ts](../../../nexus/connectors/Connector.ts) | Prohlížeč nečte uložený secret; test spojení není změna obchodu; vypnutí respektuje rozpracované operace. |
| migration | [migrate-legacy-customers-orders.ts](../../../backend/src/scripts/migrate-legacy-customers-orders.ts), [export-edge-redirects.ts](../../../backend/src/scripts/export-edge-redirects.ts) | Dry-run bez změny; součty a počty se shodují; druhý běh nic nezdvojí; žádná skutečná zákaznická data v repu/logu. |
| ambassadors | [route.ts](../../../backend/src/api/admin/coupon-links/route.ts) | Objednávka má jedno doložené přiřazení; storno/refund upraví nárok dle schválené politiky; replay bez dvojí provize. |
| club | [klubSubscribe.ts](../../../nexus/workers/api/routes/klubSubscribe.ts), [TenantSubscriptionPlanFlow.ts](../../../nexus/domains/billing/TenantSubscriptionPlanFlow.ts) | Do běžného menu nevystavit neakceptovaný prototyp; placené členství pouze po samostatné objednávce a celém testu. |
| ai | [aiGateway.ts](../../../nexus/workers/api/routes/aiGateway.ts), [NEXUS_AUTONOMY_SPEC.md](../../../docs/NEXUS_AUTONOMY_SPEC.md) | Bezpečný obsah a souhlasy; rezervace/platba přes deterministické API, žádné neomezené shell/DB oprávnění. |
| b2b | [CustomerBusinessContextFlow.ts](../../../nexus/domains/b2b/CustomerBusinessContextFlow.ts) | Fakturační identita je ověřená a promítne se do správného dokladu; cizí zákazník nic nezmění. |

## Běžné nastavení: co musí být skutečně uloženo

Každá běžná obchodní změna potřebuje serverové čtení/zápis, validaci, oprávnění, audit, verzi a ověření dopadu v obchodě. Dnešní konfigurace přes env nebo konstantu není finální samoobsluha. Bezpečnostní tajné klíče naopak nikdy nevypisujeme do formulářů; průvodce je smí bezpečně předat do úložiště a vrátit jen stav připojení.

| Nastavení | Autorita nyní | Co před UI ověřit/doplnit |
|---|---|---|
| Produkty, kategorie, základní ceny, zásoby | Medusa PostgreSQL / nativní API | Jednotky, desetinná přesnost, měny, souběh, rezervace; cena varianty nesmí přepsat jiné ceny |
| Osobní ceny a slevová politika | Medusa skupiny + NEXUS tenantová konfigurace | Verzované čtení/uložení/publikace pravidel, katalogové zobrazení a serverové vyhodnocení |
| Dobírka a riziková pravidla | Základní pravidla živé SafeOrder route | Historie doručení/nepřevzetí, provider, řízené limity; ochrany nelze vypnout UI flagem |
| Typy a týden konzultací | Vlastní booking API/PG | Globální kolize, lokální čas/DST, hranice možností nastavení |
| Nové poukazy | Vlastní settings API/PG | Snapshot již vydaných se nepřepíše; po částečném výsledku ověřit skutečný stav |
| QR a ztracené kódy | Generátor a legacy redirect mapa | Registr vydání/legacy import, capability kupónu, oprávněný resend/replace |
| E-mailové texty / tři vzhledy | Textové sloty v PG; vzhled v rendereru | Volba layoutu dnes není persistovaná; odeslání musí použít uložený vzhled |
| Doprava a osobní odběr | Nativní shipping options / bootstrap | Skutečný poskytovatel, adresa/výdejní hodiny, pravidla a vazba na region/sklad |
| Platby, dopravci, účetnictví, feedy | Deployment a jednotlivé konektory | Samoobslužné bezpečné připojení a doložený provider round-trip; ne univerzální editor secrets |
| Weby, obsah, barvy, překlady | Chybí plný obslužný CMS kontrakt | Koncept/publikace/verze, oddělení domén a přístupových práv |
| Vzhled adminu | Vlastní `/admin/my-theme`, user metadata, sdílený nový theme frame | Osobní preference bez změny webu/obchodních pravidel; aktuální stav viz [theming](admin-theming.md) |

## Připojení služeb: zadání API přímo v adminu

Výslovný požadavek Luckyho: v **Nastavenia → Pripojenia** musí být možné připojit **Stripe, ComGate, dopravce, účetnictví, dodavatelské feedy a další zavedené funkce s externí službou**. Běžné připojení nesmí vyžadovat programátora, terminál ani nové nasazení. ComGate zůstává zaznamenaná ve smluvní fázi 2; požadavek na její ovládání se nevynechává.

Každý podporovaný konektor má vlastní formulář podle skutečného kontraktu poskytovatele: požadované API klíče/přístupové údaje, identifikátor účtu či provozovny, případně povolenou adresu služby a webhook/podpisový údaj. Ne všechny služby mají stejná pole. Nový poskytovatel potřebuje implementovaný konektor; libovolně vložená URL a klíč samy nepřidají funkci do systému.

Povinné ovládání: **Pripojiť, Overiť spojenie, Testovací / ostrý režim** tam, kde je poskytovatel podporuje, **Aktivovať, Zmeniť prístupové údaje, Odpojiť**; stav „Nepripojené / Treba doplniť údaje / Spojenie overené / Chyba spojenia“, datum posledního ověření a srozumitelný další krok. U plateb také správná vazba na region/metodu a ověřené příchozí události; u dopravce smluvní účet, podporované služby, štítky a sledování. Ověřené připojení není důkaz dokončené platby, zásilky ani importu.

Citlivé údaje se zadávají přímo do chráněného formuláře a ukládají serverově do spravovaného bezpečného úložiště. Při dalším načtení pouze maskovaná informace „Nastavené“, nikdy celý uložený klíč. Žádný secret v URL, localStorage, logu, exportu nebo běžném auditu. Změna a odpojení vyžaduje oprávnění, audit bez tajných hodnot a kontrolu dopadu na rozpracované operace. Server ověřuje povolené cíle spojení; test připojení nesmí umožnit volání libovolné interní adresy ani provést ostrou platbu/objednávku zásilky.

Akceptace: uživatelka bez zásahu programátora vloží údaje podporované služby, ověří spojení, aktivuje správný způsob platby/dopravy a projde syntetickou testovací operací; chybné údaje zobrazí opravitelnou chybu a nic falešně neaktivují. **Dnes tento jednotný samoobslužný tok není implementovaný**; samotná současná konfigurace Stripe v env nebo existence Medusa API-key endpointu jej nenahrazuje.

## Automatické návaznosti a výjimky

1. **Objednávka:** server načte katalog a zákaznickou úroveň → přepočítá cenu → zkontroluje sklad/termín/poukaz/souhlasy/riziko → sváže platbu a objednávku. Admin čte skutečný výsledek. SafeOrder ALLOW není platba.
2. **Přijetí platby:** ověřený provider a Medusa stav → nárok na program / potvrzení rezervace / vydání poukazu podle typu položky → potvrzení oznámení. Již existující efekty nesmí nové UI ani další consumer spouštět podruhé.
3. **Storno/vratka:** dovolí ji doménová pravidla → skutečná refundace správného způsobu → sklad/rezervace/přístupy/poukaz podle politiky → oznámení a doklad. Stav refunded v evidenci odstoupení sám nevrací peníze.
4. **Zásilka/dobírka:** vytvoření zásilky → štítek → sledování → doručení/nepřevzetí → doložená historie SafeOrderu a vypořádání dobírky. Toto celé zatím nemá připojeného dopravce a nesmí se vykreslit jako hotová automatizace.
5. **Sklad/nákupčí/feed/účetnictví/kampaň:** pravidlo → trvalý záměr → autorizovaný konektor → nezávislé ověření → audit. Existence čisté rule funkce nebo adapter interface nestačí pro provozní dokončení.
6. **Nejistota:** po timeoutu se nejprve čte autoritativní stav. Idempotency key pouze tam, kde jej API skutečně podporuje. Unknown výsledek nemá automatické opakování nevratného efektu. Bezpečné admin retry/resolve potřebuje vlastní ověřený backend, nesmí přímo volat libovolný nativní workflow-run endpoint.

Je již ověřena trvalá obnova záměrů, inbox, doručování událostí Medusy, spotřebitel rezervací a potvrzení objednávky. Neznamená to, že stejný cyklus již mají všechny e-maily, dopravci, ERP a nákupčí. Jedna logická autorita: Medusa obchod, NEXUS pravidla/koordinace, entitlement přístup, booking termín; žádná druhá evidence objednávek v prohlížeči.

## Validace a nepříjemné situace, které UI musí řešit

- Cena: konečné číslo, správná měna/jednotka/přesnost; zákaz záporných částek a nadlimitní slevy v serveru. Frontend validace pomáhá obsluze, není bezpečnostní hranice. Akci na cenu/daně nelze považovat za bezpečnou jen podle kontrolky v prohlížeči.
- Více variant/měn/pravidel: uložení jedné ceny nemaže jiné; otevřený starý formulář nesmí potichu převálcovat souběžnou změnu. Kde API nemá verzi/lock, uvést mezeru a doplnit kontrakt.
- Platba čeká/selhala/odpověď se ztratila; částečná vratka, smíšená karta+poukaz, duplicitní webhook, dvojklik a restart. Zobrazení PENDING není PAID.
- Poslední kus, vyprodaná varianta, fyzické+digitální zboží, osobní odběr, kolize termínu, přechod letního času, propadlý hold a expirace poukazu.
- Ztracený kód, pokus cizí osoby o resend, kompromitovaný QR, starý QR s neplatným cílem; nesmí vzniknout další kredit nebo únik kódu přes log.
- Účet bez hesla, expirovaný reset, neplatný/starý/jednou použitý přihlašovací odkaz, zákaznice po migraci, administrátor bez oprávnění.
- Nedostupný dopravce/ERP/SMTP/feed, chybný CSV řádek, neplatná cena, zpožděná odpověď po vzdáleném úspěchu, přerušený import a znovuspuštění.
- 401 návrat na přihlášení; 403 vysvětlení oprávnění; 404 odstraněný cíl; 409 načíst aktuální stav se zachováním editace; 429 respektovat čas; 5xx nepředstírá úspěch ani rollback.
- Nevratné akce potvrzují konkrétní cíl/dopad. Změna barvy není jediná zpětná vazba. Bez ztráty rozepsaných údajů, souhrn chyb a chyba u pole, loading/prázdný stav/stránkování.

## UX závazky pro nově stavěné obrazovky

Běžná slovenština: Prístup k programu, Voľné termíny, Pravidlá zliav, Platba prijatá, Kód pre podporu. Žádný JSON, interní ID nebo odborný slovník pro běžnou obsluhu. Uživatelka volí zákaznici a produkt podle jména. Všechny karty, záložky a odkazy vedou na skutečný cíl; žádné placeholder dialogy.

Klidná krémová pracovní plocha, zelená navigace, čitelné vínové/zlaté akcenty; konzistentní vstupy včetně autofillu, aktivního i disabled tlačítka. Tabulky stránkované, krátké formuláře po záložkách; na běžném notebooku prioritní úkol bez zbytečného scrollu. Nezakazovat scroll tak, aby na malé obrazovce/zoomu mizel obsah. Klávesnice, čitelný fokus, 44px cíle, kontrast textu alespoň 4,5:1 a respektování omezeného pohybu.

Každý úkol musí uživatelka zvládnout bez navigování programátorem. Uložit znamená skutečné serverové uložení a následný read-back; ukázkový stav nebo browser localStorage nesmí napodobovat funkční obchod.

## Ověření mapy a následující krok

`python3 backend/scripts/check-admin-function-map.py` kontroluje kompletní aktuální routy a metody, jejich přiřazení, otisky vlastních route kontraktů, existující zdroje, modulové/job/subscriber/workflow pokrytí, Worker router, prefix médií a referenční CI důkaz. Jest regresní test tuto kontrolu volá také v CI. Změna API tedy vyžaduje i novou kontrolu mapy. Tato kontrola neověřuje spuštění ani oprávnění API.

Provedené kontroly této mapy: zdrojové pokrytí PASS; 105/105 místních odkazů PASS; cílený Jest `src/lib/__tests__/admin-function-map.unit.spec.ts` 1/1 PASS; `git diff --check` PASS. Plný HTTP/PG ani úplná unit sada nebyly lokálně spuštěny.

První implementační PR po této mapě: nový vlastní shell a šest agend C5 nad existujícími API, se slovenskými formuláři, bezpečnými validacemi a browser/API testem. Žádné převzetí admin-demo jako hotového systému. Následně ostatní agendy v pořadí závislostí backend → API → UI → celý tok; chybějící konektor nemá falešné funkční tlačítko. Claude dál vlastní storefront/integraci, Jose merge.

## Navazující implementace osobního vzhledu

[Theming adminu](admin-theming.md) přidává původní vzhled ANASTASIA, osobní ukládání, kontrast a sdílené tokeny pro všechny nově stavěné obrazovky. Nemění vzhled zákaznických webů ani neprohlašuje hotový vizuální CMS. Lucky doplnil správu sekcí/stránek graficky bez programátora a samostatné tier ceníky se starou/novou cenou a % úspory ze serveru; oba požadavky zůstávají v úplné mapě, neoznačené za hotové.

### Podmínka dokončení samoobslužné správy obsahu

Klientka musí bez programátora a bez kódu sama zakládat a upravovat kategorie, sekce a stránky. Vizuálně upraví texty, obrázky, barvy, pořadí a rozložení, zobrazí náhled a publikuje na vybraném webu z jednoho adminu. Koncept nesmí změnit živou stránku ani jiný web; menu musí mít platné cíle a předchozí verzi musí jít obnovit. Akceptace zahrnuje skutečné uložení a opětovné načtení celé této cesty; osobní motiv adminu ani klikací prototyp ji nenahrazují. **Stav CMS: NOT_IMPLEMENTED.**
