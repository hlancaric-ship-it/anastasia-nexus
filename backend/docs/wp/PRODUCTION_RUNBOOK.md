# Provozní zálohy a obnova databáze (C7)

**Datum revize:** 10. 10. 2026
**Implementační základ:** `wave1-base` @ `b01d3ed`; skripty na větvi `codex/restore-drill`.
**Stav:** lokální bezpečnostní nástroje implementované, restore drill neproveden. Tento dokument není důkazem produkční připravenosti.

## Rozsah a ochranné hranice

Skripty jsou určeny výhradně pro lokální `anastasia_dev_wave1` na `localhost`, `127.0.0.1` nebo `::1`. Odmítnou jiný hostname/databázi, URL query/hash i `NODE_ENV=production`. Záloha může obsahovat osobní údaje: soubory ukládají do `backend/data-private/backups/` (ignorováno Gitem), adresář má režim `0700`, soubor `0600`, název se vytvoří výhradně z povoleného ASCII tvaru a existující soubor se nikdy nepřepíše.

Žádné produkční připojení, plánovač, cloudové úložiště, šifrování klíčem ani alerty nejsou nastavené. Lokální backup není náhradou šifrované off-site zálohy. Přístup k souborům musí být omezen na správce a retenční/mazací postup musí schválit provozní vlastník.

## Lokální použití

V `backend/` musí být `DATABASE_URL` nastavené mimo shell historii na lokální DB `anastasia_dev_wave1`. Nečti ani nevypisuj `.env`. Nejprve bezpečný dry run:

```bash
node src/scripts/backup-local.mjs
```

Dry run nevytvoří dump. Zápis vyžaduje explicitní příznak:

```bash
node src/scripts/backup-local.mjs --confirm-local-backup
```

Dump je PostgreSQL custom format s SHA-256 kontrolním součtem. Výstup obsahuje jen cestu, velikost a hash, nikoli přihlašovací údaje nebo obsah databáze. Soubor nepřidávej do Gitu, ticketu ani běžného logu.

Obnova je povolená jen z důvěryhodného custom dumpu uvnitř `backend/data-private/backups/`, do stejné lokální DB, pokud nemá žádné uživatelské tabulky. První příkaz je kontrolní dry run:

```bash
node src/scripts/restore-local.mjs --file=/ABSOLUTE/PATH/TO/backend/data-private/backups/anastasia-YYYY-MM-DDTHH-MM-SS.sssZ.dump
```

Skutečná obnova vyžaduje explicitní souhlas se zápisem a prázdnou databázi:

```bash
node src/scripts/restore-local.mjs --file=/ABSOLUTE/PATH/TO/backend/data-private/backups/anastasia-YYYY-MM-DDTHH-MM-SS.sssZ.dump --confirm-empty-local-restore
```

`pg_restore` používá `--single-transaction`, `--exit-on-error`, bez owner/privileges a nikdy nepoužívá `--clean` ani nemaže objekty. Při neprázdné DB skončí ještě před restore. Prázdný lokální cíl připrav ručně až jako samostatnou schválenou operaci; tento balík DB nevytváří, nemaže ani nečistí. Obnovuj pouze dump vytvořený nebo ověřený důvěryhodným správcem.

## Kontrolní seznam skutečného restore drillu

1. Pro staging vyhraď izolovanou DB a účet bez přístupu k produkci; používej pouze syntetické záznamy. Zatím tato staging infrastruktura není doložena.
2. Pořiď zálohu přes podporovaný backup mechanismus, zapiš čas, velikost a SHA-256 do chráněného provozního záznamu.
3. Ověř čitelnost archivu (`pg_restore --list`) a obnov ho do prázdné izolované staging DB.
4. Spusť migrace/health check, zkontroluj počty syntetického katalogu, objednávek a entitlementů a porovnej předem známé kontrolní součty.
5. Ověř, že aplikace po obnově neodesílá e-maily, nevolá platební bránu a nemá produkční secrets.
6. Změř RPO/RTO a zaznamenej výsledek, chyby, vlastníka i postup rollbacku. Zopakuj drill po změně schématu.

## Stav a chybějící provozní rozhodnutí

- Implementováno: lokální fail-closed `pg_dump`/`pg_restore` nástroje, dry-run, ochrana názvu/cesty/práv a cíle, testy ochranných helperů.
- Neověřeno: skutečný backup/restore záměrně nebyl proveden, protože lokální databáze může obsahovat migrovaná zákaznická data a v tomto běhu nebyl dostupný potvrzený prázdný syntetický cíl. Jestli nástroj bude fungovat v čistém stagingu, musí potvrdit restore drill.
- Blokuje produkční připravenost: hosting DB, poskytovatel a šifrování záloh, off-site kopie, retenční doba, přístupová politika, monitoring/alerty, RPO/RTO, vlastník obnovy a schválené staging credentials.
- Nikdy neobnovuj lokální dump do produkce ani neprováděj restore do existující DB bez samostatného schváleného postupu.
