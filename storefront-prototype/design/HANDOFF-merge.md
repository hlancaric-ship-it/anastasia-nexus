# Spojení: tvoje homepage (MiniMax) + Claude prototyp „Pohyb“

Zadání od Luckyho: vzít to nejlepší z obou, žádná šablona. Základ = tvoje homepage v tomto worktree
(informační architektura, split sekce, boční lišta, footer se 3 logy, newsletter). Pohyb a hero = Claude prototyp.

Prototyp (čti, nekopíruj slepě): `/Users/lucky/okfish-pricing-engine/.anastasia-design/proto/anastasia-pohyb.html`
Živě: https://claude.ai/artifact/Pif2Whv5N8ycZHGsMMig9F
GSAP, ScrollTrigger a Lenis už máš v `public/vendor/` (CSP `script-src 'self'`, nic z CDN).

## 1. Hero → nahradit (Lucky: centrovaný nadpis přes video = šablona, nechce)
Převzít úvod z prototypu (`section.intro`, CSS „úvod“, JS `buildIntro()`):
- krémová plocha, přes celou šířku SVG maska se slovem ANASTASIA, video `/media/hero-*.mp4` prosvítá jen písmeny;
- skrolováním (sticky stage, ~380svh) se `#wordG` škáluje do stopky písmena T (`svgOrigin` z `getExtentOfChar(4)`, měřit na skrytém `#wordM`, ne na textu v `<mask>`);
- pak „Nič nemusíš.“ vlevo dole → „Všetko môžeš.“ vpravo nahoře s perexem;
- mobil < 700 px: tři řádky ANA / STA / SIA, T zůstává uprostřed;
- zachovat tvoje ovládání zvuku (`nature-ambient.mp3`, fade-in, jen po kliknutí) a pauzu videa; video pauzovat mimo viewport (IntersectionObserver);
- hlavička: tmavý text na krémové, bílý od ~42 % průběhu úvodu a nad tmavými sekcemi, „solid“ jen nad světlými.

## 2. Obloha → kruhové okno
Tvoje split sekce s Mléčnou dráhou nahradit sekcí `#obloha` z prototypu: malý kruh `clip-path: circle(7%)` na tmavém pozadí,
„Pozrite sa hore“, skrolováním se otevře na celou obrazovku, video `/media/night-sky.mp4` se zmenšuje 1.5 → 1, pak text
„Čo o vás vie / OBLOHA“ + odkaz na Astrologický profil zdravia a vitality. Text čitelný (radiální ztmavení + text-shadow).

## 3. Parallax všude, kde je fotka v rámu
- `[data-par]` obrázek v rámu s `overflow:hidden`, výška 124 %, posun yPercent ±8–12 při skrolu;
- `[data-speed]` vrstvy (text, menší fotka) jinou rychlostí — sekce Lucia: portrét + menší fotka stromu přes roh + text;
- tvoje split sekce (strom, les, Lucia) dostanou totéž.

## 4. Svet ANASTASIA → vrstvené karty místo 4 dlaždic s ilustracemi
Ilustrované lahvičky/svíčka působí genericky. Použít sticky „stack“ z prototypu (4 karty na celou obrazovku, předchozí se zmenší
a ztmaví): Kozmetika, Bylinky a výživa, Programy a služby, Domov — reálné fotky produktů / Lucie / přírody z `/media/legacy-*`.

## 5. RESET 40+
Ponech svou split sekci a čísla 16 / ∞ / 1×; pod ni přidej pinned vodorovný pás témat 01–08 + „+8“ (jen ≥ 761 px, na mobilu seznam).

## 6. Chyby, které vidím na 127.0.0.1:4173
- „Vybrané pre vás“: pod názvy produktů se vypisuje `undefined` — chybí podtitul/kategorie, doplň nebo nevypisuj;
- „AI ANASTASIA RESET 40+“ — ověř název produktu v katalogu, na starém webu je „RESET 40+“;
- mezi split sekcemi prosvítají proužky sousedních fotek (spodní hrana sekce 2 a 3) — obrázky přetékají;
- v „Svet ANASTASIA“ se popisy dlaždic přetínají s okrajem sekce;
- ilustrační obaly produktů nahradit skutečnými fotkami (pokud chybí, raději typografická karta než ilustrace).

## Pravidla
- `prefers-reduced-motion`: žádný pin/maska, video stojí, vše čitelné staticky; bez JS stránka funguje.
- Žádné nové závislosti, nic z CDN, žádné neověřené údaje o Lucii.
- Testy storefrontu: `ANASTASIA_OFFLINE_FIXTURES=1 node --test --test-timeout=60000 test/*.test.mjs` musí projít.
- Commituj do tohoto worktree, nepushuj; až budeš hotový, napiš shrnutí — Claude to zkontroluje screenshoty a přenese do release větve.

## Doplněk (Claude, 21. 10. v noci)
- Fotky produktů jsou nově nahrané v Medusa na testovacím API (`https://anastasia-test-api.l-code-dynamics.com/static/...`, pole `thumbnail` a `images`). Karty produktů mají používat je, ne ilustrace `product-*.svg`.
- Storefront CSP má `img-src 'self' https://*.stripe.com data:` — přidej origin médií (`ANASTASIA_MEDIA_ORIGIN`, výchozí = API origin) do `img-src`, jinak se fotky nenačtou.
- Složka `public/media/` je v gitignore; při nasazení se musí zkopírovat (hero video, night-sky, nature-ambient.mp3).
