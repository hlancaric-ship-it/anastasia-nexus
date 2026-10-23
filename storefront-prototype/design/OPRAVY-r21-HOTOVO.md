# OPRAVY r21 – HOTOVO (vady po r20)

Opravené oba body QA Claudea. Commit opravy: `61adcb7` (nepushnutý).

## 1. Desktop – menu prosvítalo pod hlavičkou

Nález prvku (podľa `document.elementsFromPoint(800,74)` na 1440×900 po scrollu na koniec):
**nejde o `#dc-top-menu`**, ale o **pätku stránky** (`<footer id="kontakt">`) – jej stĺpec
„Informácie“ (O Lucii, Zdravá lekáreň, Denný stacionár Vyšná Slaná, Môj účet, Kontakt) a
„Sprevádzanie“ (Astrológia) ležal pod fixnou hlavičkou a **presvietal cez jej priehľadné
pozadie** (`rgba(245,242,232,.9)` = 10 % priehľadnosti).

- `public/styles.css`: `.lh-top--solid` má teraz nepriehľadnú plochu `#F5F2E8`
  (hĺbka zostáva na `backdrop-filter: blur(10px)`). Pravidlo musí byť v tej istej vrstve
  (`layer(legacy)`), lebo významnosť vrstiev je obrátená.

Merané: hlavička po scrollu `background: rgb(245,242,232)` (plne nepriehľadná) na
**1440 aj 1920**, s hoverom aj bez hoveru (`r21-1440-home-pata.png`,
`r21-1440-home-pata-hover.png`, `r21-1920-home-pata.png`).

## 2. Mobil – „KOŠÍK (0)“ nečitateľný na úvode

Tmavý text na svetlom videu sa v lese ztrácal. Košík dostal **rovnakú pilulku ako
„Menu“** (jediný štýl, žiadny zdvojený obrys – rám hlavičky je od r20 nulový).

- `src/home-lh.mjs` (mobilný blok): `.lh-top__side--right>a[aria-label="Košík"]` →
  `display:inline-flex`, `min-height:44px`, `padding:0 16px`, `border-radius:80px`,
  `border:1px solid rgba(255,255,255,.22)`, `background:rgba(255,255,255,.09)`,
  `backdrop-filter: blur(14px)`.

Merané (320/360/390/430 px): košík 44 px vysoký, `background rgba(255,255,255,.09)`,
`border 1px solid rgba(255,255,255,.22)`, `radius 80px` – totožné ako „Menu“;
hrana hlavičky `0px` (žiadny zdvojený obrys). Screenshoty `r21-390-po-vstupe.png` (+ 320/360/430).

## Overenie

- Testy: `ANASTASIA_OFFLINE_FIXTURES=1 node --test --test-timeout=90000 test/*.test.mjs` → **98/98 pass**.
- QA crawler všetkých 71 rout + 404 na 360/390/430 px, DPR 3 → **„OK: žádné chyby“**.
- Screenshoty: `~/.claude/jobs/8ebf6c40/tmp/r21-*.png`
  (`r21-1440|1920-home-pata`, `r21-1440-home-pata-hover`, `r21-320|360|390|430-po-vstupe`).
