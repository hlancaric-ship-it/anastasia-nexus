# NEZARADENÉ – overiť (interné, nie súčasť scenára pre klientku)

Tento zoznam je **len pre nás**. Do `PREDANIE-test-scenare.md` sa tieto body nedali zaradiť, pretože
na testovacom webe (`https://anastasia-test.l-code-dynamics.com`, overené 21. 10. 2026 prečítaním
stránok bez objednávok, platieb a účtov) buď funkcia nie je, alebo sa nedá overiť bez zásahu do
dát. Pred samotným testovaním zákazníka ich preveríme.

## 1. Overené na živom teste

| Bod | Výsledok |
|---|---|
| **Klub / členstvo** | **Zapnutý 21. 10. (schválil Lucky).** `/klub` 200, odkaz v pätičke, záložka Klub v účte. Doplnený scenár 5.5. Ponuku po prihlásení overiť s testovacím účtom. |
| **Presmerovania starých adres a QR kódov (301)** | **Funguje.** Overené 21. 10. (Claude): všetkých 20 ciest z `public/_redirects` vracia 301 na správny cieľ, QR odkaz `/eshop/kosik?produkt=…&kupon=…&ks=…` zachová parametre. Adresy typu `/index.php?page=14` v mape nie sú (neboli v GSC). Presmerovanie hostu `anastasiaoz.eu` → `www` rieši NEXUS Worker až na produkčnej doméne. |

## 2. Overiť s prihláseným testovacím účtom

| Bod | Stav |
|---|---|
| **Zóna RESET 40+ a Zrkadielko v zákazníckom účte** | **Na teste je nasadená** (verzia f121d093, `reset-zone.mjs` 200). Bez prihlásenia a kúpeného programu sa nezobrazí – preto ju MiniMax nevidel. Pred testom overiť s testovacím účtom s kúpeným RESET 40+. |

## 3. Overiť ešte treba (neprizahlásené alebo bez zásahu do dát)

| Bod | Prečo nebolo overené |
|---|---|
| **Názvy polí v košíku** (pole na kód kupónu a pole na kód darčekového poukazu) | Existujú a fungujú, ale presné nadpisy polí sa dajú overiť až s položkou v košíku – nechceli sme robiť zásah do košíka. |
| **Tlačidlo na prechod do pokladne** | Na prázdnom košíku sa zobrazí iba **Objaviť obchod**; tlačidlo na pokladňu sa zobrazí až s položkou. |
| **Spôsob platby a tlačidlo platby** (**Kartou online**, **Zaplatiť**) | Overí sa až s položkou v košíku, kým sa platba neodohrá. |
| **Uplatnenie kupónu Montelope** | Backend hlási, že na uplatnenie kupónu treba byť prihlásený, a zľava sa počíta až pri prihlásenom košíku. Bez účtu sa nedá overiť. |
| **Uplatnenie darčekového poukazu v košíku** | Overí sa až s položkou a kódom poukazu. |
| **Výstup platby a potvrdzujúci e-mail** | Zámerné neoverené – neplatíme a nevytvárame objednávky ani účty. |
| **Zóna účtu po prihlásení** (záložky **Objednávky**, **Materiály**, **Chat s Luciou**, **Konzultácie**, obsah **RESET 40+** a **Zrkadielka**) | Vyžaduje prihlásenie – overené len v kóde, nie na živom teste. |
| **Vývoz údajov zákazníka** | V administrácii sme ho nenašli – overiť, kde je dostupný a či sa dá stiahnuť. |
| **Agenda Ochrana osobných údajov a odstúpenia v administrácii** | Overiť, či sú v použiteľnej podobe. |
| **Ambasádori** | Časť pre neskoršiu fázu – do testu Fázy 1 ju nezaraďujeme. |
| **Nový zákaznícky účet (registrácia)** | Na prihlasovacej stránke je len **Poslať prihlasovací odkaz**; samostatné tlačidlo „Vytvoriť si účet“ na živom teste nie je. Overiť, či sa má doplniť. |
