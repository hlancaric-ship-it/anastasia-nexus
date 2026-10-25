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
