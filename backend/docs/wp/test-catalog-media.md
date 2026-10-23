# Oprava obrázků katalogu v testu

`src/scripts/fix-test-catalog-media.ts` nahrazuje URL obrázků produktu, které ukazují na `http://localhost:9000/static/anastasia/`. Lokální soubory čte z `backend/static/anastasia/`, nahrává je přes Medusa file provider s přístupem `public` a přes `updateProductsWorkflow` aktualizuje `product.thumbnail` i `product.images`. Nemění jiné URL a nic nemaže.

Skript vyžaduje `ANASTASIA_IMPORT_TEST_SERVER=1`. Nejprve spouštěj dry-run:

```sh
DATABASE_URL="$(cat /path/to/testdb.url)" ANASTASIA_IMPORT_TEST_SERVER=1 \
  npx medusa exec ./src/scripts/fix-test-catalog-media.ts dry-run
```

Před apply je nutná záloha test DB. Apply musí běžet v prostředí, kde je Medusa file provider připojený k veřejnému úložišti (Cloud S3/R2) a vrací HTTPS URL. Při lokálním file provideru skript skončí chybou `PUBLIC_CATALOG_IMAGE_PROVIDER_REQUIRED` a do databáze nic nezapíše. Po úspěšném apply druhý běh najde nula lokálních URL a nic nemění.

Ověřovací dotazy:

```sql
SELECT count(*) FROM product WHERE thumbnail LIKE '%localhost%';
SELECT count(*) FROM image WHERE url LIKE '%localhost%';
```
