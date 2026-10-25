# ANASTASIA — design systém (kniha pravidel)

Jediný zdroj pravdy pro vzhled celého webu (úvod, podstránky, e-shop, účet, Klub). Platí pro každého, kdo na webu cokoli mění — lidi i agenty. Před každou vizuální změnou přečíst. Každý nový pokyn od Luckyho se zapisuje sem, ne jen do chatu.

> Stav: **rozpracováno** — sbíráme zadání (24. 10. 2026). Po dokončení rozboru předloh a schválení Luckym se z toho stanou tokeny v `storefront-prototype/public/tokens.css` a hlídač při nasazení.

## 1. Pro koho a jaký pocit (Lucky, 24. 10.)
- Klientela: bohatí a úspěšní lidé.
- Musí působit **autorsky**, žádná generika, žádné šablonovité sekce.
- Web vypráví **příběh**. Lucia je čarodějnice, spiritualistka, doktorka a průvodkyně se schopnostmi — to je jádro konceptu.
- Moderní design s **experimentem v layoutu a různými tvary** (ne jen obdélníkové karty pod sebou).
- **E-shop je součástí konceptu**, vedou na něj všechny funnely. Vizuálně patří do světa ANASTASIE, jen je o kousek víc zaměřený na prodej než zbytek webu.

## 2. Předloha
- **Hlavní předloha: Leil (leilsaunas.com)** od agentury häk (hak.ee). Odtud parallax na obrázcích, rytmus, jemnost.
- häk a Lanserhof jen jako laťka kvality detailů.
- Z předloh bereme strukturu, rytmus a pocit. Nikdy texty, fotky, kód ani placená písma.

### Rozbor Leil (vytaženo z živého webu 24. 10.)
- **Podpisový tvar**: asymetrické zaoblení s jedním ostrým rohem, např. `60px 0 60px 60px` (tlačítka, karty) a `200px 20px 200px 200px` (velké fotky). Plus pilulky (`150px`) a oblouky `200px 0 0`.
- **Typografie**: nadpisy tenké (300), velké a klidné — H1 64/67, H2 44/55, H3 26/35, bez verzálek a bez prostrkání. Text 16/24 a 20/28.
- **Barvy**: tmavě olivová `#313B2A`, olivová `#778658`, písková `#C6C0AF`, krémová `#EFECE1` a `#F7F5EF`, bílá. Málo barev, velké plochy.
- **Hero**: video přes celou obrazovku, nadpis dole vlevo, krátký podtext vpravo, jediné tlačítko Menu vpravo nahoře (pilulka s kruhovou šipkou).
- **Rytmus**: dlouhé sekce, hodně vzduchu, parallax na fotkách, střídání světlých a tmavých ploch.
- Pro ANASTASII: tvary a rytmus převzít, barvy přeložit do olivové, levandule, bílé a černé.

### Co dělá předlohy předlohami (prohlédnuto obrazovku po obrazovce 24. 10., 1440 i 390)
Lucky 24. 10. zamítl první návrh Home („ani jeden“). Byl přeplácaný: sklo, kapky, zlaté kruhy, moc tvarů najednou. Předlohy jsou naopak střídmé.
- **Vedou fotky, ne ozdoby.** Na jedné obrazovce je jedna fotka nebo jedna řada fotek. Kromě zaoblení nemají dekorativní tvary.
- **Leil**:
  - Hero: fotka nebo video přes celou plochu, dvouřádkový tenký nadpis dole vlevo, malý tučný podtext uprostřed dole.
  - Sekce na krémové ploše: vlevo nahoře malý štítek s olivovou tečkou malými písmeny („• bring the Leil ritual home.“). Nadpis H2 a odstavec až v pravé třetině. Vlevo zůstává prázdno.
  - Karty: velká krémová plocha, jeden roh výrazně zaoblený, produkt uprostřed, malé kulaté tlačítko se šipkou.
  - Vodorovný karusel fotek s textem přes fotku a vykukující další kartou.
  - Kruhové portréty se jménem a rolí. Statement na střed na slabém motivu v pozadí s jedním tlačítkem.
  - Dole tmavě olivová sekce s novinkami a patičkou.
- **Lanserhof**:
  - Obrazovka rozdělená na textový panel s jemným přechodem (šedobílá → pudrová) a fotku na celou výšku.
  - Nadpis ve dvou řádcích: kurzíva serif („The Ultimate“) a pod ní verzálky („HEALTH & BEAUTY EXPERIENCE“), na střed.
  - Malý odstavec a malé tmavé pilulkové tlačítko.
  - Seznam programů, kde se položka při scrollu zvětší a zvýrazní („Thirteen paths. ONE FOCUS.“).
  - Čtyři sloupce fotek na celou výšku s kurzívním názvem a verzálkovým podtitulem.
  - Ovládání jen jako malé pilulky v rozích.
- **häk**: laťka řemesla. Malé štítky v hranatých závorkách, velká čísla, přesná mřížka.
- **Typografie**: běžný text 13–16 px, nadpisy klidné. Velké písmo jen v hero a jednom statementu na stránku.

## 3. Barvy (Lucky, 24. 10.)
- **Olivová zelená** (nahrazuje dřívější tmavou zelenou).
- **Levandule přesně ze starého webu anastasiaoz.eu**: `#a7a5cf`, `#73729c`, světlá `#e9e9f2`.
- **Bílá** a **černá**.
- **Glassmorfismus** (sklo s rozmazáním) jako prvek systému.
- Zlatá výrazně v tmavých scénách (viz kap. 7).

### Paleta — SCHVÁLENO Luckym 24. 10. 2026
| Token | Hex | Použití | Kontrast |
|---|---|---|---|
| `--olive` | `#6B7444` | hlavní olivová, tlačítka-kapky na světlé ploše | bílý text 5,0:1 ✓ |
| `--olive-deep` | `#2F3424` | tmavé scény, patička | bílý text 12,8:1 ✓ |
| `--olive-mist` | `#E4E6D6` | světlá olivová plocha | — |
| `--lavender` | `#A7A5CF` | levandule ze starého webu, plochy a tvary | — |
| `--lavender-deep` | `#73729C` | levandulové akcenty, aktivní stavy | — |
| `--lavender-mist` | `#E9E9F2` | světlá levandulová plocha | — |
| `--white` | `#FFFFFF` | základní plocha | — |
| `--black` | `#111111` | text, černé scény, tlačítka-kapky | na bílé 18,9:1 ✓ |
| `--gold` | `#C9A55C` | jen na tmavé (černá, tmavá oliva): nadpisy, symboly, linky | na tmavé olivě 5,5:1 ✓, na černé 8,1:1 ✓, na bílé ✗ |
| `--glass-light` | `rgba(255,255,255,.55)` + blur 18px | sklo na světlých pásech | — |
| `--glass-dark` | `rgba(17,17,17,.35)` + blur 18px | sklo na tmavých scénách | — |

Pozadí pod sklem na světlých pásech: krytí max 30 %.

## 4. Písma
- **Fraunces** (300, i kurzíva) na nadpisy, **Figtree** na text a rozhraní. Nic dalšího.

## 5. Platná pravidla z dřívějška
- Texty klienta 1:1, nevymýšlet.
- Mužský / neutrální rod („zákazníci“).
- Bez středníků v textech.
- Každé ovládání jen jednou na obrazovce (žádné zdvojené menu).
- Boční skleněná lišta se objeví plynule až po scrollu, obsah jde pod ní přes celou šířku.
- Preloader jen „Vstúpte“, bez horní lišty.
- Hero video, intro a preloader neměnit bez výslovného pokynu.
- QA vždy na 1440 a 390 px, bez přetékání do strany.
- Admin: tlačítka světlá levandule, tenký levandulový okraj, tmavý text.

## 6. Mystika, plochy, tvary, e-shop (Lucky, 24. 10.)
- **Mystika napůl**: čarodějnické a spirituální je cítit, ale nepřebíjí prémiovost a odbornost.
- **Plochy napůl světlé, napůl tmavé**: světlé sekce (bílá, levandule) se střídají s tmavými scénami (černá, olivová).
- **Světlé sekce mají v pozadí motiv pod sklem**: obrázek nebo tvar za glassmorfním panelem, **krytí pozadí max 30 %**.
- **Tvary**: asymetrická mřížka, oblouky a kruhy, organické tvary. Experiment ano, ale musí dávat smysl a mít řád (jasná mřížka pod tím, opakující se pravidla, ne náhodné tvary).
- **E-shop: čistší obchod** — stejné barvy, písma a sklo jako zbytek webu, ale klasičtější mřížka, filtry a rychlý nákup.

## 7. Podpis, zlatá, pohyb, příběh (Lucky, 24. 10.)
- **Podpisový tvar: kapka jako Leil** — asymetrické zaoblení s jedním ostrým rohem. ANASTASIA ho má jinak natočený než Leil (Leil má ostrý roh vpravo nahoře, my vlevo dole, viz tokeny). Používat na fotky, karty, tlačítka, skleněné panely. Jeden tvar, opakovaně, s řádem.
- **Zlatá výrazně v tmavých scénách**: na černé a olivové zlaté nadpisy, symboly a linky. Na světlých plochách zlatou nepoužívat.
- **Pohyb pomalý a plynulý**: parallax na fotkách, pomalé odhalování při scrollu, jemné dýchání tvarů. Nic neposkakuje, respektovat `prefers-reduced-motion`.
- **Příběh úvodní stránky** navrhuje Claude, Lucky schválí.

## 8. Fotky, tlačítka, navigace, rozsah (Lucky, 24. 10.)
- **Fotky**: Luciiny vlastní (lékárna, stacionář, plakáty, `design/podklady-lucia-2026-10-21`) doplněné atmosférou — příroda, byliny, světlo. Žádné generické fotobanky s lidmi.
- **Hlavní tlačítka: kapka plnou barvou** — olivová (na světlé) nebo černá, bílý text, kruhová šipka vpravo jako Leil.
- **Navigace: boční skleněná lišta zůstává**, objeví se plynule po scrollu.
- **Účet a Klub jednodušší**: stejné barvy, písma, kapka a sklo, ale bez experimentů v layoutu, čistě funkční.

## 9. Skladba textu a rytmus (Lucky, 24. 10.)
- Stránka se skládá z **pásů** přes celou šířku.
- Výrazný kontrast velikostí: **velký text** (statement přes šířku) a hned vedle nebo pod ním **malý** (popisek, odstavec, štítek). Střídat velké a malé, nikdy všechno stejně velké.
- Vše **uspořádané v mřížce**, s jasným **rytmem** — opakující se vzdálenosti, zarovnání na sloupce, pravidelné střídání pásů (velký statement → obsah → fotka → statement).

- **Hudba zůstává jako dnes** (stejná skladba i chování přehrávače).

## 10. Otevřené otázky
- (doplňuje se v průběhu)

## 11. Admin — levý panel (sidebar) je ZAMČENÝ přesně takto (Lucky, 24. 10.)
Stav nasazený 24. 10. na anastasia-test-admin.l-code-dynamics.com je předloha. Neměnit bez výslovného pokynu.
- **Panel**: levandulové sklo `rgba(229,216,240,.83)`, `backdrop-filter: blur(18px)`, pravý okraj `1px solid #d8c6e6`, šířka cca 240 px na desktopu.
- **Hlavička s logem** nahoře vlevo: symbol + „ANASTASIA“ (Fraunces, prostrkané verzálky) + podtitul „LIGHT FOR THE FUTURE“, pozadí `#eee5f4`, spodní linka `#d8c6e6`, výška 78 px.
- **Pořadí a skupiny** (`NAV` v `anastasia-admin/app.mjs`):
  - samostatně nahoře: Prehľad
  - OBCHOD: Objednávky, Produkty, Kategórie, Darčekové vouchery, Zákazníci, Konzultácie
  - OBSAH: Správy, Stránky a texty, Médiá
  - MARKETING: Ambasádori (štítek FÁZA 2), Newsletter, Zľavy a kupóny
  - NASTAVENIA: Doprava a platby, Vzhľad a nastavenia, Používatelia, Integrácie, Potrebujete poradiť?
  - dole karta s fotkou levandule (side-promo)
- **Nadpis skupiny**: verzálky 9 px, prostrkání `.16em`, barva `#343631`.
- **Položka**: 12 px, výška 33 px, tenká obrysová ikona 18 px (`#554064`), text `#40314e`, zaoblení 17 px, hover `#e0cfea`.
- **Aktivní položka**: pozadí `rgba(194,170,218,.47)`, text `#382248`, vnitřní linka `#cdb7de`, výška 38 px, písmo 500.
- **Mobil**: panel schovaný, otevírá se hamburgerem vlevo nahoře, logo uprostřed horní lišty, vyhledávání pod ní.
- **Obsah adminu**: seznamy kompaktní (tabulka, jeden řádek na záznam), tlačítka světlá levandule s tenkým levandulovým okrajem a tmavým textem.
