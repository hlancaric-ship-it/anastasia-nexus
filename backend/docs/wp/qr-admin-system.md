# QR kódy: backend, vlastní administrace a zachované odkazy

Stav: IMPLEMENTED_UNVERIFIED; společná CI dosud čeká. Žádné nasazení, skutečná zákaznická data ani import na produkci.

## Izolace od finančního jádra

QR je neměnný odkaz na produkt a existující kupón. Modul `coupon-link` eviduje URL, kód produktu, kupón, počet, původ, případně známé datum vydání a datum vložení do evidence. Nevlastní peníze, cenu, zůstatek ani počet použití kupónu. Nadále platí existující serverové NEXUS pricing, SafeOrder, nativní objednávky, platby a ochrany souběžného uplatnění.

Identita záznamu je SHA-256 serverového tenant ID a přesné URL. PostgreSQL primární klíč s `ON CONFLICT DO NOTHING` zajišťuje idempotenci i mezi procesy, bez závislosti na Redis či paměťových zámcích. Opakování nikdy nepřepisuje původní URL, původ ani datum vydání. Čtení vždy omezuje serverový tenant. QR obrázek se vykresluje lokálně až z uložené URL; změna dnešní domény nemění již vydané odkazy.

Registrace `{ resolve: "./src/modules/coupon-link" }` je přidána do `backend/medusa-config.ts`; proběhnou standardní Medusa migrace. Lucky výslovně předal dokončení Codexu, protože Claude je na limitu. Jiná konfigurace se nemění. Bez migrace vrátí evidence 503, nikoli falešný úspěch.

## Admin API

Všechny cesty vyžadují nativní přihlášení `user` a vracejí `Cache-Control: no-store`.

- `GET /admin/coupon-links?limit=25&offset=0&q=`: stránkovaná evidence, přesné vyhledání podle kódu produktu nebo kupónu, aktuální dostupnost produktu a skutečný stav/limity/čerpání/platnost kupónu. Nejvýše 100 záznamů na stránku; nejednoznačná vazba se neoznačí za dostupnou.
- `POST /admin/coupon-links`: zachovaný vstup `{produkt,kupon,ks,format}`. Ověří dostupnost stávajícím validátorem, vykreslí QR a uloží záznam; vrací `{url,qr,record,created,discount_applied:false}`. Nevytváří novou promotion. Při chybě renderu/DB nevydává úspěch. Pro kompatibilitu zůstává původní příznak `activation_status:PENDING_PRICING_INTEGRATION`; znamená pouze, že tato operace slevu sama neaplikuje. Nový admin jej nepoužívá jako stav celého systému. Generování nikdy nepotvrzuje slevu.
- `GET /admin/coupon-links/:id`: detail včetně aktuálního stavu, nikoli kopie kupónových limitů v QR registru.
- `GET /admin/coupon-links/:id/qr?format=svg|png`: opětovné stažení původní URL, i pokud je kupón nyní neaktivní. Kupón nezapíná, nic nevystavuje znovu a nemění čerpání.
- `POST /admin/coupon-links/import`: `{links:[{url,issued_at?}],dry_run:true}`. Nejvýše 100 odkazů. Výchozí je pouze kontrolní náhled, bez změny DB. Všechny URL se validují před prvním zápisem. Opakování/importní souběh nevytváří další záznamy. Neznámé datum vydání zůstává null. Žádné čtení skutečných migračních souborů z HTTP.
- `POST /admin/coupon-links/:id/deactivate`: `{confirmation:"přesný kód kupónu"}`. Vypne již existující promotion; potvrzení vysvětluje dopad na všechny její odkazy. Čerpání a dokončené objednávky nemění. Opakování je idempotentní. Znovuzapnutí patří do stávající správy kupónů.

Infrastrukturní selhání zapisují korelovanou událost domény coupon bez URL, kódů a syrových chyb DB. Vytvoření, import a deaktivace používají stávající audit změn. Audit neukládá cílovou URL ani kód kupónu do nových auditních událostí. Stejně jako u ostatních admin změn případné selhání pomocného auditu nezruší již dokončenou změnu, ale hlásí jej stávající observability helper.

## Starý obchod a konfigurace

`NEXUS_TENANT_ID` musí být nastavený serverem. Chybějící/neplatný tenant selže uzavřeně. `COUPON_LINK_STOREFRONT_ORIGIN` nadále určuje HTTPS doménu pro nové odkazy. Nové `COUPON_LINK_LEGACY_ORIGINS` je seznam výslovně povolených původních originů oddělených čárkou, včetně schématu. Historický HTTP origin je povolen jen po výslovném uvedení; URL se nepřepisuje na dnešní HTTPS doménu.

Import přijímá pouze známou cestu `/eshop/kosik` (případně s koncovým lomítkem), parametry produkt/kupon/ks, bez duplicitních či dalších parametrů, přihlašovacích údajů a fragmentu. Nemá síťový přístup k uvedeným URL. Množství reprodukuje již existující legacy sémantiku `legacyQuantity`.

Import registru není import ani aktivace kupónů. Existující katalogový import ponechává staré kupóny draft; tento balík to nemění. Chybějící produkt/kupón je v evidenci viditelný jako nedostupný a nevytváří se náhradní sleva. Z odhadnutých kombinací produktů/kupónů se nevymýšlí seznam skutečně vytištěných QR. Původní URL je nutné dodat ze schváleného soukromého zdroje. Jejich funkčnost na skutečných historických hostech vyžaduje i správné existující edge přesměrování a schválenou migraci kupónů.

## Vlastní admin a testy

Jediný cílový admin `anastasia-admin` má v Poukazy a zľavy záložku QR kódy: seznam a hledání, tvorbu, detail, SVG/PNG stažení, import s povinným kontrolním náhledem a potvrzené vypnutí kupónu. Popisy jsou slovensky, stavy mají text a chyby role=alert; CSP se nerozšiřuje. Nový soubor `qr.mjs` je zahrnut v produkčním buildu. Storefront QR nyní používá serverové rozlišení SKU přes `/store/coupon-links`, nikoli hledání SKU jako handle. Množství pro staré odkazy normalizuje server (Int32/fallback, nejvýše999); neplatný kupón nebrání přidání dostupného produktu, ale žádnou slevu neudělí. Browser pamatuje vložení v kontextu konkrétního košíku, sdílí souběžné importy v jedné instanci a dovolí zopakovat aplikaci kupónu po přihlášení bez druhého vložení. Cena se stále jen čte ze serveru.

Staré Medusa `/app/coupon-links` zůstává kompatibilní se zachovaným POST URL/QR kontraktem, cílová evidence je ve vlastním SPA.

Cílené unit testy pokrývají stávající skutečný SVG/PNG renderer, URL a vstupy, admin hranice, tenantové ID, omezení importu/paginace, uložení původního odkazu při stažení a potvrzení vypnutí. Nový CI workflow `qr-admin.yml` spouští reálnou Medusu, vlastní syntetický PostgreSQL a skutečný NEXUS Worker kód v loopback mostu. HTTP test pokrývá souběžné generování/import, dry-run, nezávislé ORM/SQL čtení, tenantovou izolaci, zachovanou URL po změně originu, nové i staré odkazy přes Store preflight → košík → NEXUS serverovou cenu a zákaz resetu kupónu. Chromium testuje skutečnou QR komponentu proti tomuto živému Admin API, včetně stahování a dvoufázového importu, i skutečný storefront HTTP adaptér pro nový a starý odkaz a opakovaný sken. Běží na šířkách1440 a390 přes DevTools s reálným časem; čekání na ukončení prohlížeče po stahování souboru není důkaz dokončení testu. Stávající plná regrese zůstává nutná pro checkout a souběh limitovaného čerpání. Plné běhy se spouštějí jen v CI.

## Dosavadní ověření

Na zdroji `2e17a6d` prošel workflow QR integration (GitHub Actions run39154702407): skutečný PostgreSQL, Medusa, NEXUS most a Chromium na1440/390px. Prohlédnuty oba uložené screenshoty, bez vodorovného přetečení. Celá regrese na stejném zdroji run39154702405: backend1055/1055, NEXUS1235/1235, workerd142/142 a skutečný persistence runner PASS. Cílené QR unit60/60PASS; HTTP adaptér+mock48/48PASS po doplnění chyb sítě, historie jiného košíku a snižování starého množství nad99. Nová závěrečná CI doplní důkaz zachování již nenulového čerpání (tři použití vytvořená nativním registerUsage), nikoli pouze nuly. Výsledky nejsou potvrzením skutečné produkční migrace.
