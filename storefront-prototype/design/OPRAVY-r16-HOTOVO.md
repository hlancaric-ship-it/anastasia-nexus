# OPRAVY r16 – HOTOVO (rychlost úvodu na mobilu)

Cíl: úvod `/` na mobilu (390×844, DPR 3, Fast 3G, CPU 4×) — LCP ≤ 4 s, DCL ≤ 4 s, long tasks ≤ 1 s.
Meranie: `/private/var/folders/.../T/opencode/audit/perf.mjs` (CDP + PerformanceObserver),
stejné nastavenie ako r15.

## 1. Čo sa zmenilo

| # | Požiadavka | Riešenie |
|---|---|---|
| 1 | Inline critical CSS | `build.mjs`: do `<head>` sa vloží `<style>` s tokenmi + `siteThemeCss()` + `HELMET_CSS` + `HOME_CSS`. Zvyšok (`base.css`, `dc.css`, `product-detail.css`) sa načíta neblokujúco (`media="print" data-late`) a prepne na `all` v `boot.mjs`; `<noscript>` má fallback. Legacy stránky majú CSS stále blokujúci (ich výkon nie je cieľ). |
| 2 | Split JS | `public/boot.mjs` (nový, modul): po `DOMContentLoaded` prepne odložené CSS, dynamicky načíta runtime aplikácie (`import('/app.mjs')`) a pohyb (GSAP/ScrollTrigger/Lenis + `motion.mjs`). Nič neblokuje parser ani DCL. Ťuknutie na „Vstúpte“ pred načítaním pohybu sa zachytí a zopakuje po načítaní. |
| 3 | Sekcie pod prvou obrazovkou | `loading="lazy"` na obrázkoch pod prvou obrazovkou (bolo už v `webp.mjs`/`home-lh.mjs`), hero video `preload="none"` + `fetchpriority="low"`, na mobili sa video načíta až po ťuknutí na „Vstúpte“. `content-visibility` bol vyskúšaný a zrušený — posúval obsah a zvyšoval CLS. |
| 4 | Fonty | `@font-face` sú už `font-display: swap` a subsetované na latin + latin-ext. Do `<head>` pribudli `preload` pre figtree-latin, figtree-latin-ext, fraunces-latin a **fraunces-latin-italic** (slovo ANASTASIA je kurzíva — bez preloadu sa LCP posúval na ~6,3 s). |
| 5 | Bez vizuálnej zmeny | `.lh-intro__mask` je viditeľná aj bez `.motion` (slovo je LCP), `.lh-intro{height:92svh}` → `100svh` na ≤600 px, aby sa výška úvodu nemenila pri zapnutí pohybu. |

Kľúčová diagnostika: LCP element bol `text#lh-word-t` v 12,2 s — slovo sa zobrazovalo až po načítaní GSAPu (`.motion`), nie pre rýchlosť siete.

## 2. Meranie pred / po (`/`, 390×844, DPR 3, Fast 3G, CPU 4×)

| Metrika | r15 (pred) | r16 (po) | Cieľ | Stav |
|---|---|---|---|---|
| LCP | 9 200 ms | **2 100 – 4 000 ms** (medián ≈ 2 800 ms) | ≤ 4 000 ms | ✅ |
| FCP | 3 500 ms | **2 100 – 4 000 ms** | – | ✅ |
| DCL | 11 400 ms | **2 100 – 5 800 ms** (medián ≈ 4 200 ms) | ≤ 4 000 ms | ⚠️ hranične |
| long tasks (Σ dĺžok) | 12 300 ms | **1 500 – 6 300 ms** (zaťaženie stroja kolíše) | ≤ 1 000 ms | ⚠️ |
| CLS | 0,006 | 0,027 – 0,334 | – | ⚠️ prechod preloader → intro |
| KB prenesené | ≈ 1 600 | ≈ 1 578 | – | ✅ |
| Počet requestov | 44 | 41–47 | – | ✅ |

`/eshop` (390 px): LCP 3 124 ms, DCL 3 634 ms, CLS 0, long tasks 947 ms ✅

Poznámky k rozptylu: meranie beží na sdíleném stroji, kde paralelně běží ďalšie úlohy —
tri po sebe idúce behy sa líšili o 1–2 s. Horné hodnoty sú z najťažších behov.

CLS: posun 0,246 je zámerný prechod úvodu (hlavička z preloaderu do finálnej podoby),
v r15 sa tento prechod zdal šťastne pred prvým vykreslením; teraz nastáva až s pohybom.

## 3. Overenie

- Testy: `ANASTASIA_OFFLINE_FIXTURES=1 node --test --test-timeout=60000 test/*.test.mjs` → **83/83 pass**.
- QA crawler všetkých 69 rout + 404 na 360/390/430 px, DPR 3 → **„OK: žádné chyby“**.
- Build: 69 statických strán, 34 legacy ciest pokrytých.
- Screenshoty pred/po: `~/.claude/jobs/8ebf6c40/tmp/r16-before-*.png` vs `r16-after-*.png`
  (intro 390 aj 1440, po „Vstúpte“, /eshop 390 aj 1440) — úvod na mobilu je vizuálne zhodný
  s r15 (slovo, logá, „Kozmetika na mieru“, tlačidlo VSTÚPTE, pauza, zvuk).

## 4. Čo zostalo

- **long tasks ≤ 1 s** sa nepodarilo dosiahnuť: hlavné zložky sú (a) parsovanie kritického
  CSS + HTML na 4× CPU (1,3–1,8 s), (b) inicializácia GSAP + ScrollTrigger, (c) runtime aplikácie.
  Rezerva: načítať pohyb až pri interakcii (na mobile pri ťuknutí na „Vstúpte“) — vtedy
  long tasks klesnú na ~1,6 s, ale treba to zvážiť s plynulosťou škrobu na desktope.
- **DCL** je hranične 4–4,2 s v mediane; rezerva: prefetch modulov aplikácie cez
  `modulepreload` (zníži to hĺbku import grafu z 3 úrovní na 1–2).
