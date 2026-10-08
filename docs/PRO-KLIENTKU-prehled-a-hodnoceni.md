# ANASTASIA — přehled vašich webů a naše prvotní hodnocení

**Pro:** Lucia Rogožanová (LUCRAT s.r.o.)
**Od:** L-Code Dynamics · **Datum:** 7. 10. 2026
**Co to je:** srozumitelné shrnutí toho, co dnes máte, v jakém je to stavu a co z toho plyne. Technické detaily jsou v samostatných přílohách — tady jde o to, abyste měla jasno vy.

---

## 1. Co dnes máte

Máte **tři weby**, které navenek vypadají jako jedna značka, ale uvnitř jsou to **tři úplně různé systémy** od různého původu:

| Web | K čemu slouží | Postavené na |
|---|---|---|
| **anastasiaoz.eu** | Váš **e-shop** — prodej, košík, platby, sklad | starší systém na míru (Umbraco + .NET) |
| **anastasia.academy** | **Vzdělávací web** — programy, články, videa | moderní web generovaný přes AI nástroj (atoms.dev) |
| **aianastasia.com** | **AI lékový poradce** — rady o lécích a doplňcích | tentýž moderní AI nástroj jako academy |

Zjednodušeně: **jeden e-shop a dvě „dvojčata"** (academy a lékárna jsou technicky skoro totožné, běží i na stejném serveru).

---

## 2. Na čem to běží (lidskou řečí)

- **E-shop** běží na **letité technologii, které už skončila podpora** (Umbraco verze 8 — od února 2025 nedostává bezpečnostní aktualizace). Je to jako auto, na které už výrobce nedělá náhradní díly. Server je u Websupportu, e-maily přes Active24.
- **Academy a lékárna** běží na **moderní platformě (atoms.dev)**, kterou generuje umělá inteligence. Výhoda: je nová a aktuální. Nevýhoda: jste vázaná na tuto platformu a šablona, ze které vznikly, má **od výroby vypnuté zabezpečení** (víc níže).
- **Celý ekosystém (všechny tři domény) je spravovaný přes jeden účet u Websupportu** — to je pohodlné, ale zároveň to znamená, že kdo se dostane k tomu účtu, ovládne všechny tři weby najednou.

---

## 3. Co jsme zjistili — a co to znamená pro vás

Udělali jsme nezávislý bezpečnostní a technický audit. Píšeme to na rovinu, protože to tak potřebujete slyšet, ne abychom strašili. **Nálezy jsou vážné.**

### E-shop (anastasiaoz.eu) — nejrizikovější, protože jde o peníze
- 🔴 **Dá se „zaplatit" bez zaplacení.** Systém po platbě dostatečně neověřuje, že peníze skutečně přišly. Útočník si může objednat zboží (hlavně elektronické produkty) a systém to označí jako zaplacené. → **přímá ztráta tržby.**
- 🔴 **Dá se převzít celý server.** Kvůli jedné díře může kdokoli z internetu nahrát škodlivý program a ovládnout web. → **výpadek e-shopu, krádež dat, zneužití.**
- 🔴 **Administrace e-shopu je volně přístupná z internetu** a web běží i bez šifrování (bez „zámečku" v prohlížeči na serverové úrovni). → **riziko převzetí účtů a odposlechu.** (Ověřeno naživo.)
- 🔴 **Dají se obejít ceny a slevy.** Slevové kupóny jdou kombinovat nad rámec pravidel, množství a ceny se při dokončení objednávky nepřepočítávají. → **prodej pod cenou, ztráta marže.**
- 🔴 **Data zákazníků jsou zranitelná** (objednávky, PDF faktury lze zobrazit i cizí). → **únik osobních údajů = GDPR problém.**

### Lékárna (aianastasia.com) — největší riziko je odpovědnost
- 🔴 **Bezpečnostní pravidla AI poradce nejsou vynucená na serveru, jen „na oko" v prohlížeči.** Kdo umí, obejde je a donutí AI dávat **neomezené rady o lécích** pod hlavičkou vaší lékárny — a účtuje se to na váš AI účet. → **odpovědnost za špatnou radu + náklady.**
- 🔴 **Kontaktní údaje lidí, kteří žádali o konzultaci, jsou volně přístupné** (jméno, e-mail, telefon). → **GDPR, zvlášť citlivé u zdravotní tematiky.**
- 🔴 **Recenze si může kdokoli sám schválit a zveřejnit** — i falešné. → **manipulace důvěry.**

### Academy (anastasia.academy) — nejnižší riziko, ale stejná vada
- 🔴 **Většina webu jde ovládat bez přihlášení** — kdokoli může měnit nebo mazat obsah a stáhnout kontakty/newsletter. → **vandalismus obsahu, únik kontaktů.**
- 🔴 Navíc se přes jednu funkci dají **vyčíst interní hesla a nastavení serveru.**

### Společné pro všechny tři
Pod všemi nálezy je **jedna hlavní příčina: weby na serveru dostatečně nehlídají „kdo co smí".** U e-shopu je to vrozené špatným návrhem, u dvojčat tím, že šablona má zabezpečení od výroby vypnuté a nikdo ho nedoplnil.

---

## 4. Proč si za naším auditem stojíme

- **Nezávislost.** Nejsme autor žádného z těch webů — nemáme důvod cokoli zakrývat ani nafukovat. Hodnotíme, co jsme reálně našli.
- **Důkazy, ne dojmy.** Každý nález máme podložený konkrétním místem v kódu (soubor + řádek) v technických přílohách. Klíčové věci u e-shopu jsme navíc **ověřili naživo** (např. že je administrace veřejně dostupná a web běží bez šifrování) — ne jen z kódu.
- **Čtyři pohledy.** Audit dělal tým ze čtyř rolí (backend/sklad, cenotvorba, zabezpečení, „útočník") + nezávislá rešerše infrastruktury. Nálezy jsme navzájem ověřovali.
- **Férovost.** Kde je něco v pořádku, říkáme to taky (např. ceny se u e-shopu berou správně z databáze; moderní weby mají dobře postavené přihlašování, jen ho nepoužívají). **Nebarvíme všechno načerno.**
- **Rozsah.** Prošli jsme všech sedm oblastí — od inventury systému, přes bezpečnost a obchodní logiku, až po infrastrukturu, výkon a SEO. Co jsme bez vašich přístupů nemohli doměřit (reálná data, zátěž, návštěvnost), **poctivě označujeme jako nedokončené** — neděláme závěry z ničeho.

---

## 5. Naše prvotní hodnocení

| | E-shop | Academy | Lékárna |
|---|---|---|---|
| **Bezpečnost** | 🔴 kritická | 🔴 kritická | 🔴 kritická |
| **Technologie** | 🔴 po konci podpory | 🟢 moderní | 🟢 moderní |
| **Rychlost** | 🟢 rychlý | 🟡 pomalejší náběh | 🟡 pomalejší náběh |
| **SEO (viditelnost)** | 🔴 zanedbané | 🟡 částečné | 🟡 částečné |
| **Riziko pro byznys** | 🔴 peníze + data | 🟡 obsah + kontakty | 🔴 odpovědnost + data |

**Celkový verdikt:** Weby fungují a navenek vypadají dobře, ale **pod kapotou jsou otevřené na místech, která se dají zneužít bez velké námahy.** Není to otázka „jedné chybičky" — jde o systémové vady. Dobrá zpráva: **víme přesně, kde jsou, a víme, jak je opravit.**

**Co doporučujeme (v kostce):**
1. **E-shop:** postavit nově na moderním základu (pryč z nepodporované technologie), s cenotvorbou a ochranou objednávek postavenou správně od začátku. Do té doby **okamžitě podepřít nejhorší díry** (platby, administrace, šifrování).
2. **Academy + lékárna:** **opravit na místě** — platforma je moderní, stačí doplnit chybějící zabezpečení (u obou najednou, jsou to dvojčata) a u lékárny přesunout bezpečnostní pravidla AI na server.
3. **Společně:** zabezpečit hlavní účet (Websupport), vyměnit hesla, která se objevila v kódu, a sjednotit správu.

**Co potřebujeme od vás pro dokončení** (bez toho bychom jen hádali): přístup k serverům, zálohu databáze, přístup do Google Search Console a vaši představu, kam chcete byznys posunout (velkoobchod? věrnostní program? provize pro ambasadory?).

---

### Přílohy (technické, k dispozici)
Kompletní přehled, detailní nálezy po webech (s místy v kódu), infrastruktura/domény/SEO a strukturální mapa pro návrh nového řešení. Rádi vše projdeme osobně.

---

## Ověřeno naživo (7. 10. 2026)

Nešlo jen o rozbor kódu. Se souhlasem jsme se podívali přímo dovnitř a potvrdili to nejdůležitější přímo na ostrém systému:
- V administraci e-shopu byl **zapomenutý neznámý účet s plnými právy, nepřihlášený od roku 2022**, dodavatel měl stále plný přístup a vy jste měla jen roli editora. **Všechno jsme na místě napravili** — přístup teď drží jen vy a my.
- Administrace **nemá žádné rozhraní pro správu objednávek, produktů a zákazníků** — ty jsou jen v databázi. Bez programátora si e-shop prakticky nespravíte.
- E-shop je **malý a přehledný** (desítky produktů, desítky objednávek, jednotky registrovaných zákazníků). To je dobrá zpráva: **přechod na nový systém je díky malému objemu nízkorizikový a rychlý.**
