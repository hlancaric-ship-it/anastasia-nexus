# OPRAVY r20 – HOTOVO (vady po r19)

Opravených všetkých 5 bodov QA Claudea. Commit: `481b8fa` (nepushnutý).

## 1. Mobil 390 – rozbitá hlavička

Príčina: staré `styles.css` (vrstva `layer(legacy)`) dávalo hlavičke na mobile vlastnú
„pilulku“ – rám `1px solid rgba(255,255,255,.22)`, `border-radius:14px`, okraj 8/10 –
a položka „KOŠÍK (0)“ bola v druhom stĺpci mriežky, takže spadla na druhý riadok cez video.

- `src/home-lh.mjs`: mobilná mriežka `auto minmax(0,1fr) auto`, košík do 3. stĺpca
  (`.lh-top__side--right{grid-column:3}`), logo centrované (`.lh-top__brand{justify-self:center}`).
- `public/styles.css`: override rámca/zaoblenia hlavičky. Musí byť **v tej istej vrstve**
  (`layer(legacy)`) – významnosť vrstiev je obrátená, takže `!important` z nevrstvovaného
  CSS by nestačil.

Merané (po „Vstúpte“): hlavička 10/8/300×44, `border: 0`, `border-radius: 0`, položky
v jednom riadku (Menu y=8, logo y=15, košík y=23) – overené na **320 / 360 / 390 / 430 px**.

## 2. Desktop – menu prosvítalo cez stránku

Zatvorené menu bolo skryté iba `opacity:0` + `pointer-events:none`, takže jeho text
(Astrológia, INFORMÁCIE, O Lucii, Zdravá lekáreň…) bol vidieť cez obsah pod hlavičkou.

- `public/app.mjs`: `MENU` má novú premennú `v` (`--side-v`, `--top-v`) a `setMenu()` ju
  nastavuje na `visible`/`hidden`.
- `public/styles.css`: `#dc-side-menu, #dc-top-menu{visibility:var(--…-v,hidden)!important}`.

Overené: zatvorené menu = `visibility:hidden` (oba panely), po kliknutí na „Menu“ = `visible`
(`r20-1440-menu-otvorene.png`).

## 3. Cookie lišta – uvozovky

V lište sa text zobrazoval s „ a “. Teraz sa renderuje `plainBanner` (bez úvodzoviek);
detailný odkaz „Podrobnosti nájdete v …“ ostáva v paneli nastavení.

## 4. Cookie lišta – zástupný text

- V lište sa odstráni **len** úsek „ na [doplní prevádzkovateľ]“ – zvyšok vety je
  doslovne rovnaký (nič nevymýšľané).
- V paneli kategórií Analytické/Marketingové je namiesto zástupného textu **žiadny popis**.
- Právna stránka `/cookies` ostáva beze zmeny.

## 5. Cookie lišta nesmie prekrývať úvod

Lišta sa na domovskej stránke zobrazí až vtedy, keď je koniec úvodu pod viewportom
(teda po skone úvodu alebo po prvom scrollu) – s rovnakým plynulým prejavom
(`animation: cookie-banner-in .4s`). Sleduje to `MutationObserver` na triede `lh-chrome-in`
aj udalosť `scroll`.

Merané: po „Vstúpte“ (pred scrollom) je lišta **skrytá**, po scrollu sa zobrazí
(koniec úvodu je o 356 px nad viewportom) → nad úvodom už nikdy nie je.

## Overenie

- Testy: `ANASTASIA_OFFLINE_FIXTURES=1 node --test --test-timeout=90000 test/*.test.mjs` → **98/98 pass**
  (upravené porovnanie textu lišty v `test/cookie-consent.test.mjs`).
- QA crawler všetkých 71 rout + 404 na 360/390/430 px, DPR 3 → **„OK: žádné chyby“**.
- Screenshoty: `~/.claude/jobs/8ebf6c40/tmp/r20-*.png`
  (`r20-390|320|360|430-home-uvod`, `-home-po-vstupe`, `-home-pata`, `-odstupenie`,
  `r20-1440|1920-home-uvod`, `-home-pata`, `-odstupenie`, `r20-1440-menu-otvorene`).
