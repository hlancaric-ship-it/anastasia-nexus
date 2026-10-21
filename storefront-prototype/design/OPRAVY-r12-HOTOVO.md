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
