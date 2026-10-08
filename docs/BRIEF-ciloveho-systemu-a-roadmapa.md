# Anastasia — cílový systém, postup a náročnost
### Podklad pro rozhodnutí (Lucia Rogožanová / LUCRAT s.r.o.) · 7. 10. 2026 · L-Code Dynamics

> Lean, bez vaty. Cíl: první hodnota (prémiový e-shop + členská sekce) co nejdřív, zbytek navazuje. Starý e-shop běží do čistého přepnutí.

---

## 1. Co systém musí umět (zadání v pilířích)

1. **Správa sama** — majitelka ovládá obsah, produkty, ceny, objednávky, přístupy bez závislosti na vývojáři.
2. **Prémiový dojem** — autorský design s charakterem pro bonitní klientelu. ŽÁDNÁ šablona, žádný generický „AI web" vzhled.
3. **Celá commerce platforma** — plný e-shop: digitální produkty + vlastní kosmetika + italské zboží; košík, checkout, platby, objednávky.
4. **Členská sekce + entitlements** — kdo koupil digitální produkt, má automaticky přístup k obsahu. (Dnes se řeší ručně zprávou → automatizovat.)
5. **Media-first** — video + audio jako první třída: streaming, prémiový přehrávač, placený/členský obsah, auto-transkripty.
6. **Multijazyčnost** — web sám pozná jazyk a zobrazí se v něm. Automatický AI překlad s cache, ŽÁDNÉ ručně udržované překlady.
7. **Ambasadoři** — affiliate program (doporučení + provize).
8. **Vlastní přehled** — majitelský dashboard (prodeje, klienti, obsah).
9. **Rozšiřitelnost (centralizovaná platforma)** — všechny další projekty jedou na **jednom** Medusa jádře; nové weby/domény se přidávají jako funnel vedoucí k jedné nákupní doméně (Zlatá brána jako další), bez přestavby a bez samostatných obchodů.
10. **Vlajková služba** — personalizovaný audit léků (AI Anastasia), postavený bezpečně a v souladu s regulací.
11. **Marketing & funnely** — satelitní weby jako plné funnely: landing pages, lead magnety, opt-in, e-mailové sekvence/automatizace, kampaně, upsell/cross-sell, opuštěný košík, newsletter, sledování konverzí → vše vede k centrální nákupní doméně a do členství. „Růst díky nastavení."

**Brand/osa:** prémiový **wellness / zdravé stárnutí / longevity**. Autorský, nikoli generický.

---

## 2. Cílová architektura (stručně)

**JEDEN centrální commerce hub + satelitní weby, které k němu vedou.** Ne obchod na každé doméně — jedno Medusa řešení, jedna doména, kde se nakupuje; ostatní weby jsou marketingové/obsahové fronty, co zákazníka přivedou a dovedou k nákupu.

- **Commerce (centrální):** Medusa.js (headless) — **jeden** katalog, košík, checkout, platby, objednávky, zákazníci + silný admin a role. **Jedna nákupní doména** pro celý ekosystém.
- **Jeden zákazník napříč vším:** jedno přihlášení (SSO), jedno členství, jedny entitlements — klient koupí jednou, přístup má všude. Jedna klientská báze, jeden dashboard.
- **Satelitní weby (funnel):** Anastasia obsah, Zlatá brána, kampaně — vlastní prémiový frontend na edge, produkty můžou **ukazovat**, ale „Koupit" vede na **centrální doménu** (deep link na produkt/checkout).
- **Sdílené služby:** SSO/účty · **Pricing Engine** (cena/slevy/marže) · **SafeOrder** (riziko objednávek) · AI překlad s cache · obsah/CMS · entitlements · ambasadoři.
- **Média:** Cloudflare **Stream** (video) + **R2** (audio/soubory), chráněné podepsané odkazy, auto-transkripty.
- **Platforma (NEXUS):** nové weby/projekty se přidávají jako **funnel nad jedním jádrem, konfigurací, ne forkem** — commerce zůstává centralizovaný, fronty jsou izolované (problém na jednom webu nepoloží ostatní ani obchod).

Tahle architektura mimochodem **z podstaty řeší** dnešní výkonové problémy e-shopu (strop 5 souběžných, chybějící cache, zastaralý stack) i bezpečnostní (vynucená autorizace na serveru).

---

## 3. Postup — fáze (lean, hodnota padá brzy)

### Fáze 0 — Zabezpečit starý e-shop na dobu paralelního běhu  🔴 HOŘÍ
Starý web běží do přepnutí → nesmí zůstat otevřený. Minimum: ověřovat CardPay podpis **i částku**, zavřít veřejný upload, vynutit HTTPS + skrýt `/umbraco`, bezpečný reset hesla, rotovat tajemství.
*Náročnost: malá. Dělá se hned, nezávisle na migraci.*

### Fáze 1 — Prémiový e-shop + členská sekce + migrace dat → PŘEPNUTÍ
Jádro Medusa + autorský storefront (SK/CS), katalog (digi + kosmetika + italské zboží), checkout + platby, Pricing Engine + SafeOrder. **Členská sekce + entitlements** (nákup → přístup). **Migrace** stávajících klientů + objednávek → přístupy (nikdo nepřijde o to, co koupil). **SEO redirect mapa** (máme ji z auditu — kanonizace + top stránky + 404). → **Čistý cutover: nový web živě, starý vypnout.**
*Náročnost: největší blok. Tohle je ta „první velká hodnota".*

### Fáze 2 — Media-first + multijazyčnost + ambasadoři + dashboard
Cloudflare Stream/R2 + prémiový přehrávač + transkripty; AI překlad + EN (a další jazyky); affiliate program; majitelský přehled; marketingové funnely (landing/kampaně na edge + lead capture + e-mail automatizace napojená na osvědčený nástroj, ne vlastní CRM) + sledování konverzí.
*Náročnost: střední, navazuje na hotové jádro.*

### Fáze 3 — Rozšíření platformy
**Zlatá brána** (projekt na INVESTIČNÍ ZLATO) jako druhý „site" na společném jádře — info/marketing + funnel na leady (ne e-shop, ne AI poradce); **audit léků** jako zpevněná služba (serverové guardraily + ochrana zdravotních dat + disclaimery); další domény dle potřeby.
*Náročnost: dle rozsahu; platforma už stojí, přidává se konfigurací.*

---

## 4. Náročnost a termín (orientačně, bez vaty)

Reálné trvání závisí hlavně na **třech vstupech, ne na kódu**: hotový **design/art direction**, dodání **obsahu** (texty, fota, videa) a **feed italského dodavatele**. Pokud tyhle tři nedrhnou, fáze jdou svižně za sebou; samotná technika není úzké hrdlo.

- **Fáze 0** — řádově dny (hned, paralelně).
- **Fáze 1 (do přepnutí)** — hlavní blok; sem patří většina úsilí. Dá se zkrátit tím, že se nejdřív spustí prémiový e-shop + členství a část obsahu se dolaďuje za běhu.
- **Fáze 2 a 3** — navazují po cutoveru, inkrementálně.

> Přesný harmonogram ve dnech dám po odsouhlasení rozsahu fáze 1 a po potvrzení, kdo dodává design a obsah — ať je termín závazný a ne nafouknutý. Nechci slibovat datum, které by nesedělo.

---

## 5. Co potřebuju od vás, aby se nestál čas
1. **Design/art direction** — kdo a kdy (autorský, ne šablona).
2. **Obsah** — texty, fota, videa/audio (ideálně i co je placené/členské).
3. **Italské zboží** — jak chodí data (feed/CSV/ručně), objemy.
4. **Platby** — zůstat na CardPay, nebo zvážit modernější bránu k Meduse.
5. **Jazyky** do startu (tip: SK, CS, EN).

---

*Detailní technické podklady: `MASTER-AUDIT-ANASTASIA.md`, segmenty bezpečnosti/infra/DNS/dat/výkonu/SEO, `MASTER-BLUEPRINT-architektura-migrace.md`.*
