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

### Rozpracováno
- Nic.

### Chybí
- Některé nadpisy nad titulkem mají verzálky přímo v textu (KONZULTÁCIE, KLUB ANASTASIA). Text upravit v obsahu, ne v CSS.
- Obsah knihovny ze starého webu (nic-nemusis, vyuka-vedomeho-vnimania, reset-40-plus). Potřebujeme kompletní ZIP od programátora starého webu.
- `test/browser.mjs` je stále napsaný na starý úvod a je potřeba ho přepsat.
- Na Cloud testu zůstal testovací produkt `testovaci-konzultace` bez kategorie.
