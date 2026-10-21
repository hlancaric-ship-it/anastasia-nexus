# OPRAVY r17 – HOTOVO (desktop intro + boční lišta)

Cieľ: desktop intro bez prekryvu log, kategória centrovaná, a **na desktope len JEDNO Menu**
(v hlavičke, kým bočná lišta nie je vidieť; po jej objavení v hlavičke plynule zmizí a zostane
len Menu v lište – presne ako na /kosik). Mobil 390 bez zmeny.

## 1. Body 1–4 – desktop intro

| # | Zadanie | Príčina | Riešenie |
|---|---|---|---|
| 1 | Logo v hlavičke leží PREZ radou troch log | v `src/home-lh.mjs` bola **pretrhnutá CSS rule** `.lh-intro-page:not(.lh-chrome-in) ` (selektor bez deklarácie) – prehliadač ju zahodil, logo v hlavičke nikdy nezmizlo | rule doplnená: `.lh-intro-page:not(.lh-chrome-in) .lh-top__brand{opacity:0;visibility:hidden}` + na desktope rada log `top:clamp(112px,11vh,150px)` → **medzera pod hlavičkou 48 px (1440) / 55 px (1920)** |
| 2 | Rada log: rovnaká výška, jedna osa, OZ bez textu nad sebou | text „ANASTASIA / LIGHT FOR THE FUTURE“ patril hlavičke visiaci nad stredným logom OZ | logo v hlavičke sa počas úvodu skryje (bod 1); rada má `.lh-brand--*{height:96px}` + `align-items:center` → **všetky tri logá majú cy = 93 px (1440) / 102 px (1920)** |
| 3 | „Kozmetika na mieru“ visí vľavo hore a bledé | `.lh-cat--1..4` mali vlastné absolútne pozície (`top:16vh;left:9%` …) a shimmer gradient | na desktope všetky štyri rotujúce kategórie: `top:62vh;left:0;right:0;text-align:center` + `-webkit-text-fill-color:#313C2B` (bez shimmeru). **Stred = 720 px (1440) / 960 px (1920) = presne stred obrazovky, farba rgb(49,60,43) = #313C2B** |

## 2. Body 5–6 – bočná lišta a jedno Menu

Rozhodnutie Luckyho: „na desktopu je len JEDNO Menu – dokud lišta není vidět, je Menu v hlavičce;
jakmile se lišta objeví, Menu v hlavičce plynule zmizí, zůstane jen Menu v liště“.

| Požiadavka | Stav |
|---|---|
| 5a lišta sa objavuje plynule (opacity + translateX, ~400 ms) | `.lh-intro-page #ana-rail{opacity:0;transform:translateX(-14px);transition:opacity .4s,transform .4s}` → `.lh-intro-page.lh-chrome-in #ana-rail{opacity:1;transform:none}` (prechod skrátený z .6 s na .4 s) |
| 5a v intru a na prvej obrazovke za ním lišta nie je | počas úvodu: `rail opacity = 0` ✅ (merané); po úvode sa objaví (`opacity = 1`) |
| 5b zdvojené ovládanie – len jedno Menu | nové pravidlo (len desktop ≥ 761 px): `.lh-intro-page .lh-top__menu{transition:opacity .4s}` + `.lh-intro-page.lh-chrome-in .lh-top__menu{opacity:0;pointer-events:none}` → **hlavička: Menu opacity 1 → 0, lišta: Menu viditeľné**. Plovúci zvuk sa s lištou tiež skrýva (`.lh-chrome-in .lh-intro__sound{opacity:0}`) |
| 5c žiadny skok layoutu | obsah sa neposúva skokom: `padding-left` pre `.dc-root` má teraz `transition:padding-left .4s` (odsadenie sa dojazdí plynule) |
| 6 homepage ako /kosik | po úvode: lišta + hlavička, žiadne plovúce tlačidlá navyše ✅ |

**Na mobilu 390 je všetko bez zmeny** (media query `min-width:761px` + `pointer:fine`): lišta tam
neexistuje, Menu v hlavičke ostáva viditeľné (opacity 1), kategória si ponechala mobilné umiestnenie
a shimmer.

## 3. Overenie (merané v headless Chrome)

| Viewport | hlavička | rada log (medzera) | kategória | rail | Menu v hlavičke |
|---|---|---|---|---|---|
| 1440×900 | 64 px, fixná | y = 112 (**48 px pod hlavičkou**) | stred 720 px, #313C2B | 0 → 1 | 1 → 0 |
| 1920×1080 | 64 px, fixná | y = 119 (**55 px pod hlavičkou**) | stred 960 px, #313C2B | 0 → 1 | 1 → 0 |
| 390×844 | 44 px | y = 62 (10 px, bez zmeny) | stred 195 px, shimmer | bez lišty | 1 (bez zmeny) |

Screenshoty: `~/.claude/jobs/8ebf6c40/tmp/r17-final-*.png`
(`r17-final-intro-1440/1920/390`, `r17-final-za-intro-1440/1920`, `r17-final-scroll1-3-1440/1920`,
`r17-final-mobile-after-390`)

- Testy: `ANASTASIA_OFFLINE_FIXTURES=1 node --test --test-timeout=60000 test/*.test.mjs` → **83/83 pass**.
- QA crawler všetkých 69 rout + 404 na 360/390/430 px, DPR 3 → **„OK: žádné chyby“**.
- Build: 69 statických strán.
- Výkon úvodu (`/`, 390×844, Fast 3G, CPU 4×): LCP **2 316 ms**, DCL **2 239 ms**, CLS **0,027**.

## 4. Poznámky

- Body 1–3 (desktop intro) boli opravené v commite `ba37bc7`; pri tom sa pokazilo pravidlo
  `.lh-intro__brands` (media query vložený doprostred deklarácie) – opravené v `r17/5`.
- Body 5–6 sú v tomto commite.
