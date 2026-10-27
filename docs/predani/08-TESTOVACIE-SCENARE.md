# 08 – Testovacie scenáre Fázy 1 (príloha č. 1 zmluvy)

**Pre:** Mgr. Lucia Rogožanová, LUCRAT spol. s r.o.
**Vypracoval:** L-Code Dynamics
**Verzia:** 27. 10. 2026
**Na čo slúži:** Podľa týchto scenárov schvaľujete Fázu 1 (čl. 4 zmluvy). Každý bod má políčko. Označte, čo funguje, a pri tom, čo nefunguje, napíšte, čo ste presne robili.

---

## Kde testujete

| Čo | Adresa |
|---|---|
| Váš web | `https://anastasia-test.l-code-dynamics.com` |
| Vaša administrácia | `https://anastasia-test-admin.l-code-dynamics.com` |

Prístupové údaje do administrácie Vám odovzdáme osobne alebo cez bezpečný kanál, nikdy nie e-mailom.

**Dôležité pre testovanie:**
- Platby bežia v **testovacom režime**. Skutočná karta sa nestrháva a peniaze sa nikam neposielajú.
- Testovacia karta: číslo `4242 4242 4242 4242`, ľubovoľný budúci dátum platnosti, ľubovoľný trojčíselný kód CVC.
- Apple Pay a Google Pay môžete vyskúšať aj so svojou skutočnou kartou. V testovacom režime sa nestrhne.
- E-maily sa na teste doručujú iba na Vaše adresy (zdravysvet@anastasiaoz.eu, zdravysvet.anastasiaoz@gmail.com, lucia.rogozanova@gmail.com, info@aianastasia.com). Zákazníkom sa z testu nič neposiela.
- Testovacie stránky vyhľadávače neindexujú. Na Vašu doménu `anastasiaoz.eu` sa systém presunie až po Vašom schválení.

---

## 1. Nákup produktu

1. Otvorte obchod a vyberte ľubovoľný produkt, vložte ho do košíka.
2. V košíku uplatnite zľavový kupón (ak nejaký máte, alebo ho vytvorte podľa scenára 5).
3. Choďte do pokladne. Ak ste prihlásená, meno, e-mail a adresa sú vyplnené z účtu. Ak nie ste, vyplňte ich.
4. Vyberte doručenie (kuriér alebo osobný odber) a zaplaťte **kartou**.
5. Zopakujte nákup s **Apple Pay** (iPhone v Safari) a s **Google Pay** (Android v Chrome).
6. Vyskúšajte aj **dobierku** a **prevod na účet**.

**Čo má nastať:**
- Pokladňa ponúka kartu, Apple Pay, Google Pay, dobierku a prevod. Žiadne iné platobné metódy.
- Zľava z kupónu je v košíku aj v cene objednávky.
- Po platbe uvidíte poďakovanie a príde potvrdzovací e-mail.
- Objednávka je v administrácii a v Účte v časti Objednávky.

☐ Karta ☐ Apple Pay ☐ Google Pay ☐ Dobierka ☐ Prevod ☐ Kupón ☐ E-mail
Poznámka: ____________________________________________

---

## 2. Nákup programu RESET 40+ a sprístupnenie obsahu

1. Kúpte program RESET 40+ (cez tlačidlo v obchode alebo na stránke programu).
2. Zaplaťte testovacou kartou.
3. Otvorte Môj účet → Moja knižnica.

**Čo má nastať:**
- Po zaplatení sa program sprístupní **automaticky**, bez Vášho zásahu.
- V knižnici je 16 týždňov s videami a PDF materiálmi, plus úvodné video. Každý týždeň má 7 PDF (posledný týždeň 6) a týždeň 17 má iba video.
- Video sa prehrá až po kliknutí. PDF sa otvorí v novom okne.
- **Bez zakúpenia** obsah nie je dostupný: prihláste sa iným účtom, ktorý program nekúpil, a v knižnici ho nenájdete. Adresu videa alebo PDF z knižnice nemožno otvoriť bez prihlásenia.

☐ Sprístupnenie po platbe ☐ Videá ☐ PDF ☐ Bez nákupu nedostupné
Poznámka: ____________________________________________

---

## 3. Prihlásenie existujúcej zákazníčky po migrácii

Zákazníčky zo starého webu sú v novom systéme prenesené aj s históriou objednávok a kúpenými prístupmi. **Heslá zo starého webu sa neprenášajú.** Zákazníčka sa prihlási e-mailom.

1. Otvorte Prihlásenie a zadajte e-mail zákazníčky zo starého webu (môžete použiť svoj vlastný, ktorý na starom webe existoval).
2. Kliknite **Poslať prihlasovací odkaz na e-mail** a otvorte odkaz z e-mailu.
3. Skontrolujte Môj účet: objednávky, kúpené programy, Moja knižnica.
4. V časti **Môj profil** nastavte heslo. Odhláste sa a prihláste sa e-mailom a heslom.
5. Zatvorte prehliadač a otvorte web znova.

**Čo má nastať:**
- Po prvom prihlásení je účet zákazníčky **ten istý** (nie nový prázdny). Staré objednávky a kúpené prístupy sú na mieste.
- Prihlásenie heslom funguje. Pri zlom hesle sa zobrazí zrozumiteľná hláška.
- Prihlásenie vydrží **30 dní**, aj po zatvorení prehliadača. Tlačidlo Odhlásiť sa ho zruší.

☐ Rovnaký účet a história ☐ Kúpené prístupy ☐ Heslo ☐ 30 dní ☐ Odhlásenie
Poznámka: ____________________________________________

---

## 4. Staré adresy a vytlačené QR kódy

Staré adresy musia viesť na správne stránky nového webu (trvalé presmerovanie 301).

1. Otvorte tieto adresy a skontrolujte, kam Vás web presmeruje:

| Stará adresa | Má viesť na |
|---|---|
| `/darcekovy-poukaz` | obchod, kategória darčekové poukazy |
| `/zdrava-lekaren` | obchod |
| `/eshop/kategoria/kozmetika` | obchod, kategória biokozmetika |
| `/nova-registracia` | prihlásenie |
| `/programy` | stránka Academy |
| `/moj-ucet/moje-elektronicke-produkty` | Váš účet |

2. Naskenujte mobilom **vytlačený QR kód** zo starého letáka (ak ho máte) a skontrolujte, kam vedie.

**Čo má nastať:** Každá stará adresa a QR kód Vás zavedie na zodpovedajúcu stránku nového webu, nie na chybovú stránku.

☐ Adresy ☐ QR kódy z letákov
Poznámka: ____________________________________________

---

## 5. Generátor QR kódov na zľavy

1. V administrácii otvorte **Poukazy a zľavy** a vytvorte nový zľavový kupón.
2. Pri kupóne vytvorte **QR odkaz**. Systém vygeneruje adresu s automatickou zľavou a QR kód.
3. Stiahnite QR kód (pripravený na tlač).
4. Naskenujte QR kód mobilom alebo otvorte adresu.

**Čo má nastať:**
- Adresa otvorí obchod a zľava sa **uplatní automaticky** v košíku.
- QR kód sa dá stiahnuť a vytlačiť.

☐ Kupón ☐ QR odkaz ☐ Stiahnutie QR ☐ Zľava sa uplatní
Poznámka: ____________________________________________

---

## 6. Administrácia

Overte, že celý systém spravujete sama:

1. **Produkty:** zmeňte názov, cenu a obrázok produktu, pridajte nový produkt. Zmena je hneď na webe.
2. **Ceny a kategórie:** upravte kategóriu a poradie produktov v obchode.
3. **Kupóny:** vytvorte, upravte a deaktivujte kupón.
4. **Objednávky:** otvorte objednávku, skontrolujte jej detail, vytlačte štítok a dodací list.
5. **Zákazníci:** nájdite zákazníčku, pozrite si jej objednávky a prístupy.
6. **Obsah:** upravte text na stránke bez toho, aby sa rozbil vzhľad.

Podrobný návod je v dokumente `06-NAVOD-ADMINISTRACIA`.

☐ Produkty ☐ Ceny a kategórie ☐ Kupóny ☐ Objednávky ☐ Zákazníci ☐ Obsah
Poznámka: ____________________________________________

---

## 7. Zabezpečenie

1. Do administrácie sa nedá dostať bez prihlásenia.
2. Chránený obsah (videá, PDF z RESET 40+) nie je dostupný bez zakúpenia a prihlásenia.
3. Po odhlásení sa už z účtu nedá otvoriť objednávka ani knižnica.
4. Pri 11 zlých pokusoch o heslo sa prihlásenie na chvíľu zablokuje.

☐ Administrácia ☐ Chránený obsah ☐ Odhlásenie ☐ Brzda hesla
Poznámka: ____________________________________________

---

## Výsledok testovania

☐ Fáza 1 sa schvaľuje bez výhrad
☐ Fáza 1 sa schvaľuje s drobnými vadami (zoznam nižšie)
☐ Fáza 1 sa neschvaľuje (zoznam nižšie)

**Zoznam vád:** (čo ste robili, čo ste čakali, čo sa stalo, ideálne so snímkou obrazovky)

1. ____________________________________________
2. ____________________________________________
3. ____________________________________________

Podľa zmluvy (čl. 4) máte na schválenie alebo písomný zoznam vád **7 dní** od odovzdania na testovanie. Drobné vady opravíme do 14 dní a nebránia schváleniu.

Pomoc počas testovania: ceo@l-code-dynamics.com
