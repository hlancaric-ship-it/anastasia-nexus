# Call s Lucií, 27. 10. 2026, 11:00 (videohovor)

Cíl hovoru: předat Fázi 1 k testování, ukázat, že všechno funguje, a vyjasnit tři věci, které potřebujeme od Lucie.
Vykání. Bez interních názvů nástrojů.

## 1. Úvod (2 min)
- „Dobrý den, slyšíme se? Vidíme se?“
- „Dnes Vám Fázi 1 předáváme k testování. Za deset minut Vám všechno ukážu, pak si to zkusíte sama a my ještě vyjasníme pár věcí.“
- Termín podle smlouvy: na schválení nebo seznam vad máte 7 dní, tedy do úterý 3. 11.

## 2. Ukázka webu (15 min)
Sdílená obrazovka, krok za krokem:
1. **Úvod a obchod:** vzhled, kategorie, detail produktu. Zkusíme i mobil.
2. **Košík a pokladna:** vložíme produkt, ukážeme předvyplněné údaje u přihlášené zákaznice, platbu kartou. Platba je v testovacím režimu, nic se nestrhne.
3. **Apple Pay a Google Pay:** obojí dnes prošlo od pokladny po objednávku. Ukázat v administraci objednávky #62 a #63.
4. **Přihlášení zákaznice:** odkazem z e-mailu, pak heslo v Profilu, zůstane přihlášená 30 dní.
5. **Staří zákazníci:** 17 zákaznic je přeneseno s historií a kupovanými programy. Hesla ze starého webu se nepřenášejí, zákaznice se poprvé přihlásí odkazem.
6. **RESET 40+:** Moje knižnica, týden 1 (úvodní video a lekce 1), PDF materiály, týdny 1 až 16.

## 3. Ukázka administrace (10 min)
- Objednávky (štítek, dodací list), produkty a ceny, kategorie.
- **Kupóny a QR:** kupón Montelope (−20 € na RESET 40+, platí do 31. 12.), starý QR odkaz funguje, nový QR se generuje a stahuje.
- Zákazníci a jejich přístupy, obsah a texty.
- Upozornit: přístupy jsme poslali jinou cestou než e-mailem.

## 4. Co potřebujeme od Lucie (8 min)
1. **Kupóny a QR:** přenesli jsme tři staré kupóny (Montelope, ZK01, ZK02) a jejich QR odkazy. Existují další, které jsou ve starém systému a mají se přenést? Které QR kódy jsou vytištěné a používané?
2. **Video lekce 1:** ve starém webu je „Reset 40 Plus 0“ (úvod) a „Reset 40 Plus 1“ (týden 1). Teď je úvod i lekce 1 v týdnu 1. Souhlasí to tak? U samostudia týdne 16 starý web žádné PDF nemá. Je to správně?
3. **Platby naostro:** zřídit živý režim Stripe na její firmu (LUCRAT), přidat doménu pro Apple Pay a vypnout Link. Potřebujeme její ruku v Stripe, nebo nás pozve do účtu.
4. **Termín spuštění:** po schválení a po doplatku před spuštěním (975 €), přepnutí domény `anastasiaoz.eu` až na její pokyn.

## 5. Další kroky (3 min)
- Lucia projde přílohu č. 1 (testovací scénáře, políčka k odškrtnutí) a pošle seznam vad do 3. 11.
- Drobné vady opravíme do 14 dní, nebrání schválení.
- Dokumentace (architektura, nasazení, API, zálohy, provoz, návod k administraci) je v balíku, česky nebo slovensky.
- Servis 99 € měsíčně se začíná platit až od veřejného spuštění.

## 6. Konec
- „Máte teď otázky? Kdyby cokoliv nefungovalo, napište mi na ceo@l-code-dynamics.com, reakce do 5 pracovních hodin.“

## Čeho se vyvarovat
- Neslibovat termín spuštění bez schválení a doplatku.
- Nezmiňovat starý testovací server, interní nástroje ani jména dodavatelů. Říkáme „Váš web“, „Váš účet“, „Váš systém“.
- Nezpochybňovat rozhodnutí o heslech: heslo ze starého webu se nepřenáší (domluveno ve smlouvě o migraci).
