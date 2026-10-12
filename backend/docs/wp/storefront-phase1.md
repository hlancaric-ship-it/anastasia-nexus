# C-storefront — statická kostra Fáze 1

Datum: 12. 10. 2026. Větev: `codex/storefront-phase1`.
Worktree: `/Users/lucky/anastasia-nexus-codex-storefront-phase1`.

## Rozsah a rozhodnutí

Autoritativní zadání: `docs/STOREFRONT-POZADAVKY-FAZE1.md`, zejména sekce
7–8: nejdříve kompletní kostra, schválení a až potom API. Toto konkrétní zadání
má pro lokální mock práci přednost před starším obecným pořadím backend → frontend.
Neznamená schválení produkčního spuštění ani integrační akceptaci.

Po požadavku uživatele pokračovat bez dalšího rozhodování se zachovává
HTML/CSS/JS původního `origin/codex/anastasia-storefront-visual-foundation`.
Namísto zavádění Astro nebo jiné platformy je doplněn malý generátor
samostatných HTML stránek. Získáme přímé SEO cesty bez runtime SPA fallbacku,
bez změny package/lock souborů a bez změny hostingu. Výstup může později sloužit
na Cloudflare Pages. Současná práce je lokální, žádný hosting nebyl vytvořen.

## Implementováno

- 52 statických stránek: home, katalog, kategorie, 16 produktů, košík,
  QR košík, tříkrokový checkout, magic-link obrazovky, účet/historie,
  RESET + 16 ukázkových lekcí, obsahové stránky, služby, kontakt a GDPR.
- Kontrola všech 34 unikátních cílových cest z redirect mapy. CSV má
  43 datových záznamů, 44 řádků včetně hlavičky; lomítkové varianty obslouží
  stejný dokument. AI obsahové URL jsou zachovány, asistent je označen Fáze 2.
- Závazná paleta a kompozice menu: plovoucí zaoblená karta, 3 sloupce,
  hover text swap, SVG logo, foto se zaobleným levým horním rohem.
  Focus trap, Escape, návrat focusu, inert pozadí a zamknutí scrollu.
- Hero používá všechny dodané video varianty, poster a samostatné audio.
  Video muted, zvuk výhradně kliknutím, stop/pause a reduced-motion.
  GSAP ScrollTrigger scrub, Lenis, simpleParallax a přechod mezi stránkami.
- Jedna datová vrstva s async browser rozhraním, frontou zápisů, syntetickými
  daty a sessionStorage košíkem. QR vstup validuje množství/kód, uchová kupón
  a opakovaný vstup ve stejné kartě je idempotentní. Render hledání ignoruje
  zastaralou odpověď. Žádné cenové výpočty, grant oprávnění nebo backendové volání.
- Lokální média a výstup jsou gitignored. Font Outfit/OFL, původní SVG produktové
  ilustrace a licence vendorizovaných knihoven mají popsané zdroje v README.

## Hranice ověření

Kostra není hotový e-shop: všechna obchodní data a stavy jsou náhledy.
Přístup do knihovny není bezpečnostní kontrola, ale explicitní demo přepínač
bez skutečného placeného obsahu. Ukázkový účet neobsahuje migrované zákaznické údaje.
Potvrzení tokenu nevytváří relaci. Checkout nepřijímá karty a nikdy netvrdí,
že byla provedena platba. Formuláře se neodesílají a jejich hodnoty se neukládají.

Finální fotografie produktů, portrét Lucie, odborné texty a právní znění
čekají na schválené podklady; sekce 7 výslovně požaduje placeholder obsah.
Z dodaného starého archivu se soubor `vs-pohľad-z-boku-3_2023.jpeg` ukázal jako
nečitelná data, proto je použita platná veřejná fotografie z `01flv1eo/`.
Náhledová sauna v menu pochází přímo z dodaného konceptu, nikoli z cizího webu.

## Testy

**Stav lokální UI kostry: VERIFIED.** Schválení vzhledu uživatelem: dosud
neprovedeno. Napojení skutečných obchodních funkcí: `NOT_IMPLEMENTED`,
záměrně až následující etapa podle zadání.

| Příkaz / kontrola | Výsledek |
| --- | --- |
| `node storefront-prototype/build.mjs` | PASS — 52 HTML stránek, pokrytí 34 cílů CSV |
| `node --check storefront-prototype/public/app.mjs` | PASS |
| `node --test storefront-prototype/test/mock.test.mjs` | 12/12 PASS |
| `node storefront-prototype/test/browser.mjs` | 15/15 skupin PASS — Chrome |
| `cd backend && npx tsc --noEmit` | PASS, exit 0 |
| `cd backend && npm run test:unit` | 21/21 suites, 190/190 testů PASS |
| `ffprobe` nad čtyřmi hero videi | PASS — 1080p MP4/WebM, 720p a 480p MP4; žádná audio stopa |
| `git diff --check` | PASS |

Browser test ověřuje menu/focus/inert/Escape, vyhledávání a filtry, prázdný
stav, vložení produktu/množství/kupón, kroky checkoutu a všechny čtyři
výsledky, QR opakování i neplatný vstup, magic-link náhled a odstranění query
tokenu, zamknutí/odemknutí knihovny, kontaktní formulář, všech 52 rout, obrázky
a interní odkazy. Regrese proběhla na 320/360/390/768/1024 px a desktopu
1440 px, se sníženým pohybem i aktivním GSAP/Lenis/parallaxem. Zvlášť
ověřeno scrollování menu při aktivním Lenis a krátkém viewportu, a dotykové
nákupní karty bez hoveru. V hlavní regresi žádné JS chyby, žádné API ani
runtime požadavky na třetí strany.

Screenshoty a strojový report: `storefront-prototype/test-results/`
(lokální, gitignored). Unit regrese backendu byla provedena nad nezměněným
backendem této větve s existujícími závislostmi původního worktree.

Při kontrole byl opraven neplatný obrazový soubor a parametr knihovny
simpleParallax: připnutá verze přijímá NodeList/HTMLCollection, nikoli pole
elementů. Finální regrese prokazatelně ověřuje vytvoření parallax wrapperu.

## Rizika a součinnost

Pro rozsah lokální kostry nejsou blokery. Browserová kompatibilita je
ověřena v Chromu, nikoli v Safari/Firefox. Skutečné API, platby, migrace,
finální obsah a produkční nasazení nejsou předmětem této akceptace.
Po vizuálním schválení pokračuje samostatná integrační etapa; nezačíná
automaticky jen proto, že testy mock UI prošly.

## Další etapa

Vizuální schválení kostry → výměna mock adaptéru za skutečné API, bezpečné
přihlášení, serverové cenové snapshoty a kupóny, Stripe, oprávnění a obsah.
Admin C5, nasazení redirectů, R2/CDN a produkční spuštění jsou samostatné balíky.
