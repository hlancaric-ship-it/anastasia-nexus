# QA živého testu – anastasia-test.l-code-dynamics.com (21. 10. 2026)

**Rozsah:** všetky odkazy z menu a pätičky (SK) – 41 adries (úvod, obchod, kategórie, produkty,
konzultácie, účet, právne stránky, darčekový poukaz, košík a pokladňa).
**Rozmery:** 320, 360, 390, 430 px a desktop 1440 px (pri 320–430 px emulovaný mobile).
**Spôsob:** prečítanie stránok v headless Chrome (Playwright) – **bez platby, bez objednávok a bez
vytvárania účtov**. Na každej stránke boli skontrolované: stav HTTP, vodorovné pretečenie
(`scrollWidth > innerWidth`), chyby konzoly, obrázky s `naturalWidth = 0`, orezaný text
(`overflow: hidden` a `scrollWidth > clientWidth`) a prekrývajúce sa tlačidlá.
**Výsledky:** všetkých 41 adries vrátane 200 OK, **vodorovné pretečanie stránky sa nezistilo** v žiadnej
z 5 šírok. Nižšie sú iba reálne nájdené chyby, zoradené podľa závažnosti.

---

## 1. KRITICKÉ – nenačíta sa runtime skript webu (404 na každej stránke)

| | |
|---|---|
| **URL** | všetky stránky (napr. `/`, `/eshop`, `/vop`, `/kontakt`) |
| **Šírka** | 320, 360, 390, 430 aj 1440 px |
| **Selektor** | `script[src^="/boot.mjs"]` |
| **Prejav** | HTML žiada adresu `/boot.mjs'+V+'` (doslovný text s apostrofmi – parameter sa neskompiloval) a server vráti **404**. Skript sa nenačíta vôbec. |

Dôsledok: nefunguje runtime webu – tlačidlá lišty cookies, košík, prepínač jazykov a mobilné
menu (obsah sa síce zobrazí, ale kliknutia sa nevykonajú). Chyba je v generovaní značky
`<script>` pri buildi, nie v obsahu stránky.

---

## 2. VÝBORNÉ – neexistujúce obrázky produktov (404)

| | |
|---|---|
| **URL** | `/eshop`, `/eshop/kategoria/*`, `/eshop/produkt/*`, `/zdrava-lekaren` |
| **Šírka** | 320, 360, 390, 430 aj 1440 px |
| **Selektor** | `img[src*="/backend-media/static/"]` (napr. `1792536301270-FB_IMG_1660378872439.jpg`, `1792536302141-20220601_081415.jpg`, `1792536302447-1000004007.JPG`, `1792536314809-Ja_longevity_.png`, `1792536317064-20201029_195427.jpg` a ďalšie – spolu 14 súborov) |
| **Prejav** | HTTP 404 na mediálne súbory; v katalógu a na stránke „Zdravá lekáreň“ zostali prázdne miesta na fotografie. |

Súbory sú nasmerované na `/backend-media/static/…` – na testovacom prostredí sa tieto cesty
neobsluhujú (404). Screenshoty: `shots/eshop-390.png`, `shots/zdrava-lekaren-390.png`,
`shots/eshop-produkt-reset-40-plus-390.png`.

---

## 3. STREDNÉ – texty stránok sa nenačítajú z administrácie (400)

| | |
|---|---|
| **URL** | všetky stránky (napr. `/`, `/eshop`, `/konzultacie`, `/vop`, `/odstupenie`) |
| **Šírka** | všetky testované |
| **Selektor / požiadavka** | `GET /store/content/global` a `GET /store/content/<stránka>` na `anastasia-test-api.l-code-dynamics.com` → **400** |
| **Prejav** | Web si nedokáže stiahnuť texty upravované v administrácii (hlavičky, popisy, výzvy). Zobrazujú sa len základné texty zo stránky – úpravy z administrácie nie sú vidieť. |

---

## 4. STREDNÉ – orezaný text v sekciách úvodu a v kartách

| | |
|---|---|
| **URL** | `/` (úvod), `/o-lucii` |
| **Šírka** | 320 px (najviac), rovnako 390 a 1440 px |
| **Selektory** | `div.lh-intro__stage` (376 px > 320), `div.lh-sky__stage` (400 > 320), `div.lh-lucia` (330 > 320), `section#lh-reset.lh-reset` (3 333 > 1 388 na 1440), `article.lh-card.lh-card--light` / `article.lh-card.lh-card--dark` (1 471 > 1 388), `/o-lucii`: `section` (1 526 > 1 440) |
| **Prejav** | Obsah je širší ako rám sekcie a rám ho má `overflow: hidden` – časť textu sa **orezne** a nevidí (nie je to len skryté, obsah sa nedá zobraziť). Na úvode je to najmä v 320 px. |

Screenshoty: `shots/domov-320.png`, `shots/domov-390.png`, `shots/domov-1440.png`,
`shots/o-lucii-1440.png`.

---

## 5. NÍZKE – chyba v konzole: analytický skript blokovaný politkou CSP

| | |
|---|---|
| **URL** | všetky stránky |
| **Šírka** | všetky testované |
| **Selektor / požiadavka** | `https://static.cloudflareinsights.com/beacon.min.js/…` – načítanie zablokované politkou `Content-Security-Policy` (`script-src 'self'`) |
| **Prejav** | V konzole sa pri každej stránke objaví chyba `Loading the script '…beacon.min.js…' violates the following Content Security Policy`. Na obchod to nemá vplyv (meranie súkromia funguje), ale je to chyba v konzole. Súvisí s tým aj opakovaná chyba `Failed to load resource: 404` (beacon). |

---

## 6. INFO – čo sa nepotvrdilo ako chyba

- **Lišta cookies prekrýva obsah stránky** (`button.cookie-btn` cez dlaždice katalógu) – je to
  zamýšľané správanie pevnej lišty, nie chyba; po odsúhlasení zmizne.
- **`/store/reset-program` vracia 401** na `/ucet` – správne, bez prihlásenia nemáte prístup.
- **Prekrývanie rotujúcich kategórií** (`a.lh-cat--1` až `a.lh-cat--4`) – rozložené sú v rôznych
  rohoch a viditeľná je naraz vždy len jedna; nejde o chybu.
- Skryté pomocné texty (`span.media-label`, `label.sr-only`, `label.contact-trap`) a odkazy
  produktových obrázkov (`a.product-image`) sú technicky „orezané“, ale slúžia schovávanému textu
  pre čítačky obrazovky a pasci proti robotom – neodporúčame ich riešiť.
