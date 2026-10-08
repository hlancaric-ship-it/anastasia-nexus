# Data audit e-shopu (anastasiaoz.eu) — z dumpu DB.sql

**Datum:** 7. 10. 2026 · **Zdroj:** `~/Downloads/anozeu/DB.sql` (20 MB, UTF-16, MS SQL dump přibalený k oficiálnímu repu e-shopu). Read-only, offline analýza. **Žádné PII se nevypisuje** — jen struktura a počty.

## 1. Co dump je
MS SQL dump databáze e-shopu: **78 tabulek** (CREATE), **64 s daty**, celkem **19 176 INSERT řádků**. Umbraco 8 CMS tabulky (`umbraco*`, `cms*`) + business tabulky e-shopu (`ec*`) + cookie log (`wsCookies`).

## 2. ⚠️ Toto je nejspíš DEV/handover snapshot, ne živá produkce
Objemy jsou na reálný e-shop **velmi malé** → pravděpodobně vývojová/předávací kopie přibalená k repu, ne aktuální produkční data:

| Byznys tabulka | Řádků | Význam |
|---|---|---|
| **ecProduct** | 30 | produktů v katalogu |
| **ecQuote** | 58 | objednávky/nabídky |
| **ecCustomer** | 12 | zákazníci |
| **cmsMember** | 13 | registrovaní členové |
| **ecProductPrice** | 30 | ceny |
| **ecCoupon** | 3 | kupóny |
| **ecProducer** | 3 | výrobci |
| **ecCategory** | 11 | kategorie |
| **ecPaymentType / ecTransportType** | 3 / 2 | platby / doprava |
| **umbracoUser** | 4 | **admin účty** (vč. dodavatelského) |

> **Důsledek:** data audit potvrzuje datový model a integritu, ale **produkční objemy a reálná zákaznická data z něj určit nelze** — na to by byl potřeba aktuální produkční dump (hosting Active24, `81.95.98.157`).

## 3. Bezpečnostní nálezy z dumpu
- 🔴 **DATA-1 — dump obsahuje `umbracoUser` (4 admin účty) vč. hashů hesel** a `cmsMember`/`ecCustomer` (PII zákazníků). Tento `DB.sql` koluje v repu/ke stažení → **únik hashů admin hesel + PII**. Repo s produkčním/dev dumpem = citlivé, nepatří do volně sdíleného balíku.
- 🟠 **DATA-2 — dodavatelský admin účet** `developer@dufeksoft.com` v `umbracoUser` → dodavatel má/měl plný přístup do CMS. Při odchodu dodavatele nutno **zrušit/rotovat** (viz migrace).
- 🟡 **DATA-3 — `wsCookies` 5118 řádků** vs. 12 zákazníků/58 objednávek → buď reálný nízkokonverzní provoz, nebo dlouho běžící dev. Nepotvrzuje produkci jednoznačně.

## 4. Integrita datového modelu (OK)
- `ecQuote` 58 ↔ `ecProduct2Quote` 32 ↔ `ecUser2Quote` 10 — vazby konzistentní s auditovaným schématem.
- `ec*` tabulky odpovídají struktuře z `segment-STRUKTURA-architektura.md` (ecProduct/ecQuote/ecCoupon/…).
- 14 tabulek je prázdných (CREATE bez dat) — mj. `cmsDictionary`, `umbracoConsent`, `umbracoExternalLogin` (viz dump).

## 5. Co zbývá k úplnému bodu 3 (data audit)
- **Produkční objemy a reálná data** → aktuální dump z hostingu e-shopu (Active24, `81.95.98.157`); `Heslo.txt` v repu má reálné přístupy, ale jeho čtení bylo prostředím zablokováno (bezpečnostní pojistka) → přístupy musí dodat majitelka/web designer řízeně.

---

## 6. ŽIVÝ nález — správa admin účtů v produkčním Umbraco (7.10.2026)
**Zdroj:** screenshot User management z živého `anastasiaoz.eu/umbraco` (přihlášení provedl vlastník účtu, ne auditor). 4 uživatelé:

| Účet | Role | Poslední přihlášení | Nález |
|---|---|---|---|
| developer@dufeksoft.com | Administrator | aktivní (7.10.2026) | 🔴 LIVE-U1 dodavatel = plný admin |
| **pkvarg@yahoo.se** | Administrator | **28.4.2022** | 🔴 **LIVE-U2 osiřelý admin, 4+ roky neaktivní, neznámá 3. strana, plná práva** |
| lucia.rogozanova@gmail.com | **Editor** | 6.10.2026 | 🟠 LIVE-U3 majitelka má jen Editor (míň než dodavatel i neznámý účet) |
| L-Code Dynamics | Administrator (Inactive) | — | auditní účet (nově přidán) |

**Priorita (governance, nezávisle na migraci):**
1. 🔴 **Okamžitě zablokovat/odstranit `pkvarg@yahoo.se`** — neznámý dormant admin je aktivní vektor převzetí.
2. 🔴 Po dokončení přechodu **zrušit/rotovat `developer@dufeksoft.com`** (dodavatelský admin).
3. 🟠 Povýšit majitelku na Administrator (po konsolidaci rolí); zavést princip nejmenších oprávnění.

> Pozn.: Počet admin účtů (4) odpovídá `umbracoUser=4` v `DB.sql` → dump je blízko produkčnímu stavu; malé objemy produktů/objednávek tedy mohou odrážet reálně malý/mladý e-shop, ne jen dev. Produkční objemy potvrdit v Content/objednávkách.

### REMEDIACE provedena vlastníkem (7.10.2026, ~12:05)
- ✅ LIVE-U2 vyřešeno: `pkvarg@yahoo.se` **deaktivován** (Disabled).
- ✅ LIVE-U1 vyřešeno: `developer@dufeksoft.com` **deaktivován** (Disabled).
- ✅ LIVE-U3 vyřešeno: majitelka `lucia.rogozanova` povýšena na **Administrator** (plné skupiny).
- Aktivní admini nyní: majitelka + L-Code Dynamics (auditní). Doporučení: disabled účty tvrdě smazat po ověření, že nevisí autorství obsahu.
