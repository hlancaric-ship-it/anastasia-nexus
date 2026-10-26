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
