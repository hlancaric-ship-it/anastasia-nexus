# KULATÝ STŮL — celkový pohled na ekosystém Anastasia + rozhodnutí
**Datum:** 7. 10. 2026 · **Koordinace:** Jarvis
**Účastníci:** Černá Mamba (backend/data/sklad/doprava) · Kapitán Flemazánka (cenotvorba) · Jarvis (zabezpečení + architektura) · Red-team (útočné řetězy)
**Na stole:** kompletní audit (5 domén, 7 bodů) + byznysové zadání majitelky (10 pilířů) + návrh cílové architektury (centralizovaná Medusa/NEXUS) + roadmapa + model nacenění.

> Cíl sezení: jedno jasné doporučení pro Honzu — **co stavíme, v jakém pořadí, co hoří, a kde jsou červené čáry.**

---

## 0. Výchozí stav (fakta, na kterých se shodneme)

- **Ekosystém = 5 domén:** anastasiaoz.eu (e-shop, Umbraco 8 EOL/.NET/MSSQL, hosting Active24), anastasia.academy + aianastasia.com (React+FastAPI na atoms.dev), zlatabrana.gold + .online (zaparkované, budoucí projekt na investiční zlato).
- **Audit hotový** do maxima: bezpečnost, infra/DNS/TLS, data (z DB.sql), výkon (+ zátěžový test se souhlasem), SEO (z GSC). Živě ověřena a majitelkou opravena správa adminů (osiřelý admin od 2022, dodavatel-admin, majitelka byla jen Editor).
- **Byznys:** 10 klientek (start v září), prémiová/bonitní klientela, osa = wellness / zdravé stárnutí. Produkty: digitální + vlastní kosmetika + italské zboží. Vlajková služba: personalizovaný audit léků (AI Anastasia). Media-first (video/audio). Dnes se přístup klientů řeší ručně zprávou.
- **Zadání:** jeden centralizovaný commerce (Medusa), prémiový autorský dojem, členství + entitlements, multijazyčnost (AI překlad, žádné ruční překlady), ambasadoři, majitelský přehled, rozšiřitelnost (další weby jako funnel k jedné nákupní doméně). Starý e-shop běží do čistého přepnutí.

---

## 1. Verdikty jednotlivých rolí

### 🟣 Jarvis (zabezpečení + architektura)
Současný e-shop je **systémově prolomitelný** (3 kořenové vady: veřejné API bez autorizace, důvěra klientovi, tajemství v plaintextu) a běží na **EOL platformě** se závislostí na odcházejícím autorovi. Opravovat cizí EOL kód je slepá ulička. **Migrace na centralizovanou Medusu je správně** — autorizaci, cenotvorbu a identitu postavíme od začátku pořádně. Ale pozor: *zadání je velké* (10 pilířů) — bez fázování a bez zafixovaného rozsahu nás to utopí. A **vlajková služba (audit léků) je zároveň nejrizikovější část** (zdravotní data + regulace) — musí vzniknout bezpečně, ne jako teď.

### 🟡 Kapitán Flemazánka (cenotvorba)
Dnešní cenotvorba je **děravá**: finalizace nepřepočítá ceny/slevy, kupóny se stackují, `memberId` z klienta → zákazník si zvolí velkoobchodní hladinu, **a v kódu vůbec neexistuje nákupní cena → nulová ochrana marže.** U prémiového byznysu s vlastní kosmetikou a italským zbožím je marže celý point. **Trvám na tom, že cenotvorba půjde přes náš Pricing Engine** (deterministicky: nejvyšší sleva vyhrává, žádné stackování, přepočet z DB, ochrana marže). Ambasadorský program = provize → o důvod víc mít cenu/provizi na serveru, ne u klienta.

### 🔴 Černá Mamba (backend/data/sklad)
Backend starého e-shopu má **sklad do záporu, ztrátu přesnosti u váhového zboží, race condition při dokončení objednávky, neidempotentní finalizaci** (dvojí odpis / spálené číslo objednávky). Pod zátěží to padá — a to měříme: **strop 5 souběžných požadavků, pak timeouty.** Medusa tyhle věci řeší správně. Můj hlavní bod ale je **MIGRACE DAT:** 10 klientek, členové, objednávky, entitlements. *Nikdo nesmí přijít o to, co koupil.* Migrace = jednorázová, idempotentní, ověřená počty (zdroj vs cíl), hesla přes reset (ne plaintext). Media (video/audio) **nikdy** z aplikace — Stream/R2, jinak se origin složí úplně.

### ⚫ Red-team (útočné řetězy)
Dokud běží starý e-shop paralelně, **útočné řetězy jsou živé:** webshell přes FileUpload (RCE), padělání CardPay platby (zboží zdarma + „zaplaceno"), převzetí účtu/admina, exfiltrace dat zákazníků, admin po HTTP. **Paralelní běh = měsíce otevřených dveří.** Když to nepodepřeme hned (fáze 0), migrace nás nezachrání — do přepnutí nás někdo může položit, okrást nebo kompromitovat data klientek. A u nového systému: **audit léků + zdravotní data jsou terč č. 1** — guardraily musí být na serveru, ne ve frontendu (na pharmacy webu šly obejít).

---

## 2. Sporné body (kde se role střetly — a jak jsme to zavřeli)

**Spor 1 — Opravit vs. migrovat starý e-shop?**
Flemazánka i Mamba nejdřív chtěli „opravit nejhorší a jet dál". Red-team i Jarvis proti: opravovat EOL kód s odcházejícím autorem = plýtvání. → **Shoda: migrovat (nová centralizovaná Medusa), starý jen DOČASNĚ podepřít (fáze 0) do cutoveru. Žádná velká investice do starého kódu.**

**Spor 2 — Jak moc hned?**
Jarvis varoval před „velkým třeskem" (10 pilířů najednou). Mamba souhlasí (migrace dat chce klid). → **Shoda: fázovat. Fáze 1 = prémiový e-shop + členství + migrace → cutover. Zbytek (media platforma, jazyky, ambasadoři, dashboard, audit léků, Zlatá brána) navazuje.** První hodnota rychle, ne všechno naráz.

**Spor 3 — Audit léků: pustit, nebo odložit?**
Red-team chtěl odložit (regulační riziko). Jarvis: je to vlajková služba, nejde ji zahodit. → **Shoda: NEspěchat ji do fáze 1. Postavit ji později (fáze 3) správně — serverové guardraily, odborný dohled, ochrana zdravotních dat, disclaimery. Do té doby ji neprovozovat v děravé podobě.**

**Spor 4 — Kdo platí provoz?**
Shoda napříč: NEXUS dáváme jako dárek (IP zůstává naše), práci účtujeme, ale **provozní náklady (Stream/R2, AI překlad, platby, domény) nese klientka** — jinak media-first byznys platíme my.

---

## 3. KONSENZUS — doporučení pro Honzu

> **Migrovat na jeden centralizovaný commerce (Medusa + NEXUS), fázovaně, s okamžitým podepřením starého e-shopu po dobu paralelního běhu. Cenotvorba přes Pricing Engine, riziko přes SafeOrder, identita/členství/entitlements centrálně. Audit léků až jako zpevněná služba později.**

Jednohlasně. Rozdíl oproti minulému kulatému stolu: tehdy to byla volba A/B jen pro e-shop — teď je rozhodnutí **jasně B**, protože byznysové zadání (centralizace, členství, media, multijazyk, platforma) stejně vyžaduje nové řešení; opravovat starý e-shop by byla dvojí práce.

---

## 4. Akční plán (priorita shora)

| # | Akce | Role | Fáze | Pozn. |
|---|------|------|------|-------|
| 1 | **Podepřít starý e-shop** (CardPay podpis+částka, zavřít upload, HTTPS+skrýt /umbraco, reset token, rotace tajemství) | Jarvis+Red-team | 0 🔴 | hoří, dělá se hned, paralelně |
| 2 | Medusa jádro + autorský storefront (SK/CS) + katalog (digi+kosmetika+IT zboží) | Mamba+Jarvis | 1 | centrální nákupní doména |
| 3 | Cenotvorba na **Pricing Engine**, riziko na **SafeOrder** | Flemazánka | 1 | marže + žádné podvody |
| 4 | **Migrace dat** (členové, zákazníci, objednávky → entitlements), reset hesel, ověření počtů | Mamba | 1 | nikdo nepřijde o přístup |
| 5 | Členská sekce + entitlements + SEO redirect mapa (z auditu) → **CUTOVER** | Mamba+Jarvis | 1 | vypnout starý web |
| 6 | Media-first (Stream/R2 + přehrávač + transkripty), multijazyk (AI překlad+cache), ambasadoři, dashboard | všichni | 2 | navazuje na jádro |
| 7 | **Audit léků** jako zpevněná služba + **Zlatá brána** jako 2. funnel site | Jarvis+Red-team | 3 | compliance + rozšíření |

---

## 5. Červené čáry (nenegociovatelné)

1. **Zdravotní data + audit léků:** serverové guardraily, odborný dohled, zvláštní režim GDPR. Nikdy děravě jako na pharmacy webu.
2. **Migrace dat:** idempotentní, ověřená počty, hesla přes reset — žádná ztráta přístupů klientek.
3. **Cenotvorba a provize na serveru** (Pricing Engine), nikdy řízené klientem.
4. **Paralelní běh starého webu = fáze 0 povinná** — nenechat kritické díry otevřené do cutoveru.
5. **Platby a zápisy do produkce jen s explicitním souhlasem** (sync, cutover, migrace = samostatné „go").

---

## 6. Otevřená rozhodnutí pro Honzu / majitelku (byznys, ne technika)

1. **Rozsah fáze 1** (co přesně je v prvním cutoveru) → od toho závisí závazný termín.
2. **Design/art direction + obsah + feed italského dodavatele** — kdo a kdy dodá (to, ne kód, je úzké hrdlo).
3. **Platby:** zůstat CardPay, nebo moderní brána k Meduse.
4. **Jazyky do startu** (tip SK/CS/EN).
5. **Model nacenění** (interně: práce účtujeme, NEXUS zdarma, provoz klientky).

---

### Podklady k stolu
`MASTER-AUDIT-ANASTASIA.md` · `BRIEF-ciloveho-systemu-a-roadmapa.md` · segmenty: INFRA/DNS/DATA/VYKON/SEO + bezpečnostní segmenty webů · `CELKOVY-POHLED-kulaty-stul.md` (předchozí, jen e-shop/bezpečnost) · `POKRYTI-vs-MEZERY.md`.
