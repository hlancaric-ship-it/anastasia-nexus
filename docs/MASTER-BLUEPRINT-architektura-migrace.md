# ANASTASIA — MASTER BLUEPRINT
## Od současného stavu k jednomu nerozbitnému ekosystému

**Pro:** Lucia Rogožanová (LUCRAT s.r.o.) · **Od:** L-Code Dynamics · **7. 10. 2026**
**Co to je:** kompletní obraz — co dnes máte (silné i neudržitelné), proč je současné řešení slepá ulička, a náš návrh cílové architektury: **jedna infrastruktura, jedno jádro, nerozbitné základy, navržené tak, aby bezpečně rostlo s každým dalším webem.**

---

# ČÁST 1 — SOUČASNÝ STAV

## 1.1 Co máte (aktuální řešení)

| Web | Role | Technologie | Hosting |
|---|---|---|---|
| anastasiaoz.eu | e-shop (prodej, platby, sklad) | Umbraco 8 + .NET 4.7.2, MS SQL | Websupport (Windows), bez CDN |
| anastasia.academy | vzdělávací web | React + FastAPI (šablona atoms.dev) | atoms.dev za Cloudflare |
| aianastasia.com | AI lékový poradce | React + FastAPI (tatáž šablona) | atoms.dev (stejný server) |

Tři oddělené systémy, dva technické světy, **žádné společné jádro**.

## 1.2 Co je silné (co stojí za zachování)

- 🟢 **Ceny e-shopu se berou z databáze** (ne z prohlížeče) — správný princip, jen je potřeba kolem něj dostavět ochranu.
- 🟢 **Moderní weby mají dobře postavené přihlašování** (OIDC/PKCE) — kvalitní základ, který se dnes bohužel skoro nepoužívá.
- 🟢 **Ambasadorské/QR odkazy** na e-shopu jsou nejlépe napsaný kus — jen jim chybí sledování (tracking).
- 🟢 **Čistá datová struktura obsahu** u academy (vícejazyčnost přes jazyk + překladový klíč) — dá se přenést.
- 🟢 **Rychlý e-shop server** (odezva ~0,1 s) — výkon není problém, problém je bezpečnost a platforma.

## 1.3 Co je absolutně neudržitelné

- 🔴 **E-shop na mrtvé platformě** (Umbraco 8, od 2/2025 bez bezpečnostních záplat) — nejde spravit, jen vyměnit.
- 🔴 **Platby se neověřují** podpisem ani částkou → objednávka „zaplaceno" bez zaplacení.
- 🔴 **Zabezpečení „na oko"** u všech tří — server nehlídá, kdo co smí; velká část funkcí jde ovládat bez přihlášení.
- 🔴 **Osobní údaje zákazníků přístupné nepovolaným** (u lékárny i zdravotní kontext) → GDPR.
- 🔴 **AI lékový poradce bez serverových pravidel** → zneužitelná neomezená rada na váš účet.
- 🔴 **Tajemství (hesla, klíče) čitelná v kódu**; administrace e-shopu veřejná; web běží i bez šifrování (ověřeno naživo).
- 🔴 **Dvojí vendor lock-in** (uzavřená knihovna u e-shopu, platforma atoms.dev u dvojčat) — nejste pánem systému.
- 🔴 **Žádná logika pro růst** — chybí ochrana marže, velkoobchod, věrnost, provize ambasadorů.

**Závěr části 1:** dobré principy existují, ale základ je děravý a u e-shopu mrtvý. Opravovat a stavět dál na tomto = draho a dokola. Proto navrhujeme **nový společný základ.**

---

# ČÁST 2 — NÁŠ NÁVRH: JEDEN EKOSYSTÉM, JEDNO JÁDRO

## 2.1 Principy (nerozbitné základy)

1. **Bezpečnost jako výchozí stav, ne dodatek.** Vše zakázáno, dokud to není výslovně povoleno (deny-by-default). Server hlídá každý požadavek.
2. **Jeden zdroj pravdy.** Cena, sklad, objednávka, identita — každá informace má jedno autoritativní místo. Žádná dvojí logika.
3. **Deterministicky, pak teprve AI.** Peníze a sklad počítá pevná, ověřitelná logika. AI je nástroj, ne účetní.
4. **Jádro oddělené od platforem.** Business logika je nezávislá; napojení na platby, účetnictví, AI jsou vyměnitelné adaptéry. Konec vendor lock-inu.
5. **Jedna infrastruktura.** Jeden účet, jedna brána, jedno jádro, jedna správa — ne tři ostrovy.
6. **Navrženo pro růst.** Nový web = nový frontend napojený na existující jádro. Žádná nová infrastruktura, žádná duplikace.

## 2.2 Architektura — vrstvy

```
                    ┌───────────────────────────────────────────────┐
  ZÁKAZNÍCI ───────▶│   EDGE VRSTVA (Cloudflare — jedna brána)       │
  (všechny domény)  │   DNS · WAF · DDoS · TLS/HSTS · CDN · cache    │
                    │   Pages (frontendy) · Workers (API gateway)    │
                    │   KV (cache) · R2 (média/zálohy) · D1 (stav)   │
                    └───────────────┬───────────────────────────────┘
                                    │  (ověřený, rate-limited provoz)
                    ┌───────────────▼───────────────────────────────┐
                    │        IDENTITA / SSO (jedno přihlášení)       │
                    │   zákazníci i admini · role · MFA pro admin    │
                    └───────────────┬───────────────────────────────┘
                                    │  (zero-trust, deny-by-default)
   ┌────────────────────────────────────────────────────────────────────────┐
   │                    DOMÉNOVÉ JÁDRO (platformově agnostické)               │
   │                                                                          │
   │  Commerce (Medusa.js)   Content service      AI Gateway                  │
   │  produkty/objednávky/    programy/články/     1 místo pro AI,            │
   │  sklad/zákazníci         média/stránky        serverové guardraily,      │
   │       │                                       stropy nákladů, audit      │
   │       ▼                                                                  │
   │  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐        │
   │  │ PRICING ENGINE  │   │   SafeOrder     │   │ Notifications   │        │
   │  │ (L-Code)        │   │  (L-Code)       │   │ mail/SMS        │        │
   │  │ jediný zdroj    │   │ riziko → rozhod.│   │ přes adaptér    │        │
   │  │ pravdy o ceně   │   └─────────────────┘   └─────────────────┘        │
   │  └─────────────────┘                                                     │
   └───────────────┬────────────────────────────────┬─────────────────────┘
                   │                                  │
   ┌───────────────▼──────────────┐    ┌─────────────▼──────────────────────┐
   │   DATA (jeden source of truth)│    │   INTEGRAČNÍ ADAPTÉRY               │
   │   PostgreSQL · R2 · KV/D1     │    │   platba (ověřená) · účetnictví/ERP │
   │   automatické zálohy          │    │   (Pohoda-ready) · feedy · analytics│
   └──────────────────────────────┘    └─────────────────────────────────────┘
```

## 2.3 Co která vrstva dělá a proč

- **Edge (Cloudflare) — jedna vstupní brána pro celý ekosystém.** DNS, WAF, DDoS ochrana, TLS/HSTS, CDN a cache pro všechny domény najednou. Frontendy běží jako **Pages** (rychlé, bezpečné), edge logika jako **Workers** (API gateway, směrování, rate-limiting, ambasadorské QR s trackingem přímo na edge). **R2** nahrazuje dnešní rozházené úložiště médií, **KV/D1** drží cache a lehký stav. *Proč:* levné, škálovatelné, platí se za použití, a sjednotí tři ostrovy pod jednu ochranu.
- **Identita / SSO — jedno přihlášení.** Jeden poskytovatel identity pro zákazníky i adminy, role a oprávnění, povinné dvoufaktorové ověření pro administraci. Nahrazuje tři různé přihlašování. *Proč:* kdo-co-smí se řeší na jednom místě a vynucuje všude.
- **Commerce core (Medusa.js).** Moderní, otevřené jádro e-shopu: produkty, varianty, objednávky, sklad, zákazníci. *Proč:* aktuální, udržované, rozšiřitelné, bez lock-inu — opak mrtvého Umbraca.
- **Pricing Engine (náš).** **Jediný počítá ceny** — tiery, ceníky, akce, kupóny, stropy, zaokrouhlení a **ochranu marže** deterministicky. Medusa ho volá, nepočítá ceny sám. *Proč:* přesně tady dnes e-shop „krvácí" (obcházení slev, žádná marže).
- **SafeOrder (náš).** Vyhodnotí rizikovost objednávky a rozhodne (povolit / zkontrolovat / omezit / blokovat). *Proč:* ochrana proti podvodům a ztrátám.
- **Content service.** Společné jádro pro obsah academy i lékárny (programy, články, média, stránky, vícejazyčnost). *Proč:* jeden systém místo dvou kopií téže šablony.
- **AI Gateway.** **Jediné místo, kudy tečou všechny AI funkce** (lékový poradce i budoucí), se **serverově vynucenými bezpečnostními pravidly**, ověřením, rate-limitem, stropy nákladů a auditem. *Proč:* řeší dnešní obejitelný guardrail i nekontrolované náklady.
- **Data — jeden source of truth.** PostgreSQL jako primární databáze (commerce + obsah + identita), R2 na soubory, edge cache nad tím. Automatické zálohy. *Proč:* konec rozházených dat a nejasností „kde je pravda".
- **Integrační adaptéry.** Platba (s **ověřením podpisu i částky** a idempotencí), účetnictví/ERP (**připravené na Pohodu**, pokud ji používáte), produktové feedy, analytika — vše izolované, vyměnitelné. *Proč:* jádro zůstane čisté a nezávislé.

## 2.4 Bezpečnostní základ (proč „neprůstřelné")

- **Deny-by-default** autorizace na bráně i v každé službě — žádná funkce není veřejná omylem.
- **Tajemství v trezoru** (secrets manager), nikdy v kódu.
- **Platby** jen při platném podpisu **a** odpovídající částce, idempotentně (dvojí potvrzení nic nezduplikuje).
- **Sklad a ceny** vždy přepočítané na serveru, v transakci, s pravidly (sklad nejde do záporu).
- **GDPR od základu:** minimalizace dat, evidence souhlasů, šifrování citlivých údajů, auditní log, právo na výmaz. Zvlášť ošetřený zdravotní kontext lékárny.
- **AI** s guardraily na serveru + audit + stropy nákladů.
- **Monitoring a alerting**, logy bez osobních údajů.

## 2.5 Jak ekosystém roste (extensibilita)

Nový web do ekosystému (další značka, kampaňový web, nový jazyk) = **jen nový frontend na Pages napojený na existující bránu, identitu a jádro.** Žádná nová databáze, žádná nová správa, žádné kopírování logiky. Sdílí ceny, identitu, obsah, AI i bezpečnost. **To je smysl jednoho jádra — každý další web je levnější a bezpečnější než ten předchozí.**

---

# ČÁST 3 — MIGRACE: KAM, PROČ, JAK

## 3.1 Kam co migruje

| Dnes | Cílové řešení | Proč |
|---|---|---|
| E-shop (Umbraco 8) | **Medusa.js + Pricing Engine + SafeOrder** na moderním hostu, za Cloudflare edge | pryč z mrtvé platformy; cenotvorba a ochrana objednávek správně od začátku |
| academy + pharmacy (atoms.dev) | **frontendy na Pages + společné jádro** (identita, content, AI gateway) | konec lock-inu na atoms.dev; sjednocení dvou kopií do jednoho jádra |
| Rozházená úložiště/média | **R2** | jedno bezpečné úložiště + zálohy |
| Tři přihlašování | **jedno SSO** | jeden bod kontroly |
| Přímé AI z prohlížeče | **AI Gateway** | bezpečnost + kontrola nákladů |

## 3.2 Migrace dat
- **Produkty, ceny, sklad, objednávky, zákazníci, kupóny** z e-shopu (tabulky `ec*`) se namapují do Medusy (produkt/varianta/ceník/objednávka/zákazník/akce). Postup: zmapovat → zkušební migrace („nanečisto") → porovnat počty a hodnoty → ostrá migrace → ověřit. Nic se nemaže, vše je vratné.
- **Obsah** academy/pharmacy (články, programy, média) se přenese do content service se zachováním vícejazyčnosti.

## 3.3 SEO a QR — nic se nesmí rozbít
- **URL struktura se zachová 1:1** (přes edge přesměrování), zvlášť **ambasadorské QR odkazy e-shopu** — vytištěné kódy musí dál fungovat.
- Doplní se chybějící **sitemap, canonical, hreflang** (dnes chybí) → lepší viditelnost než dnes.
- `anastasiaoz.eu` je 21 let stará doména → její SEO hodnotu migrací **neztratíme**, naopak využijeme.

## 3.4 Fáze (bezpečně, po krocích)

- **Fáze 0 — Hašení (hned, nezávisle na rozhodnutí).** Podepřít nejhorší díry: platby, veřejná administrace, šifrování, vyměnit kompromitovaná hesla. Zastaví aktivní krvácení.
- **Fáze 1 — Základ.** Postavit edge bránu, SSO, datovou vrstvu a Pricing Engine. Nic se ještě nepřepíná, buduje se pevný základ.
- **Fáze 2 — E-shop.** Migrace e-shopu na Medusu, zkušebně → ostře, se zachováním URL/QR. Nejvyšší byznys hodnota.
- **Fáze 3 — Dvojčata.** academy + pharmacy pod společné jádro, AI gateway, guardraily na server.
- **Fáze 4 — Sjednocení a růst.** Jedna správa, jeden monitoring, připravenost na další weby.

Každá fáze je samostatně hodnotná a vratná. Žádný „velký třesk".

---

# ČÁST 4 — NÁKLADY (logika, ne jen číslo)

Přesné číslo dáme po doměření (objemy dat, návštěvnost — viz část 5). Už teď ale platí principy, podle kterých náklady řídíme:

- **Jedna infrastruktura místo tří** = jedny provozní náklady, ne trojnásobek. Dnes platíte a spravujete tři oddělené systémy.
- **Edge (Cloudflare) se platí za použití** a škáluje — levné u malého provozu, zvládne i špičky. Žádný předražený server „pro jistotu".
- **Znovupoužití našich nástrojů** (Pricing Engine, SafeOrder) = neplatíte vývoj věcí, které máme hotové a odzkoušené.
- **Hlavní jednorázový náklad** = návrh jádra + migrace e-shopu. **Provoz pak klesá a je předvídatelný.**
- **Čemu se vyhýbáme:** drahé SaaS na věci, co zvládne edge; zbytečné databáze; duplikace logiky; opakované plné synchronizace.
- **Náklad nedělání:** současné řešení dnes tiše stojí peníze (únik tržby přes platby/slevy) a nese právní riziko (GDPR) — to jsou náklady, které migrace odstraní.

Orientačně členíme nabídku na **Fáze 0 (hašení)** jako samostatnou malou položku, a pak **Fáze 1–4** s cenou za fázi, abyste platila po krocích a viděla hodnotu průběžně.

---

# ČÁST 5 — CO POTŘEBUJEME K DOTAŽENÍ

Abychom dali přesný plán, ceny a časy (ne odhady z ničeho):
1. **Přístup k serverům** všech tří webů (infrastruktura, logy, výkon pod zátěží).
2. **Zálohu databází** (objemy produktů/objednávek/zákazníků → dimenzování a cena migrace).
3. **Google Search Console / analytiku** (návštěvnost, odkazy, URL mapa → bezpečná SEO migrace).
4. **Vaši představu o byznysu:** velkoobchod / cenové skupiny? věrnostní program? provize pro ambasadory? napojení na účetnictví (Pohoda)? → podle toho doladíme doménový model.

---

## Shrnutí jednou větou
Dnešní tři děravé ostrovy nahradíme **jedním bezpečným jádrem s edge bránou**, na kterém poběží e-shop i obsahové weby, bude se správně počítat cena a chránit data, a **každý další web už jen přibude — levně, bezpečně a bez přestavby.**

*Technické podklady (detailní nálezy po webech s místy v kódu, infrastruktura, kompletní struktura dat) jsou k dispozici jako přílohy.*
