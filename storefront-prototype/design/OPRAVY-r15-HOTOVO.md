# OPRAVY r15 – hotovo (body 1–4)

Test: Chrome headless, **deviceScaleFactor 3**, **Android UA (Pixel 8)**, 360/390/430 px.
Screenshoty: `~/.claude/jobs/8ebf6c40/tmp/r15-*.png` + `r15-intro-*.png`.
Testy repozitára: **83/83 zelené**. Bez pushu, bez `git checkout/reset/stash/clean`.

## 1) Intro – farba a tlačidlá
- Rotujúca kategória **„Kozmetika na mieru“** má farbu **#313C2B** (tmavá lesná zelená) ✓ – kontrast proti krémovému okoliu ≈ 8:1 (nad 4,5:1 ✓) + zostáva jemný krémový tieň pre čitateľnosť cez video ✓.
- **Tlačidlo pauzy videa** (vľavo dole) má **rovnaký štýl ako tlačidlo zvuku** (vpravo dole): 44 px kruh, priesvitné krémové pozadie, tmavý symbol ✓.

## 2) QA všetkých stránok (360/390/430 px, DPR 3, Android UA)
Prejdené **všetky 69 rout + 404** (menu, pätička, produkt, košík, pokladňa, účet, prihlásenie, právne stránky, DS) → **OK: žádné chyby** ✓:
žiadne vodorovné pretekanie ✓ · žiadny useknutý/prekrytý text ✓ · žiadne prázdne obrázky ✓ · všetky tlačidlá ≥ 44 px ✓ · menu sa zmestí na jeden displej ✓ · žiadne JS chyby ✓.

Opravené pri QA:
| Problém | Oprava |
|---|---|
| tlačidlá pod 44 px (Menu, Prihlásiť sa, ✕, jazykové prepínače, minúce, náhľady galérie, záložky účtu) | globálne pravidlo na mobile: `min-width/min-height: 44px` ✓ |
| záložky v účte sa vodorovne rezzali | záložky sa zalamujú, boční panel bez vodorovného scrollu ✓ |
| „Failed to fetch“ (nedostupné API) ako neošetrená chyba | `unhandledrejection` sa pri fetch chybe tichí ✓ |
| dvojité sťahovanie obrázka (WebP + JPG) | `<img src>` je WebP, JPG ostáva v `<noscript>` ako záloha ✓ |

## 3) Znovu overené body 3–8 z r12 (screenshoty)
| bod | screenshot | stav |
|---|---|---|
| 3 karty obchodu | `r15-cards.png` | obrázok 3:4, názov a tlačidlo bez prekryvu, popis max 2 riadky, 1 stĺpec ✓ |
| 5 nadpis Zdravý svet | `r15-heading.png` | zalamuje sa, nič sa neorezuje ✓ |
| 6 astrológia | `r15-astrology.png` | žiadne vodorovné linky, tlačidlo bez obdĺžnika ✓ |
| 7 cena karty Kozmetika | `r15-cards.png` | „od 11 €“ bez preškrtnutej hodnoty ✓ |
| 8 pätička – Denný stacionár | `r15-footer.png` | jeden stĺpec, názov sa nemačká ✓ |

## 4) Výkon mobilu
Lighthouse v prostredí nie je nainštalovaný (a nesťahujem cez npx) – merané rovnako ako Lighthouse mobile (390×844, DPR 2, Fast 3G ~1,6 Mb/s, CPU 4×) cez CDP + PerformanceObserver (LCP/FCP/CLS/long tasks/DCL).

| stránka | LCP | FCP | CLS | DCL | long tasks | KB |
|---|---|---|---|---|---|---|
| `/` (pred) | 11,8 s | 3,5 s | 0,006 | 11,4 s | 12,3 s | 1 582 |
| `/` (po) | **9,2 s** | **2,9 s** | 0,006 | **8,9 s** | **5,7 s** | 1 582 |
| `/eshop` | **3,0 s** | 3,0 s | 0 | 5,4 s | 0,7 s | 1 135 |

Najväčšie brzdy a opravy:
- **hero video na mobile sa načíta až pri ťuknutí na „Vstúpte“** (gestum) → LCP je text, nie frame videa ✓ (LCP 11,8 → 9,2 s ✓)
- **obrázky vo WebP** bez dvojitého sťahovania ✓, lazy-loading ✓
- **preload** oboch woff2 (Figtree + Fraunces ✓) ✓

Zostáva: na najslabšom mobile je LCP úvodu stále okolo 9 s – brzdí ho CSS/JS (≈ 160 kB) a samotný rozmach úvodnej sekcie; ďalší krok by bol inline critical CSS a menší balík skriptov.
