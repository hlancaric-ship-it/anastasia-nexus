# Právne texty – čo treba ešte doplniť

**Dátum:** 21. 10. 2026
**Zdroj:** `ANASTASIA_VOP_GDPR_na_schvalenie (2).docx` (odoslané 21. 10. 2026, odpoveď Lucia)
**Stav:** texty častí A–E sú už na webe (5 samostatných stránok). Na webe nie sú zatiaľ hotové — ostali v nich miesta, kde treba doplniť údaje o prevádzkovateľovi.
**Zmena 21. 10. 2026 (večer):** cookies lišta a online funkcia odstúpenia od zmluvy **už sú v repu** (pozri `anastasia-admin/COOKIES-ODSTUPENIE-HOTOVO.md`). Body 2, 3, 4, 5 a nový bod 15 sa tým zmenili — pri dvoch z nich je odkaz na funkciu, ktorá už existuje, a pri cookies je lišta, ktorá ukazuje placeholder.

> **Upozornenie (21. 10. 2026, večer):** cookies lišta a panel „Nastavenia cookies“ sú v repu a bežia na živom webe. Body 4, 5 a 15 sa teda zobrazujú v používateľskom rozhraní — placeholder `[doplní prevádzkovateľ]` je viditeľný návštevníkom v texte lišty aj ako popis voliteľných kategórií. Kým sa body 4, 5 a 15 nedoplnia, lišta zobrazuje text s placeholderom.
>
> **Ako to vyzerá na webe:** každé miesto označené v dokumente `DOPLNIŤ` je zatiaľ na webe nahradené viditeľným znakom **`[doplní prevádzkovateľ]`**. To je len pracovný placeholder — pred spustením webu musí byť nahradený skutočným textom.
> Doplnenia, ktoré zadáte sem, vložíme do stránok (všetky právne texty sa dajú upravovať priamo v administrácii, §3).

---

## 1. Miesta na doplnenie (6)

| # | Stránka | Článok / odsek | Presná citácia z dokumentu | Čo treba doplniť |
|---|---|---|---|---|
| 1 | **VOP** (`/vop`) | čl. **4.2** Ceny a platby | „… Konkrétny spôsob a splatnosť sú uvedené pred objednaním. **[DOPLNIŤ splatnosť prevodu; prípadnú hotovosť alebo dobierku uviesť iba po zavedení.]** Pri prevode je cena uhradená pripísaním na účet…“ | Splatnosť bankového prevodu (v dňoch). Údaj o hotovosti/dobierke uviesť **iba vtedy, ak ich naozaj predávate**. |
| 2 | **VOP** (`/vop`) | čl. **9.2** Odstúpenie od zmluvy bez dôvodu | „… Online funkcia „Odstúpiť od zmluvy tu“ je dostupná **[DOPLNIŤ skutočné umiestnenie a adresu funkcie]**. Po vyplnení zákazník aktivuje „Potvrdiť odstúpenie od zmluvy“…“ | Funkcia **už je v repu** — stránka `/odstupenie`, sekcia „Odstúpiť od zmluvy tu“, tlačidlo „Potvrdiť odstúpenie od zmluvy“. Treba už len rozhodnúť, či do textu napísať konkrétnu adresu (napr. „na stránke Odstúpenie od zmluvy“) alebo odkaz na `/odstupenie`. **Text na webe zatiaľ nemenený** – je 1:1 s dokumentom. |
| 3 | **Odstúpenie od zmluvy** (`/odstupenie`) | oddiel **Poučenie pre zákazníka** | „… Môžete použiť aj online funkciu **[DOPLNIŤ umiestnenie]**. Formulár nižšie nie je povinný…“ | Rovnaké umiestnenie online funkcie ako v bode 2. **Funkcia je na tejto stránke, hneď za textom poučenia a vzorového formulára.** |
| 4 | **Cookies** (`/cookies`) | oddiel **Informácia pre návštevníkov** | „**[DOPLNIŤ pred zverejnením overený zoznam: názov technológie, poskytovateľ a doména, účel, kategória, doba platnosti, príjemcovia a prípadný prenos mimo EHP. Inventár musí zahŕňať domovskú stránku, formuláre, rezerváciu, videá, košík aj platbu. Z označenia Cloudflare alebo Stripe nemožno odvodiť, ktoré konkrétne cookies sú zapnuté.]**“ | Tabuľka používaných cookies: názov, poskytovateľ, doména, účel, kategória, doba platnosti, príjemcovia, prenos mimo EHP. (Zoznam musí vzniknúť z reálneho webu, nie z názvu nástroja.) |
| 5 | **Cookies** (`/cookies`) | oddiel **Text prvej vrstvy lišty** | „… Voliteľné cookies na **[DOPLNIŤ len reálne účely]** použijeme iba s vaším súhlasom…“ | Čo voliteľné cookies reálne robia (napr. analýka návštevnosti, marketing). Ak žiadne nepoužívate, napíšte, že web používa iba nevyhnutné cookies — vtedy lišta nesmie tvrdiť, že súhlasí s analýkou. |
| 15 | **Cookies** (`/cookies`) + panel „Nastavenia cookies“ na každej stránke | názvy voliteľných kategórií | Dokument hovorí o technológiách „najmä analytické a reklamné“ (oddiel Informácia pre návštevníkov). | V lište a v paneli sú dve voliteľné kategórie: **Analytické** a **Marketingové** (názvy podľa zadania pre tento balík). Potvrdiť, či má byť „reklama“ alebo „marketing“, a či sú vôbec potrebné obe — kým sa nepotvrdí zoznam cookies (bod 4), kategórie môžu zostať prázdne a lišta bude informačná (iba nevyhnutné). |

**Kam sa tieto údaje dostanú po doplnení:** body 1–3 do textu stránok VOP a Odstúpenie, body 4–5 do stránky Cookies. Všetky úpravy idú cez administráciu (Obsah webu → Upraviť obsah) alebo priamo do `storefront-prototype/src/legacy-content.json` a `backend/src/lib/content/seed.json`.

---

## 2. Potvrdenia, ktoré v dokumente zostali otvorené (na webe nie sú)

Tieto body sú z úvodného súhrnu „Potvrdené údaje a zostávajúce doplnenia“ — ten **nie je** na webe (nie je zverejnený text pre zákazníkov), ale je potrebné ho uzavrieť:

| # | Kde v dokumente | Čo treba potvrdiť |
|---|---|---|
| 6 | Súhrn, bod 5 – „Pri označení HyGen potvrdiť presný produkt a prevádzkovateľa.“ | Presný názov HyGen a jeho prevádzkovateľ (v časti D je uvedený medzi príjemcami údajov). |
| 7 | Súhrn, bod 5 – „Overiť presné zmluvné subjekty, integrácie, prenosy údajov, cookies, e-mailový a prípadný videohovorový systém.“ | Zmluvné subjekty a prenosy mimo EHP (na webe to stále visí v časti D, bod 5). |
| 8 | Súhrn, bod 6 – držiteľ povolenia na poskytovanie lekárenskej starostlivosti a prevádzkovateľ zdravotných údajov | Je prevádzkovateľom zdravotných údajov LUCRAT spol. s r.o., alebo iný poskytovateľ? (časť D, bod 3). |
| 9 | Súhrn, bod 2 – „Sadzobník dopravy a technické parametre produktov zostávajú na doplnenie.“ | Sadzobník dopravy (podľa krajiny) a technické parametre produktov. |
| 10 | Súhrn, bod 4 – „Pri platených hodnotových poukazoch treba ešte určiť čiastočné čerpanie, zostatok a prenosnosť.“ | Pravidlá pre platené hodnotové poukazy (časť A, čl. 8). |

---

## 3. Preklepy v zaslanom znení (ponechané 1:1 – na potvrdenie)

Texty boli vložené **doslovne**, bez úprav formulácií. V dokumente sú preto tieto preklepy, ktoré sme zámerne **neopravili** — potvrďte, či ich opraviť:

| # | Kde | Presná citácia | Čo s tým |
|---|---|---|---|
| 11 | VOP, čl. **2.5** | „Poskytovateľom zdravotnej starostlivosti je spoločnosť LUCRAT spol. **s..o.** , povolenie … vydal VÚC Košice …“ | „s..o.“ + medzera pred čiarkou. |
| 12 | Ochrana osobných údajov, čl. **3** (2. odsek) | „Poskytovateľom zdravotnej starostlivosti je spoločnosť LUCRAT spol. **s..o.** , povolenie …“ | To isté. |
| 13 | Ochrana osobných údajov, čl. **7** (posledná veta) | „… Osobitne posúdiť prípadné automatické zamietanie objednávok a platobné kontroly**].**“ | Zátvorka naviac na konci vety (text končí bodkou, potom „]“). |
| 14 | VOP, čl. **2.5** a Ochrana údajov, čl. **3** | dvojité medzery v texte („vydal  VÚC“, „nakladá  v súlade“, „poriadku .“) + medzera pred čiarkou („s..o. ,“) | Nejednotné medzery. |

---

## 4. Čo s tým spravíme my

1. Vyplníte tabuľky v §1 a §2 (stačí poslať odpovede e-mailom).
2. My dosadíme texty na webe — na miestach placeholderov, nie inde.
3. Pred spustením zmeníme verzie právnych textov v backende na `2026-10-21` (nové znenie = nový dátum), aby si pokladňa vyžiadala nový súhlas.
4. Preveríme, či súhlas v pokladni a newsletter funguje s novými verziami (test + ručná skúška). Staré súhlasy v databáze nemusíme mazať – zákazňa nové znenie pri nákupe odoberie znova.
