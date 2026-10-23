# Návod pre Luciu – administrácia obchodu ANASTASIA

**Verejnosť 21. 10. 2026 · platí pre testovacie prostredie aj pre ostrý obchod**

Vitajte. Tento návod vás prevedie administráciou od prihlásenia po každodennú prácu.
Nič tu nie je technické – píšem, ako s administráciou pracovať.

Adresa administrácie: **`https://anastasia-test-admin.l-code-dynamics.com`** (test) ·
pri ostrom obchode vám ju pošleme.
Prihlásenie: e-mail a heslo, ktoré dostanete od nás. Po prihlásení sa dostanete na **Prehľad**.

---

## 1. Prehľad – čo treba urobiť dnes

Na začiatku vidíte tri čísla a zoznam úloh:

- **Na vybavenie** – koľko objednávok čaká, kým ich zabalíte a pošlete.
- **Nové správy** – koľko zákazníkov vás čaká s odpoveďou.
- **Dnešné konzultácie** – s ktorou máte rezerváciu.

Pod ním je **Pripravenosť obchodu** (zelená = všetko v poriadku) a panely **Tržby**,
**Najpredávanejšie produkty** a **Nízky sklad**. Ak svietí žlté, kliknite na odkaz
a administrácia vás prevedie priamo na miesto, kde treba vec opraviť.

Vľavo hore je **vyhľadávanie** – napíšte meno, e-mail alebo číslo objednávky
a administrácia vám ponukne, kde to nájsť.

---

## 2. Objednávky – každodenná práca

Kliknite na **Objednávky** vľavo. Hore sú **záložky** (filtr), pod nimi tabuľka a dole
stránkovanie:

| Záložka | Čo vám ukáže |
|---|---|
| Všetky | Všetky objednávky |
| **Na vybavenie** | Objednávky zaplatené, ktoré ešte treba poslať – toto je váš denný zoznam |
| Čaká na platbu | Objednávky, ktoré zákazník nezaplatil (dobierka, prevod) |
| Odoslané | Už odoslané |
| Zrušené / Archív | Zrušené a historické objednávky |

Do **vyhľadávacieho poľa** napíšte číslo objednávky, e-mail zákazníka alebo názov produktu.
Keď označíte viac objednávok (zaškrtávadlo vľavo), objaví sa lišta **Označené objednávky**:
viac štítkov naraz, viac dodacích listov naraz a **Export CSV** (tabuľka do Excelu).

### Tlač štítka a dodacieho listu

- **Štítok** = malá adresná etiketa (A6) na obálku: meno, adresa, kód objednávky, spôsob dopravy.
- **Dodací list** = A4 s položkami, cenami, dopravou a adresou.

Tlačí sa cez tlačidlo pri objednávke (aj hromadne pre označené). Otvorí sa okno tlače –
vyberte tlačiareň a obyčajné „Uložiť ako PDF“, ak netlačíte. **Pozor:** prehliadač musí
povoliť vyskakovacie okná (nad adresou webu). Ak okno nevybe, kliknite na tlačidlo
a povoľte „Povoliť vyskakovacie okná“ pre túto stránku.

### Detail objednávky

Kliknutím na riadok sa otvorí detail so záložkami:

- **Prehľad** – zákazník, stav platby, doručovacia a **fakturačná adresa**,
  **poznámka k objednávke** (vidíte len vy – napr. „zabalené darčekovo“).
- **Položky** – čo zákazník kúpil.
- **Odoslanie** – tlačidlo **Pripraviť** (označí položky ako pripravené) a potom
  **Označiť ako odoslanú** + číslo zásielky. Keď potvrdíte, zákazník dostane e-mail.
- **Platby** – pri prevode a dobierke tlačidlo **Prijať platbu** (až vtedy sa zákazníkovi
  sprístupní digitálny obsah). **Vrátiť peniaze** vráti sumu.

---

## 3. Produkty

### Fyzické produkty

**Produkty → Nový produkt**: názov, cena v EUR, obrázok (JPG/PNG/WebP do 5 MB), kód (SKU),
typ dopravy (fyzický tovar / digitálny produkt / služba), kategórie a predajné kanály.

Pri úprave existujúceho produktu nájdete v záložke **Základné údaje** aj:

- **EAN (čiarový kód)** a **Hmotnosť (kg)** – použijú sa v feede pre porovnávače a pri doprave.
- **Cena s DPH** – ceny v obchode sú vrátane DPH, takže ich zákazník vidí v rovnakej výške.

Záložka **Sklad** ukazuje, koľko kusov je na sklade; zoznam produktov má stĺpec **Sklad**
a zvýrazní **vypredané** a nízky zásobný stav. V **Nastavenia → Doprava a platby** vidíte
cenové hladiny dopravy podľa regiónu.

V zozname produktov filtrom **Fyzické / Digitálne** a podľa stavu (zverejnené / koncept)
vyberiete len to, čo potrebujete. Ak označíte viac produktov, lišta vám umožní ich naraz
zverejniť alebo uložiť ako koncepty.

### Digitálne produkty

Pri novom digitálnom produkte (typ dopravy *Digitálny produkt*) vás administrácia po vytvorení
odrazu prevedie na záložku **Zakúpený obsah** – nahrajete súbory (MP4, MP3, PDF), ktoré
zákazník dostane po zaplatení. Súbory sa chránia: zákazník si ich môže prehrať,
ale nevie si ich stiahnuť.

---

## 4. Kupóny a zľavy

**Poukazy a zľavy → Kupóny a zľavy → + Nový kupón**:

- **Kód** – napr. `MONTELOPE` (zákazník ho vloží do košíka).
- **Typ zľavy** – percentá (%) alebo pevná suma (€).
- **Zľava platí na** – *Na celý košík* alebo *Len vybrané produkty* (vtedy označíte produkty).
- **Cena vrátane DPH** – nechajte zapnuté, naše ceny sú s DPH.
- **Platí od – do** – platnosť kupónu.

**Uložiť** a kupón je aktívny. Kúpón môžete kedykoľvek vypnúť (tlačidlo na stav).
Limit použití nastavíte v detaile kupónu (0 = bez limitu).

### QR kódy (tlačiteľné letáky)

**Poukazy a zľavy → QR kódy → Vytvoriť QR kód**: vyberiete produkt a kupón, systém vyrobí
odkaz `…/eshop/kosik?produkt=…&kupon=…&ks=1` a z neho QR kód. Kód si **stiahnete** (SVG alebo PNG)
alebo rovno **vytlačíte** – tlačidlo *Tlačiť A4* (list s QR kódom a údajmi) alebo *Tlačiť nálepku*
(samotná nálepka s QR kódom). Staré vytlačené QR kódy môžete pridať cez *Pridať staré odkazy*.

### Darčekové poukazy

**Poukazy a zľavy → Darčekové poukazy**: vidíte vydané poukazy, ich zostatok, platnosť
a stav. V **Nastavenie poukazov** nastavíte hodnoty (napr. 50 €, 100 €, 200 €), platnosť
a spôsob doručenia (e-mailom obdarovanej, PDF kupujúcej alebo oboma). Poukaz môžete
**zneplatniť** (uvediete dôvod) alebo vrátiť zaplatenú sumu na poukaz.
V detaile poukazu je **náhľad poukazu v značke ANASTASIA** a tlačidlo **Tlačiť poukaz**.

---

## 5. E-maily

**Obsah a e-maily → E-maily**: zoznam e-mailov, ktoré odchádzajú zákazníkám
(potvrdenie objednávky, prijatie platby, odoslanie zásielky, vrátenie peňazí, darčekový poukaz…).
Kliknutím otvoríte editor: **predmet, nadpis, odseky, tlačidlo** – presne ako vo Worde.
Vpravo vidíte **náhľad** e-mailu, takže hneď viete, čo zákazník dostane.
Texty zmeníte a stlačíte **Uložiť e-mail**. Prepínač hore zapína a vypína konkrétny e-mail.

---

## 6. Obsah webu (texty, obrázky, hero video)

**Obsah a e-maily → Stránky a texty**: tu upravíte **texty stránok webu**.
Kliknite na stránku (napr. Kontakt, O nás) a otvorí sa jej rozdelenie na **sekcie**.
V sekcii upravíte jednotlivé **polia**:

- **nadpis / podnadpis / odsek** – text,
- **obrázok** – adresa obrázka (alebo vyberiete z knihovne),
- **video** – adresa hero videa,
- **odkaz** – kam tlačidlo vedie.

Pri každom poli vidíte, koľko znakov ešte môžete napísať, a vpravo **náhľad**, ako sa to bude zobrazovať.
Keď niečo pokazíte, tlačidlom **Obnoviť pôvodné** vrátite pôvodný text; v zozname verzií
si môžete vrátiť aj staršiu verziu. Rozvijacie **sekcie** nechajte skryté, kým v nich nepracujete.

**Obsah a e-maily → Médiá**: knihovna obrázkov. Nahráte obrázok (JPG, PNG, WebP, GIF, AVIF, SVG;
do 12 MB), skopírujete jeho URL (tlačidlo *Kopírovať URL*) a použijete ho na webe.
Zmazanie obrázka vždy vyžaduje potvrdenie; ak obrázok používa niektorý produkt, administrácia
vám to povie a nedá ho zmazať.

---

## 7. Feedy pre porovnávače (Heureka, Google)

**Nastavenia → Pripojenia**: nájdete dva odkazy:

- **Heureka** – XML feed pre porovnávač Heureka,
- **Google Merchant Center** – RSS feed pre Google.

Kliknite **Kopírovať odkaz** a vložte ho do administrácie daného porovnávača.
Feed sa generuje automaticky a obsahuje iba zverejnené produkty v predajnom kanáli, s cenou
s DPH a s obrázkami. Keď zmeníte cenu alebo obrázok produktu, feed sa zmení sám – nič
nahrávať netreba. Keď kliknete *Otvoriť feed*, uvidíte, čo sa v ňom práve nachádza.

---

## 8. Vernostné úrovne

**Nastavenia → Vernostné úrovne**: pre každú úroveň (Bronze, Silver, Gold, VIP) nastavíte:

- **názov**, ktorý uvidí zákazník,
- **zľavu v %** (0 – 50),
- **prah zaplatené útraty** v € (od koľka útrat zákazník úroveň získa),
- či je úroveň **zapnutá**.

Uložíte tlačidlom **Uložiť zmeny**. Úroveň zákazníci sa priradí automaticky podľa jej
celkovej útraty; ak jeho úroveň nastavíte ručne (v detaile zákazníka, záložka
*Vernostná úroveň*), automatika ju už nepremení. V zozname zákazníc je stĺpec **Úroveň**
a filter úrovne; viac zákazníc môžete označiť a priradiť úroveň naraz.

---

## 9. Zákazníci

**Zákazníci**: hľadajte podľa mena alebo e-mailu, zoznam sa stránkuje.
V detaile zákazníci nájdete:

- **Základné** – meno, e-mail, ID zákazníci,
- **Skupiny / tier** – skupiny, do ktorých zákazník patrí,
- **Vernostná úroveň** – jeho úroveň a možnosť ju zmeniť,
- **Objednávky** – história jeho nákupov,
- **Prístupy** – ku ktorým digitálnym produktom má prístup + **Prideliť prístup ručne**
  (napr. po telefonáte alebo keď pošlete darček),
- **Ochrana údajov** – ak zákazník požiadala o výmaz osobných údajov, tlačidlom
  **Vymazať osobné údaje** žiadosť potvrdíte (akcia sa nedá vrátiť).

---

## 10. Konzultácie

**Konzultácie**: rezervácie, typy konzultácií a dostupnosť (v ktorej dni a hodiny máte
voľné termíny). Rezerváciu môžete zrušiť. V zozname je tlačidlo **Export kalendára (.ics)**
– termíny si pridáte do kalendára na mobile aj na počítači.

---

## 11. Zabezpečenie prístupu (Nastavenia → Zabezpečenie)

Táto záložka je pre vás (vlastníka) – chráni administráciu aj vašu prácu.

**Dvojfaktorové overenie (kód z telefónu)**

1. V Nastaveniach prepnite hore na **Zabezpečenie**.
2. Kliknite na **Zapnúť dvojfaktorové overenie**.
3. Naskenujte QR kód v telefóne aplikáciou na overovanie (napr. Google Authenticator,
   1Password, Aegis). Ak QR naskenovať neviete, vložte vypísaný tajný kód do aplikácie ručne.
4. Vložte šesťmiestny kód z aplikácie a kliknite **Potvrdiť a zapnúť**.
5. Záložné kódy, ktoré sa zobrazia **raz**, si **vytlačte alebo stiahnite** a odložte na
   bezpečné miesto. Bez nich sa do administrácie nedostanete, ak prídete o telefón.

Od najdajšieho prihlásenia pýta administrácia heslo **aj** kód. Ak stratíte telefón, prihlásite
sa jedným zo záložných kódov. Nové záložné kódu vygenerujete tlačidlom **Vygenerovať nové
záložné kódy** (staré tým stratia platnosť). Vypnutie overenia vyžaduje platný kód z aplikácie.

**Role správcov (vlastník / asistent)**

V časti **Administrátori a ich roly** vidíte všetkých správcov a ich rolu:

- **Vlastník** – spravuje celú administráciu: ceny, zľavy, vernostné úrovne, pridávanie
  prístupov, role a zabezpečenie.
- **Asistent** – vybavuje objednávky, produkty, zákazníkov, konzultácie, správy a obsah.
  Ceny, zľavy, vernostné úrovne, pridávanie prístupov a role **nevidí** a nemôže meniť.

Role prepnete v stĺpci Rola a uložíte tlačidlom **Uložiť rolu**. Posledného vlastníka
nie je možné znížiť na asistenta (inak by administrácia nemala vlastníka) – najprv pozvite
ďalšieho správcu.

---

## 12. Kde nájdete pomoc

- **„Ako to funguje“** nad nadpisom stránky – krátke vysvetlenie priamo k tej sekcii.
- **Potrebujete poradiť?** vľavo dole – sprievodca so 23 návodmi (aj prehliadka celej aplikácie).
- **Skratky na klávesnici:** `/` hľadanie, `g` + písmeno (napr. `g` + `o` = Objednávky), `?` otvorí nápovedu.
- **História zmien** (Nastavenia → História zmien) – kto a čo zmenil.
- **ceo@l-code-dynamics.com** – keď niečo nejde alebo potrebujete poradiť; napíšte, čo ste
  robili a čo sa zobrazilo, a pomôžeme.

---

## 13. Čo sa dá a čo nie

| Viete | Nejde (a prečo) |
|---|---|
| Spravovať objednávky, tlačiť štítky a dodací listy, exportovať CSV | Robiť platby ručne – platbu prijíma jadro, vy len potvrdíte, že prišla |
| Meniť produkty, ceny, akcie, obrázky, sklad a kategórie | Mazať si digitálne súbory zákazníkom – chránia sa |
| Vytvárať kupóny, QR kódy a darčekové poukazy | Robiť viac zľav naraz na jeden košík – poradie zľav určuje jadro |
| Upravovať texty, obrázky a odkazy na webe | Meniť dizajn stránok – farby, písmo a rozloženie zostávajú také, aké sú |
| Spravovať vernostné úrovne | Vyplácať provízie – to bude v druhej fáze |
| Spravovať dopravcov a jeho kľúč | Klásika nie je v tejto fáze prevádzkovaná |
