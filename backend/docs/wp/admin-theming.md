# Osobní vzhled nového adminu

Stav: IMPLEMENTED_UNVERIFIED do dokončení nového browser/HTTP CI. C5 obchodní obrazovky nejsou tímto balíkem dokončené. Nový vlastní admin nepřebírá admin-demo ani nativní Medusa editory.

## Výsledek a ovládání

Nová vlastní stránka `/vzhlad-administracie` (v administraci pod jejím nakonfigurovaným prefixem) nabízí pět voleb: **Pôvodná ANASTASIA**, Lesná, Vínová, Nočná, Vlastné farby. Výchozí je původní motiv. Vlastní barva navigace a hlavních tlačítek má hex vstup i barevný výběr; text automaticky dostane čitelnou barvu. Volí se i vzdušné/kompaktní rozložení, bez zmenšení tlačítek pod 44 px.

Původní veřejné styly byly přečteny 16. 10. 2026: [content.min.css?v20](https://www.anastasiaoz.eu/Styles/css/content.min.css?v20), [ecommerce.min.css?v8](https://www.anastasiaoz.eu/Styles/css/ecommerce.min.css?v8). Header používá přechod `#73729c` → `#a7a5cf`, světlá barva `#e9e9f2`, obchodní modrá `#184987`, text `#1a1919`. Barevná identita se zachovává; původní slabý kontrast bílého textu na světlé fialkové se nepřebírá. Nejde o kopii staré struktury/písma webu ani jeho administrace.

Volba se ukládá k autentizovanému Medusa userovi v PostgreSQL, nikoli pouze v localStorage. Náhled je jasně oddělený od uložení, reset nejprve pouze mění náhled. Po uložení server znovu čte autoritativní záznam. Výpadek, neplatná odpověď a konflikt neukazují úspěch; UI ponechá náhled a vyžádá načtení uloženého stavu před dalším pokusem. Neodesílá zápis automaticky podruhé.

## API, izolace a souběh

- `GET /admin/my-theme`: vlastní `selection`, `revision`, odvozené bezpečné barevné tokeny. `Cache-Control: no-store`. Nevrací user profil ani ostatní metadata.
- `POST /admin/my-theme`: `{ selection: { scheme, accent, navigation, density }, revision }`. Žádné cílové user ID, libovolné CSS ani další pole. Jen přesně ověřené hex barvy a povolené hodnoty.
- User z `auth_context` je jediný cíl. Anonymní a customer autorita jsou odmítnuty. Backend ukládá pouze `metadata.anastasia_admin_theme`, zachová ostatní metadata.
- Zápis má nativní lock podle user ID, porovnání revize, read-back a běžný redigovaný audit po úspěchu. Shodná již uložená volba vrátí `replayed: true` bez dalšího zápisu. Odlišný zastaralý zápis vrátí 409.
- Ochrana revizí a lock koordinují tento konkrétní endpoint. Libovolný jiný přímý nativní zápis do stejného user metadata nemusí používat tentýž lock. Audit je existující best-effort mechanismus; není vydáván za atomický s obchodní změnou. Distributed lock závisí na nasazeném provideru; proces/Redis restart není tímto testem doložený.

## Vizuální rozsah a další stránky

`AdminThemeFrame`, `useAdminTheme` a sdílené styly jsou základ všech nově vznikajících vlastních obrazovek. Upravují plochu, text, navigaci, tlačítka, pole, autofill, chyby, potvrzení a fokus. Nativní historické/reference stránky Medusy se tímto balíkem globálně nepřebarvují. Osobní motiv obsluhy nemění brand/customer-facing barvy e-shopu a dalších webů; jejich editace má samostatnou agendu.

Jeden admin musí spravovat e-shop, anastasia.academy a aianastasia.com s kontextem webu pro obsah; zákaznice, objednávky a přístupy zůstávají společné podle architektury. Uživatelka sama přidává kategorie, stránky a sekce a vizuálně upravuje texty, obrázky, pořadí a rozložení, s konceptem/náhledem/verzemi/publikací. Tento balík neposkytuje zatím chybějící CMS API a nevydává náhled vzhledu za vizuální editor webů. Úplné návaznosti: [mapa agend](ADMIN-FUNKCE-A-POKRYTI.md).

## Ověření

Lokální cílené policy/API testy: 23/23 PASS před finální typovou opravou testu; finální opakování a oba TypeScript checky následují. Mimo jiné kontrast všech textových párů min. 4,5:1, všech 256 odstínů šedi pro vlastní barvy, odmítnutí CSS injection, vlastní účet, zachování metadata, replay a konflikt revize.

Browser fixture spouští skutečnou React obrazovku v Chrome se syntetickým HTTP transportem, ve StrictMode a při 1440/390 px. Není důkazem DB persistence. Lokální headless Chrome na tomto Macu dvakrát nedoběhl (`CVDisplayLinkCreateWithCGDisplay failed`, po 60 s ukončen). Browser výsledek není označen PASS; workflow jej ověří na Linuxu a uloží snímky. Proces a dočasný profil fixture se uklízejí.

Samostatný `admin-theme.yml` používá syntetickou PostgreSQL service a skutečný Medusa server/auth/users API pro test vlastního profilu, odmítnutí cizího ID, persistenci, read-back, replay a souběh dvou různých revizních změn. Vstup suite je CI-only a vyžaduje specifického syntetického DB uživatele a název DB. Nesahá do Claudova HTTP runneru/middleware. Lokální PG/HTTP ani plné testy se nespouštějí; širší regrese jen existující CI. Nic se nenasazuje ani neslučuje automaticky.
