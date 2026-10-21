# NEZARADENÉ – overiť (interné, nie súčasť scenára pre klientku)

Tento zoznam je **len pre nás**. Do `PREDANIE-test-scenare.md` sa tieto body nedali zaradiť, pretože
na testovacom webe (`https://anastasia-test.l-code-dynamics.com`, overené 21. 10. 2026 prečítaním
stránok bez objednávok, platieb a účtov) buď funkcia nie je, alebo sa nedá overiť bez zásahu do
dát. Pred samotným testovaním zákazníka ich preveríme.

## 1. Overené na živom teste

| Bod | Výsledok |
|---|---|
| **Klub / členstvo** | **Nedostupné.** `/klub` sa presmeruje (301) na `/eshop/` – na živom teste sa zobrazí obchod, nie ponuka členstva. V kóde je Klub zapnutý prepínačom `ANASTASIA_CLUB=1` (`src/club.mjs`) a vtedy pribudne záložka **Klub** v účte a odkaz **Klub** v pätičke. **Treba rozhodnúť, či Klub v Fáze 1 vôbec patrí do testu.** |
| **Presmerovania starých adres a QR kódov (301)** | **Nefunguje na testovacom webe.** Staré adresy typu `/index.php?page=14` alebo `/eshop/index.php?id=3` skončia na stránke **„Tuto stránku na webu anastasia-test…“** (404), nie presmerovaním. Neexistujúca adresa sa tiež správa ako 404 (korektne). **Treba overiť nasadenie mapy presmerovaní na testovacie prostredie.** |

## 2. K dispozícii vo webe, ale na živom teste zatiaľ nie je

| Bod | Stav |
|---|---|
| **Zóna RESET 40+ a Zrkadielko v zákazníckom účte** | Kód je v našom worktree (nová záložka **RESET 40+** v účte, týždne 1 – 16, Zrkadielko s pridávaním, úpravou a zmazaním záznamu). **Na živom testovacom webe zatiaľ nie je** – živý test beží zo staršieho buildu. Scenár 5.4 platí až po nasadení. |

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
