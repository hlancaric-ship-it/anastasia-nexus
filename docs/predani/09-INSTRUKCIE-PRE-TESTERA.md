# 09 – Pokyny pre bezpečnostného testera

**Pre:** Mgr. Lucia Rogožanová, LUCRAT spol. s r.o., na odovzdanie testerovi
**Vypracoval:** L-Code Dynamics
**Verzia:** 27. 10. 2026

## 1. Čo sa testuje

Web a systém ANASTASIA vo Fáze 1. Testuje sa na testovacom prostredí. Ostrý web ešte nebeží.

| Čo | Adresa |
|---|---|
| Web (obchod, účet, pokladňa) | `https://anastasia-test.l-code-dynamics.com` |
| Administrácia | `https://anastasia-test-admin.l-code-dynamics.com` |
| Rozhranie systému (API) | `https://anastasia-api.medusajs.app` |
| Chránené médiá | `https://anastasia-test-protected-media.*` (adresu zistíte z webu pri prehrávaní kúpeného obsahu) |

Prístupové údaje do administrácie a testovacieho zákazníckeho účtu odovzdáme osobne alebo cez bezpečný kanál, nikdy nie e-mailom.

## 2. Čo je povolené

- Skúšanie prihlásenia a hesiel na vlastných testovacích účtoch (hrubá sila, opakované pokusy, obnova hesla, odkaz na prihlásenie).
- Kontrola prístupu k cudzím dátam (cudzie objednávky, faktúry, knižnica, chránené súbory) s testovacími účtami, ktoré Vám pridelíme.
- Skúšanie vstupných polí a formulárov (XSS, injekcie, nahrávanie súborov, CSRF, otvorené presmerovania).
- Skúšanie pokladne a platieb **iba v testovacom režime Stripe** (testovacie karty, napríklad 4242 4242 4242 4242). Skúšanie zneužitia kupónov a zliav, manipulácia s košíkom a cenou.
- Kontrola hlavičiek, TLS, CORS, CSP, e-mailovej autentifikácie (SPF, DKIM, DMARC) a verejne dostupných súborov.
- Záťažové útoky (DoS) **iba v dohodnutom časovom okne**, viď bod 4.

## 3. Čo je zakázané

- Akýkoľvek útok na doménu `anastasiaoz.eu`, jej DNS, e-mail alebo ostrý web. Ostrý web a doména sú mimo rozsahu, kým Vám nedáme písomný súhlas.
- Platby skutočnou kartou, skutočné objednávky a odosielanie e-mailov skutočným zákazníkom. Testovacie e-maily chodia iba na adresy majiteľky.
- Sociálne inžinierstvo, phishing a útoky na osoby (majiteľku, zamestnancov, zákazníkov, náš tím).
- Útoky na služby tretích strán (Stripe, Cloudflare, poskytovateľ e-mailov, hosting). Testuje sa náš systém, nie ich infraštruktúra.
- Mazanie alebo ničenie dát, ktoré nepatria testerovi. Pri nájdení úniku osobných údajov dáta nesťahujte vo väčšom množstve, stačí dôkaz o prístupe.
- Zneužitie nájdenej chyby nad rámec dôkazu, že existuje.

## 4. Termín, adresy a záťažový test

Pred začiatkom nám tester pošle na `ceo@l-code-dynamics.com`:
1. termín a čas testovania,
2. IP adresy, z ktorých bude test prebiehať,
3. či bude súčasťou test záťaže (DoS).

Záťažový test sa robí iba na testovacom webe a v predom dohodnutom čase. Ochrana webu môže neohlásený test zablokovať.

## 4a. Čo by mal tester vedieť vopred

- **Limity požiadaviek sú zámerné.** Pri opakovaných pokusoch dostanete odpoveď `429 RATE_LIMITED`, napríklad pri prihlásení, obnove hesla, platobnej relácii, kupónoch, rezerváciách termínov a formulároch s e-mailom. Na rovnakú e-mailovú adresu odídu najviac 3 správy za hodinu. Ide o ochranu, nie o chybu. Ak chcete testovať obídenie limitu, napíšte nám a pridáme Vašu IP do výnimky iba na Cloudflare.
- **Automatické skenery** používajte najviac s 10 požiadavkami za sekundu.
- **Účty:** dostanete dvoch zákazníkov a správcu s rolou `assistant`. Rolu `owner` iba na požiadanie. Asistent nesmie meniť ceny, kupóny, poukazy, prístupy ani API kľúče. Overenie týchto hraníc vítame.
- **Dvojfaktorové overenie (TOTP)** si správca zapína v Administrácia → Zabezpečenie.
- **Záťažový test:** najviac 5 minút, iba aplikačná vrstva (drahé dopyty, limity) a s okamžitým zastavením na náš pokyn. Objemové útoky na Cloudflare sú zakázané.
- **Kritický nález** (prevzatie účtu, platba, únik dát) nahláste hneď telefonicky, nečakajte na záverečnú správu.
- Po odovzdaní správy zmažte údaje získané počas testu.

## 5. Správa z testu

Výsledok pošlite písomne. Pri každom náleze uveďte: názov, závažnosť, kroky na zopakovanie, dôkaz (snímka obrazovky alebo požiadavka a odpoveď), odporúčanú opravu. Všetky nálezy opravíme a vrátime ich na overenie.

## 6. Kontakt

L-Code Dynamics, Jan Lančarič, `ceo@l-code-dynamics.com`, +420 776 880 075. Ak test niečo vážne naruší (web nereaguje, objavia sa chyby), test prerušte a zavolajte.
