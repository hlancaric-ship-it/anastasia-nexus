# 07 – Prístupy a účty

**Pre:** Mgr. Lucia Rogožanová, LUCRAT spol. s r.o.
**Vypracoval:** L-Code Dynamics
**Verzia:** 22. 10. 2026

---

## 1. Ako tento dokument čítať

Tento dokument obsahuje **zoznam účtov a služieb, nie heslá**. Žiadne heslo, kľúč ani token tu nie je a ani nikdy nebude. Ak by ste v nejakej verzii tohto dokumentu našli hodnotu, ktorá vyzerá ako heslo, nie je platná a treba ju nahlásiť.

Stĺpec **Stav** má pri všetkých položkách hodnotu **overiť pri odovzdaní**. Je to zámerné. Vlastníctvo účtov sa počas prípravy menilo a jediný správny stav je ten, ktorý sa overí na odovzdávacom stretnutí pri prihlásení do každého účtu.

**Ako sa prístupy odovzdávajú:** osobne alebo cez dohodnutý bezpečný kanál, nikdy e-mailom, nikdy v tomto dokumente a nikdy v chate. Heslá sa prideľujú tak, že si ich nastavíte sami cez pozvánku alebo obnovu hesla.

---

## 2. Zoznam účtov a služieb

| Služba alebo účet | Na čo slúži | Kto vlastní dnes | Kto má vlastniť | Stav |
|---|---|---|---|---|
| Doména `anastasiaoz.eu` a ostatné domény | adresa webu, e-mailové záznamy, DNS | LUCRAT spol. s r.o., registrátor WebSupport, DNS dnes u WebSupportu, pri spustení prechod na Cloudflare LUCRAT | LUCRAT spol. s r.o. | overiť pri odovzdaní |
| Cloudflare účet a zóny domén | DNS, TLS, ochrana, hosting webu a administrácie, úložisko R2 | účet LUCRAT je založený, testovacie prostredie dočasne beží u L-Code Dynamics | LUCRAT spol. s r.o. | overiť pri odovzdaní |
| Cloudflare Pages, projekt `anastasia-web` | hosting webu | L-Code Dynamics | LUCRAT spol. s r.o. | overiť pri odovzdaní |
| Cloudflare Pages, projekt `anastasia-admin` | hosting administrácie | L-Code Dynamics | LUCRAT spol. s r.o. | overiť pri odovzdaní |
| Cloudflare Access pre `admin.` | druhá vrstva ochrany administrácie overením e-mailom | L-Code Dynamics | LUCRAT spol. s r.o. | overiť pri odovzdaní |
| Cloudflare R2, bucket `anastasia-db-backups` | šifrované denné zálohy databázy | L-Code Dynamics | LUCRAT spol. s r.o. | overiť pri odovzdaní |
| Cloudflare R2, bucket `anastasia-media` | chránené médiá a súbory | L-Code Dynamics, dočasne | LUCRAT spol. s r.o. | overiť pri odovzdaní |
| Medusa Cloud, organizácia a projekt | backend, databáza PostgreSQL, úložisko obrázkov | LUCRAT spol. s r.o., napojenie pri odovzdaní | LUCRAT spol. s r.o. | overiť pri odovzdaní |
| Stripe účet LUCRAT | platby kartou, Apple Pay, Google Pay, vrátenia | LUCRAT spol. s r.o. | LUCRAT spol. s r.o. | overiť pri odovzdaní |
| GitHub repozitár `anastasia-nexus` | zdrojový kód webu, administrácie, backendu a NEXUS | L-Code Dynamics, vývojár má prístup ako spolupracovník | repozitár pod účtom LUCRAT, dodávateľ ako spolupracovník | overiť pri odovzdaní |
| E-mailová služba na odosielanie (Resend) | doručovanie e-mailov z obchodu | L-Code Dynamics | LUCRAT spol. s r.o. | overiť pri odovzdaní |
| E-mailové schránky a pošta (Active24) | prijímanie pošty, MX a SPF záznamy | LUCRAT spol. s r.o. | LUCRAT spol. s r.o. | overiť pri odovzdaní |
| NEXUS Worker, D1 a Durable Object | výpočet ceny, SafeOrder, rezervácie, QR, udalosti | L-Code Dynamics, zámerne zostáva | L-Code Dynamics, obchod sa pripája cez zabezpečené API | overiť pri odovzdaní |
| Šifrovací kľúč záloh | bez neho sa záloha nedá obnoviť | trezor hesiel L-Code Dynamics | trezor hesiel LUCRAT, kópia u dodávateľa pre podporu | overiť pri odovzdaní |
| GitHub prostredie `production-backup` a jeho tajomstvá | prístup k zálohe a k úložisku záloh | L-Code Dynamics | LUCRAT spol. s r.o., spravuje dodávateľ | overiť pri odovzdaní |
| Overenie domény pre Apple Pay v Stripe | aby sa Apple Pay zobrazilo na webe | LUCRAT spol. s r.o. | LUCRAT spol. s r.o. | overiť pri odovzdaní |

Poznámka k NEXUS: NEXUS je náš vlastný modul a podľa dohody zostáva na našom účte. Objednávateľ má právo ho ďalej používať a nechať upraviť, dostane k nemu zdrojový kód aj dokumentáciu. Prevádzkové spojenie je cez API so zdieľanými tajomstvami, takže obchod funguje aj vtedy, keď sa na strane NEXUS nič nemení.

---

## 3. Čo skontrolovať pri odovzdaní

Toto je kontrolný zoznam pre stretnutie pri odovzdaní. Každý bod sa overí prihlásením alebo pohladom do účtu, nie slovne.

1. **Doména.** Prihlásenie k registrátorovi, overenie, že doména je vedená na LUCRAT, kontrola platnosti a automatickej obnovy.
2. **DNS.** Prístup do Cloudflare, kontrola všetkých záznamov, DNSSEC, platnosť certifikátov.
3. **Cloudflare.** Vlastníctvo účtu, členstvo dodávateľa v správnej role, kontrola, že v účte nezostal prostriedok, ktorý patrí obchodu a nie je prevzatý.
4. **Medusa Cloud.** Vlastníctvo organizácie, prístup k projektu, environment, databáza, prehľad spotreby.
5. **Stripe.** Overenie firmy, zapnuté platobné metódy, webhook pre ostrý režim, oprávnenia pre dodávateľa, prístup k výplatám.
6. **R2.** Dva buckety, lifecycle pravidlá, zámky proti zmazaniu, tokeny len na konkrétny bucket.
7. **GitHub.** Vlastníctvo repozitára alebo organizácie, práva dodávateľa, tajomstvá v prostredí `production-backup`, dvojfaktorové overenie.
8. **E-maily.** Overenie odosielacej domény, DKIM a bounce záznamy, schránka pre odpovede, schránka pre kontaktný formulár a chat.
9. **Šifrovací kľúč záloh.** Odovzdanie súkromného kľúča a hesla k nemu dvoma oddelenými položkami, overenie, že kópia u dodávateľa je tiež v trezore.
10. **Dvojfaktorové overenie.** Zapnuté na všetkých účtoch, ktoré to podporujú, s uloženými záložnými kódmi.

Ak niektorý bod nie je možné overiť, zapíše sa do preberacieho protokolu ako otvorená položka. To je správny postup, nie dôvod odovzdanie odkladať, pokiaľ nejde o prístup, bez ktorého obchod nefunguje.

---

## 4. Kde sú tajomstvá

| Tajomstvo | Kde je | Kde nie je |
|---|---|---|
| Prístup do databázy | nastavenie Medusa Cloud | v repozitári, v dokumentácii |
| Platobné kľúče Stripe | nastavenie Medusa Cloud a Stripe | vo webe, v administrácii |
| Podpisové kľúče webhookov | nastavenie Medusa Cloud a Cloudflare Workers | v repozitári |
| Kľúč e-mailovej služby | nastavenie Medusa Cloud | v repozitári |
| Kľúč na podpis odhlasovacích odkazov | nastavenie Medusa Cloud | v administrácii |
| Šifrovací kľúč záloh | trezor hesiel, dve oddelené položky | v GitHube, v R2 |
| Prístupové tokeny k R2 | GitHub prostredie `production-backup` | v repozitári, v dokumentácii |

Ak sa niektoré tajomstvo dostane na miesto, kde nemá byť, riešením je **výmena**, nie zmazanie súboru. Pri odchode dodávateľa alebo pri podozrení na únik sa vymenia všetky tajomstvá naraz.

---

## 5. Ak by ste chceli systém prevziať inému dodávateľovi

Toto je zámerná súčasť dohody a je dobré vedieť, že je pripravená:

- **Zdrojový kód** je v repozitári s celou históriou a odovzdá sa Vám.
- **Dokumentácia** je táto sada a technické dokumenty, ktoré sú súčasťou repozitára.
- **Prístupy** sú vedené na Vás, teda doména, Cloudflare, Medusa Cloud, Stripe, R2, GitHub a e-mailová služba.
- **Naše vlastné moduly**, teda NEXUS, máte právo ďalej používať a nechať upraviť.
- **Zálohy** sú čitateľné šifrovacím kľúčom, ktorý máte Vy. Nový dodávateľ teda dokáže obnoviť dáta aj bez nás.

Podmienka, ktorá sa nesmie vynechať: **bez šifrovacieho kľúča záloh sa zálohy nedajú obnoviť.** Kľúč preto nie je „detail“, je to jedna z najdôležitejších položiek pri odovzdaní.

---

## 6. Bezpečnostné minimum pre všetkých

- Dvojfaktorové overenie na doméne, Cloudflare, Medusa Cloud, Stripe, GitHub aj e-mailovej službe.
- Záložné kódy uložené mimo telefónu, ideálne vytlačené v uzamknutej zásuvke alebo v trezore hesiel.
- Jeden účet na jednu osobu, žiadne zdieľané prihlasovanie.
- Prístup bývalého spolupracovníka sa ruší v deň odchodu, nie „neskôr“.
- Zoznam účtov sa reviduje raz mesačne, pozri `05-PREVADZKOVA-PRIRUCKA.md`.
