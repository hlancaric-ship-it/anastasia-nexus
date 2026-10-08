# ANASTASIA ekosystém — INFRA / DOMÉNY / TLS / SEO (segment, pasivní sken)

**Datum:** 7. 10. 2026 · **Metoda:** pasivní/neinvazivní rešerše s písemným souhlasem majitelky — veřejné DNS, WHOIS, CT logy, TLS handshake, HTTP hlavičky, existence veřejných cest (jen stavové kódy, žádné payloady, žádné pokusy o přihlášení). Žádný destruktivní ani zátěžový test.

---

## 1. Hosting a DNS — tři weby, DVĚ infrastruktury

| | anastasiaoz.eu | anastasia.academy | aianastasia.com |
|---|---|---|---|
| Origin IP | **81.95.98.157** | 107.150.101.9 | **107.150.101.9** (stejná) |
| CDN/WAF | **žádný** (přímý origin) | **Cloudflare** | **Cloudflare** |
| Platforma | Windows / IIS / ASP.NET | MGX/atoms.dev (MetaGPT) | MGX/atoms.dev (MetaGPT) |
| DNS (NS) | Websupport (ns1/2.cz, ns3.eu) | Websupport | Websupport |
| Mail (MX) | Active24 (`mx1/2.active24.com`) | Active24 (`mx10/20.active24.sk`) | Active24 (`mx10/20.active24.sk`) |
| Cookie platformy | `ASP.NET_SessionId` | `mgx_vid` | `mgx_vid` |

**Závěry:**
- **academy + pharmacy = technická dvojčata** — stejná origin IP, stejná MGX platforma, za Cloudflare. Potvrzuje syntézu: jedna oprava/správa pro oba. Hostované na **cizí managed platformě atoms.dev** → migrace = export z MGX, ne přesun serveru.
- **e-shop stojí samostatně** — vlastní Windows hosting na Websupport/Active24, **origin IP přímo odhalená, bez CDN/WAF** → žádná ochrana proti DDoS/scanování, origin cílitelný přímo.
- DNS i mail celého ekosystému je **koncentrovaný na Websupport + Active24** → jeden účet = single point of failure (a jeden cíl pro převzetí). Hesla k Websupportu byla v dřívějším nálezu exponovaná → **rotovat prioritně** (ovládá DNS všech tří domén).

---

## 2. Domény a registrace (WHOIS)

| Doména | Vznik | Expirace | Registrátor | DNSSEC |
|---|---|---|---|---|
| anastasiaoz.eu | 2005-04-28 (stará, SEO equity) | — (.eu whois omezený) | — | — |
| anastasia.academy | 2013-12-12 | — | — | — |
| aianastasia.com | 2026-03-19 (nová) | **2027-03-19** | Ascio Technologies | **unsigned** |

**Závěry:**
- `anastasiaoz.eu` je **21 let stará doména** → značná SEO hodnota, při migraci **nutno zachovat doménu i URL strukturu 1:1** (viz SEO níže).
- `aianastasia.com` expiruje **za ~5 měsíců (19.3.2027)** → hlídat prodloužení, zapnout auto-renew.
- **DNSSEC není nasazen** (aspoň aianastasia.com unsigned) → riziko DNS spoofingu. Doporučeno zapnout na Websupportu pro všechny tři.

---

## 3. TLS

Všechny tři: **Let's Encrypt**, platné certifikáty, krátká životnost (auto-renew OK).
- anastasiaoz.eu: platný do 3.1.2027, **SAN jen apex** (`anastasiaoz.eu`, bez `www`).
- academy / pharmacy: platné do 22.–23.12.2026, SAN apex.

Bez zásadního nálezu. Pozn.: `www.` varianty vrací 200, ale apex cert nemá `www` v SAN → ověřit, zda `www` neběží na jiném certu/redirectu (kosmetika).

---

## 4. Bezpečnost přenosu a hlavičky (potvrzeno naživo)

### anastasiaoz.eu (e-shop) — 🔴 reálné díry
- **`/umbraco` → HTTP 200** — administrační backoffice je **veřejně dostupný z internetu**. (Potvrzuje otevřenou hypotézu z e-shop auditu — admin panel není skryt za IP whitelist/VPN.)
- **HTTP (port 80) → 200 OK, obsah se servíruje, ŽÁDNÝ serverový redirect na HTTPS** — přesměrování řeší jen JavaScript v těle stránky. Web je plně funkční po nešifrovaném HTTP.
- `ASP.NET_SessionId` cookie: `HttpOnly` + `SameSite=Lax`, ale **bez `Secure`** → přes HTTP se session posílá v plaintextu → **odposlech/MITM session** (potvrzuje BEZ-02/06 naživo).
- **Žádné bezpečnostní hlavičky:** chybí HSTS, CSP, X-Frame-Options (clickjacking), X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- `/app_plugins` → 301 (existuje). `/.git/config`, `/web.config`, `/App_Data`, `/bin` → 404 (dobře, nejsou servírované).

### academy + pharmacy — 🟢 výrazně lepší (Cloudflare)
- HTTP → **308 server-side redirect** na HTTPS (korektní).
- `mgx_vid` cookie: `HttpOnly` + `SameSite=Lax`; jedna varianta s `Secure`, jedna bez (platforma MGX — drobnost).
- Bezpečnostní hlavičky řeší převážně Cloudflare vrstva; detailní CSP neověřeno (za 307 redirectem na app).

---

## 5. SEO povrch (vstup pro migraci)

| | anastasiaoz.eu | academy | pharmacy |
|---|---|---|---|
| robots.txt | **404 (chybí)** | 307 (chybí na apexu) | 307 (chybí na apexu) |
| sitemap.xml | **404 (chybí)** | 307 (chybí na apexu) | 307 (chybí na apexu) |
| Jazyk | `lang="sk"` | multi (i18n) | multi (i18n) |

**Závěry:**
- **E-shop nemá robots.txt ani sitemap.xml** → zhoršené indexování; před migrací **nutno zmapovat URL ručně** (crawl) a postavit redirect mapu, protože neexistuje sitemap jako zdroj pravdy. QR/ambasadorská URL struktura (`eshop/kosik?produkt&kupon&ks`) **musí zůstat 1:1** — jinak se rozbijí tištěné QR kódy.
- FastAPI weby jsou SPA za 307 redirectem → SEO běží přes `seo-scripts/` (viděno ve zdrojáku); sitemap/robots nejsou na apexu → ověřit, zda je generuje frontend.
- CT log (crt.sh) nevrátil žádné další subdomény → buď žádné nejsou, nebo rate-limit; doplnit přes Websupport DNS export.

---

## 6. Nové nálezy do celkového obrazu (infra vrstva)

**KRITICKÉ / VYSOKÉ (e-shop)**
- INF-01 Admin backoffice `/umbraco` veřejně dostupný → cíl pro brute-force/exploit (řetězí se s reset-hesla-z-Ticks a login bez lockoutu z kódového auditu). Oprava: IP whitelist / VPN / basic-auth před backoffice.
- INF-02 Web běží po HTTP bez serverového redirectu + session cookie bez `Secure` → MITM únos session. Oprava: vynutit HTTPS na serveru (301), HSTS, `Secure` na cookies.
- INF-03 Chybí všechny bezpečnostní hlavičky (HSTS/CSP/X-Frame/X-Content-Type). Oprava: přidat do IIS/web.config.
- INF-04 Origin IP odhalená, bez CDN/WAF → přímé scanování/DDoS. Oprava: zvážit Cloudflare i pro e-shop.

**STŘEDNÍ (ekosystém)**
- INF-05 DNS/mail celého ekosystému na jednom Websupport+Active24 účtu s dříve exponovanými hesly → rotovat, 2FA, oddělit. Single point of failure pro všechny tři domény.
- INF-06 DNSSEC nenasazen → DNS spoofing. Zapnout na Websupportu.
- INF-07 `aianastasia.com` expiruje 19.3.2027 → auto-renew.

**NÍZKÉ / SEO**
- INF-08 E-shop bez robots.txt/sitemap.xml → doplnit + postavit URL/redirect mapu před migrací (zachovat QR 1:1).

---

## 7. Co stále vyžaduje přístup (nelze pasivně)
- Interní logy serveru, výkon (DB queries, TTFB pod zátěží) — potřebuje hosting účet.
- Zálohy DB — data audit, source of truth cena/sklad.
- Search Console / analytika — reálné URL, návštěvnost, 404, backlinky pro migraci.
- Export z MGX/atoms.dev pro academy+pharmacy — potřebuje účet majitelky.

---

## 8. Výkon — lehké měření (jednotlivé requesty, BEZ zátěžového testu)

| Web | TTFB | Total | HTML velikost | Pozn. |
|---|---|---|---|---|
| anastasiaoz.eu | **~0,095 s** | ~0,095 s | 17,2 kB | Rychlý origin (IIS), ale bez CDN → latence vzdáleným návštěvníkům + bez ochrany. |
| anastasia.academy | **~1,43 s** 🔴 | ~1,43 s | 2,8 kB (SPA shell) | Pomalý origin za Cloudflare (connect ~0,36 s → origin geograficky daleko, atoms.dev). |
| aianastasia.com | **~1,44 s** 🔴 | ~1,44 s | 1,5 kB (SPA shell) | Totéž — reálný obsah se dotahuje JS, takže vnímaná rychlost ještě horší. |

**Závěr:** e-shop má serverově rychlou odezvu (optimalizovat spíš dotazy/N+1 z kódu + nasadit CDN). **FastAPI dvojčata mají TTFB ~1,4 s = špatné** — pomalý MGX origin; Cloudflare cachuje jen statiku, ne API. Měřeno bez zátěže; zátěžový test vyžaduje samostatný souhlas a běžící prostředí.

## 9. SEO meta — reálný stav (follow redirects)

| | anastasiaoz.eu | academy | pharmacy |
|---|---|---|---|
| `<title>` (server HTML) | "ANASTASIA OZ" (chudé) | **prázdný** 🔴 (SPA, plní JS) | "ANASTASIA – AI Pharmacy Assistant" |
| meta description | duplikát titulku | OK | OK |
| canonical | **chybí** 🔴 | ano | **chybí** 🔴 |
| Open Graph | **0** 🔴 | 7 | 3 |
| **hreflang** | 0 (jen sk) | **0** 🔴 (přitom vícejazyčný) | **0** 🔴 (vícejazyčný) |
| H1 (server HTML) | 0 | 0 (SPA) | 0 (SPA) |
| robots.txt / sitemap.xml | **404 / 404** 🔴 | 200 / 200 | 200 / 200 |

**Závěry SEO:**
- **E-shop je SEO-nedotažený**: žádný canonical, žádné OG, žádný robots/sitemap, chudé meta. Při 21 let staré doméně se plýtvá SEO equity. Před migrací doplnit + postavit redirect mapu (QR 1:1).
- **Vícejazyčné weby nemají hreflang** → Google nemapuje jazykové verze = kanibalizace/špatné cílení. Doplnit.
- **academy má prázdný server-side `<title>`/H1** (SPA bez SSR) → crawleři bez JS nevidí obsah. Zvážit SSR/prerender nebo doplnit statické meta.

## 10. Celkový infra verdikt
- **E-shop:** rychlý, ale bezpečnostně a SEO zanedbaný na úrovni serveru (veřejný backoffice, HTTP bez redirectu, cookie bez Secure, nulové hlavičky, žádné sitemap/canonical). Infra opravy jsou levné a okamžité (web.config), nezávislé na rozhodnutí opravit/migrovat aplikaci.
- **Dvojčata (academy+pharmacy):** bezpečný přenos (Cloudflare, HTTPS), ale **pomalý origin (TTFB 1,4 s)** a neúplné SEO (hreflang, canonical, SSR). Vázané na managed platformu atoms.dev.

---

## DODATEK (7. 10. 2026) — vyřešena nesrovnalost hostingu academy

**Zdroj:** reálný export Websupport hosting slotu pro `anastasia.academy` (archiv od majitelky). Statická analýza, read-only.

**Zjištění:** Websupport hosting slot `anastasia.academy` (interní cesta `/data/c/9/c92f1154-...`) je **prázdný / zaparkovaný**:
- `web/index.php` = pouze **defaultní Websupport parking stránka** ("Registrácia domén, hosting a servery"), jediný PHP blok = Websupport honeypot beacon. **Žádná aplikační logika, DB připojení, `$_POST`/SQL ani tajemství.**
- Všechny HTTP odpovědi = **509** (překročený limit) → slot nic neobsluhuje.
- `error_log` obsahuje **výhradně skenování botů** (`wp-admin/install.php`, `wlwmanifest.xml`, náhodné subdomény přes wildcard `*.anastasia.academy`) → vždy "File does not exist". **Žádný WordPress, žádný MySQL.**

**Důsledek:**
1. Dřívější podezření (panel hlásí Apache/PHP 8.5/MySQL ⟂ audit zdrojáků = Python/FastAPI/Postgres) je **vysvětleno**: Websupport slot je jen provisioned/parkovaný. Reálná academy + pharmacy běží na **atoms.dev / Cloudflare** (auditovaný FastAPI/Postgres). 
2. **Žádný zapomenutý legacy PHP web s PII na Websupportu** → odpadá podezření na skrytý GDPR zdroj.
3. **Reálná produkční data academy/pharmacy NEJSOU na Websupportu** (leží na atoms.dev) → data audit (bod 3) přes Websupport export nelze dořešit; jen přes přístup k atoms.dev.

---

## DODATEK — Google Search Console (živě, 7.10.2026)

### anastasia.academy (domain property)
- **Výkon:** 1 klik z vyhledávání za období → prakticky nulová organická návštěvnost.
- **Indexace:** 6 zaindexovaných / 9 nezaindexovaných stránek; data naskakují ~24.9.2026 → web čerstvý.
- Část nezaindexovaných = `noindex` (koresponduje s e-mailem Googlu „Vyloučeno značkou noindex, 4 stránky").
- **Závěr pro migraci:** žádná SEO equity k ochraně → přechod/přestavba academy je SEO-bezrizikový.

### Governance Search Console
- 🟠 **SEO-G1:** V GSC účtu majitelky/L-Code je **pouze property `anastasia.academy`**. E-shop `anastasiaoz.eu` ani `aianastasia.com` tam nejsou — přitom v DNS mají `google-site-verification` → jsou ověřené v **cizím Google účtu** (pravděpodobně web designer / původní dodavatel).
- **Důsledek:** majitelka nemá přístup k Search Console vlastního e-shopu; **historická SEO data e-shopu (top stránky, dotazy, backlinky) jsou mimo její kontrolu.** Pro migraci nutné: (a) získat přístup k původnímu GSC účtu e-shopu, (b) přidat `anastasiaoz.eu` jako novou property do účtu majitelky (ověření DNS TXT přes Websupport, kam máme přístup).

- **Academy indexace – detail:** 6 indexováno / 9 ne (3 důvody). Hlavní důvod „Alternativní stránka se správnou značkou kanonické stránky" (3 str.) = benigní (canonical dedup). Zbytek pravděpodobně záměrný `noindex`. **Žádná SEO vada, jen nový web.** Academy jako GSC property uzavřena.

### anastasiaoz.eu (e-shop, domain property — přidána a ověřena 7.10.2026 přes DNS)
- **Výkon:** 66 kliknutí z vyhledávání (zobrazené období ~3 měsíce), špička ~15.–20.9.2026. Malý, ale reálný organický provoz (vs. academy 1 klik).
- **Indexace:** 36 zaindexováno / 24 nezaindexováno (stabilní).
- **Závěr pro migraci:** e-shop MÁ SEO equity k ochraně → nutné přesměrování 1:1 (zachovat top stránky + dotazy) a přenos backlinků. Detail top stránek/dotazů/odkazů → doplnit z Výkon (16 měs.) + Odkazy.
- Pozn.: property je nově ověřená ve vlastním účtu (TXT `...33tpQom3GM`); historická data Google doplnil zpětně. Původní `google-site-verification=DM7ad…` = cizí účet s plnou historií (zjistit vlastníka u web designera).

- **anastasiaoz.eu — 16 měs. souhrn:** 81 kliknutí / 818 zobrazení / CTR 9,9 % / **průměrná pozice 5,2** (top 5 = první strana). Data od ~května 2026 (web v indexu ~5 měsíců). Závěr: malý mladý web, ale **kvalitní pozice** → SEO equity reálná, při migraci nutno přenést (1:1 redirecty top stránek, zachovat dotazy). Top stránky/dotazy/backlinky → doplnit z exportu.

### anastasiaoz.eu — top stránky (16 měs., pro redirect mapu)
Celkem 39 stránek v indexu. Nejvýznamnější:
1. `/` (domovská) — 60 klik / 161 zobr. — PRIORITA 1 pro redirect
2. `/konzultacie` — 9 / 41
3. `/eshop` — 6 / 185
4. `http://www.…/` (HTTP varianta) — 4 / 364
5. `/eshop/produkt/astrologia` — 1 / 58
6. `/ai-anastasia/recenzie-farmaceutickych-produktov/` — 1 / 38
7. `/kontakt/` — 0 / 49
8. `/eshop/produkt/supervizia` — 0 / 25
9. `/eshop/produkt/bio-sprchovy-gel` — 0 / 22
(+ 30 dalších → kompletní z exportu)

**🔴 SEO-C1 — rozbitá kanonizace URL:** táž stránka indexována vícenásobně:
- `http://` i `https://` (HTTP homepage: 364 zobr./4 kliky)
- `www.` i bez `www.`
→ tříští link equity + duplicitní obsah (potvrzuje infra nález: chybí HTTP→HTTPS redirect + www kanonizace). **Migrace musí sjednotit na 1 kanonickou podobu + 301 redirecty** → okamžitý SEO zisk.

**Byznys z top stránek:** jádro = konzultace / astrológia / supervízia + bio produkty + lékárenské recenze (ne klasický retail e-shop). Vstup do cílové architektury.

---

## SEO MIGRAČNÍ MAPA — anastasiaoz.eu (z GSC exportu, 16 měs., 7.10.2026)

Zdroj: oficiální GSC export (Dotazy/Stránky/Země/Zařízení/Vzhled/Graf). Souhrn: 81 klik / 818 zobr. / pozice 5.2.

### A) Trend — organika ROSTE
| Měsíc | Prokliky | Zobr. | CTR | Pozice |
|---|---|---|---|---|
| 06/2026 | 11 | 196 | 5.6% | — |
| 07/2026 | 13 | 194 | 6.7% | 4.9 |
| 08/2026 | 13 | 172 | 7.6% | 5.1 |
| **09/2026** | **44** | **229** | **19.2%** | **3.9** |
| 10/2026 (1–4) | 0 | 20 | 0% | 3.2 |
→ Září = skok (44 klik, CTR 19 %, pozice 3.9). Web nabírá, migrace NESMÍ shodit pozice.

### B) Dotazy — DVA nesouladné proudy intentu
**1. Relevantní (prémiová klientela — jádro byznysu):**
- `astrologicky vyklad` (50 zobr., poz 6.3), `astrologický výklad`, `astrologicky`
- `supervizia bilateralnej integracie`, `pritomny okamih`, `zdravy svet poradna`
- `zdravá káva`/`zdrava kava` (poz 31 — slabé), `sprcháč`/`sprchač`, `biokozmetika`
- brand: `maria oz`, `as oz`, `anastasia*`

**2. Nesouladný intent (lékárna / léky — NÍZKÁ hodnota):**
- `lekáreň` (32 zobr., poz 1.69!), `pharmacy near me`, `vaša lekáreň`, `apotheke`, `lekáreň e-shop blízko mňa`, `najbližšia lekaren`, `аптека рядом`
- `wegovy`/`mounjaro`/`semaglutid`/`liraglutid` (hubnoucí injekce — z `/ai-anastasia/recenzie-farmaceutickych-produktov/`)

🔴 **SEO-C2 — intent mismatch:** web se umisťuje vysoko (poz 1–6) na „lékárna / pharmacy near me / léky na hubnutí", ale **CTR = 0 %** — lidi hledají skutečnou lékárnu/léky, tohle není ono → balast provoz bez konverze. Tahá to průměrnou pozici i profil webu špatným směrem. **Pro bonitní klientelu je tento provoz bezcenný.** Při migraci NEřešit jako prioritu; zvážit odindexování `recenzie-farmaceutickych-produktov` nebo jasné oddělení od e-shopu.

### C) Stránky k zachování (1:1 redirect, dle hodnoty)
PRIORITA 1 (drží kliky/pozici):
- `/` (60 klik) · `/konzultacie` (9) · `/eshop` (6, 185 zobr.)
- `/eshop/produkt/astrologia`, `/supervizia`, `/bio-sprchovy-gel`
- `/konzultacie/astrologicky-profil-zdravia-a-vitality/`, `/online-zdravotna-konzultacia/`, `/astrologia/`
PRIORITA 2 (zobrazení, poz do 10):
- `/kontakt/` (49 zobr.), `/eshop/produkt/kava-zdrava`, `/telove-maslo`, `/zdravy-svet/`, `/vyuka/`, `/ai-anastasia/`, produkty (lanova-sukna, ritualne-sviecky, pletova-voda, saty-lanove), `/gdpr`
Celkem **39 URL s provozem** → kompletní 1:1 redirect tabulka z `Stránky.csv`.

### D) 🔴 SEO-C1 potvrzeno tvrdě — rozbitá kanonizace
Táž stránka v indexu vícenásobně:
- `http://www.anastasiaoz.eu/` (364 zobr.!) × `https://www.` (161) × `https://anastasiaoz.eu/` (non-www)
- `/konzultacie`: www i non-www; produkty i na `http://anastasiaoz.eu/...`
→ chybí **HTTP→HTTPS 301** + **www↔non-www sjednocení**. Tříští link equity a kazí měření. **Migrace: zvolit 1 kanonickou podobu (`https://www.`) + 301 vše ostatní + `rel=canonical` + HSTS.**

### E) Publikum (pro cílovou architekturu)
- **Země:** Slovensko 71 klik / 707 zobr. (dominantní), Česko 2. → primárně SK, sekundárně CZ.
- **Zařízení:** Mobil 43 / Desktop 37 / Tablet 1 → mobile-first nutnost.
- **Vzhled:** Produktové úryvky (rich snippets) 91 zobr. — strukturovaná data produktů fungují, zachovat.

### F) Byznysový kontext (od majitelky, 7.10.2026)
**Lucia cílí na BONITNÍ / prémiovou klientelu.** Jádro = konzultace, astrologie, supervízia, prémiové bio produkty — ne masová lékárna/retail. Potvrzuje to i dotazový rozpor (B): lékárenský/lékový provoz je mimo cíl. Cílová architektura = **prémiový, kurátorský e-shop + konzultační platforma**, ne objemový obchod. SEO strategie po migraci: posílit astrologie/konzultace/supervízia/bio, utlumit lékárenský balast.

### ZÁVĚR bodu 6 (SEO/migrace) — UZAVŘENO pro e-shop
Mám: trend, top dotazy, top stránky (39), kanonizační problém, publikum, intent. Dodělat jen: **Odkazy/backlinky** (GSC → Odkazy) pro úplnou ochranu link equity při přechodu. Jinak migrační mapa stojí.

### G) Indexace (GSC Coverage export, 16 měs.) — kvantifikace problémů
Property = **doménová** (`sc-domain:anastasiaoz.eu`, pokrývá http+https+www+non-www dohromady). Sitemap odeslán („Všechny známé stránky").

**Stav:** ~36 indexováno / ~24 NEindexováno (mírný pokles z 39/22 v 07/2026). Důvody vyloučení:
| Důvod | Stránek | Dopad |
|---|---|---|
| Stránka s přesměrováním | 7 | http/non-www varianty (duplicity) |
| **Duplicitní stránka bez kanonické verze** | **6** | 🔴 potvrzuje SEO-C1 — 6 stránek bez `rel=canonical`, Google kanonikál vybírá sám |
| **Nenalezeno (404)** | **5** | 🔴 SEO-C3 — Google má v indexu/odkazech 5 rozbitých URL |
| Procházeno – neindexováno | 6 | 🟡 SEO-C4 — tenký/nízkohodnotný obsah (pravděpodobně lékárenský balast) |

🔴 **SEO-C3 (nový) — 5× 404:** existují odkazované URL, co vrací 404 → ztracená stránka + ztracená link equity. **Migrace: dohledat těch 5 URL (GSC → Stránky → Nenalezeno 404) a 301 přesměrovat** na odpovídající nové stránky.
🟡 **SEO-C4 — 6× procházeno-neindexováno:** Google je viděl, ale odmítl indexovat (tenký obsah). Pravděpodobně lékárenské/balastní stránky (viz SEO-C2) → při migraci neřešit jako prioritu, spíš sloučit/odstranit.

**Doplnění migrační mapy:** 36 indexovaných + 5 ztracených (404) = cíl 1:1 redirectů; 6 duplicit → sjednotit kanonikál; 6 tenkých → konsolidovat. Po migraci: deklarovat `rel=canonical` na všech, čistý sitemap jen s kanonickými URL.

### H) Backlinky (GSC Odkazy export, 7.10.2026) — 🔴 SEO-C5: nulový profil
Celkem **12 odkazujících URL**, dva zdroje:
1. **dufeksoft.com (8×)** — portfolio web-designéra (stránky „realizované weby / tvorba webov / cena"). Jediné reálné backlinky = vývojář se webem chlubí ve svém portfoliu. ⚠️ Pozn.: Dufek „ze hry" → tyto odkazy mohou časem zmizet (nízká hodnota tak jako tak).
2. **search.seznam.cz (4×)** — NEjsou to backlinky, jsou to URL výsledků Seznamu se spam query stringy (cizí spam domény v parametru). Nulová SEO hodnota, artefakt/šum.

🔴 **SEO-C5 — e-shop nemá žádnou doménovou autoritu z odkazů.** Reálně 0 hodnotných backlinků.
- **Pro migraci = dobrá zpráva:** není co ztratit, žádné riziko ztráty link equity. Stačí zachovat kanonické URL (viz C) a 404 (C3).
- **Pro byznys = příležitost:** budování backlink profilu je greenfield — ideální sladit s prémiovým repositioningem (astrologie/konzultace/supervízia, PR, partnerství, odborné texty), ne lékárenský balast.

### ✅ BOD 6 (SEO / migrace) — E-SHOP KOMPLETNĚ UZAVŘEN
Máme: trend (roste), top dotazy (2 proudy intentu), 39 stránek s provozem, indexaci (36/24 + důvody), kanonizaci (C1), intent mismatch (C2), 404 (C3), tenký obsah (C4), backlinky (C5), publikum (SK/CZ, mobil, rich snippets). Migrační mapa stojí. Jediné doplnění kdykoliv: konkrétní výčet 5× 404 URL (GSC → Stránky → 404) pro přesný redirect — ale blokující to není.
