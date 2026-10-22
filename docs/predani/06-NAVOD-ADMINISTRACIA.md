# 06 – Návod k administrácii

**Pre:** Mgr. Lucia Rogožanová, LUCRAT spol. s r.o.
**Vypracoval:** L-Code Dynamics
**Verzia:** 22. 10. 2026

---

## 1. Úvod a prihlásenie

Administrácia je Vaše pracovné prostredie. Je celá v slovenčine a nič v nej nie je technické. Tento návod prechádza agendu po agende, od prihlásenia po každodennú prácu.

**Adresa administrácie:** pri ostrom obchode `https://admin.anastasiaoz.eu`. Počas testovania to bola adresa testovacej administrácie, ktorú ste dostali od dodávateľa.

**Prihlásenie:** e-mail a heslo, ktoré Vám odovzdáme osobne alebo cez bezpečný kanál, nikdy nie e-mailom. Po prihlásení sa dostanete na **Prehľad**.

Ak máte zapnuté dvojfaktorové overenie, administrácia si po hesle vypýta aj šesťmiestny kód z aplikácie v telefóne.

**Čo v administrácii nenájdete:** nastavenia servera, kľúče a technické zálohy. Tie patria dodávateľovi a sú zámerne mimo Vášho pracovného prostredia.

---

## 2. Prehľad – čo treba urobiť dnes

Na začiatku vidíte tri čísla a zoznam úloh:

- **Na vybavenie** – koľko objednávok čaká, kým ich zabalíte a pošlete.
- **Nové správy** – koľko zákazníkov čaká na odpoveď.
- **Dnešné konzultácie** – s kým máte rezerváciu.

Pod tým je **Pripravenosť obchodu** (zelená znamená, že všetko je v poriadku) a panely **Tržby**, **Najpredávanejšie produkty** a **Nízky sklad**. Ak svieti žltá, kliknite na odkaz a administrácia Vás prevedie priamo na miesto, kde treba vec opraviť.

Vľavo hore je **vyhľadávanie**. Napíšte meno, e-mail alebo číslo objednávky a administrácia Vám ponúkne, kde to nájdete.

---

## 3. Objednávky

Kliknite na **Objednávky** vľavo. Hore sú záložky, pod nimi tabuľka a dole stránkovanie.

| Záložka | Čo Vám ukáže |
|---|---|
| Všetky | všetky objednávky |
| **Na vybavenie** | zaplatené objednávky, ktoré ešte treba poslať, toto je Váš denný zoznam |
| Čaká na platbu | objednávky, ktoré zákazník nezaplatil, napríklad dobierka alebo prevod |
| Odoslané | už odoslané objednávky |
| Zrušené a archív | zrušené a historické objednávky |

Do vyhľadávacieho poľa napíšte číslo objednávky, e-mail zákazníka alebo názov produktu. Keď označíte viac objednávok zaškrtávadlom vľavo, objaví sa lišta **Označené objednávky**. Tam viete naraz vytlačiť viac štítkov, viac dodacích listov a exportovať tabuľku do CSV pre Excel.

### 3.1 Tlač štítka a dodacieho listu

- **Štítok** je malá adresná etiketa formátu A6 na obálku. Obsahuje meno, adresu, kód objednávky a spôsob dopravy.
- **Dodací list** je A4 s položkami, cenami, dopravou a adresou.

Tlačí sa tlačidlom pri objednávke, prípadne hromadne pre označené objednávky. Otvorí sa okno tlače. Vyberte tlačiareň alebo obyčajné „Uložiť ako PDF“, ak netlačíte.

**Pozor:** prehliadač musí povoliť vyskakovacie okná pre túto stránku. Ak sa okno neotvorí, kliknite na tlačidlo znova a povoľte vyskakovacie okná.

### 3.2 Detail objednávky

Kliknutím na riadok sa otvorí detail so záložkami:

- **Prehľad** – zákazník, stav platby, doručovacia a fakturačná adresa a poznámka k objednávke. Poznámku vidíte iba Vy, hodí sa napríklad na „zabalené darčekovo“.
- **Položky** – čo zákazník kúpil.
- **Odoslanie** – tlačidlo **Pripraviť** označí položky ako pripravené, potom **Označiť ako odoslanú** s číslom zásielky. Keď potvrdíte, zákazník dostane e-mail.
- **Platby** – pri prevode a dobierke tlačidlo **Prijať platbu**. Až vtedy sa zákazníkovi sprístupní digitálny obsah. Tlačidlo **Vrátiť peniaze** vráti sumu, a to aj čiastočne.

Objednávku viete aj zrušiť. Zrušenie uvolní rezerváciu skladu. Ak už bola platba prijatá, vrátenie peňazí je samostatný krok, ktorý sa robí cez Stripe.

---

## 4. Produkty a ceny

### 4.1 Fyzické produkty

**Produkty → Nový produkt**: názov, cena v EUR, obrázok (JPG, PNG alebo WebP do 5 MB), kód SKU, typ dopravy (fyzický tovar, digitálny produkt alebo služba), kategórie a predajné kanály.

Pri úprave existujúceho produktu nájdete v záložke **Základné údaje** aj:

- **EAN (čiarový kód)** a **hmotnosť v kg**, ktoré sa použijú vo feede pre porovnávače a pri doprave,
- **cenu s DPH**. Ceny v obchode sú vrátane DPH, takže zákazník vidí rovnakú výšku, akú nastavíte.

Záložka **Sklad** ukazuje, koľko kusov je na sklade. Zoznam produktov má stĺpec **Sklad** a zvýrazní vypredané položky a nízky stav zásob.

Produkt bez ceny a bez predajného kanála sa nedá zverejniť. Administrácia Vás na to upozorní, aby nevznikol produkt, ktorý sa nedá kúpiť.

V zozname produktov filtrujte **Fyzické a digitálne** a podľa stavu (zverejnené, koncept). Ak označíte viac produktov, lišta Vám umožní zverejniť ich naraz alebo uložiť ako koncepty.

### 4.2 Zmena ceny

Cena sa mení priamo v detaile produktu. Server pri uložení skontroluje, že cena medzičasom nezmenila niekto iný. Ak áno, administrácia Vás upozorní a Vy potvrdíte novú hodnotu. Tým sa zabráni tichému prepísaniu ceny.

Zľavové zoznamy a akcie sa nemenia spolu so základnou cenou. Sú samostatné nastavenie.

### 4.3 Digitálne produkty

Pri novom digitálnom produkte (typ dopravy **Digitálny produkt**) Vás administrácia po vytvorení prevedie na záložku **Zakúpený obsah**. Tam sa priraďujú súbory (MP4, MP3, PDF), ktoré zákazník dostane po zaplatení.

Súbory sú chránené. Zákazník ich môže prehrať, ale nedostane priamu adresu na stiahnutie. Server mu na krátky čas vystaví podpísaný odkaz, ktorý platí niekoľko minút. Nahrávanie chránených súborov z administrácie je pripravené na strane servera, obrazovka sa dokončuje. Stav overte pri odovzdaní. Ak obrazovka chýba, doplní dodávateľ pri odovzdaní.

---

## 5. Kategórie

Kategórie spravujete v **Produkty → Kategórie**. Kategória má názov, popis a poradie. Produkt môže byť vo viacerých kategóriách.

Menu webu a filter v e-shope sa riadia kategóriami, preto pri novej kategórii skontrolujte, či sa objavila v menu tak, ako očakávate. Ak nie, je to otázka nastavenia webu, nie obsahu, a rieši sa s dodávateľom.

---

## 6. Kupóny a QR generátor

### 6.1 Kupóny

**Poukazy a zľavy → Kupóny a zľavy → Nový kupón**:

- **Kód**, napríklad `MONTELOPE`. Zákazník ho vloží do košíka.
- **Typ zľavy** – percentá alebo pevná suma v eurách.
- **Zľava platí na** – na celý košík alebo len na vybrané produkty. Pri druhej možnosti produkty označíte.
- **Cena vrátane DPH** – nechajte zapnuté, naše ceny sú s DPH.
- **Platí od a do** – platnosť kupónu.

Po uložení je kupón aktívny. Kedykoľvek ho môžete vypnúť tlačidlom na stave. Limit použití nastavíte v detaile kupónu, pričom 0 znamená bez limitu.

**Dôležité:** na jeden košík sa neuplatňuje viac zliav naraz. Poradie zliav určuje jadro, nie administrácia, aby sa nedala „poskladať“ nižšia cena, než dovoľuje cenník.

### 6.2 QR kódy na tlačiteľné letáky

**Poukazy a zľavy → QR kódy → Vytvoriť QR kód**. Vyberiete produkt a kupón, systém vytvorí odkaz v tvare `…/eshop/kosik?produkt=…&kupon=…&ks=1` a z neho QR kód. Kód si stiahnete ako SVG alebo PNG, prípadne hneď vytlačíte tlačidlom **Tlačiť A4** (list s QR kódom a údajmi) alebo **Tlačiť nálepku** (samotná nálepka).

Staré vytlačené QR kódy sa dopĺňajú cez **Pridať staré odkazy**. Import ich iba zaeviduje, sám kupóny neaktivuje.

**Čo si pred kampaňou overiť:** naskenujte QR kód mobilom, prejdite až do košíka a skontrolujte, že sa zľava naozaj prejaví. QR odkaz sám o sebe zľavu neuplatňuje, iba prevedie zákazníka na správne miesto.

### 6.3 Darčekové poukazy

**Poukazy a zľavy → Darčekové poukazy**. Vidíte vydané poukazy, ich zostatok, platnosť a stav. V **Nastavení poukazov** určíte hodnoty (napríklad 50, 100 a 200 eur), platnosť a spôsob doručenia: e-mailom obdarovanému, PDF kupujúcemu alebo oboma.

Poukaz môžete **zneplatniť** s uvedením dôvodu alebo vrátiť zaplatenú sumu na poukaz. V detaile poukazu je náhľad poukazu v značke ANASTASIA a tlačidlo **Tlačiť poukaz**.

Denník pohybov poukazu je oddelený od prevádzkových logov, aby sa peňažný záznam nemiešal s technickými udalosťami.

---

## 7. RESET 40+ a prístupy

RESET 40+ je jednorazový vzdelávací program so šestnástimi tematickými týždňami a doplnkovou časťou Zrkadielko. Zákazník ho vidí vo svojom účte po zaplatení, v časti **Moje programy** a **RESET 40+**.

Ako to funguje:

1. Zákazník kúpi produkt programu a zaplatí.
2. Po potvrdení platby systém sprístupní prístup k programu. Prístup je viazaný na konkrétneho zákazníka a konkrétny produkt, nie na prehliadač.
3. Ak zákazník požiada o vrátenie peňazí alebo objednávku stornuje, prístup sa podľa pravidiel odoberie. Čiastočné vrátenie prístup zachová.
4. Zrkadielko je dostupné iba zákazníkom s programom. Ostatným sa zobrazí vysvetlenie, nie chyba.

**Ručné pridelenie prístupu:** v detaile zákazníka je záložka **Prístupy**. Tlačidlom **Prideliť prístup ručne** môžete sprístupniť obsah napríklad po telefonáte alebo ako darček. Udelenie aj odobratie sa zapisuje do histórie zmien, aby bolo dohľadateľné, kto ho urobil.

**Odobratie prístupu:** v administrácii v sekcii prístupov tlačidlom na odobratie s uvedením dôvodu. Už vydaný odkaz na súbor však platí ešte niekoľko minút, kým nevyprší. To je zámerné a nejde o chybu.

Chránené médiá nie sú DRM. Neobmedzujú počet zariadení a nezabraňujú nahrávaniu obrazovky. Chránia pred zdieľaním priameho odkazu, čo je v tomto type produktu primeraná úroveň.

---

## 8. Zákazníci

**Zákazníci**: hľadajte podľa mena alebo e-mailu, zoznam sa stránkuje. V detaile zákazníka nájdete:

- **Základné** – meno, e-mail, identifikátor zákazníka,
- **Skupiny a úroveň** – skupiny, do ktorých zákazník patrí, a jeho vernostnú úroveň s možnosťou zmeny,
- **Objednávky** – história nákupov,
- **Prístupy** – ku ktorým digitálnym produktom má prístup, s možnosťou prideliť prístup ručne,
- **Ochrana údajov** – ak zákazník požiadal o výmaz osobných údajov, tlačidlom **Vymazať osobné údaje** žiadosť potvrdíte.

**Pozor pri výmaze:** akcia sa nedá vrátiť. Účet sa anonymizuje, prístupy sa zrušia a zákazník sa už neprihlási. Účtovné záznamy objednávok zostávajú zachované, pretože to vyžadujú predpisy. Výmaz sa robí vždy až po overení, že ide o správnu žiadosť.

Interné poznámky k zákazníkovi vidíte iba Vy a nie sú súčasťou exportu, ktorý dostane zákazník.

---

## 9. Konzultácie

**Konzultácie** obsahujú rezervácie, typy konzultácií a dostupnosť, teda v ktorých dňoch a hodinách máte voľné termíny.

- Rezerváciu môžete zrušiť. Zrušenie uvolní termín a zákazník dostane e-mail.
- Typ konzultácie má cenu, formu a dĺžku. Archivovaný typ sa už nedá rezervovať, existujúce rezervácie zostávajú.
- Dostupnosť sa nastavuje po týždňoch. Systém nedovolí skrátiť úsek, v ktorom už je rezervácia, aby nevznikol konflikt.
- V zozname je tlačidlo **Export kalendára (.ics)**, ktorým si termíny pridáte do kalendára na mobile aj na počítači.

---

## 10. Obsah a texty

**Obsah a e-maily → Stránky a texty**. Tu upravíte texty stránok webu. Kliknite na stránku, napríklad Kontakt alebo O nás, a otvorí sa jej rozdelenie na **sekcie**. V sekcii upravíte jednotlivé **polia**:

- **nadpis, podnadpis, odsek** – text,
- **obrázok** – adresa obrázka alebo výber z knižnice,
- **video** – adresa videa,
- **odkaz** – kam tlačidlo vedie.

Pri každom poli vidíte, koľko znakov ešte môžete napísať, a vpravo náhľad, ako sa to bude zobrazovať. Keď niečo pokazíte, tlačidlom **Obnoviť pôvodné** vrátite pôvodný text. V zozname verzií si viete vrátiť aj staršiu verziu. Sekcie, v ktorých práve nepracujete, nechajte skryté.

**Médiá**: knižnica obrázkov. Nahráte obrázok (JPG, PNG, WebP, GIF, AVIF alebo SVG do 12 MB), skopírujete jeho adresu tlačidlom **Kopírovať URL** a použijete ju na webe. Zmazanie obrázka vždy vyžaduje potvrdenie. Ak obrázok používa niektorý produkt, administrácia Vám to oznámi a nedovolí ho zmazať.

**Čo v obsahu nejde:** meniť dizajn, teda farby, písmo a rozloženie. Tie zostávajú také, aké sú, aby web zostal konzistentný.

---

## 11. E-maily

**Obsah a e-maily → E-maily**: zoznam e-mailov, ktoré odchádzajú zákazníkom. Ide o potvrdenie objednávky, prijatie platby, odoslanie zásielky, vrátenie peňazí, darčekový poukaz a ďalšie.

Kliknutím otvoríte editor: predmet, nadpis, odseky a tlačidlo. Vpravo vidíte náhľad e-mailu, takže hneď viete, čo zákazník dostane. Texty zmeníte a stlačíte **Uložiť e-mail**. Prepínačom hore e-mail zapnete alebo vypnete.

**Čo sa v e-maile meniť nedá:** rozloženie, odkazy a výpočty. Tie zostávajú v kóde, aby sa nedalo omylom poslať zlý odkaz alebo zlá suma. Mení sa iba text.

Ak e-mail vypnete, zákazník ho nedostane. Vypínajte iba vtedy, keď to má zmysel, napríklad pri dočasnej zmene procesu.

---

## 12. Newsletter

**Obsah a e-maily → Newsletter** má tri časti: kampane, editor s náhľadom a zoznam odberateľov.

Postup pri kampani:

1. Vytvorte koncept a vyplňte predmet, preheader a text.
2. Skontrolujte náhľad.
3. Odošlite testovaciu kópiu. Test chodí iba na adresy dodávateľa, aby sa nedal omylom poslať zákazníkovi.
4. Potvrďte odoslanie. Kampaň sa zaradí do fronty a odosiela sa po dávkach.
5. Kampaň môžete počas odosielania zrušiť. Zvyšné e-maily sa už neodošlú.

Limity, ktoré platia: najviac 40 e-mailov na jeden beh, najviac 90 e-mailov za 24 hodín, odosielanie sa dopĺňa každých 10 minút. Podrobnosti a dôvody sú v `05-PREVADZKOVA-PRIRUCKA.md`.

Zoznam odberateľov obsahuje iba tých, ktorí dali súhlas. Súhlas sa ukladá s verziou textu, ktorú zákazník videl. Export do CSV slúži na prehľad, nie na rozposielanie mimo systému.

**Stav obrazovky:** newsletter je na strane servera pripravený a otestovaný, obrazovka v administrácii sa v čase písania tejto dokumentácie dokončovala. Ak ju pri odovzdaní nenájdete, doplní dodávateľ pri odovzdaní.

---

## 13. Feedy pre porovnávače

**Nastavenia → Pripojenia** obsahuje dva odkazy:

- **Heureka** – XML feed pre porovnávač Heureka,
- **Google Merchant Center** – feed pre Google.

Kliknite **Kopírovať odkaz** a vložte ho do administrácie daného porovnávača. Feed sa generuje automaticky a obsahuje iba zverejnené produkty v predajnom kanáli, s cenou s DPH a s obrázkami. Keď zmeníte cenu alebo obrázok, feed sa zmení sám. Tlačidlom **Otvoriť feed** uvidíte, čo sa v ňom práve nachádza.

---

## 14. Vernostné úrovne

**Nastavenia → Vernostné úrovne**. Pre každú úroveň (Bronze, Silver, Gold, VIP) nastavíte:

- **názov**, ktorý uvidí zákazník,
- **zľavu v percentách** v rozsahu 0 až 50,
- **prah zaplatenej útraty v eurách**, od ktorej zákazník úroveň získa,
- či je úroveň **zapnutá**.

Uložíte tlačidlom **Uložiť zmeny**. Úroveň sa zákazníkovi priradí automaticky podľa celkovej útraty. Ak jeho úroveň nastavíte ručne v detaile zákazníka, automatika ju už neprepíše. V zozname zákazníkov je stĺpec **Úroveň** a filter úrovne, viac zákazníkov môžete označiť a priradiť úroveň naraz.

**Dôležité:** na spustení obchodu boli vernostné úrovne prázdne, teda bez vernostných zliav. Percentá sa nevymýšľajú dopredu, nastavíte ich Vy. Kým úroveň nemá percento a prah, zľava sa neuplatňuje.

---

## 15. Nastavenia

| Sekcia | Čo tam nájdete |
|---|---|
| **Vzhľad** | farby a vzhľad administrácie pre Váš účet |
| **Pripojenia** | odkazy na feedy, dopravcovia s API kľúčom uloženým šifrovane na serveri |
| **Doprava a platby** | cenové hladiny dopravy a prehľad platobných metód, iba na čítanie |
| **Používatelia** | zoznam správcov a pozvánky, prijatie pozvánky cez odkaz |
| **História zmien** | kto a čo zmenil |
| **Zabezpečenie** | dvojfaktorové overenie a role |

Doprava a platby sú zámerne iba na čítanie. Zmena ceny dopravy alebo platobnej metódy je zásah do peňažného toku, preto sa robí s dodávateľom a so zálohou pred zásahom.

---

## 16. Zabezpečenie prístupu

### 16.1 Dvojfaktorové overenie

1. V Nastaveniach prepnite na **Zabezpečenie**.
2. Kliknite **Zapnúť dvojfaktorové overenie**.
3. Naskenujte QR kód v telefóne aplikáciou na overovanie, napríklad Google Authenticator, 1Password alebo Aegis. Ak QR kód naskenovať neviete, vložte vypísaný tajný kód do aplikácie ručne.
4. Vložte šesťmiestny kód z aplikácie a kliknite **Potvrdiť a zapnúť**.
5. Záložné kódy, ktoré sa zobrazia **raz**, si vytlačte alebo stiahnite a odložte na bezpečné miesto. Bez nich sa do administrácie nedostanete, ak prídete o telefón.

Od najbližšieho prihlásenia administrácia pýta heslo aj kód. Ak stratíte telefón, prihlásite sa záložným kódom. Nové záložné kódy vygenerujete tlačidlom **Vygenerovať nové záložné kódy**, staré tým stratia platnosť. Vypnutie overenia vyžaduje platný kód z aplikácie.

### 16.2 Role správcov

| Rola | Čo môže |
|---|---|
| **Vlastník** | celá administrácia, teda ceny, zľavy, vernostné úrovne, prideľovanie prístupov, role a zabezpečenie |
| **Asistent** | objednávky, produkty, zákazníci, konzultácie, správy a obsah, ale nie ceny, zľavy, vernostné úrovne, prideľovanie prístupov ani role |

Rolu prepnete v stĺpci Rola a uložíte tlačidlom **Uložiť rolu**. Posledného vlastníka nie je možné znížiť na asistenta, inak by administrácia nemala vlastníka. Najprv pozvite ďalšieho správcu.

**Poznámka k rozsahu:** podrobné rozlíšenie práv po jednotlivých agendách nie je v tejto fáze overené. Ak potrebujete prístup iba na časť agendy, dohodnite sa s dodávateľom. Stav doplní dodávateľ pri odovzdaní.

---

## 17. Čo viete a čo nie

| Viete | Nejde a prečo |
|---|---|
| Spravovať objednávky, tlačiť štítky a dodacie listy, exportovať CSV | robiť platby ručne. Platbu prijíma jadro, Vy iba potvrdíte, že prišla |
| Meniť produkty, ceny, akcie, obrázky, sklad a kategórie | mazať zákazníkom digitálne súbory, chránia sa |
| Vytvárať kupóny, QR kódy a darčekové poukazy | uplatniť viac zliav naraz na jeden košík, poradie určuje jadro |
| Upravovať texty, obrázky a odkazy na webe | meniť dizajn stránok, farby, písmo a rozloženie zostávajú |
| Spravovať vernostné úrovne | vyplácať provízie, to patrí do ďalšej fázy |
| Prideliť alebo odobrať prístup k digitálnemu obsahu | meniť nastavenia servera, zálohy a kľúče |

---

## 18. Kde nájdete pomoc

- **„Ako to funguje“** nad nadpisom stránky, krátke vysvetlenie priamo k danej sekcii.
- **Potrebujete poradiť?** vľavo dole, sprievodca s návodmi vrátane prehliadky celej aplikácie.
- **Skratky na klávesnici:** `/` pre vyhľadávanie, `g` a písmeno pre rýchly prechod, napríklad `g` a `o` pre Objednávky, `?` pre nápovedu.
- **História zmien** v Nastaveniach, kto a čo zmenil.
- **ceo@l-code-dynamics.com** alebo **+420 776 880 075**, keď niečo nejde alebo potrebujete poradiť. Napíšte, čo ste robili a čo sa zobrazilo.
