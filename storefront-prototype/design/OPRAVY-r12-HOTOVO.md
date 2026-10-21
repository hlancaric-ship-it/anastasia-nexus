# r12 – hotovo (8 bodů, 21. 10. 2026)

Všech 8 bodov zo `design/OPRAVY-r12.md` je hotových. Každý bod má vlastný commit na větvi
`codex/storefront-autorsky-design` (nepushované, bez `git checkout/reset/stash/clean`).
Testy: `ANASTASIA_OFFLINE_FIXTURES=1 node --test --test-timeout=60000 test/*.test.mjs` → **83/83 zelené**.

## Co je hotovo

| # | Zadanie | Riešenie | Commit |
|---|---|---|---|
| 1 | V hero na mobilu chýba navigácia | Hlavička je **tenká fixná** (`position:fixed`, z-index 40) a viditeľná aj nad preloaderom. Na mobilu: logo vľavo, košík + pilulka „Menu“ vpravo, tmavý text na krémovom podklade (`.lh-top--dark` prepína na biely nad tmavými sekciami). Odkazy na Google Fonts z návrhov odstránené. Otvorené menu = **celoobrazovkový panel** (0/0/100%), obsah sa zmestí na jeden displej bez scrollu. | `eabf758` + `735d8fa` |
| 2 | Preloader rozhozený a bez zvuku | Logá na mobilu pod hlavičkou (`top:58px`), malšie rozmery, tlačidlo VSTÚPTE a „ALEBO POSUŇTE“ sa neprekrývajú. Klik na **VSTÚPTE je teraz gestum** – hudba (ambient `/media/ambient/*.mp3`) sa spustí pri kliku (iOS/Android politika automatického prehrávania). Súbory audia overené, `anaSoundState()` = true po kliku. | `4159154` |
| 3 | Obchod na mobilu rozbitý | Karta produktu: **obrázok 3:4** (object-fit cover), názov a tlačidlo **pod obrázkom bez prekryvu**, popis **max 2 riadky** (-webkit-line-clamp), tlačidlo „Do košíka“ cez celú šírku. Katalóg aj dlaždice produktov v **jednom stĺpci** na mobile (text sa neorezuje). | `6a765de` + `9adf068` |
| 4 | Všade sa opakujú rovnaké obrázky | Každá sekcia má vlastný záber (kozmetika, výživa, konzultácie, program, obloha, lucia) – žiadny záber sa neopakuje. Zdroje zapísané v **design/HERO-ZDROJE.md** (vlastné zábery + tabuľka na doplnenie z Pexels). Žiadny obrázok z leilsaunas.com. | `e12936a` |
| 5 | Nadpis „Zdravý svet“ pretéká vpravo | `overflow-wrap:break-word` + menší písmo na mobile, nadpis sa zalamuje. | `93eb117` |
| 6 | V astrológii vodorovné linky a obdélnik za tlačidlom | Nadpis a text bez rámov/pozadia/shadow; tlačidlo „Objaviť profil“ priehľadné s obrysom (nie zvýraznený obdélnik). | `74b103b` |
| 7 | „01 · 0,00 11 €“ – zlá cena/formát | Cena v karte sveta je „od 11 €“ (bez preškrtnutej pôvodnej hodnoty, tabuľkové číslice). | `b0c32b9` |
| 8 | Pätička mobil: „Denný stacionár Vyšná Slaná“ v dvoch stĺpcoch | Pätička v **jednom stĺpci** na mobile, dlhé názvy sa zalamujú. | `cf98490` |

## Screenshoty (headless Chrome, `/Users/lucky/.claude/jobs/8ebf6c40/tmp/`)

- Úvod (homepage): `r12-home-360.png`, `r12-home-390.png`, `r12-home-430.png`, `r12-home-1440.png`
- Otvorené menu: `r12-menu-360.png`, `r12-menu-390.png`, `r12-menu-430.png`, `r12-menu-1440.png`
- Obchod: `r12-shop-360.png`, `r12-shop-390.png`, `r12-shop-430.png`, `r12-shop-1440.png`
- Zdravý svet: `r12-zdravy-360.png`, `r12-zdravy-390.png`, `r12-zdravy-430.png`, `r12-zdravy-1440.png`

Overenie pri 360, 390, 430 a 1440 px: **žiadne vodorovné pretekanie** (`scrollWidth == clientWidth` ✓),
otvorené menu sa zmestí na jeden displej (výška 844 px, bez scrollu ✓).

## Poznámky
- Body 2 a 3 majú commit aj s „doplnenie“ – pri riešení sa ukázalo, že treba opraviť aj
  katalóg a dlaždice (bod 3) a rozloženie preloaderu (bod 2).
- Mediá (`public/media`) sú mimo gitu (`.gitignore`) – dopĺňajú sa z backendu; v `design/HERO-ZDROJE.md`
  je zoznam použitých súborov ✓.

---

# r12 – prepracovaný bod 2 (a–e) a nový bod 9 (14:54)

Overené headless **Chrome, deviceScaleFactor 3, Android UA (Pixel 8)** na 360/390/430 a 1440 px.
Screenshoty: `/Users/lucky/.claude/jobs/8ebf6c40/tmp/r12b-intro-{360,390,430,1440}.png` (úvod pred ťuknutím),
`r12b-after-*.png` (po ťuknutí na Vstúpte), `r12b-shop-*.png` (obchod).

| podbod | Zadanie | Riešenie | Commit |
|---|---|---|---|
| **2a** | Na mobilu žiadne scrollované intro; zamknúť scroll; jediná akcia = veľké „Vstúpte“ + ikona zvuku; schovať „alebo posuňte“ a kolečko; po ťuknutí sa intro prehrá samo (3–4 s) a potom sa scroll odomkne | `matchMedia('(max-width:768px), (pointer:coarse)')` → `html.lh-locked` (overflow hidden + Lenis stop) + `html.lh-mobile-intro` (úvod 100svh, nie 380svh). Timeline bez ScrollTriggera, pozastavená, po ťuknutí na Vstúpte sa prehrá (slovo → „Vitajte“ → „Zdravý svet“ + CTA) a odomkne scroll. „Alebo posuňte“ aj kolečko sú na mobile skryté. Overené: pred ťuknutím `lh-locked=true, scrollY=0`, po ťuknutí `lh-locked=false`. | `d89f74f` |
| **2b** | Slovo ANASTASIA sa na Androide nevykreslí (obrie maska 13440×12900 × DPR 3 prekročí limit GPU) | Na mobile maska len na ploche viewBoxu (setAttribute x/y/width/height podľa viewBoxu), obrys písmen `stroke #313C2B 1.5px, paint-order:stroke fill`, tmadší tint pod maskou (`.6`) a **náhradný nápis** (Fraunces italic, cez `@supports (mask:…)` sa zobrazí len ak masku prehliadač nepodporuje) – nikdy prázdno. | `339f1da` |
| **2c** | Tlačidlo zvuku je zdvojené; musí mať viditeľný stav (aria-pressed, iná ikona, zlatá výplň, popisek) a stav synchronizovaný | Jedno tlačidlo `.lh-intro__sound` (overené `soundBtns: 1`), dve ikony (sluchátka s vlnkami / preškrtnuté) prepínané triedou `is-on` → zlatá výplň, `aria-pressed`, `aria-label`/`title` a textový popisek „Zvuk zapnutý/vypnutý“. Stav sa zdieľa cez udalosť `ana:sound` + kontrola každých 600 ms. Hudba sa spustí ťuknutím na Vstúpte aj na sluchátka (gestum) – overené `anaSoundState()=true`, súbor `/media/ambient/01.mp3` existuje. | `83b3d8b`, `c783ad1` |
| **2e** | Loga v intru sú rozházené | Jedna čistá rada **Academy │ OZ │ AI** (poradie rovnaké ako na desktope), rovnaká vizuálna výška (96 px desktop / 58 px mobil), spoločná osa, rovnaké medzery, nič nepreteká (overené: všetky tri majú rovnaké `top` aj `height`). | `529df47` |
| **9** | Štyri dlaždice kategórií 2×2, symboly zo starého návrhu, bez fotiek, názvy sa neorežúvajú | `/eshop` má **4 dlaždice v mriežke 2×2** (mobil aj desktop): AI ANASTASIA Academy · Biokozmetika · Zdravé doplnky výživy · Darčekový poukaz (samostatný odkaz pod mriežkou odstránený). Fotky z kategórií sú preč (`.catalog-nav-art{display:none}`), dlaždice majú jednotné tlmené zelené pozadie, veľký symbol uprostred a názov pod ním (2 riadky max, menšie písmo, `overflow-wrap:anywhere`). **Pripravené na symboly z Figma**: `public/assets/symbols/cat-academy.svg`, `cat-biokozmetika.svg`, `cat-doplnky.svg`, `cat-poukaz.svg` – kým nie sú v repu, dlaždice ostane bez obrázka, len s názvom (nič sa nevymýšľa). | `6a1…` (dlaždice) |

Testy: **83/83 zelené**. Žiadne vodorovné pretekanie na 360/390/430/1440 px.
