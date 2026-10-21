# OPRAVY r17 – HOTOVO (desktop intro)

Cieľ: desktop intro nesmie byť rozbitý (prekryv loga v hlavičke s radou troch log,
bledá kategória vľavo hore) a mobil 390 nesmie sa pokaziť.

## 1. Body 1–3 (opravené)

| # | Zadanie | Príčina | Riešenie |
|---|---|---|---|
| 1 | Logo v hlavičke leží PREZ radu troch log | v `src/home-lh.mjs` bola **pretrhnutá CSS rule** `.lh-intro-page:not(.lh-chrome-in) ` (selektor bez bloku) — prehliadač ju zahodil, takže logo v hlavičke nikdy nezmizlo | rule doplnená: `.lh-intro-page:not(.lh-chrome-in) .lh-top__brand{opacity:0;visibility:hidden}` (logo v hlavičke je počas úvodu skryté, objaví sa s `lh-chrome-in`) + na desktope rada log posunutá na `top:clamp(104px,11vh,150px)` (≥ 48 px pod hlavičkou) |
| 2 | Rada log: rovnaká výška, jedna osa, OZ bez textu nad sebou | text „ANASTASIA / LIGHT FOR THE FUTURE“ patril hlavičke, ktorá visela nad stredným logom OZ | odstránené skrytím loga v hlavičke (bod 1); rada má už `.lh-brand--*{height:96px}` + `align-items:center` → jedna osa |
| 3 | „Kozmetika na mieru“ visí vľavo hore a bledá | `.lh-cat--1..4` mali vlastné absolútne pozície (`top:16vh;left:9%` …) a shimmer gradient | na desktope (`min-width:761px` + `pointer:fine`) všetky štyri rotujúce kategórie: `top:62vh;left:0;right:0;text-align:center;color:#313C2B` (centrované pod slovom ANASTASIA, plná farba, bez shimmeru). Mobil si ponechal vlastné pravidlá (`.lh-cat{bottom:0;text-align:center}`) |

## 2. Bod 4 – overenie

Screenshoty: `~/.claude/jobs/8ebf6c40/tmp/r17-fix2-*.png`

| Viewport | Súbor | Stav |
|---|---|---|
| 1280×720 | `r17-fix2-intro-1280.png` | OK – bez prekryvu, kategória centrovaná |
| 1440×900 | `r17-fix2-intro-1440.png` | OK |
| 1920×1080 | `r17-fix2-intro-1920.png` | OK – logo v hlavičke skryté, rada log pod hlavičkou, kategória pod slovom |
| 2560×1440 | `r17-fix2-intro-2560.png` | OK |
| 390 mobil | `r17-fix2-mobile-390.png` | OK – mobil nezmenený (kategória ostáva dole, rada log na svojom mieste) |
| scroll 900 px | `r17-fix2-scroll-*.png` | stav po skrole (lišta + hlavička) |

Testy: `ANASTASIA_OFFLINE_FIXTURES=1 node --test --test-timeout=60000 test/*.test.mjs` → **83/83 pass**.
Build: 69 statických strán.

## 3. Body 5–6 (boční lišta) – stav

- Lišta sa na úvode už skrýva (`.lh-intro-page #ana-rail{opacity:0;transform:translateX(-14px)}`) a po úvode
  sa zjaví s prechodom (opacity + translateX, `.6s`) – `.lh-intro-page.lh-chrome-in #ana-rail{opacity:1;transform:none}`.
  Obsah sa neposúva (`.lh-intro-page.lh-chrome-in .dc-root{padding-left:var(--rail-pad)}` je jediný posun).
- Plovúce tlačidlá (zvuk) sa s lištou skryjú (`.lh-chrome-in .lh-intro__sound{opacity:0}`).
- **Nedokončené:** zdvojenie ovládania „Menu“ (v hlavičke aj v lište) – treba rozhodnúť, ktorý
  z nich sa v úvode a po ňom skryje, aby bol vždy len jeden. Zatiaľ je v hlavičke aj v lište.
  Toto je bod 5b a zostáva na doplnenie (bez zásahu do mobilu, kde lišta nie je).
