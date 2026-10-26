# 05 – Prevádzková príručka

**Pre:** Mgr. Lucia Rogožanová, LUCRAT spol. s r.o.
**Vypracoval:** L-Code Dynamics
**Verzia:** 22. 10. 2026

---

## 1. Úvod pre laika

Prevádzková príručka hovorí, čo robiť, keď všetko beží, a čo robiť, keď niečo nefunguje. Nepotrebujete poznať technológie. Stačí vedieť, kam sa pozrieť, čo je normálne a kedy volať podporu.

Tri veci, ktoré si zapamätajte:

1. **Raz denne** sa pozrite do administrácie na Prehľad. Zelená znamená, že obchod je v poriadku.
2. **Keď niečo nefunguje**, zapíšte čas a čo ste robili, a napíšte alebo zavolajte. Čím presnejší popis, tým rýchlejšia pomoc.
3. **Nič sa neopravuje naslepo.** Systém je nastavený tak, že pri pochybnostiach radšej nič nezapíše, než aby zapísal nesprávnu objednávku alebo cenu.

---

## 2. Pravidelná kontrola

### 2.1 Denne

| Kde | Čo kontrolovať | Čo je v poriadku |
|---|---|---|
| Administrácia → Prehľad | Pripravenosť obchodu, počet objednávok na vybavenie, nové správy | zelená, bez blokérov |
| Medusa Cloud → Logs | filter `level=error` | žiadne nové chyby |
| Stripe → Webhooks | zoznam doručení | žiadne zlyhané doručenie |
| Administrácia → Objednávky → Na vybavenie | objednávky čakajúce na odoslanie | vybavené v ten deň |

### 2.2 Týždenne

| Kde | Čo kontrolovať |
|---|---|
| GitHub Actions → DB backup | posledný beh zelený a mladší ako 26 hodín |
| Medusa Cloud → Usage | spotreba výpočtových hodín voči mesačnému limitu |
| Administrácia → Newsletter | stav kampaní, počet doručení a chýb |
| Administrácia → História zmien | neobvyklé zmeny, ak nejaké sú |

### 2.3 Mesačne

| Čo | Prečo |
|---|---|
| Skúšobná obnova zo zálohy | overí, že zálohy sú naozaj použiteľné, postup v `04-ZALOHY-A-OBNOVA.md` |
| Revízia používateľov administrácie | zrušiť prístupy, ktoré už nie sú potrebné |
| Kontrola vernostných úrovní a cien | obchodné nastavenie má zodpovedať realite |
| Kontrola spotreby rozpočtu na služby | aby sa limit neprekročil nepozorovane |

---

## 3. Monitoring – kam sa pozerať

Monitoring v tomto systéme nie je jeden panel. Sú to štyri miesta, každé sleduje niečo iné:

| Miesto | Čo odhalí |
|---|---|
| Administrácia → Prehľad → Pripravenosť obchodu | chýbajúcu konfiguráciu, nezaplatené pripojenia, problémy s cenou alebo skladom |
| Medusa Cloud → Logs | chyby backendu, zlyhané úlohy, problémy s doručením udalostí |
| Stripe → Webhooks a Payments | nepotvrdené platby, zlyhané webhooky, vrátenia |
| GitHub Actions → DB backup | zlyhanú alebo chýbajúcu zálohu |

Prevádzkové udalosti a audit zmien sú dostupné aj v administrácii v sekcii Prevádzka. Každá požiadavka má identifikátor `x-request-id`, ktorý sa dá použiť pri dohľadaní konkrétneho prípadu.

**Čo monitoring v tejto fáze nepokrýva:** nie je doložené úplné zachytenie každého prístupu, nie sú nastavené automatické upozornenia na výpadok dostupnosti a nie je určený človek, ktorý sleduje panely mimo pracovných hodín. Tieto body patria medzi otvorené úlohy, stav doplní dodávateľ pri odovzdaní.

---

## 4. Keď niečo nefunguje

### 4.1 Priority podľa čl. 6 zmluvy

| Priorita | Čo to znamená | Príklady |
|---|---|---|
| **P1 – kritické** | web alebo platby nefungujú, zákazník nemôže nakúpiť | pokladňa vracia chybu, web je nedostupný, platby sa nepotvrdzujú |
| **P2 – obmedzené** | obchod funguje, ale niektorá funkcia nie | nechodia e-maily, nefunguje chat, nepribúda obsah v administrácii |
| **P3 – bežné** | požiadavka alebo úprava, nie porucha | zmena textu, nový kupón, otázka k nastaveniu |

Garantovaná reakcia pri kritickom výpadku je **do 5 hodín** v základnom programe podpory a **do 2 hodín, 7 dní v týždni vrátane večerov a víkendov** v plnom programe. Rozdiel medzi reakciou a opravou: reakcia je čas, do ktorého sa problému začneme venovať a dáme Vám vedieť. Oprava je čas, kým je vec znovu funkčná, a ten závisí od povahy problému. Pri kritickom výpadku je prioritou číslo jedna.

Ktorý program podpory máte zmluvne dohodnutý a presné znenie priorít podľa čl. 6 doplní dodávateľ pri odovzdaní.

### 4.2 Čo urobiť pri výpadku

1. **Zapíšte si čas** a čo ste presne robili, keď problém vznikol.
2. **Skontrolujte Prehľad** v administrácii. Ak svieti blokér, kliknite na odkaz, administrácia Vás prevedie na miesto, kde treba vec opraviť.
3. **Skontrolujte, či problém vidia aj iní.** Skúste stránku otvoriť v inom prehliadači alebo na mobile. Ak problém vidíte iba Vy, ide o Váš prehliadač alebo pripojenie.
4. **Nerobte zásahy do dát.** Nemažte objednávky, nemeňte nastavenia a nespúšťajte obnovu zo zálohy bez dohody s dodávateľom.
5. **Napíšte na `ceo@l-code-dynamics.com`** alebo zavolajte na **+420 776 880 075**. Napíšte, čo ste robili, čo sa zobrazilo, kedy to nastalo a či ide o objednávku, uveďte jej číslo.

### 4.3 Ako dodávateľ dohľadá príčinu

Tento postup je pre technický personál, uvádzame ho pre úplnosť a pre prípad, že by systém prevzal iný dodávateľ.

1. Uložiť čas, prostredie, verziu nasadenia a identifikátor `x-request-id`. Získať číslo košíka alebo objednávky, ale nikdy nekopírovať tokeny.
2. V prevádzkových udalostiach prepájať reťaz: cena, riziko, dokončenie, platba, nadväzujúca úloha.
3. Porovnať skutočný stav objednávky, platby, rezervácie a denníka poukazu. Návrat do prehliadača nie je dôkaz zaplatenia.
4. Ak chýba trvalá udalosť, skontrolovať chránený log a záznam o zlyhaní zápisu udalosti.
5. Externý finančný výsledok overiť najprv u poskytovateľa platobnej služby. Finančnú operáciu ani e-mail sa neopakujú naslepo, pretože by mohli vzniknúť dvakrát.

---

## 5. Limity spotrebných služieb

Zmluva čl. 6 odst. 4 počíta s rozpočtom **50 € mesačne** na prevádzkové a spotrebné služby. Hranica na upozornenie je **80 % rozpočtu, teda 40 €**.

Do rozpočtu patria:

| Služba | Ako sa platí | Poznámka |
|---|---|---|
| Medusa Cloud, plán Develop | 29 USD mesačne, uhradené | zahŕňa backend, databázu a úložisko súborov. Plán má **300 minút buildu mesačne**: každé nahratie zmeny backendu do sledovanej vetvy spustí build (okolo 3 minút), preto sa zmeny backendu nahrávajú v dávkach. Zmena premenných prostredia build nespúšťa |
| Cloudflare | podľa použitia, R2 do 10 GB bezplatne | web, administrácia, DNS, Worker, zálohy |
| Stripe | poplatok z transakcie | nie je mesačný paušál |
| E-mailová služba | podľa počtu odoslaných e-mailov | transakčné e-maily a newsletter |
| Doména a pošta | ročne, podľa registrátora | doména a schránky |

**Ako to sledovať:** raz týždenne sa pozrite do Medusa Cloud → Usage a raz mesačne spočítajte všetky služby do jedného prehľadu. Keď sa súčet priblíži k 40 €, teda k 80 % rozpočtu, upozornite dodávateľa ešte pred prekročením 50 €. Spoločne sa rozhodne, či sa niečo vypne, obmedzí alebo či sa rozpočet upraví.

**Otvorená blokácia, ktorú treba potvrdiť:** plán Develop má podľa cenníka limit 600 výpočtových hodín mesačne na prostredie, pričom mesiac má 720 až 744 hodín a server beží nepretržite. Ak je limit tvrdý, produkcia by sa koncom mesiaca zastavila. Dokumentácia poskytovateľa neuvádza, čo sa po vyčerpaní stane. Do potvrdenia odpovede od poskytovateľa sledujte Usage týždenne. Ak sa limit blíži, kontaktujte dodávateľa okamžite, nie až po výpadku.

Nákladová položka, ktorú sme zámerne nevybrali: dlhodobé staging prostredie za 60 USD mesačne. Na launch nie je potrebné a samo by rozpočet vyčerpalo.

---

## 6. Limity newslettera

Newsletter má vlastné limity, aby sa neodoslalo viac, než je bezpečné, a aby sa dali kampane zastaviť.

| Parameter | Hodnota | Význam |
|---|---|---|
| Dávka za jeden beh | 40 e-mailov | koľko najviac odíde pri jednom spustení úlohy |
| Denný limit | 90 e-mailov za 24 hodín | ochrana proti nechcenému hromadnému odoslaniu |
| Ako často úloha beží | každých 10 minút | dávka sa dopĺňa priebežne |
| Testovacia kópia | iba na adresy domény dodávateľa | nedá sa poslať test zákazníkovi omylom |
| Odhlasovací odkaz | podpísaný, jednoklikový | bez neho sa neodošle nič |

Pravidlá, ktoré platia pri každej kampani:

1. Pred každým e-mailom sa znova prečíta stav súhlasu aj stav kampane. Ak kampaň počas odosielania zrušíte, zvyšné e-maily sa neodošlú.
2. Adresy, ktoré neprejdú povoleným zoznamom v testovacom režime, sa označia ako preskočené a nepočítajú sa ako odoslané.
3. Stav „odoslané" znamená, že e-mailová služba správu prijala. Doručenie do schránky je samostatná vec, ktorú sledujte v prehľade e-mailovej služby.
4. Denný limit sa počíta z doručení za posledných 24 hodín. Ak sa databáza obnoví zo zálohy, výpočet sa môže líšiť.

Ak potrebujete odoslať viac ako 90 e-mailov za deň, je to zmena nastavenia a dohodne sa s dodávateľom vopred.

---

## 7. E-maily v prevádzke

- E-maily odchádzajú z overenej domény. Odosielateľ, adresa pre odpovede a meno odosielateľa sú nastavené v prostredí.
- Kontrola, či e-maily naozaj chodia: prihláste sa na vlastnú adresu prihlasovacím odkazom a odošlite kontaktný formulár. Ak e-mail nedorazí, ide o najčastejšie nastavenie e-mailovej služby, nie o chybu obchodu.
- Chyba odoslania sa zapíše do logu s HTTP stavom a kódom chyby. Neopakuje sa automaticky, aby zákazník nedostal dva rovnaké e-maily.
- Odpoveď z kontaktného formulára aj z chatu chodí na schránku, ktorú určíte. Ak chcete inú adresu, je to zmena nastavenia.

---

## 8. Presmerovania starých adries a QR kódy

### 8.1 Ako to funguje

Starý web mal adresy, ktoré sú použité v odkazoch, vo vyhľadávači a vo vytlačených QR kódoch. Pri migrácii sa nesmú rozbiť. Systém to rieši dvoma spôsobmi:

1. **Adresa existuje aj na novom webe.** Vtedy sa nič nepresmeruje, stránka jednoducho funguje na novej adrese. Takých adries je 27 a build ich kontroluje, aby nezmizli.
2. **Adresa sa líši iba schémou alebo hostom.** Napríklad stará adresa bez `www` alebo cez `http`. Vtedy platí trvalé presmerovanie 301 na `https://www.anastasiaoz.eu` s rovnakou cestou a **zachovaným query parametrom**.

Vlastnosti, ktoré sú zámerné:

- Presmerujú sa iba požiadavky GET a HEAD. Ostatné metódy idú priamo do spracovania.
- Presmeruje sa iba webová doména. API adresa sa nikdy nepresmerúva.
- Cieľ sa nikdy neskladá z hlavičky požiadavky, vždy z pevného zoznamu. Nedá sa teda zneužiť na presmerovanie na cudziu stránku.
- Query parametre, teda `produkt`, `kupon`, `ks` a parametre kampaní, sa prenášajú bez zmeny.
- Do logu ide iba cesta, nikdy nie kód kupónu.
- Presmerovanie sa drží v cache jednu hodinu, aby sa prípadná chyba dala opraviť bez dlhého čakania.
- Ak je zoznam presmerovaní poškodený, Worker nič nepresmeruje, zapíše chybu a API beží ďalej. Radšej žiadne presmerovanie než nesprávne.

### 8.2 QR kódy

QR odkaz má tvar `…/eshop/kosik?produkt=<kód>&kupon=<kód>&ks=<počet>`. Kód produktu je kód SKU, nie názov ani interné ID. Počet kusov je celé číslo od 1 do 999, pri neplatnej hodnote sa použije 1.

Dôležité: **samotný QR odkaz nie je uplatnená zľava.** Odkaz overí, že produkt a kupón existujú, a prevedie zákazníka do košíka. Skutočnú zľavu uplatní server pri prepočte košíka. Ak je kupón neplatný, produkt sa aj tak pridá, podobne ako v starom systéme.

Pred každou kampaňou s vytlačenými QR kódmi odporúčame urobiť tri veci:

1. Naskenovať QR kód mobilom a prejsť až do košíka.
2. Skontrolovať, že sa zľava naozaj prejaví v cene.
3. Skontrolovať, že po prechode na `www` zostali v adrese parametre kampane.

Ak sa niektorý krok nepodarí, je to dôvod kontaktovať podporu ešte pred tlačou.

### 8.3 Staré adresy produktov

Mapa starých ciest produktov a kategórií sa naplní po importe katalógu s pôvodnými adresami. Dovtedy je prázdna a nič sa neodhaduje. Kým import neprebehne, staré adresy produktov sa nepresmerujú automaticky. Stav doplní dodávateľ pri odovzdaní.

---

## 9. Bežné situácie a čo s nimi

| Čo vidíte | Najčastejšia príčina | Čo urobiť |
|---|---|---|
| Obrázky produktov sa nezobrazujú | nesprávne nastavenie adresy úložiska obrázkov | skontrolovať v administrácii detail produktu, či obrázok existuje, potom kontaktovať podporu |
| Zákazníkom nechodia e-maily | chýbajúce alebo neplatné nastavenie e-mailovej služby | skúsiť prihlásenie na vlastnú adresu, potom kontaktovať podporu |
| Košík vráti chybu 503 | nedostupná cenová služba NEXUS | kontaktovať podporu, objednávka sa nezapíše, nič sa nestratí |
| Platba sa nepotvrdí | zlyhaný webhook alebo nesprávny kľúč | skontrolovať Stripe → Webhooks, kontaktovať podporu, objednávku neodosielať, kým sa platba nepotvrdí |
| Objednávka je „čaká na platbu" pri prevode | platba ešte neprišla | po prijatí peňazí potvrdiť v detaile objednávky tlačidlom Prijať platbu |
| Podozrivá objednávka | rozhodnutie SafeOrder | skontrolovať objednávku, pri pochybnostiach kontaktovať zákazníka, nič nemazať |
| Newsletter sa neodošle | chýbajúci kľúč pre odhlasovací odkaz alebo neplatná konfigurácia | kontaktovať podporu, kampaň zostáva v stave konceptu |
| Záloha zlyhala | zmena hesla alebo siete na strane služby | kontaktovať podporu do 24 hodín, ďalší beh sa spustí nasledujúcu noc |
| Administrácia je pomalá | slabé pripojenie alebo veľký počet záznamov | skúsiť inú sieť, potom kontaktovať podporu |
| Zákazník zo starého webu nevie zadať heslo | heslá zo starého webu sa neprenášajú | poslať mu odkaz na prihlásenie z e-mailu, heslo si potom nastaví v účte v časti Profil |
| Zákazník je odhlásený po zatvorení prehliadača | súkromné okno alebo vymazané údaje prehliadača | prihlásenie platí 30 dní a uchováva sa v prehliadači, pri súkromnom okne alebo vymazaní údajov je potrebné prihlásiť sa znova |
| V knižnici sa PDF alebo video neotvorí (chyba 403) | chýba súbor v súkromnom buckete alebo nezhodné podpisové tajomstvo | skontrolovať, či súbor existuje v súkromnom buckete a či `MEDIA_TOKEN_SECRET` sedí na backende aj na Workeri médií |

---

## 10. Čo sa v prevádzke nikdy nerobí

- Nemaže sa celá databáza, ani pri čistení testovacích dát. V databáze je bootstrap, bez ktorého obchod nefunguje.
- Neobnovuje sa záloha do existujúcej neprázdnej databázy bez schváleného postupu.
- Neopakuje sa platba ani odoslanie e-mailu naslepo.
- Nezapisujú sa heslá a kľúče do dokumentácie, e-mailu, chatu ani ticketu.
- Nezasahuje sa do produkčných dát bez zálohy spravenej tesne pred zásahom.
- Nevypína sa zálohovanie, ani keď sa zdá, že prekáža.

---

## 11. Kontakty

| | |
|---|---|
| Podpora a poradenstvo | **ceo@l-code-dynamics.com** |
| Telefón | **+420 776 880 075** |
| Web dodávateľa | https://l-code-dynamics.com |

Pri kritickom výpadku volajte, nepíšte iba e-mail. Uveďte, že ide o kritický výpadok, aby sa správa zaradila správne.
