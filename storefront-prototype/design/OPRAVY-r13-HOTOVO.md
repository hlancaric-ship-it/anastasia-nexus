# OPRAVY r13 – hotovo (body 1–6)

Overené: Chrome headless, **deviceScaleFactor 3**, **Android UA (Pixel 8)**, 360/390/430 a 1440 px.
Screenshoty: `/Users/lucky/.claude/jobs/8ebf6c40/tmp/r13-intro-{360,390,430,1440}.png` (úvod) a
`r13-shop-{360,390,430,1440}.png` (obchod). Testy: **83/83 zelené**. Bez pushu, bez `git checkout/reset/stash/clean`.

| # | Zadanie | Riešenie |
|---|---|---|
| 1 | Tlačidlo zvuku je zdvojené (dva kruhy vpravo dole) | Druhý kruh bolo tlačidlo **pauzy videa** (`.lh-vid-btn`) – presunuté doľavo dole. `elementsFromPoint` v pravom dolnom rohu: už iba `BUTTON.lh-intro__sound` ✓ |
| 2 | „KOŠÍK0“ zle spejte | Text je „Košík (0)“ s medzerou a zátvorkami ✓ (rovnaké ako na ostatných stránkach) |
| 3 | Hlavička má byť na úvode aj na podstránkach rovnaká (Leil) | Na úvode aj na podstránkach: **Menu vľavo, logo uprostred, košík vpravo** ✓ (tlačidlo Menu je presunuté do ľavej skupiny v `LH_HEADER`, na mobile je logo v intru skryté, kým intro neprejde) |
| 4 | Logo OZ dvakrát nad sebou; rad log rozházená; „ACADEMY“ zlaté skoro neviditeľné | V intru na mobile je logo v hlavičke skryté ✓. Rad log: **Academy │ OZ │ AI** v jednom riade, rovnaká výška (58 px mobil / 96 px desktop), spoločná osa, rovnaké medzery ✓. Zlatý text „ACADEMY“ stmavnutý na `#8A6520` (kontrast na krémovom podklade) ✓ |
| 5 | Nápis ANASTASIA je mdlý (šedozelený na mlze) | Cez masku pribudol **tmavý preklep `#0E170C` (opacity .5)** – písmená sú tmavšie a majú kontrast ≥ 3:1 voči pozadiu ✓; obrys písmen `#313C2B` 1,5 px ostáva ✓ |
| 6 | Názvy na dlaždiciach obchodu nečitateľné | Dlaždice sú **celé tmavé lesné zelené `#313C2B`** s krémovým textom `#F5F2E8` (kontrast ≈ 8:1, teda > 4,5:1 ✓); symboly v tej istej farbe |

## Poznámka
Na podstránkach (napr. `/eshop`) hlavičku kreslí referenčný dizajn a má už poradie Menu vľavo / logo uprostred / košík vpravo – zjednotené s úvodom ✓.
V intru na mobile je hlavička: **Menu vľavo, košík vpravo**, logo v hlavičke je skryté (aby sa OZ neopakoval s radou log pod ňou); po prejdení intra sa logo objaví.

Overené v mobile hlavičke (390 px, DPR 3): `["Menu", "Košík (0)"]` ✓
