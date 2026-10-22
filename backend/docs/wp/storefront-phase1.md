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
bez skutečného placeného obsahu. Ukázkový účet neobsahuje migrované zákazníkové údaje.
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

## Revize podle kontroly Luckyho (12. 10. 2026)

IMPLEMENTED: aktuálně 61 statických cest. Hero a velké menu zachovávají
schválený styl. Hamburger až pod hero, malý průhledný panel, jazyky vlevo,
telefon vpravo, účet/košík uvnitř menu. Opravený společný obrys s protilehlými
rohy a tenkým švem. Všechny odkazy na `centre.jpg` odstraněny včetně fallback
obsahových šablon; příprava médií odstraní i staré kopie obrázku z výstupu.

Prohlédnuty screenshoty všech pěti referencí (Leil, Vita Travels, Biofarma,
Esfirum, Parallel Universe / About), u osobní stránky i několik scroll pozic.
Odstraněny vlastní obecné slogany a cyklické barevné karty po každém nadpisu.
Úvod střídá otevřený text, katalog, spojený programový blok, asymetrickou
fotografickou nabídku konzultací, portrét přes barevnou plochu a široké video.
O Lucii používá původní portrét, výrazné jméno a původní citát bez vymyšleného CV.

Obsah: `src/legacy-content.json` je veřejný snapshot 17 sekcí z
`https://anastasiaoz.eu`, pořízený 12. 10. 2026. Zdroj je uveden u každé stránky.
1372 bloků zachovává slova/pořadí; odstavce jsou rozděleny kvůli čitelnosti.
19 původních obrázků se připravuje lokálně přes `prepare-media.mjs` (gitignored).
Zdrojový JavaScript, původní formulářové relace a cookies se nepřenášejí.
Kontaktní formulář zůstává lokální ukázkou. Texty VOP/GDPR jsou původní obsah,
nikoliv potvrzení jejich platnosti pro novou platební integraci.

Hranice: `/kurzy` a `/blog` vracejí na původním webu HTTP 404; jejich chybějící
texty nejsou domýšleny. `/ai-anastasia` nemá ve veřejném HTML obsah; funkční AI
zůstává Fáze 2. `/zdrava-lekaren` na zdroji přesměrovává na
`/eshop/kategoria/-vsetko-`; obě cesty nyní zobrazují lokální mock katalog.
Úplnou migraci katalogu, dynamického AI obsahu a schválení vzhledu tato revize
neprohlašuje za hotovou.

VERIFIED:

- `node storefront-prototype/build.mjs`: PASS, 61 stránek, 34 cílů redirect mapy.
- `node --check` pro `public/app.mjs`, `src/components.mjs`, `src/legacy.mjs`: PASS.
- `node --test storefront-prototype/test/mock.test.mjs`: 12/12 PASS.
- `node storefront-prototype/test/browser.mjs`: 17/17 skupin PASS nad 60 stránkami;
  kontrola všech zdrojových slov, obrazů, interních cílů, menu/focus/scroll,
  320–1440 px, reduced motion i GSAP/Lenis/parallax, bez JS chyb.
- Po doplnění 61. cesty samostatně ověřeny obě původní lékárenské URL,
  viditelné tiché video, ruční pause a malé menu při aktivním Lenis: PASS.
- Backend zůstal beze změn; `npx tsc --noEmit`: PASS;
  `npm run test:unit -- --runInBand`: 21 suites / 190 testů PASS.
- `git diff --check`: PASS.

Server běží lokálně na `http://localhost:4173`. Volitelné `HOST=0.0.0.0`
umožňuje samostatné spuštění na Linuxu; spuštění ve VirtualBoxu neproběhlo,
protože nebylo dodáno přihlašovací jméno. Soubory ani tajemství se tam nekopírovaly.

## Zdravý svet, logo a ovládání médií (14. 10. 2026)

Větev `codex/storefront-chat`, lokální náhled `http://127.0.0.1:4183`.

- Lišta čte i zděděné pozadí `body`/`html` a barevné přechody a přepíná při každém scroll snímku. Pozadí patičky pokračuje pod lištu; její obsah se ořezává až uvnitř patičky, takže nevzniká vodorovný overflow. Ikony a popisky určují kontrast ve své vlastní výšce, takže zůstávají čitelné i přes hranici světlé a tmavé sekce.
- Hero používá původní logo ANASTASIA OZ (`lucia-logo.png`), stejné jako první logo z trojice v patičce.
- Fotografie Zdravého světa má přirozených 960 × 558 px bez ořezu, zarovnání k pravému okraji a původní zaoblený levý horní roh. Spodní hrana navazuje bez mezery na zelenou sekci. Mezera nad fotografií je zmenšená na polovinu (35 px desktop, 20 px mobil); oba bloky se tím posunuly společně výš. Na menších displejích se zachovává poměr stran.
- Dodaná fotografie `unbbiu5e_jar.jpg` je uložená jako `public/assets/zdravy-svet-luka.jpg` a navazuje vlevo přímo na spodní hranu zelené sekce. Má stejnou šířku jako horní fotografie (960 px, na mobilu šířka viewportu), přirozený poměr stran a pravý spodní roh zaoblený na 170 px. Začíná na x = 0, takže zasahuje pod lištu. Nový browser check ověřuje shodnou šířku, dotyk zelené hrany a zaoblení; cílená kontrola geometrie prošla při 320–1920 px.
- Sluchátko a spuštění/pauza jsou v levé liště úvodu i Zdravého světa. Na mobilu se stejné ovladače přesouvají vlevo dole. Na úvodu tlačítko ovládá video; na Zdravém světě stávající lokální ambientní zvuk. Zvuk se vytváří a spouští až po kliknutí. Rychlé pozastavení rozběhnutého požadavku není chyba přehrávání.

Ověření: cílené kontroly rozměrů, dotyku zelené sekce a overflow při 320–1920 px PASS; ovládání dotykem, zvuk, play/pause a zachování stavu při změně šířky PASS. Plný `STOREFRONT_URL=http://127.0.0.1:4183 node storefront-prototype/test/browser.mjs` po poslední úpravě: 26/26 skupin PASS, včetně patičky s přechodem, bez JS chyb a cizích requestů. Mock sada 14/14 PASS; syntaktické kontroly a `git diff --check` PASS. CSP zůstalo `'self'`.

## Odhlásenie zákazníka (22. 10. 2026)

Větev `codex/storefront-autorsky-design`. Chyba ověřená QA na teste: „Odhlásiť sa →“ byl
obyčajný odkaz na /prihlasenie, token `anastasia.jwt` zostal v sessionStorage,
`/store/customers/me` vracel 200 a /ucet bol po odhlásení stále dostupný.

Rozhodnutie: token a údaje zákazníka sa mažú v prehliadači vždy (aj pri chybe servera),
serverová relácia sa zruší, ale její zlyhanie odhlásenie neblokuje. Účet bez relácie sa
neotvára vôbec — stráž účtu je v hlave stránky, aby účet neblikal ani na chvíľu.

- `src/lib/api/http.mjs`: `signOut()` — zruší serverovú reláciu (`DELETE /auth/session`, trasa
  je v Meduse, chyba sa ignoruje) a vymaže token aj údaje zákazníka: `anastasia.cart`,
  `anastasia.coupon`, `anastasia.qrkeys`, `anastasia.gift`, `anastasia.booking`,
  `anastasia.membership.cart|checkout|offer` a `anastasia.return` (ten drží app shell
  v localStorage). Kľúč tokenu je exportovaný ako `JWT_KEY`.
- `src/lib/api/mock.mjs`: `signOut()` v náhľade vymaže košík a údaje, `isLoggedIn()` po
  odhlásení vrací `false`. `src/lib/api/index.mjs`: `signOut` je vo fronte zápisov.
- `src/customer-center.mjs`: jediné tlačidlo „Odhlásiť sa →“ má `data-sign-out` (zostáva
  odkaz, bez JS sa zákazník dostane na /prihlasenie, žiadne zdvojené tlačidlo).
  `public/app.mjs`: klik zavolá `api.signOut()` a prejde na /prihlasenie.
- Stráž účtu: `src/account-guard.mjs` + `build.mjs` vkladajú na /ucet do hlavičky
  `/account-guard.js` (bez tokenu hneď `location.replace('/prihlasenie')`, ešte pred runtime
  aplikácie); `public/app.mjs` má rovnakú kontrolu ako zálohu. Bez tokenu /ucet nie je dostupný.

Ověření: `node --test 'storefront-prototype/test/*.test.mjs'` → 143/143 PASS (o 8 nových
v `storefront-prototype/test/sign-out.test.mjs`); `node storefront-prototype/build.mjs` PASS;
`node --check` PASS; `git diff --check` PASS; cílená kontrola v Chromiu PASS — po odhlásení je
sessionStorage bez tokenu aj košíka a /ucet presmeruje na /prihlasenie.
`node storefront-prototype/test/browser.mjs` je rozbitý už na HEAD (kontrola hero layoutu
`hlavička je uvnitř hero`, backend na 127.0.0.1:9100 v tomto prostredí neběží), takže táto
oprava je v browser teste overená uvedenou cílenou kontrolou, nie celým browser balíkom.

