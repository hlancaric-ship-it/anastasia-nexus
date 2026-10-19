# Etapa 2 – převod Cloudflare prostředků ANASTASIA na účet Lucie

Stav: příprava 18. 10. 2026, nic se nepřevádí. Spouští se, až bude existovat Cloudflare účet LUCRAT s.r.o.
a Lucky převod schválí. Etapa 1 (launch 23. 10.) běží na Cloudflare účtu L-Code.

**NEXUS je výjimka:** Worker `nexus-api-production`, D1 `nexus-voucher` a DO `VOUCHER_SECURITY` zůstávají na účtu
L-Code a nepřevádějí se. ANASTASIA se k NEXUS připojuje jen přes zabezpečené API (sdílené secrety, runbook §1).

## 1. Princip: převod bez zásahu do kódu

Žádná část aplikace nemá v kódu účet, bucket, endpoint ani doménu Cloudflare. Vše je v proměnných:

| Část | Kde je odkaz na Cloudflare | Co se při převodu změní |
|---|---|---|
| Zálohy DB (`db-backup.yml`) | GitHub env `production-backup`: `R2_BACKUP_ENDPOINT`, `R2_BACKUP_BUCKET`, secrety `R2_BACKUP_*` | 4 hodnoty |
| Storefront (Pages) | env `ANASTASIA_*` v Pages projektu | nový Pages projekt se stejným env |
| Vlastní admin (Pages) | `ANASTASIA_API_ORIGIN`, `ANASTASIA_MEDIA_ORIGIN` při buildu | nový Pages projekt |
| Backend (Medusa Cloud) | `NEXUS_*` URL, CORS, `MAGIC_LINK_BASE_URL`, `ACCOUNT_URL` | nic, pokud zůstanou domény |
| NEXUS Worker (L-Code) | `ALLOWED_ORIGINS`, `MEDUSA_BOOKING_SYNC_URL`, `OPS_INGEST_URL` | nic, pokud zůstanou domény |

Zálohovací skript odmítne jen endpoint, který není R2 (`https://<32 hex>.(eu.)r2.cloudflarestorage.com`). Účet ani název bucketu
v kódu nejsou. Šifrovací klíč na účtu Cloudflare nezávisí, zálohy zůstávají čitelné stejným soukromým klíčem.

## 2. Soupis prostředků (ověřeno `wrangler` 18. 10. 2026, účet L-Code)

| Prostředek | Dnes | Patří | Etapa 2 |
|---|---|---|---|
| R2 `anastasia-db-backups` (EU) | L-Code, zálohy DB, lifecycle + zámky | ANASTASIA | převést (§3.1) |
| R2 `anastasia-media` | L-Code (dočasně) | ANASTASIA | převést (§3.2) |
| R2 `anastasia-admin-demo-media` | L-Code, demo adminu | L-Code (demo) | nepřevádět, po launchi smazat (schvaluje Lucky) |
| Pages `anastasia-web`, `anastasia-admin` | zatím neexistují | ANASTASIA | pokud už bude účet Lucie, zakládat rovnou tam |
| Zóny 5 domén (DNS) | Cloudflare, přenos z Websupportu | ANASTASIA | převést (§3.4); účet zón ověřit před migrací |
| Worker `nexus-api-production`, D1, DO | L-Code | L-Code | **zůstává** |
| Cloudflare Access pro `admin.` | (doporučení runbooku) | ANASTASIA | založit znovu v účtu Lucie |

Před migrací soupis zopakovat (`wrangler r2 bucket list` i s `-J eu`, `wrangler pages project list`, Workers, zóny, Access aplikace),
aby nic nevzniklo mezitím.

## 3. Postup (každý krok: nový prostředek → ověření → přepnutí → ověření → teprve pak úklid starého)

### 3.1 Zálohy DB
1. V účtu Lucie bucket `anastasia-db-backups`, jurisdikce **EU**, stejná lifecycle pravidla a zámky (runbook §4.2).
2. R2 Account API token jen pro tento bucket (Object Read & Write).
3. Zkopírovat existující zálohy (S3 API, dva profily, `aws s3 sync s3://… s3://…` přes lokální mezikopii nebo `rclone copy`
   s `--checksum`). Kopírují se šifrované soubory i manifesty, nic se nedešifruje. Počet a velikosti objektů porovnat.
4. GitHub env `production-backup`: nové `R2_BACKUP_*`. Ruční běh workflow → zelený, objekt v novém bucketu.
5. Restore drill z nového bucketu (runbook §4.4 a).
6. Starý bucket: počkat, dokud nevyprší zámky (denní 30 dní, měsíční 365 dní), nebo zámky smaže admin L-Code
   po písemném schválení Luckyho. Teprve pak smazat bucket a starý R2 token.

### 3.2 Média
1. Bucket v účtu Lucie (stejný název nebo nový, je to jen env), CORS a veřejný přístup jako u původního.
2. Kopie objektů (`rclone copy --checksum`), porovnání počtu a velikostí.
3. Přepnout proměnné, které na bucket odkazují (média adminu, `MEDIA_DELIVERY_BASE_URL` ve fázi 2), nový build/redeploy.
4. Ověřit obrázky na webu a v adminu. Starý bucket smazat po 14 dnech bez přístupů.

### 3.3 Storefront a admin (Pages)
1. Nové Pages projekty v účtu Lucie, stejný build a env (runbook §2.5, §2.6). Nasadit na `*.pages.dev`, ověřit.
2. Custom domains přepojit na nové projekty (po převodu zóny, §3.4). Ověřit HTTPS a smoke test §3 body 1, 2, 9–11.
3. Staré projekty: odpojit domény, ponechat 14 dní jako rollback, pak smazat.

### 3.4 DNS a domény
1. Zóny přidat do účtu Lucie (Add site), záznamy exportovat/importovat (DNS → Export/Import), porovnat záznam po záznamu.
2. DNSSEC: nejdřív vypnout DS u registrátora, pak změna NS, pak zapnout DNSSEC v novém účtu (runbook §2.8/4).
3. Pošta (MX, SPF, DKIM Active24 a ZeptoMail) se přenáší beze změny hodnot. Po přepnutí test ZeptoMail (magic link).
4. **NEXUS a doména:** custom domain Workeru musí být v zóně stejného účtu jako Worker. Po převodu zóny `anastasiaoz.eu`
   na Lucii nemůže `nexus.anastasiaoz.eu` ukazovat na Worker v účtu L-Code. Řešení bez změny kódu:
   - NEXUS dostane hostname v zóně L-Code (např. `anastasia.nexus.l-code-dynamics.com`);
   - změní se jen backend env `NEXUS_PRICING_URL`, `NEXUS_MEDUSA_WEBHOOK_URL` a WAF pravidlo z runbooku §1 (přesune se do zóny L-Code);
   - storefront NEXUS nevolá, zákaznice změnu nepozná.
   **Rozhodnutí pro Luckyho:** použít hostname L-Code pro NEXUS už na launch 23. 10., a tím tento krok v Etapě 2 vynechat
   (doporučeno), nebo ho přepnout až při převodu zóny.

### 3.5 Secrety a přístupy
- Nové R2 tokeny vznikají v účtu Lucie; staré tokeny v účtu L-Code se po přepnutí mažou.
- L-Code dostane v účtu Lucie členství s rolí podle potřeby provozu (ne Super Administrator).
- Secrety mezi backendem a NEXUS (runbook §1) se převodem nemění.

## 4. Kontrola po migraci (před úklidem)
- Noční záloha 3× po sobě zelená v novém bucketu, restore drill prošel.
- Web, admin, přihlášení, košík s cenou z NEXUS, platba v testovacím režimu není potřeba (Stripe se nemění).
- `dig` všech 5 domén ukazuje NS nového účtu, DNSSEC validní, pošta chodí.
- V účtu L-Code nezůstal žádný prostředek ANASTASIA kromě NEXUS (soupis §2 znovu).
