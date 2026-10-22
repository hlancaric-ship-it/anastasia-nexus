# 04 – Zálohy a obnova

**Pre:** Mgr. Lucia Rogožanová, LUCRAT spol. s r.o.
**Vypracoval:** L-Code Dynamics
**Verzia:** 22. 10. 2026

---

## 1. Úvod pre laika

Záloha je kópia databázy, z ktorej sa dá obchod postaviť späť, ak by sa stalo niečo zlé: chybný zásah, výpadok, poškodenie dát. Bez zálohy sa strata databázy rovná strate objednávok, zákazníkov a celého katalógu.

Systém robí **jednu šifrovanú zálohu denne** a ukladá ju mimo servera, na ktorom beží obchod. Každá záloha sa pred uložením skúšobne obnoví, aby sa nezálohoval súbor, ktorý sa nedá použiť. Zálohu nevidí nikto bez šifrovacieho kľúča, a to ani ten, kto má prístup k úložisku.

Dve čísla, ktoré sa používajú pri každej zálohe:

- **RPO 24 hodín** znamená, že pri havárii môžeme prísť najviac o jeden deň dát. Preto sa pred každým rizikovým zásahom robí záloha ručne.
- **RTO 4 hodiny** znamená, že obnova do funkčného stavu je plánovaná na štyri hodiny.

---

## 2. Čo sa zálohuje

| Čo | Ako | Kto to robí | Poznámka |
|---|---|---|---|
| PostgreSQL, teda celý obchod | workflow `db-backup.yml` denne o 02:17 UTC, teda 04:17 SELČ alebo 03:17 SEČ | automaticky | jediná produkčná záloha, pretože plán Develop vlastné zálohy nemá |
| PostgreSQL pred zásahom | ten istý workflow ručne cez Actions → DB backup → Run workflow na vetve `master` | ten, kto zasahuje | robí sa pred každou zmenou dát |
| D1 `nexus-voucher` | Time Travel 30 dní a export `wrangler d1 export` pred migráciou | ten, kto nasadzuje | stav darčekových poukazov v NEXUS |
| Obrázky produktov | úložisko, ktoré spravuje Medusa Cloud | správa obsahu | originály má objednávateľ a import |
| Chránené médiá | R2 `anastasia-media` | správa obsahu | pri obnove sa dopĺňajú z originálov |
| Konfigurácia | nastavenia v Cloude, Cloudflare a Stripe | dodávateľ | nie je súčasťou dumpu, obnovuje sa ručne podľa `02-NASADENIE.md` |

---

## 3. Denná záloha krok za krokom

Zálohu vykonáva skript `backend/src/scripts/backup-cloud.mjs` v rámci GitHub Actions. Každý krok, ktorý neprejde, ukončí beh chybou a GitHub pošle e-mail. Nič sa nepreskočí.

1. **Kontrola oprávnení.** Skript overí, že účet nemá právo zápisu, teda žiadne vkladanie, úpravu ani mazanie, žiadne vlastníctvo tabuliek, žiadne práva superpoužívateľa. Ak by mal, skončí chybou `BACKUP_ROLE_NOT_READ_ONLY`.
2. **Kontrola spojenia.** Spojenie ide iba cez TLS. Lokálna adresa ako zdroj je zakázaná.
3. **Kontrola verzie.** `pg_dump` musí byť rovnakej alebo novšej hlavnej verzie ako server. Bežec má verziu 16.
4. **Konzistencia.** Dump sa číta v jednom snapshotu, takže zápisy počas zálohy sa do nej nedostanú a nič sa nezamyká. Navyše sa spočítajú riadky všetkých tabuliek tesne pred a po.
5. **Úplnosť a obnoviteľnosť.** Dump sa ihneď celý obnoví do prázdnej databázy na bežcovi a počty riadkov sa porovnajú. Prázdna záloha je chyba, chýbajúca alebo prebytočná tabuľka je chyba.
6. **Šifrovanie.** Dump sa zašifruje verejným kľúčom. Nešifrovaný súbor sa hneď zmaže, takže úložisko nikdy nevidí čitateľné dáta.
7. **Manifest.** K zálohe sa uloží súbor `<objekt>.json` bez osobných údajov, s kontrolnými súčtami, počtami riadkov a verziami.
8. **Nahratie a kontrola.** Súbor sa nahrá do R2 a overí sa jeho veľkosť. Zhrnutie behu je v Actions → beh → Summary.

Logy sú verejné, pretože repozitár je verejný. Skript preto nikdy nevypisuje host, používateľa, heslo ani obsah databázy a chybové hlášky sa pred výpisom čistia.

---

## 4. Kde zálohy sú a ako dlho

Bucket `anastasia-db-backups`, jurisdikcia EU. Bucket slúži výhradne zálohám ANASTASIA.

| Prefix | Čo obsahuje | Ako dlho sa uchová | Zámok proti zmazaniu |
|---|---|---|---|
| `daily/RRRR/MM/` | každý nočný beh | 35 dní | 30 dní |
| `monthly/RRRR/` | kópia behu z 1. dňa v mesiaci | 400 dní | 365 dní |
| `selftest/` | iba ručné testy | 1 deň | bez zámku |

Zámok znamená, že zálohu nemaže ani neprepíše nikto, ani uniknutý kľúč, ani omylom spustený príkaz. Nedokončené nahrávania sa mažú po jednom dni. Veľkosť jednej zálohy je približne 1,5 MB, takže celý objem sa pohodlne zmestí do bezplatnej kapacity úložiska.

Súkromný šifrovací kľúč a heslo k nemu sú uložené oddelene od záloh, v trezore hesiel dodávateľa. V GitHube ani v R2 nie sú. **Bez tohto kľúča sa žiadna záloha nedá obnoviť.** Preto sa pri odovzdaní kľúč odovzdáva objednávateľovi bezpečným kanálom, nie e-mailom. Stav odovzdania kľúča je v `07-PRISTUPY-A-UCTY.md`.

---

## 5. Obnova

Obnova má dve podoby. Prvá je **skúšobná obnova** na overenie, že záloha je použiteľná. Druhá je **ostrá obnova produkcie**. Obe sa začínajú rovnako: overením kontrolného súčtu a čitateľnosti archívu.

Potrebné nástroje: PostgreSQL 16 klient, gpg, nástroj príkazového riadku pre R2, Node 24 a lokálna kópia repozitára.

### 5.1 Skúšobná obnova (restore drill)

Robí sa do **prázdnej lokálnej databázy**. Iný cieľ skript neprijme.

```sh
cd backend
export R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_ENDPOINT=… R2_BUCKET=anastasia-db-backups
export BACKUP_GPG_PRIVATE_KEY_FILE=… BACKUP_GPG_PASSPHRASE_FILE=…

# zálohu vyberte podľa dátumu v prefixe daily/RRRR/MM/ a zapíšte si jej presný názov

createdb anastasia_restore_drill
export RESTORE_DATABASE_URL=postgres://localhost/anastasia_restore_drill
node src/scripts/restore-cloud.mjs --key=daily/2026/10/anastasia-….dump.gpg
node src/scripts/restore-cloud.mjs --key=daily/2026/10/anastasia-….dump.gpg --confirm-empty-local-restore
DATABASE_URL=$RESTORE_DATABASE_URL npx medusa db:migrate
```

Prvý príkaz je vždy kontrolný, nič nezapisuje. Druhý vyžaduje výslovné potvrdenie a prázdny cieľ. Migrácie musia prejsť bez zmien, potom sa databáza zmaže.

Hodnoty pripojenia a kľúčov sa do dokumentácie, do e-mailu ani do chatu nikdy nekopírujú. Vyplňuje ich správca priamo v prostredí.

### 5.2 Ostrá obnova produkcie

Rozhoduje dodávateľ po dohode s Vami. Postup:

1. **Zastaviť predaj.** Web sa prepne do údržby cez rollback Pages a webhook Stripe sa vypne, aby nevznikali nové objednávky.
2. **Uložiť aktuálny stav.** V Cloude → Environment → Database sa spraví Export aktuálnej databázy, aby sa dalo dohľadať, čo sa medzitým stalo.
3. **Pripraviť súbor.** Záloha sa stiahne a dešifruje príkazom `restore-cloud.mjs --decrypt-only`. Vznikne súbor `backend/data-private/backups/…`, ktorý sa po importe hneď zmaže.
4. **Import.** Cloud → Environment → Database → Import. Cloud očakáva formát, ktorý naše zálohy spĺňajú.
5. **Oživenie a kontrola.** Redeploy, potom smoke test v rozsahu košík, pripravenosť a plánované úlohy, potom zapnutie webhooku a návrat webu.
6. **Dohľadanie.** Objednávky a platby vzniknuté po čase zálohy sa dohľadajú v Stripe.

Čo sa pri obnove **nikdy nerobí**: neobnovuje sa lokálna záloha do produkcie, neobnovuje sa do existujúcej neprázdnej databázy bez samostatne schváleného postupu a nespúšťa sa obnova naslepo bez overenia kontrolného súčtu.

---

## 6. Test obnovy

Test obnovy nie je formalita. Je to jediný spôsob, ako zistiť, že záloha naozaj funguje.

Kontrolný zoznam:

1. Vyhradiť izolovanú databázu a účet bez prístupu k produkcii, iba so syntetickými údajmi.
2. Spraviť zálohu podporovaným spôsobom, zapísať čas, veľkosť a kontrolný súčet do chráneného záznamu.
3. Overiť čitateľnosť archívu a obnoviť ho do prázdnej izolovanej databázy.
4. Spustiť migrácie a kontrolu stavu, porovnať počty katalógu, objednávok a prístupov s očakávanými hodnotami.
5. Overiť, že obnovená kópia neodosiela e-maily, nevolá platobnú bránu a nemá produkčné tajomstvá.
6. Zmerať RPO a RTO, zapísať výsledok, chyby, vlastníka a postup rollbacku. Test zopakovať po každej zmene schémy.

Kedy sa test robí: **raz pred prechodom na ostré platby a potom raz mesačne.**

### 6.1 Čo je už overené

Dňa 18. 10. 2026 bola celá cesta vyskúšaná na kópii lokálnej vývojovej databázy so 172 tabuľkami: záloha, nahratie do R2, stiahnutie, dešifrovanie, obnova do prázdnej databázy, zhoda počtov riadkov so zdrojom, migrácie a štart s odpoveďou `GET /health` 200 a produktmi v API.

### 6.2 Čo ešte nie je overené

- **Ostrý test obnovy na produkčnej zálohe** prebehne po prvom nočnom behu v ostrom prostredí. Kým neprebehne, produkčná obnoviteľnosť nie je doložená.
- **Vlastník obnovy** musí byť určený menom. Bez vlastníka je postup len dokument.
- **Prenos šifrovacieho kľúča do trezoru a k objednávateľovi** musí byť dokončený pred odovzdaním.

Ak niektorý z týchto bodov k dátumu odovzdania chýba, doplní dodávateľ pri odovzdaní.

---

## 7. Ako zistiť, že zálohy naozaj bežia

- Každý neúspešný beh pošle e-mail tým, ktorí sledujú repozitár.
- **Týždenne** sa v GitHub Actions → DB backup skontroluje, že posledný beh je zelený a mladší ako 26 hodín.
- Plán workflow sa vo verejnom repozitári po 60 dňoch bez aktivity vypína. Workflow si ho preto každú noc sám znovu zapína.
- Každá zmena zálohovacích skriptov alebo workflow spustí skúšku na syntetickej databáze: odmietnutie účtu s právom zápisu, záloha so skúšobnou obnovou, odmietnutie neprázdneho cieľa, nečitateľnosť bez súkromného kľúča, dešifrovanie a obnova, odhalenie poškodeného súboru.

Ak záloha neprebehne tri dni za sebou, je to dôvod kontaktovať podporu. Tri dni bez zálohy znamenajú, že RPO prestáva platiť.

---

## 8. Lokálne pomocné nástroje

Pre lokálny vývoj existujú aj skripty `backup-local.mjs` a `restore-local.mjs`. Pracujú výhradne s lokálnou vývojovou databázou, odmietnu iný hostiteľ, inú databázu aj produkčné prostredie, a obnova vyžaduje prázdny schválený cieľ. Sú určené na vývoj, **nie sú náhradou produkčnej zálohy** a nikdy sa nepoužívajú na produkčné dáta. Vývojové zálohy sa neukladajú do repozitára.
