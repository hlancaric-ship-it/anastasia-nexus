# KONCEPT redesignu – HOTOVO

Návrh na schválenie. **Žiadny zásah do produkčného kódu** – celý koncept je v
`design/redesign-koncept/` (samostatné statické HTML), `src/`, `public/` aj `build.mjs`
ostali nedotknuté.

## 1. Čo je kde

| Súbor | Obsah |
|---|---|
| `design/redesign-koncept/index.html` | **Úvod** (mobil 390 px → desktop 1440): video hero z vlastných médií, parallax na obrázkoch, kategórie, programy, pätička |
| `design/redesign-koncept/ucet.html` | **Zákaznícky účet** vrátane zóny **RESET 40+** (vstupný dotazník, týždne) a **Zrkadielka** (tabuľka/karty, hodnotenie 1–10) |
| `design/redesign-koncept/paleta.html` | **Paleta, typografia, tlačidlá a karty** |
| `design/redesign-koncept/koncept.css` | Spoločné štýly konceptu (premenné palety, mriežky, mobilné pravidlá) |
| `design/redesign-koncept/koncept.js` | Interakcie konceptu: mobilné menu, plynulá bočná lišta, parallax, záložky účtu, hodnotenie 1–10 |
| `design/redesign-koncept/shots/` | Screenshoty 390 px a 1440 px každej stránky (`index-390/1440.png`, `ucet-390/1440.png`, `paleta-390/1440.png`) |

Screenshoty vznikli v headless Chrome cez lokálny statický server (len na zobrazenie –
koncept je samostatný a nič nepotrebuje build).

## 2. Rozhodnutia o palete

| Farba | Hodnota | Použitie |
|---|---|---|
| Lesná zelená | `#313C2B` | text, tmavé sekcie, pätička, písmo v logu |
| Šalviová | `#778658` | zvýraznenie, hover, akcent na odkazoch |
| **Mätová (navrhnutá)** | `#B4CDB0` + svetlá `#DCE7D9` | mätová svetlá odlišuje **zónu účtu** od zvyšku webu (odtieňom pastelovej palety, **žiadne bordó**) a slúži na sekcie |
| Krémová | `#F5F2E8` | pozadie stránok a kariet |
| **Levanduľová (navrhnutá)** | `#B9A7C9` + svetlá `#E8E1F1` | **Luciina vlastná značka** (etiketa Mineral Protect, starý web) – pastelový akent, nie sýta; použitá na značkové karty a na hlásenia v zóne účtu |
| Zlatá | `#C9A355` | **len drobný akcent pri logu** (podnadpis, delenie) |

Ďalšie farby: text `#3A4436`, ticho `#6E7468`, link `#4C5B3E`, tmavá zelená `#20261C`
(pätička), okraje `#E7E1CF`. **Bordó v koncepte nie je** – bordó zóny účtu sa nahrádza
odtieňom mätovej.

## 3. Typografia

- **Fraunces** (OFL, cez Google Fonts v koncepte) – nadpisy, kurzíva v úvode („Vitajte.“).
  V produkcii sa hostuje lokálne (rovnaké súbory Fraunces/Figtree ako dnes).
- **Figtree** (OFL) – text, 300–500.
- Miery: display `clamp(52px,13vw,168px)`, nadpis sekcie `clamp(30px,5vw,62px)`,
  text 16–19 px / 1,7, malý text 10–13 px s `letter-spacing .2em`.
- Žiadne fonty, videá ani obrázky z Leil/häk – hero video je vlastné
  (`public/media/hero-720p.mp4`, `hero-1080p.mp4`), obrázky vlastné (`public/assets/…`).

## 4. Pravidlá mobilu a lišty

- Bez pretekania do strany (overené: `scrollWidth === clientWidth` na 390 px aj 1440 px
  na všetkých troch stránkach).
- Mobilné menu je **celé na jeden displej** (`transform` + `visibility`), žiadne
  duplicitné ovládanie.
- Bočná lišta sa objaví **plynule až po scrolle** (`opacity` + `translateX`, .4 s),
  hlavička sa zmení na plnú po 40 px. Na mobile sa lišta vôbec nezobrazuje.
- Tap targety: tlačidlá a stupnice hodnotenia min. 44 px.
- `prefers-reduced-motion` vypína parallax aj prechody.

## 5. Texty

Všetky texty sú **1:1** z obsahu webu:
`src/home-content.json` (Vitajte., celý úvodový odsek, Vstúpte do zdravého sveta,
Priestor pre zdravie…, Kde veci nemusia…, Kolekcia, AI ANASTASIA Longevity Academy,
16 týždňov…, AI ANASTASIA RESET 40+, Čo získate?, Môžeš tu nájsť…, Kontakt,
Otázka k produktu…) a `src/legacy-content.json` (názvy stránok v kategóriách, pätičke
a v zóne účtu). **Nič sa nevymýšľalo** – aj prázdny obsah týždňov je vyznačený
state „Obsah pripravujeme.“ (rovnaký stav ako v produkčnej zóne účtu). Názvy záložiek
účtu a stĺpcov Zrkadielka sú prebrané z existujúcej zóny účtu a z API metrík.
Používame mužský/neutrálny rod („zákazníci“), nikdy „zákazníčky“.

## 6. Commity (len vlastné súbory, bez pushu)

| Commit | Obsah |
|---|---|
| `cfd59ea` | koncept – úvod (mobil 390 px → desktop 1440) |
| `eac06f3` | koncept – zákaznícky účet so zónou RESET 40+ / Zrkadielkom |
| `c2dfa67` | koncept – paleta, typografia, tlačidlá a karty |
| (tento) | `design/redesign-koncept/HOTOVO.md` |

## 7. Čo treba rozhodnúť pred produkciou

1. Potvrdiť mätovú a levanduľovú (obidve navrhnuté v koncepte) a definitívne
   odsúhlasiť bordó v zone účtu.
2. Potvrdiť, či ostáva **Fraunces + Figtree** (dnes) alebo iné voľne licencované páry.
3. Rozhodnúť, či parallax a video hero idú aj do produkcie (koncepcia je len návrh).
