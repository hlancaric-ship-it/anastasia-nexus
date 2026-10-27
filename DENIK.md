# Deník ANASTASIA — co je hotové a co chybí

Píše se průběžně při každé práci. Nejnovější nahoře.

## 25. 10. 2026

### Hotovo
- Nový úvod `/` (koncept) kompletně v SK, EN a RU, nasazený na test.
- Nákup bez registrace (host checkout) a rezervace konzultace hostem.
- Jednotkové testy webu: 162/162 prošlo.
- Prohlížečový test platby kartou proti Medusa Cloudu (Stripe TEST) prošel. Stripe se načte až v pokladně, objednávka se vytvoří.
- Klub je skrytý v bočním i horním menu na desktopu i mobilu. Stránka /klub a záložka v účtu zůstávají. Zapsané v DESIGN.md.
- Prohlížečový test menu: 566/566 prošlo, nasazeno.
- Jednotný design podstránek podle nového úvodu, kromě obchodu (`public/jednotny.css`, vlastní vrstva CSS, která má přednost před starými styly):
  - papírové pozadí
  - tenký Fraunces bez verzálek, kurzíva v levanduli
  - olivové pilulky
  - pásy krém, mlha a levandule
- Žádné oblouky na fotkách v podstránkách. Fotky v úvodu podstránek jsou obdélník na celou výšku. Oblouky odstraněny také na VOP a O Lucii (portrét, longevity, galerie).
- Kontrola screenshotů 1440 a 390: konzultace, supervízia, stacionár, RESET 40+, kontakt, VOP, Klub, O Lucii, přihlášení, 404.
- Jednotkové testy po změně: 162/162.
- Štítky nad nadpisy jsou psané větou, ne verzálkami (Konzultácie, Klub ANASTASIA). Značky ANASTASIA, AI a RESET zůstávají verzálkami. Překlady EN a RU fungují dál.
- Digitální objednávka už nedostane e-mail „odovzdali sme dopravcovi“. E-mail o odeslání chodí jen tehdy, když objednávka obsahuje fyzickou položku.
- Odkaz v e-mailu na objednávku už nevede na 404. Otevře účet na záložce Objednávky, a to i u starých e-mailů s adresou /ucet/order_…. Nepřihlášený zákazník jde na přihlášení a po přihlášení má tlačítko Zobraziť objednávku.

### Rozpracováno
- Nic.

### Chybí
- Obsah knihovny: RESET 40+ (17 videí) a Nic nemusíš (7 MP3) jsou v R2 `anastasia-media`. Výuka vedomého vnímania leží v R2 v Cloudflaru Lucie (ZIP od programátora nepotřebujeme). Je potřeba ji přenést do `anastasia-media` a napojit v knihovně.
- `test/browser.mjs` je stále napsaný na starý úvod a je potřeba ho přepsat.
- Na Cloud testu zůstal testovací produkt `testovaci-konzultace` bez kategorie.

## 25. 10. večer — detail produktu, košík, patička
- Detail produktu má jednu šablonu pro všechny typy (fyzický, digitální, poukaz, konzultace). Média jsou vlevo a nákupní panel vpravo. Varianty se vybírají jen přes select a vyprodané varianty jsou zakázané s textem „(Vypredané)“.
- Košík je rozdělený 2/3 položky a 1/3 sticky souhrn. Souhrn obsahuje progress na dopravu zdarma, zľavový kód, poukaz, rozpis s DPH a trust badges. Prázdný košík má prémiový stav.
- Nový veřejný endpoint `/store/nexus-checkout/free-shipping` vrací práh dopravy zdarma a ceny dopravy.
- Patička je v tmavé olivové `#182218`. Linky jsou zlaté s opacitou 14 %, loga a nadpisy sloupců v matném zlatě. Tlačítko Odoberať je levandulové a hover odkazů přechází do levandule. Texty jsou krémové na 70 %. Ikony výhod v obchodě jsou v matném zlatě.
- Ověřeno na testu na 1440 a 390: přidání do košíku 200, žádné chyby stránky, 162/162 testů.

## 25. 10. večer – hero, Obchod, opravy Home
- Hero Home má zlatou pečeť ANASTASIA nahoře uprostřed, čísla 30+/1/16 v jedné skleněné kapsli, směrové overlaye a zlatý eyebrow „Zdravý svet“. Karty 01–03 jsou editorial bez avatarů.
- Obchod pod dlaždicemi má krémovou plochu `#F6F0E1`. Levý sloupec s radio filtry a boční newsletter jsou pryč. Kategorie jsou pilulky Všetko, Kozmetika, Bylinky a výživa, Programy a služby, Darčekové vouchery. Aktivní pilulka je levandulová. Vpravo je řazení (cena, název) a hledání. Grid má 4 sloupce, na ≤1100 px 3 a na ≤900 px 2. Karty mají fotku 4:5, hover zoom a štítek typu (Fyzický produkt, Online program, Konzultácia, Darčekový poukaz).
- Home, karta Konzultácie: místo místnosti se stolem je portrét Lucie před zlatým ornamentem. Rám je klenutý jako u Obchodu a RESET 40+ a karta je v champagne gradientu. Vrstvené karty mají stín `0 -20px 40px rgba(0,0,0,.15)` a na nízkých displejích nižší výšku.
- Sekce Volám sa Lucia je svisle vycentrovaná ke kruhové kompozici a bez prázdného místa pod tlačítkem O Lucii.
- Poukaz končí vlastním paddingem a mezi poukazem a patičkou je zlatá linka 1px s opacitou 15 %.

## 25. 10. večer, Můj účet
- Video ani audio v účtu nehraje samo. Knižnica ukazuje plakát s ikonou Play a lekce se načte až po kliknutí. Ambientní zvuk webu v účtu nehraje.
- Levá lišta se sociálními sítěmi a jazyky je v celém účtu skrytá a obsah využívá plnou šířku.
- Rozložení je 65/35 v kontejneru 1152 px. Vlevo je obsah, vpravo rychlé akce a podpora s fotkou Lucie.
- Objednávky jsou karty s číslem, datem, stavem, náhledy, celkovou cenou a tlačítky Detail, Stiahnuť doklad a Zopakovať nákup. Sledování zásilky se zobrazí, jen když ho dopravce vrátí. Spodní pruh Objednať znova je pryč a oblíbené produkty jsou vpravo.
- Konzultace mají box Moje termíny nebo prázdný stav s výběrem typu konzultace, přípravou a častými otázkami.
- Chat má hlavičku s Luciou, zaoblené pole a levandulové tlačítko Odoslať.
- Poukazy jsou vizuální karty s kódem, uplatněním v košíku a PDF. Formulář na kód poukazu ho uplatní v košíku.
- Profil má mřížku dva a tři sloupce a barvu prostoru v jednom řádku.
- Zrkadielko má pilulky 1–10 s popisky Nízka, Vyvážená a Vysoká. Při úpravě záznamu jsou hodnoty předvyplněné.
- Otevřené: skutečná faktura potřebuje rozhodnutí o fakturačním systému, zatím je to tisknutelný doklad.

## 25. 10. 2026 – detail produktu: akordeony pod nákupním blokem
- Nahoře 2 sloupce: galerie (vertikálně vycentrovaná, výška = panel) a čistě nákupní panel (název, cena, sklad nebo aktivace, select, stepper, košík, výhody).
- Podrobnosti přesunuty pod nákupní blok přes celou šířku: 2 sloupce zavřených akordeonů, poslední (doprava, přístup, podmínky) široký. Platí pro všechny 4 typy (fyzický, digitální, poukaz, konzultace).
- Karty akordeonů: světlý podklad s blurem, 1px matně zlatá linka, radius 16.
- Ověřeno na testu v 1440 i 390, bez horizontálního scrollu. Testy 162/162.

## 25. 10. 2026 – mediální banka, sklad po variantách, nákupní řádek a lišta
- Admin produktu: tlačítko Vybrať z mediálnej banky s modálem (hledání, filtr, vícenásobný výběr, Priradiť vybrané fotografie (X)), pořadí fotek, hlavní fotka, odebrání bez mazání z knihovny.
- Admin variant: sloupec Skladom (ks) a přepínač Neobmedzené / digitálne u každé varianty. Uložení zakládá a propojuje skladovou položku, pokud chybí. Stará sekce Sklad jen odkazuje na varianty, aby si nastavení nepřepisovala.
- Detail produktu: select, stepper a tlačítko v jednom řádku, vše 44 px. Vyprodaná varianta vypne tlačítko a ukáže Vypredané. Ověřeno na Tvoj pleťový krém, kde Pánsky má 0 ks.
- Hlavní fotka je čtverec s radiusem 24 px bez deformace.
- Levá lišta nad světlým podkladem je tmavě olivová #1E261D se zlatým hoverem.
- Nasazeno na test, ověřeno v 1440 i 390, bez horizontálního scrollu. Testy 162/162.

## 25. 10. 2026 – Safari/iOS, mobilní lišta a čisté pozadí
- Rozmazané květiny a fotky v pozadí detailu, košíku a poukazu jsou pryč. Světlé plochy mají jen krémový podklad a vektorovou auru zlatých linek kolem 7 %, bez fixed pozadí (iOS ho neumí plynule).
- Všechna 100vh nahrazena 100dvh, ostatní výšky svh. Cookie lišta má vh jako zálohu pro staré prohlížeče.
- Hero a animované kontejnery mají translate3d, will-change a backface-visibility. ScrollTrigger ignoruje změnu výšky při skrytí lišty Safari.
- Blur (backdrop-filter) má všude i -webkit- variantu a mimo obrazovku se vypíná.
- Mobil: vedle Menu stálé ikony Košík s počtem a Môj účet. Otevřené menu zamkne scroll stránky.
- Levá lišta: aura linek se už nepočítá jako fotka, takže nad světlým detailem zůstává tmavě olivová.
- Ověřeno v Chrome s emulací iPhone 13 a v 1440. Skutečné Safari lokálně nejde (macOS 12 bez WebKitu), ověřit na iPhonu. Testy 162/162.

## 25. 10. noc – konzultácie, Kontakt, prihlásenie
- Všetky podstránky konzultácií a /konzultacie/rezervacia majú jednu šablónu: úvodná sklenená karta s fotkou, dĺžkou, formou a cenou, vedľa nej kalendár. Pod tým tri karty Pre koho, Ako stretnutie prebieha, Otázky a zrušenie termínu (podľa VOP 6.2 a 6.3).
- Kalendár: mesiac so zlatou bodkou pri dňoch s voľným termínom, potom časy, potom súhrn s cenou a Pokračovať k platbe. Bez „kontaktujte nás“. Voľné okná zadáva Lucia v admine (Kalendár), test ich zatiaľ nemá. Overené s podvrhnutými termínmi v 1440 aj 390.
- Výpis /konzultacie: 2×2 sklenené karty s fotkou, meta pilulkami a krátkym popisom pre koho.
- Kontakt: krémový podklad, karta s fotkou Lucie a kontaktmi so zlatými ikonami, formulár v samostatnej karte, bez vodoznaku. IČO, DIČ a IČ DPH pod sebou.
- Prihlásenie z e-mailu: bez medzistránky, hneď /ucet#prehlad alebo bezpečný ?redirect=, v účte 3 s toast. Chyba odkazu ponúkne nový odkaz.
- Testy 162/162, nasadené na test.

## 25. 10. noc – bočná lišta všade matne priehľadná
- Ľavá lišta už nemá vlastnú krémovú plochu. Má len jemný závoj (8–16 %) a rozmazanie 18 px, takže presvitá farba toho, čo je pod ňou.
- Tón sa číta aj z prechodov (patička), každá ikona podľa svojej výšky. Nad patičkou svetlé ikony, nad krémom tmavá olivová.
- Lišta obchodu (Kategórie, Vyhľadať, Košík, Môj účet) je sklo a nad patičkou sa plynulo skryje spolu s Menu.
- Audit všetkých stránok 1440 a 390: lišta všade priehľadná, bez vodorovného posunu, nič plávajúce nad patičkou.
- Dnes v stacionári: text v olivovej kapitole bol tmavý na tmavom, teraz svetlý. Jazyky SK/EN/RU v lište majú vlastný tón podľa podkladu.
- Klub skrytý: preč z menu (aj stĺpec „Kontakt“) a z patičky, stránka /klub zostáva bez odkazov.

## 25. 10. noc – platby a ďakovná stránka
- Platba kartou na teste overená tromi nákupmi (fyzický tovar, digitálny produkt, poukaz) v 1440 aj 390, objednávky 59–61 vznikli.
- Po úspešnej platbe presmerovanie na /dakujeme: číslo objednávky, položky, celková suma, čo bude ďalej podľa typu (knižnica, PDF poukazu, zásielka, dobierka, prevod), tlačidlá Moje objednávky a Pokračovať v nákupe.
- Platby s presmerovaním (banky) majú return_url na /dakujeme, objednávka sa dokončí tam, pri neúspechu ponuka zopakovať platbu.
- Stripe formulár je v slovenčine a vo farbách webu (krém, oliva, matné zlato).

## 26. 10. – prihlásenie a konzultácie
- /prihlasenie: krémový podklad s aurou zlatých liniek, vľavo organický sklenený tvar s pečaťou a zlatým svitom, vpravo sklenená karta s pill prepínačom, pill vstupmi a olivovým tlačidlom so zlatou šípkou.
- /konzultacie: zrušené generické karty. Každá konzultácia je sklenená karta s asymetrickým zaoblením, fotka v organickej maske prelínajúca sa do krému, číslo ako zlatý vodoznak (20 %), veľký serifový názov, parametre ako typografická linka s bodkami v šampanskej. Karty sa striedajú vľavo/vpravo, pod sekciou min. 128 px.
- Skip link už nikdy nepresvitá mimo fokusu.
- Darčekový poukaz v PDF: tmavá olivová A4, dvojitý zlatý rám, pečať, aura zlatých liniek, Fraunces a Figtree vložené (diakritika aj €), kód v zlatom rámčeku, platnosť podľa Bratislavy. Rovnaké PDF ide kupujúcemu do e-mailu aj na stiahnutie v účte.

## 26. 10. – pečať a DNA úvodu 1:1 (oprava po spätnej väzbe)
- Staré kruhové logo (BUSINESS / LIFE COACHING / MARTIAL ART) je odstránené z celého webu. Všade je len zlatá pečať ANASTASIA (`/assets/brand-seal.svg`, matne zlatá #C5A880 so šampanským svitom).
- Žiadne generické ovály ani bloby. /prihlasenie a /konzultacie berú presne triedy a tvary úvodu (kc): oblúková fotka 3:4, karty s radiusom 48 48 48 0, rovnaký tieň, sticky stoh panelov so striedaním levanduľa / oliva / hmla / gradient, pill tlačidlo s 1px linkou, rozloženie 58/42 v 1280 px.
- Prihlásenie: vľavo oblúková fotka Lucie (arabeska), cez roh olivový medailón s pečaťou, vpravo krémová karta.
- Hlášky „len po slovensky“ pri prepnutí jazyka zrušené, texty prihlásenia, konzultácií a poďakovania preložené do EN a RU.
- Kontrola impeccable (detect) na /prihlasenie a /konzultacie: zo 14 a 10 nálezov ostáva len logo Google Pay a kurzíva v nadpise podľa úvodu. Opravené kontrasty (zlaté čísla, fialový panel, sivé texty, placeholdery, patička), funkčný text min. 11 px (patička, lišta, menu), text cookies max. 60 znakov na riadok.

## 26. 10. – prehliadka stacionára, mobilná lišta, test celého webu
- Denný stacionár (/denny-stacionar-vysna-slana aj /ds-dnes): galéria je teraz „Prehliadka priestorov.“ v DNA úvodu, sticky stoh panelov so striedaním levanduľa / oliva / hmla / gradient, oblúková fotka 3:4, zlaté číslo. Použité všetky fotky priestorov (spoločenský priestor, poradňa, kreslá, šatňa, kuchynka, kávovar, linka), fotka z hlavičky stránky sa neopakuje. Texty preložené do EN a RU.
- Mobil (do 999 px): hore vľavo len tlačidlo Menu, košík a účet sú v menu. Ovládanie hudby je jazýček v pravom dolnom rohu schovaný do boku, po ťuknutí sa vysunie a panel sa otvorí smerom hore. Pri otvorenom menu je jazýček skrytý.
- Test 390 / 768 / 1440 px (úvod, e-shop, detail produktu, košík, konzultácie, prihlásenie, stacionár, účet, kontakt): bez chýb v konzole, nič nepreteká do strany, LCP 0,4–1,3 s. Úvod má 950 kB kvôli hero videu, ostatné 45–560 kB.
- Zabezpečenie: doplnené HSTS (1 rok) a Permissions-Policy (bez kamery, mikrofónu a polohy, platby len Stripe). CSP povoľuje analytiku Cloudflare, ktorú predtým blokovala. V builde nie sú žiadne tajné kľúče. Test ostáva noindex.

## 26. 10. – úvod pri obmedzenom pohybe, kategórie 1:1
- Úvod (preloader) stál, keď má návštevník v systéme zapnuté „Obmedziť pohyb“ (Windows: Zobrazovať animácie vypnuté). Teraz sa aj vtedy kategórie a značky striedajú, len jemne prelínajú bez posunu a rozmazania.
- Kategórie sú všade rovnaké ako v obchode na webe: Programy a služby, Biokozmetika, Zdravé doplnky výživy, Darčekové poukazy. Rovnaké názvy majú administrácia (testovacie jadro), menu, dlaždice a filtre obchodu aj úvod.
- V administrácii premenované AI ANASTASIA ACADEMY, BIOKOZMETIKA a Darčekové vouchery, poradie podľa menu. Kategória Konzultácie zrušená, jej 4 konzultácie sú v Programy a služby. Konzultácie ostávajú v menu ako služba so svojou stránkou.
- Úvod berie kategórie priamo z menu obchodu, nič sa nepíše ručne. Staré názvy kategórií web aj jadro stále rozpoznajú, aby nič nespadlo.

## 26. 10. – prihlásenie heslom a trvalé prihlásenie
- Podľa zmluvy sa majú zachovať funkcie existujúcich účtov a starý web mal prihlásenie heslom. Na /prihlasenie je preto e-mail + heslo a pod tým tlačidlo „Poslať prihlasovací odkaz na e-mail“.
- Heslo si zákazník nastaví alebo zmení v účte v časti Profil. Heslo patrí k tomu istému účtu ako odkaz, takže oba spôsoby vedú k tým istým objednávkam a knižnici. Zabudnuté heslo: pošle si odkaz a heslo zmení v Profile.
- Zákazník ostane prihlásený aj po zatvorení prehliadača: prihlásenie platí 30 dní a pri návšteve sa raz za deň predĺži. Odhlásenie ho okamžite zruší. Administrácia má platnosť bez zmeny.
- Ochrana: najviac 10 pokusov o heslo na e-mail a 30 na zariadenie za 15 minút, heslo 8 až 200 znakov, heslá sa nikde nelogujú. Samostatná registrácia heslom mimo účtu je zablokovaná, aby si nikto nemohol založiť heslo na cudzí e-mail.

### 26. 10. – zákazníci starého webu
- Heslo ze starého webu se nepřenáší (rozhodnutí ze zadání). Na přihlášení je věta pro zákazníky starého webu: e-mail a odkaz, objednávky a programy už v účtu jsou.
- Hláška při špatném hesle to vysvětluje. Texty jsou SK, EN i RU.

### 26. 10. – první přihlášení zákazníků ze starého webu
- 17 zákazníků ze starého webu je v systému od 22. 10. jako hosté s historií a přístupy. Registrace je ale zakládala znovu a přišli by o historii.
- Nová cesta `/store/customers/legacy-claim`: první přihlášení odkazem naváže identitu na existující záznam, účet se nezakládá znovu. E-mail se bere z ověřeného odkazu.
- Testy: backend 5 nových, web 1 nový.

### 26. 10. – PDF RESET 40+ v knihovně
- PDF jsou v soukromém bucketu `anastasia-paid-content-test` (111 kusů), video a audio v `anastasia-media`. Doručovací worker `anastasia-test-protected-media` četl jen druhý, takže PDF vracela 403. Teď hledá v obou.
- Na Cloud testu přidané proměnné `PROTECTED_R2_*` (stejné klíče jako `S3_*`).
- Ověřeno v Safari na účtu z přihlášení odkazem: knihovna ukazuje týden 1 se 7 PDF, PDF se otevře (200, application/pdf), video se přehraje (206).

### 26. 10. – placený obsah už není veřejný
- Videa RESET 40+ (17) a MP3 Nič nemusíš (A1 až A6) byly v `anastasia-media` s veřejnou adresou a šly stáhnout bez přihlášení. Zkopírovány do soukromého bucketu `anastasia-paid-content-test` (velikosti ověřeny), veřejné kopie smazány. Ukázka A0 zůstává veřejná.
- Ověřeno v Safari: video lekce se přehrává (206), v knihovně je 111 PDF.
- Starý web (správa médií, jen čtení): 111 PDF, stejně jako u nás. Soubor `Reset 40 Plus 1` je navíc, majitelka dříve potvrdila, že lekce 1 je `lekcia-00`.
- Video lekce 1: `Reset 40 Plus 1` ze starého webu (týden 1) nahráno do soukromého bucketu jako `lekcia-01.mp4`. `lekcia-00` je teď „Úvod“ (předmluva) a zůstává v týdnu 1. Registr knihovny na testu upraven přes admin, manifest v kódu srovnán. Ověřeno v Safari: týden 1 má Úvod a Lekci 1, přehrává se (206).

### 26. 10. – dokumentace k předání
- Balík `docs/predani` (8 dokumentů, slovensky) už existoval z 23. 10. Zkontrolovaný, bez zmínek Zoho, AWS a Codex.
- Aktualizováno: přihlášení heslem a 30 dní, převzetí účtu starého zákazníka, nové trasy API, soukromý bucket plateného obsahu a jeho proměnné `PROTECTED_R2_*`, limit 300 minut buildu, nové řádky v tabulce běžných situací.
- Zůstává otevřené: v dokumentech je produkce na Cloudflare Pages, test běží jako Worker se statickými soubory. Před ostrým nasazením sjednotit podle skutečného postupu.

### 26. 10. – e-mail z automatického vyplnění v telefonu
- V newsletteru v patičce (tmavě zelená) a v kruhu komunity v obchodě zmizel po vložení e-mailu z paměti telefonu text. Telefon obarví pole světle a text je krémový. Přidána pravidla `:-webkit-autofill` do `public/jednotny.css`, text i pozadí zůstávají tmavé.
- Android v tmavém režimu: automaticky vyplněný e-mail a heslo na přihlášení byly světlé na bílém. `color-scheme: light` a pravidla `:-webkit-autofill` pro všechna pole na světlé ploše (tmavý text, světlé pozadí) v `public/jednotny.css`.
- Objednávky v účtu na mobilu: spodní část karty objednávky (cena a tlačítka) měla tmavé olivové pozadí z obecného pravidla pro patičku. `.acc-order footer` má průhledné pozadí a dědí barvu (`public/jednotny.css`).
- Přihlášení: když je přihlášení na zařízení aktivní, ukáže to hláška nad formulářem (SK, EN, RU), aby se Môj účet nezdál jako obejití.
- Plynulost scrollu v účtu na Androidu: záznam obrazovky 12,7 s má jen dvě krátké zastavení (3 a 1 snímek), jinak plynulý. Mini košík jsem na Pixel 7 v tmavém režimu zkoušel, je v pořádku (fixní panel, obrázek 66 px). Nezastyleného košíku z 22:16 jsem nezreprodukoval, nejspíš načtení stránky během nasazení.
- Trhaný scroll na Androidu (video z 22:15): z videa vychází nerovné kroky (0, 16, 48, 0, 18, 50, 43, 60 px na snímek), tedy zahozené snímky a dohánění. V laboratoři (Chrome, Pixel 7, 4× zpomalení) se příčina nenašla: málo malování, rasterizace i layoutu, obrázky malé. Přidán testovací přepínač efektů `?fx=a|b|c|all|off` (a = blur a filtry, b = stíny, c = animace a dekorace, all = vše). Po vyhodnocení na telefonu odstranit z `app.mjs` a `jednotny.css`.
- Scroll na telefonu změřen přímo v Chrome na Xiaomi (ladění přes USB, synthesizeScrollGesture): stránky webu (úvod, obchod, účet, VOP) nemají horší průběh snímků než prázdná textová stránka. Vypnutí blur, stínů a animací nic nezměnilo. Trhaný obraz ve videu z 22:15 je nejspíš dopad nahrávání obrazovky. Testovací přepínač `?fx=` odstraněn.
- Přihlášení: točící se pečeť je zlatá (byla tmavá na tmavém kruhu). Pravidlo musí být v `@layer jednotny`, protože `!important` mimo vrstvu prohrává s `!important` ve vrstvě.
- Edge worker webu ukazoval proměnnou `API_ORIGIN` na starý testovací server. Přepnuto na backend v Medusa Cloud (`ops/test-predani/web.wrangler.jsonc`).
- Platba kartou: v pokladně na Androidu se vedle Karty nabízely Bancontact, MB WAY a Link (zapnuté v účtu Stripe, `automaticPaymentMethods: true`). Smlouva počítá s kartou, Apple Pay a Google Pay. PaymentIntent pro kartu teď dostává `payment_method_types: ["card"]` (peněženky jsou typ card), `backend/src/api/store/nexus-checkout/options/route.ts`.
- Stripe (testovací režim, výchozí konfigurace platebních metod): Google Pay byl vypnutý, proto se v pokladni na Androidu nenabízel. Zapnut Google Pay, vypnut Link. Apple Pay byl zapnutý. Ověřeno na telefonu: v pokladně jsou záložky Karta a Google Pay, bez Linku, Bancontactu a MB WAY. Platbu samotnou (potvrzení ve Wallet) musí potvrdit člověk. Před ostrým provozem stejné nastavení zopakovat v živém režimu Stripe, u Apple Pay přidat doménu.
- Pokladna: přihlášenému zákazníkovi se předvyplní jméno, příjmení, e-mail a adresa (z profilu nebo z uložené adresy, i ze starého webu). Hosté a už napsané hodnoty se nemění. `getCheckoutProfile` v `http.mjs`, volání v `app.mjs`. Ověřeno: přihlášený má pole vyplněná, host prázdná.

### 27. 10. – odevzdání Fáze 1
- Lucia už je v administraci a nastavila si nové heslo, takže testování fakticky běží. Datum předání do testování v protokolu: 27. 10. 2026, lhůta 7 dní končí 3. 11. 2026.
- Přidána příloha č. 1 `docs/predani/08-TESTOVACIE-SCENARE.md` (slovensky, vykání, s políčky k odškrtnutí). Protokol vyplněn a odškrtnut, kromě řádku „Opravy z auditu“, který jsem neověřoval.
- Platby (karta, Apple Pay, Google Pay) Lucky otestoval na telefonu, funguje to.
- OPRAVA (27. 10.): zákaznické heslo na e-mailu administrátora rozbilo přihlášení do administrace. Přihlášení e-mailem a heslem je v Medusa sdílené pro zákazníky i administrátory podle e-mailu. `POST /store/customers/me/password` heslo administrátora smazalo a přesunulo na zákaznickou identitu, takže přihlášení do administrace vracelo zákaznický token (200) a administrace odpověděla 401. Teď se heslo administrátora nemaže, identita dostane `customer_id` i `user_id` a stejné heslo platí pro obě role. Opakované nastavení hesla v Profilu stávající poškození opraví. Testy 11/11.
- Přihlášení do administrace se po rozbití sdíleného e-mailu opraví samo: před přihlášením `/auth/user/emailpass` se identita držící heslo tohoto e-mailu propojí s administrátorem (`healSharedAdminLogin`). Heslo se tím neobchází. Testy 40/40. Uživatel už nemusí nic nastavovat v Profilu.

### 27. 10. – staré kupóny a QR kódy
- Ze starého webu (snímek DB z 5. 10.) jsou 3 kupóny: `Montelope` (pevně −20 €, jen RESET 40+, platí 17. 9. až 31. 12. 2026, aktivní), `ZK01` a `ZK02` (10 %, vypršely). V testu byl jen `TEST10`. Všechny tři vytvořeny v administraci přes API, ZK01 a ZK02 jako neaktivní.
- QR odkazy: nový systém generuje stejný tvar adresy jako starý web (`/eshop/kosik?produkt=KÓD&kupon=KUPÓN&ks=1`). Tři staré QR adresy (Montelope, ZK01, ZK02) naimportovány do registru QR (`/admin/coupon-links/import`, zdroj legacy).
- Oprava webu: QR adresa nese SKU (`EP.002`), web ale hledal produkt podle adresy a vrátil „Produkt sa nenašiel v katalógu“. `variantFor` teď zkusí SKU. Test `qr-sku.test.mjs`.
- Oprava ceny: testovací NEXUS worker neznal pevnou slevu (kupón Montelope se přijal, ale cena zůstala 168 €). Nasazen aktuální kód workeru. Kupón teď dává 148 €, vypršelý kupón je zamítnut. V `nexus/wrangler.jsonc` je pro `anastasia-test` zástupná hodnota KV (`REPLACE_WITH_ANASTASIA_TEST_KV_NAMESPACE_ID`), proto jsem nasadil s dočasnou konfigurací bez KV vazby (politika ceny jde přes tajemství).
- Otevřené: skutečný seznam kupónů z živého starého webu. Snímek DB je z 5. 10., po něm mohly přibýt další.
- Zvuk na iPhonu byl přeřvaný: iOS ignoruje hlasitost prvku `<audio>` (vždy 100 %), cílová hlasitost 0,6 se tam nikdy neuplatnila. Ambient teď dostává na iPhonu hlasitost přes Web Audio zesílení (`bindVolume` v `ambient.mjs`, `bindIosVolume` v `app.mjs`), takže platí 0,6 a funguje i prolnutí částí. V ostatních prohlížečích se nic nemění. Neověřeno na iPhonu. Test `ambient.test.mjs` 11/11.
- Upozornění pro správce (nová objednávka, kontakt, rezervace, chat) lze nastavit jako seznam adres oddělený čárkou nebo středníkem (`ORDER_NOTIFY_EMAIL`, `CHAT_ADMIN_NOTIFY_EMAIL`, `CONTACT_NOTIFY_EMAIL`). `sendEmail` posílá každému příjemci zvlášť s vlastním idempotentním klíčem a výpadek jednoho neblokuje ostatní. Testy 66/66. Na Cloudu nastaveno: objednávky Lucii, chat a kontakt Lucii i Luckymu.

### 27. 10. – požadavky z hovoru s Lucií
- **Osobní odběr je lékárna.** Adresa a název osobního odběru: „Zdravá lekáreň, Sokolská 88, 960 01 Zvolen“ (kód, e-mail, zakládací skript, živá možnost dopravy v administraci). Text na děkovací stránce říká, kde si objednávku vyzvednout.
- **QR kód na bankovní účet.** Objednávka s platbou převodem dostane QR kód PAY by square (slovenské banky) a pro české banky QR platbu SPAYD. Zobrazí se na děkovací stránce s IBAN, variabilním symbolem a částkou a jde v příloze `QR-platba-<VS>.png` v potvrzovacím e-mailu. Nová závislost `lzma` (MIT, čistý JS). Ověřeno nezávislým dekodérem v Pythonu (délka a CRC sedí). **Neověřeno v aplikaci banky**, je potřeba naskenovat v telefonu.
- Otevřené z hovoru: faktura (doklad k objednávce) a šablona newsletteru podle Lucie (font, barvy, logo).
- **Faktura** (27. 10.): PDF faktura (daňový doklad pro zaplacené, zálohová faktura pro nezaplacený převod), číslo `FA` + rok + číslo objednávky na 6 míst, prodejce LUCRAT, rekapitulace DPH podle sazeb z daňových řádků objednávky. Odchází jako příloha potvrzovacího e-mailu a e-mailu o přijaté platbě, v administraci je tlačítko „Faktúra“ vedle Štítku a Dodacího listu, v účtu zákazníka „Stiahnuť faktúru“ (ne u historických objednávek). Trasy `GET /admin/orders/:id/invoice` a `GET /store/orders/:id/invoice` (jen vlastník). Testy faktury a e-mailu zelené. Neověřeno právním ani účetním pohledem, má schválit Lucia nebo účetní.
- **Dotazník k newsletteru** pro Luciu: `docs/DOTAZNIK-NEWSLETTER-PRE-LUCIU.md` (A až H, limity znaků, kam fotografie, videa).
