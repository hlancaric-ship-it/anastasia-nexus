# Testovacie scenáre pre Váš web a Vašu administráciu (Fáza 1)

**Testovacie adresy (platia len počas testovania):**

| Čo | Adresa |
|---|---|
| Váš web | `https://anastasia-test.l-code-dynamics.com` |
| Vaša administrácia | `https://anastasia-test-admin.l-code-dynamics.com` |

Prihlasovacie údaje do administrácie Vám pošleme osobitne. **V tomto návode nie sú žiadne heslá ani
prístupové údaje** a neuvádzame interné nástroje – testujte iba cez uvedené adresy.

**Ako testovať:** každý bod má prázdne ☐. Keď Vám daný bod funguje, označte ho. Keď nie, zapíšte
si, čo ste presne robili (pozri bod 9). Odškrtnutý zoznam je najlepšia spätná väzba pre nás.

**Platobná karta na testovanie (funguje, nič sa nezúčtuje):**

| Pole | Hodnota |
|---|---|
| Číslo karty | `4242 4242 4242 4242` |
| Platnosť | ľubovoľný budúci dátum (napr. 12/2030) |
| CVC | ľubovoľné tri číslice (napr. 123) |
| Meno a priezvisko | ľubovoľné |

---

## 1. Úvod webu

### 1.1 Na mobile (do 430 px šírky)
- ☐ Otvorte `https://anastasia-test.l-code-dynamics.com` na mobile telefóne.
- ☐ Prejdite prstom úvodom až na koniec – video na pozadí a texty sa ukazujú, nič sa neprekrýva.
- ☐ Ťuknite na tlačidlo **Menu** v hornej lište – otvorí sa Vám menu na celú obrazovku.
- ☐ Ťuknite na tlačidlo **VSTÚPTE ↓** – dostanete sa do ďalšej časti úvodu.
- ☐ V menu si vyskúšajte aj prechod na **OBCHOD**, **PROGRAMY A SLÚŽBY** a **KONZULTÁCIE**.

### 1.2 Na počítači
- ☐ Otvorte rovnakú adresu na počítači.
- ☐ Skontrolujte, že hlavička je priehľadná nad úvodom a po rolovaní sa zmení na plnú.
- ☐ Bočná lišta vľavo sa má objaviť až po rolovaní, nie hneď na začiatku.
- ☐ Prejdite myšou cez obrázky – obrázok sa má jemne posúvať (paralax).

### 1.3 Jazyky
- ☐ V **bočnej lište vľavo hore** prepínajte jazyk **SK / EN / RU** (SK je hore, pod ním EN, pod ním RU).
- ☐ Prejdite na pár stránok (napr. Obchod, Kontakt) v každom jazyku.

---

## 2. E-shop: produkt → košík → pokladňa → platba

- ☐ Otvorte **OBCHOD** (v hlavičke) a vyberte kategóriu (napr. **BIOKOZMETIKA**).
- ☐ Otvorte ľubovoľný produkt – skontrolujte názov, cenu, popis a fotografie.
- ☐ Kliknite na **Pridať do košíka** a potom otvorte **KOŠÍK ( 0)** v hlavičke.
- ☐ Skontrolujte, že sa v košíku zobrazuje položka aj cena; skúste zmeniť množstvo a položku
  odstrániť.
- ☐ V košíku pokračujte tlačidlom na prechod do **pokladne** (stránka „Už len malý krok.“).
- ☐ Vyplňte údaje (meno, priezvisko, e-mail, adresu podľa spôsobu dodania).
- ☐ Vyberte **Kartou online** a kliknite na **Zaplatiť**.
- ☐ Zadajte testovaciu kartu `4242 4242 4242 4242`, ľubovoľný budúci dátum a ľubovoľné CVC.
- ☐ Po úspešnej platbe sa má zobraziť potvrdenie objednávky a vy má prísť **potvrdzujúci e-mail**.
- ☐ Skontrolujte, že v e-maile je uvedené číslo objednávky, položky a spôsob dodania.

---

## 3. Kupón Montelope

Kupón **Montelope** zníži cenu o **20 €** a platí **len na program RESET 40+** (na ostatné
položky sa zľava neuplatní). Kupón uplatníte **v košíku** – pole na kód kupónu je priamo v košíku,
a **na uplatnenie kupónu musíte byť prihlásený**.

- ☐ Prihláste sa (pozri bod 5.2) a vložte do košíka **AI ANASTASIA RESET 40+** (cena 168 €).
- ☐ V košíku vložte do poľa na kupón **Montelope** a potvrďte.
- ☐ Cena RESET 40+ má klesnúť o 20 € (zo 168 € na 148 €).
- ☐ Skontrolujte, že ostatné položky v košíku (napr. voda) **zostávajú bez zľavy**.
- ☐ Skontrolujte, že po odstránení kupónu sa cena vráti na pôvodnú.
- ☐ Vložte do košíka len iný produkt (bez RESET 40+), skúste kupón znova – zľava sa nemá uplatniť.

---

## 4. Darčekový poukaz

- ☐ Otvorte stránku **DARČEKOVÝ POUKAZ** (v kategóriách v obchode) a vyberte sumu a príjemcu.
- ☐ Kliknite na **Pridať poukaz do košíka** a potom na **Prejsť do košíka**.
- ☐ Dokončite objednávku (testovacou kartou).
- ☐ Skontrolujte, že vám príde e-mail s darčekovým poukazom (kód).
- ☐ Vytvorte si druhý košík, vložte ľubovoľný produkt a v košíku vložte **kód poukazu**
  (pole na uplatnenie darčekového poukazu).
- ☐ Skontrolujte, že sa cena zníži a v potvrdení objednávky je uvedený poukaz.
- ☐ Skontrolujte, že poukaz možno použiť len raz a že po ňom už ďalej nejde použiť.

---

## 5. Zákaznícky účet

### 5.1 Prvý prihlas a registrácia
- ☐ V hlavičke kliknite na **Môj účet** – otvorí sa stránka **Prihlásenie**.
- ☐ Kliknite na **Poslať prihlasovací odkaz** – v e-maile príde odkaz na prihlásenie.
- ☐ Otvorte prihlasovací odkaz v e-maile – mali by ste sa prihlásiť bez zadania hesla.
- ☐ Skontrolujte, že odkaz funguje len raz a po chvíli expiroje.
- ☐ Skontrolujte, že po prihlásení vidíte svoje údaje a aj **Môj účet** v menu.

### 5.2 Objednávky a materiály
- ☐ V účte otvorte záložku **Objednávky** – vidíte svoju objednávku, jej stav a položky.
- ☐ V účte otvorte záložku **Materiály** – vidíte materiály ku zakúpeným programom.
- ☐ Skontrolujte, že po kúpe programu sa príslušný materiál objaví.

### 5.3 Záložky v účte
- ☐ Vľavo v účte nájdete záložky: **Prehľad**, **Moje programy**, **Konzultácie**, **Chat s Luciou**,
  **Objednávky**, **Materiály**, **Môj profil** (a **Klub**, ak je v ponuke zapnutý).
- ☐ Prejdite si ich postupne a skontrolujte, že sa každá otvorí.

### 5.4 RESET 40+ a Zrkadielko
- ☐ V účte otvorte záložku **RESET 40+**.
- ☐ Skontrolujte **vstupný dotazník** – odkaz sa otvorí v novom okne.
- ☐ Rozbaľte **týždne 1 – 16**; ak obsah ešte nie je doplnený, má tam byť oznamenie
  „Obsah pripravujeme“.
- ☐ V časti **Zrkadielko** kliknite na **Pridať záznam**:
  - ☐ vyberte dátum a týždeň,
  - ☐ hodnotenie 1 – 10 nastavíte ťuknutím na číslo,
  - ☐ záznam uložíte – objaví sa v tabuľke.
- ☐ Záznam **upravíte** (tlačidlo **Upraviť**) a uložíte zmenenú hodnotu.
- ☐ Záznam **zmážete** (tlačidlo **Zmazať**) – najprv sa zobrazí potvrdenie.
- ☐ Na mobile má tabuľka prejsť na karty a nesmie sa roztiahnuť do strany.

### 5.5 Klub ANASTASIA
- ☐ V pätičke kliknite na **Klub** – otvorí sa stránka **Členstvo Klubu**.
- ☐ Bez prihlásenia sa má zobraziť výzva **Prihlásiť sa**.
- ☐ Po prihlásení si prezrite ponuku členstva a podmienky.
- ☐ V účte otvorte záložku **Klub** – v časti **Moje členstvo** vidíte stav svojho členstva.

---

## 6. Konzultácie a chat

### 6.1 Rezervácia konzultácie
- ☐ Otvorte **KONZULTÁCIE** v hlavičke.
- ☐ Vyberte typ konzultácie (napr. **Online zdravotná konzultácia**, **Supervízia**,
  **Astrologický profil**) a kliknite na **Vybrať termín konzultácie**.
- ☐ Na stránke **„Vyberte si termín.“** vyberte dátum a čas, vyplňte údaje a rezerváciu potvrďte.
- ☐ Skontrolujte, že sa rezervácia zobrazí v účte v záložke **Konzultácie**.

### 6.2 Chat s Luciou
- ☐ V účte otvorte **Chat s Luciou** a napíšte správu.
- ☐ Skontrolujte, že sa správa odošle a zobrazí sa v konverzácii.

---

## 7. Právne stránky, cookies a odstúpenie

### 7.1 Právne stránky
- ☐ Otvorte **Obchodné podmienky**, **Reklamačné pravidlá**, **Ochrana osobných údajov**,
  **Odstúpenie od zmluvy** a **Cookies** (nájdete ich v pätičke).
- ☐ V každej stránke skontrolujte, že sa dá prejsť po nadpisoch a text je čitateľný na mobile.

### 7.2 Lišta cookies
- ☐ Na prvej návšteve Vás v spodnej časti obrazovky objaví **lišta cookies** s tromi tlačidlami:
  **Odmietnuť voliteľné**, **Nastaviť**, **Prijať všetky**.
- ☐ Skúšajte **Odmietnuť voliteľné** – lišta zmizne a voliteľné kategórie zostanú vypnuté.
- ☐ Skúšajte **Prijať všetky** a potom **Nastaviť** – v panely nastavení vidíte kategórie
  (nevyhnutné je vždy zapnuté, voliteľné sa dá vypnúť) a tlačidlá **Uložiť nastavenia** a **Zavrieť**.
- ☐ Skontrolujte, že sa voľba **zachová** aj po obnovení stránky.
- ☐ V pätičke nájdite odkaz **Nastavenia cookies** – otvorí ten istý panel.
- ☐ Skontrolujte, že **platba kartou funguje aj bez súhlasu s cookies** (nevyhnutná technológia).

### 7.3 Online odstúpenie od zmluvy
- ☐ Otvorte **Odstúpenie od zmluvy** a nájdite formulár **Odstúpiť od zmluvy tu**.
- ☐ Vyplňte číslo objednávky, dátum, položky, e-mail, meno a dôvod, označte súhlas s informáciami
  o ochrane osobných údajov a kliknite na **Potvrdiť odstúpenie od zmluvy**.
- ☐ Skontrolujte, že sa zobrazí potvrdenie a záznam sa uloží.
- ☐ Skúšajte aj chybný vstup (napr. nevyplnený dátum alebo e-mail) – má sa zobraziť zrozumiteľná
  hláška, nie prázdna stránka.

### 7.4 Reklamácie
- ☐ Otvorte **Reklamačné pravidlá** a prejdite si nadpisy (napr. „1 Uplatnenie reklamácie“).
- ☐ Skontrolujte, že je na stránke uvedený spôsob, ako reklamáciu nahlásiť.

---

## 8. Administrácia

Otvorte `https://anastasia-test-admin.l-code-dynamics.com` a prejdite si všetky časti vľavo.

- ☐ **Prehľad** – na hlavičke vidíte čísla na dnes a prehľad pripravenosti obchodu.
- ☐ **Objednávky** – nájdete objednávku z testu, otvoríte jej detail, zmeníte stav a vidíte položky,
  platbu a rezerváciu.
- ☐ **Produkty** – otvoríte produkt, zmeníte názov, cenu, popis alebo obrázok a uložíte; zmena je
  vidieť na webe.
- ☐ **Kategórie** – skontrolujete, že kategórie sú správne pomenované a patria k produktom.
- ☐ **Zákazníci** – nájdete testovacieho zákazníka, vidíte jeho objednávky a poznámky.
- ☐ **Konzultácie** – vidíte rezervácie, typy konzultácií a voľné termíny.
- ☐ **Správy** – vidíte konverzácie z chatu.
- ☐ **Poukazy a zľavy**:
  - ☐ v časti **Kupóny a zľavy** vytvoríte kupón (napr. 10 % na jeden produkt) a uvidíte ho v košíku,
  - ☐ v časti **QR kódy** vytvoríte QR kód ku kupónu, stiahnete ho a otvoríte ho – kupón sa má
    automaticky uplatniť v košíku,
  - ☐ v časti **Darčekové poukazy** vidíte vytvorený poukaz, jeho stav a pohyby.
- ☐ **Obsah a e-maily**:
  - ☐ upravíte text na stránke (napr. Kontakt) – zmena sa zobrazí na webe,
  - ☐ upravíte obrázok stránky,
  - ☐ v časti **E-mailové šablóny** upravíte text potvrdzovacieho e-mailu a vidíte náhľad.
- ☐ **Nastavenia** – skontrolujete, či sa dajú upraviť bežné nastavenia obchodu.
- ☐ V každej časti si všimnite, či je nápoveda (?). Ak niečo chýba alebo je nejasné, zapíšte to.

---

## 9. Ako nahlásiť chybu

Pri každej chybe pošlite, prosím, **tri veci**:

1. **Snímku obrazovky** (na mobile aj na počítači, ak sa chyba prejavuje inak).
2. **Adresu stránky**, na ktorej chyba nastala (aj s tým, čo ste mali v adrese).
3. **Čo ste presne robili** – krok za krokom (napr. „klikol som na Pridať do košíka a potom na
   pokladňu“).

Pri chybe v administrácii pripíšte aj **meno časti v ľavom menu**, kde sa chyba stala.
Priložte, prosím, aj text chybovej hlášky, ak sa zobrazila.
