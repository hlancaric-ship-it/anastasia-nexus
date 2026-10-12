# ANASTASIA — lokální kostra storefrontu

Statické HTML stránky, CSS a ES moduly. Rozsah: sekce 7–8
`docs/STOREFRONT-POZADAVKY-FAZE1.md`. Backend, skutečné přihlášení,
platby, zprávy ani placené materiály se v této etapě nezapojují.

## Spuštění

Z kořene worktree, Node.js 22+:

```sh
node storefront-prototype/prepare-media.mjs
node storefront-prototype/build.mjs
node storefront-prototype/serve.mjs 4173
```

Náhled: `http://127.0.0.1:4173`. Generátor vytváří 61 samostatných HTML
stránek v `storefront-prototype/dist/`. Přímé adresy fungují bez SPA fallbacku.
Neznámé adresy vracejí HTTP 404. Náhled je označen `noindex`.
`dist/` je statický výstup kompatibilní s Cloudflare Pages; nic se automaticky
nenasazuje a produkční hosting se tímto nemění.

Příprava médií standardně čte `~/Documents/anastasia-hero-video/`.
Jinou cestu lze předat jako argument. Kopie médií i sestavený web jsou
gitignored. Nahrání do R2/CDN není součástí této lokální etapy.

## Ukázkové scénáře

- `/eshop` — hledání, kategorie, novinky a bestsellery.
- `/eshop/produkt/bio-sprchovy-gel` — detail, množství a přidání do košíku.
- `/kosik` — úprava množství, odstranění produktu a kupón `DEMO10`.
- `/eshop/kosik?produkt=DEMO-GEL&kupon=DEMO10&ks=2` — kompatibilní QR
  cesta; reload ve stejné kartě nepřidá položku podruhé.
- `/pokladna` — údaje → doručení → platba; čtyři výsledky ALLOW,
  REVIEW, BLOCK a ERROR se vybírají v označeném ovladači náhledu.
- `/prihlasenie`, `/prihlasenie/potvrdit`, `/ucet` — ukázkové obrazovky,
  žádné ověřování, ukládání JWT nebo odesílání e-mailu.
- `/reset-40/knihovna` — výchozí zamknutý stav; explicitní přepínač
  náhledu ukáže 16 zástupných lekcí. Žádná skutečná média programu.
- `/o-lucii`, `/zdravy-svet`, `/konzultacie`, `/astrologia`, `/kontakt`,
  `/gdpr` a další cíle redirect mapy — obsahové šablony s označenými placeholdery.

Ceny kromě dokumentované ceny RESET jsou syntetické návrhové příklady.
Částky a slevy se na klientovi nesčítají ani nepočítají. Náhled kupón přijme,
ale neslibuje skutečné uplatnění slevy. Reálné původní produktové kódy jsou
práce integračního adaptéru, ne odhad této kostry.

## Struktura

- `src/lib/api/` — jediná datová hranice; fixture katalog, obsah a mock
  doménové operace. `createApi()` dává prohlížeči asynchronní rozhraní,
  serializuje změny košíku a odděluje je od komponent.
- `src/components.mjs`, `src/pages.mjs` — sdílený layout a stránkové šablony.
- `public/app.mjs` — interakce, přístupné menu, formuláře a animace.
- `public/styles.css` — paleta, typografie a responzivní rozložení.
- `build.mjs` — SSG bez frameworkových závislostí; kontroluje všechny cíle CSV.
- `serve.mjs` — pouze lokální HTTP server, včetně Range požadavků videa.
- `test/` — mock unit testy a prohlížečová regrese.

Při následném napojení zachovat normalizované rozhraní, nahradit mock adaptér
a pro statický renderer přednačíst odpovídající veřejný snapshot. Komponenty
nemají znát Medusa/NEXUS URL, credentialy ani cenová pravidla. Před nasazením
se odstraní demo ovladače a doplní serverová autorizace, bezpečné relace,
capture platby a skutečné oprávnění. Stav `ALLOW` není doklad platby.

## Testy

```sh
node --test storefront-prototype/test/mock.test.mjs
node storefront-prototype/test/browser.mjs
```

Browser test potřebuje Playwright a Chrome. Cestu k nainstalovanému modulu
lze předat přes `PLAYWRIGHT_MODULE` (absolutní cesta nebo file URL).
Výchozí cesta využívá již nainstalovaný Playwright na tomto pracovním počítači.
Testy používají syntetická data a pouze loopback. Screenshoty a výsledky jsou
v ignorovaném `test-results/`.

## Vizuální zdroje

Závazný vzhled: `docs/design-reference/hero-menu-mockup.png`.
Paleta: panel `#2a3222`, zlato `#C9A355`, text `#EFE5C7`, pilulka `#ecf3e7`.
Logo je vlastní SVG rekonstrukce konceptu. Menu zobrazuje přímo příslušný
výřez dodané reference pomocí CSS; nevydává jej za fotografii skutečné provozovny.
Produktové obrázky jsou původní SVG ilustrace, jasně označené jako náhledy.
Portrét Lucie a finální produktové fotografie nejsou nahrazovány domnělými lidmi
ani cizím brandingem. Dvě veřejné fotografie jsou z dodaného starého webu.

Typografie Outfit je lokálně uložený variabilní font s přiloženou OFL licencí,
viz `public/assets/outfit-OFL.txt`. Zdroj:
<https://github.com/google/fonts/tree/main/ofl/outfit>.

Připnuté, lokálně servírované animační knihovny (žádné runtime CDN volání):

| Knihovna | Verze | Zdroj/licence |
| --- | --- | --- |
| GSAP + ScrollTrigger | 3.13.0 | <https://gsap.com/standard-license/>; původní copyright hlavičky zachovány |
| Lenis | 1.3.11 | <https://github.com/darkroomengineering/lenis>; MIT soubor v `public/vendor/` |
| simpleParallax | 5.6.2 | <https://github.com/geosigno/simpleParallax.js>; MIT soubor v `public/vendor/` |

`package.json`, lockfile ani backendové závislosti se nemění. Smooth scroll,
scrub reveal, hero pruhy a parallax respektují `prefers-reduced-motion`.
Zvuk se spouští pouze kliknutím; video lze zastavit samostatně.

## Obsah a revize vzhledu

Původní veřejné texty jsou ve `src/legacy-content.json`; `src/legacy.mjs`
je skládá bez zkracování do čitelných bloků a používá původní fotografie.
`prepare-media.mjs` stáhne chybějící původní obrázky přes `curl` (musí být
nainstalovaný), existující kopie znovu nestahuje. Fotky stavby jsou vyřazené.
Zdrojové URL a limity snapshotu uvádí `backend/docs/wp/storefront-phase1.md`.

Pro Linux dostupný z dalšího zařízení lze server spustit takto:

```sh
HOST=0.0.0.0 node storefront-prototype/serve.mjs 4173
```

Výchozí adresa zůstává pouze lokální `127.0.0.1`. Veřejné nasazení tím nevzniká.

Pokud dodaná složka videa už není dostupná, příprava použije existující kopie
v `public/media/`. Bez zdroje i bez těchto kopií skončí chybou; média se nevyrábějí.
