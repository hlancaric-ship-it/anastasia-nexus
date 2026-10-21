# Backend: mapa funkcí, nastavení a logů před administrací

Kanonický základ: `claude/backend-integration`, worktree `anastasia-nexus-claude-backend`.
Inventář vzniká čtením skutečného sjednoceného kódu, ne starého seznamu plánů. Admin UI se teď nestaví.
Přesný snapshot a kompletní výčet rout, zdrojových jednotek NEXUS, exportů, modelů, jobů,
subscriberů, názvů konfigurace a míst logování: **`backend-admin-inventory.json`**.
Stav `IMPLEMENTED_UNVERIFIED` v inventáři znamená nalezenou implementaci; není to tvrzení,
že každý endpoint nebo export byl ověřen za běhu. Runtime důkazy se posuzují zvlášť.

## Funkce a jejich správa

| Oblast | Autoritativní implementace / API | Nastavení a uložení | Stav / logy / návaznost |
|---|---|---|---|
| Produkty, varianty, kategorie, kolekce | Medusa Product, nativní `/admin/products`, `/admin/product-categories`, `/admin/collections` | Medusa PostgreSQL; prodejní kanály, published/draft, SKU, metadata | Nativní admin existuje; katalogový import a jeho testy v `src/scripts`. Nejde o novou implementaci NEXUS. |
| Základní ceny, daně, doprava a sklady | Nativní Medusa pricing/tax/fulfillment/inventory/stock-locations/regions | PostgreSQL, region EUR/SK, profily digitální/fyzické; bootstrap | Výslednou cenu určuje server. Daňové rozhodnutí k poukazům zůstává otevřené. |
| Zákazník a skupiny | Nativní Medusa zákazníci/skupiny; `nexus-cart/customer-tier.ts` | `customer_group.metadata.nexus_tier`, `rank` | Více skupin vybírá server; vstup klienta nikdy neurčuje tier. |
| Passwordless přihlášení | Medusa auth provider `auth-magic-link` | Auth identity/state, hash jednorázového tokenu, konfigurovaný URL základ | Propojení migrovaného zákazníka a `has_account` je v integrovaném základu. Odesílání závisí na Notification provideru. |
| NEXUS pricing | `POST /store/nexus-cart` → Worker `/api/nexus/pricing` | Serverový tenant/credential, policy JSON; product metadata `manufacturer`, `category`, `max_discount` | Přepočet pod kontrolou serveru; snapshot v košíku. Medusa promotions se nesmějí vrstvit přes autoritativní cenu. |
| Checkout | `POST /store/nexus-checkout`, standardní cart complete, `workflows/hooks.ts` | Snapshot, platební session, kupón/rezervace/poukaz z PostgreSQL | Guard nad zamčeným košíkem, kompenzace, změna ceny invaliduje platbu. Plný lokální HTTP runner. |
| SafeOrder | Worker `/api/nexus/safeorder`, serverový `safeorder.ts` | Aktuální HTTP policy má v kódu COD 120 EUR a prahy 40/70; klient je nesmí měnit | Není zaměnitelná s kompletní sadou doménových SafeOrder pravidel. REVIEW/BLOCK/výpadek zastavují checkout; nastavovací admin zatím chybí. |
| Platební události a refundy | Medusa payment/order events, entitlement/voucher subscribery | Payment provider, skutečný capture, vazby objednávky | Bez capture nevzniká nárok. Plný refund kompenzuje poukazovou část a revokuje digitální přístupy; částečný refund poukazu vyžaduje ruční kontrolu; Stripe E2E se skutečným test klíčem ještě není lokální synthetic důkaz. |
| QR kupóny | `/admin/coupon-links`, `/store/coupon-links`, serverová coupon policy | Medusa promotions/kampaně + `COUPON_LINK_STOREFRONT_ORIGIN` | Generování SVG/PNG je lokální. Preflight není aplikovaná sleva; cenu aktivuje checkout/pricing. Existující admin `coupon-links`. |
| 301 přesměrování | `src/scripts/export-edge-redirects.ts`, GSC `redirects-map.csv` | Importovaná `metadata.legacy_path`, handle a stav produktu/kategorie | Read-only export; query musí zachovat Worker. Nasazení ani dostupnost všech cílových stránek tím nejsou ověřené. |
| Darčekové poukazy | `/admin/vouchers/**`, `/store/gift-vouchers/**`, modul `gift-voucher` | `gift_voucher_settings`, snapshot pravidel na vydaném poukazu | Výběr hodnot, vystavení po platbě, kredit, vrácení, expirace, doručení; existující admin `vouchers`. |
| Pohyby poukazů | `/admin/vouchers/:id/transactions` | Trvalý `gift_voucher_transaction` | Autoritativní částky, vazby a správce; bez kódů, poznámek a kontaktů. Read-only serverový audit. |
| Ochrana kódů poukazů | Middleware apply + cleanup job | `gift_voucher_rate_limit`, pseudonymní hash klienta, 20/min | Souběh 25 HTTP pokusů: 20 validací, 5×429; expirace obnoví limit. DB výpadek →503. |
| Typy konzultací | `/admin/booking/types[/:id]`, `booking/offer.ts` | Produkt, varianta/cena, booking metadata | Existující admin `booking-types`; nastavení musí odpovídat serverové validaci. |
| Volné termíny a rezervace | `/admin/booking/availability`, `/admin/bookings`; store booking-slots/bookings | `booking_availability`, `booking`, časová zóna Bratislava | Globální kolize kalendáře, hold/capture/cancel. Existující admin `booking-availability`; zkrácení úseku s rezervací →409. |
| Digitální přístupy | `/admin/entitlements`, revoke; `/store/entitlements` | `entitlement`, source/dedupe/order/expiry | Nárok po capture, refund/storno revoke; vlastní Claude. Admin stránka pro kompletní správu zatím samostatně nevznikla. |
| Chráněná média | `/store/media-access`, Worker `/media/...` | Privátní R2, token secret, expirace a serverový entitlement | Bez nároku/konfigurace se nepustí. Připravený kontrakt není důkaz produkčního bucketu. |
| Chat | `/admin/chat/**`, `/store/chat/**` | Conversation/message/block/notification-state v PG | Nárok ověřuje server; limity napříč konverzacemi. Existující admin `chat`. Text bez příloh. |
| Retence chatu | `chat-retention` job, `redactExpiredContent` | `CHAT_RETENTION_DAYS` | Po uzavření odstraní starý obsah a předmět. Provozní ID/časy zůstávají pro limity; není úplná anonymizace účtu. |
| Notifikace a joby | Medusa event subscribers/jobs, Notification adaptery | Provider a URL/recipient konfigurace | Lokální synthetic doručení není skutečné odeslání pošty. Claim/retry semantics nutno posuzovat po doménách. |
| Migrace katalogu/zákazník/objednávek | `src/scripts/import-anastasia-catalog.ts`, `migrate-legacy-customers-orders.ts` | Dry-run, legacy ID, důkazy/importní soubory | CLI, idempotence, bez osobních dat v veřejném inventáři. Není to frontendová admin akce. |
| Záloha/obnova | backup-local/restore-local/db-recovery | Jen schválená lokální databáze a artefakty | Runbook, guard lokální DB, restore drill; žádná automatická produkční obnova. |
| Korelace, provozní události a audit změn | `lib/observability`, `/admin/ops/events`, `/admin/ops/audit`, `ops-audit` | PostgreSQL `ops_event`, `ops_audit_entry`, request ID | Trvalé čtení/filtry ověřeny skutečným HTTP; přesné pokrytí callerů níže. |

## Konfigurace: kdo ji mění a kde

| Nastavení | Typ / výchozí stav | Autorita a způsob změny | Audit |
|---|---|---|---|
| Poukazy: `enabled`, hodnoty, `validity_months`, `scope_type`, `category_ids`, `partial_redemption`, `delivery_method` | enabled; 50/100/200 EUR; 12 měsíců; all; postupné; both. Validace v `gift-voucher/policy.ts` | Správce přes `/admin/vouchers/settings`; PG jediný default řádek; synchronizace produktu | `updated_by` + čas a ops audit aplikovaného snapshotu, i když navazující sync produktu selže. Void/refund mají audit bez kódu/poznámek, replay refundu záznam nezdvojí. |
| NEXUS pricing policy | JSON loyaltyTiers/brandLimits/categoryLimits/brandSaleDiscounts, validace Workerem | `MEDUSA_PRICING_POLICY_JSON`; deployment/tenant vlastník. Zatím žádný konfigurační write API/admin editor | Samotný env update netvoří ops_audit_entry. |
| NEXUS propojení | URL, tenant string, secret | Backend `NEXUS_PRICING_URL`, `NEXUS_TENANT_ID`, `NEXUS_PRICING_API_KEY`; Worker dedicated credential/tenant | Secret hodnoty nepatří do adminu ani inventáře. |
| Booking typy | Booking metadata dle `booking/offer.ts`, varianta a cena v PG | Správce přes booking types API | Společný admin audit v integrační větvi. |
| Volný týden | Datum/úseky, Bratislava, serverová validace kolizí | Správce přes availability API →PG | Společný admin audit; obsazený čas nelze mlčky odstranit. |
| Chat limity | 3 po sobě, 5/den, zákazník 2000 znaků, správce 5000, předmět 120 | Konstanty `chat/policy.ts`; **zatím nejsou nastavitelné v adminu** | Změna kódu/git, nikoli DB nastavení. |
| Retence obsahu | `CHAT_RETENTION_DAYS`, 365; celé 30–3650 | Serverová konfigurace; neplatná hodnota job bezpečně zastaví | Počty odstraněného obsahu do logu; env změna není admin audit. |
| Chat upozornění | `CHAT_ADMIN_NOTIFY_EMAIL`, `CHAT_ADMIN_URL`, `CHAT_STOREFRONT_URL` | Serverová konfigurace, adapter Notification | E-mail a obsah zpráv se nesmějí stát provozním logem. |
| Doručení poukazu | `GIFT_VOUCHER_DELIVERY`, aktivní pouze `notification` | Server + vybraný provider a šablony | Maskované provozní informace, delivery stav/pokusy v PG. |
| Retence provozních událostí / admin auditu | `OPS_EVENT_RETENTION_DAYS`: 90, rozsah7–730; `OPS_AUDIT_RETENTION_DAYS`: 1095, rozsah365–3650 | Serverová konfigurace, daily `ops-retention` job, dávky po500 / maximum10000 na běh | Neplatná hodnota používá bezpečný default; striktní celé číslo, žádné parseInt zkrácení typu7junk. Finanční deník poukazů tímto jobem mizet nesmí. |
| Média | Bucket, token secret a serverové URL/TTL dle source inventory | Deployment vlastník, R2 a backend | Log token nikdy neobsahuje. |
| Auth/CORS/DB/payment | Názvy env a poskytovatelé v `medusa-config.ts` | Deployment; běžné obchodní nastavení přes nativní Medusa admin | Žádné čtení `.env`, výpis secretů nebo klientský přepínač tenantu. |

Všechny backend custom admin endpointy patří do Medusa `user` autority. Zákazníková autorita je jiná.
Konkrétní jemnější role („Lucia jen chat“, „účetní jen vratky“) zatím nejsou tímto inventářem
prokázané. Nenabízet v UI práva, která backend ještě nevynucuje. Medusa instance je tenantově
oddělená; Worker svazuje tenant s credentialem, ne s libovolným vstupem storefrontu.

## Logy: co je trvalé a co stále chybí

| Zdroj | Co lze dohledat | Trvalost / přístup | Mezery |
|---|---|---|---|
| `ops_audit_entry` | Aktér, akce, entita, čas, redigované změny, request ID | PG; `/admin/ops/audit`, user auth, stránkování/filtry | Audit helper se volá po obchodní změně. Selhání auditu nezruší už provedenou změnu; vzniká error log. Nejde o atomický audit ve všech doménách. |
| `ops_event` | Úroveň, doména, event, request/order/cart/customer/entity ID, čas a redigovaná pole | PG; `/admin/ops/events`, pouze správce, no-store, limitmax100, filtry ID/domain/level/event/from/to | HTTP ověřil chybný i úspěšný checkout, korelaci, filtry a401 pro anonymní přístup. Maximální explicitní časové okno93d. Zápis je best-effort: při chybě DB zůstává error ve stdout; obchodu se nemění výsledek. |
| `gift_voucher_transaction` | Vystavení, čerpání, propadnutí, kompenzace, refund, void, expiry | PG; `/admin/vouchers/:id/transactions` | Není to všechen provoz aplikace; audit settings je jiný typ události. |
| Medusa structured log | Doména/event/úroveň/čas/request ID; zprávy HTTP a domén | `recordEvent` callery mají i PG záznam; `logEvent`/přímý logger jsou stdout | V inventáři `persistent_ops_events` oproti `structured_stdout_events`. Samotná deklarace domény v helperu není důkaz pokrytí všech operací; native framework stdout není automaticky převzat do PG. |
| Worker structured log | requestId, pricing/SafeOrder/webhook/voucher události, chyby | Workers log infrastruktura; lokálně worker.log | Warn/error z Medusa cest přenáší podepsaný tenantově svázaný ingest do `ops_event`; debug/info a ostatní tenanty zůstávají ve Worker stdout. Celý Worker → backend řetěz v jednom běhu zatím není doložen. |
| Worker D1 voucher audit | Pohyby/reject/hold, tenant/order; execution intents a webhook receipts | D1 tabulky dle migrací | Oddělené od Medusa EUR poukazů; nelze slučovat dva zůstatky ani oba systémy označit za jeden účetní deník. |
| Booking / entitlement / chat stav | Stav rezervace/nároku/konverzace, akce a časová pole | PG + příslušné admin API | Stav entity není úplná neměnná historie všech přechodů. Chat body je chráněný obsah, ne provozní log. |
| Lokální ověřovací důkazy | Syntetické scénáře, statusy, souběh, order delta, persistentní částky | JSON HTTP runneru; test logy; `docs/wp/evidence` | Testové důkazy nejsou živé provozní logy ani produkční acceptance. |

Čtecí backend pro trvalé provozní události nyní existuje, včetně filtrování, oprávnění a retence.
Požadavek „vidět veškeré logy“ je pokrytý pro skutečně zapojené `recordEvent` callery;
samotný stdout helper, seznam domén ani audit změn nenahrazují zapojení dalších zdrojů.
Do budoucího adminu nezavádět čtení libovolných souborů, raw SQL nebo zobrazování tokenů,
celých kódů, kontaktů či chatových zpráv v provozním přehledu.

## Širší NEXUS: nepřehlédnuté funkce mimo storefront tok

Inventář zahrnuje všechna nalezená `nexus/core`, `domains`, `engines`, `adapters`, `workers`.
Domény: pricing, SafeOrder, availability, procurement, voucher, campaign/creative,
billing/subscription, invoice/Omega, B2B/customer context, supplier CSV/Shoptet a warehouse.
Core: canonical entities, rules/decisions, state machine, audit, tenant, snapshots, validation,
error isolation, idempotency, reconciliation a execution intents.

Nalezené pravidlo/typ/flow v kódu není automaticky hotová serverová funkce s nastavením
a adminem. Devět HTTP Worker rout představuje konkrétní runtime povrch; soukromé doručování
médií je navíc prefixová route. Domény bez runtime endpointu jsou `PARTIAL` pro tento
produkt, jejich budoucí admin je `FUTURE_SCOPE`, dokud nebude doložen vykonavatel,
perzistence, oprávnění a testy. `NOT_MIGRATED.md` není důkaz úplné migrace.

## Ověření a pořadí dokončení

1. Integrovat Codex backend commity s Claudovým logováním/notifikacemi/refundy.
2. `npx tsc --noEmit`, kompletní unit, plný `scripts/verify-safeorder-local.py` na syntetické PG.
3. Doplnit do této mapy výsledný commit a konkrétní zbylé mezery kontraktů.
4. Teprve potom společně začít admin nad skutečnými API. Tato mapa nevytváří žádný admin UI.

Dosavadní důkaz: plná integrovaná Medusa/PG regrese `wave1-safeorder-o5t4amac` PASS,
včetně retence dvou uzavřených konverzací (jedna archivovaná), souběhu/replay, audit historie
poukazů a OPS_OBSERVABILITY. Nové admin změny poukazů ověřil navíc `wave1-safeorder-qotli3sf`
(gift-only): settings2/void1/refund1, refund replay bez duplikace. Codex ověřil 412/412 unit a TypeScript PASS.
Integrátor doložil na d37c213 backend 416/416 a NEXUS 572/572 testů PASS; plný HTTP na c500401 PASS.
Podle předání Clauda prošly na fc7e7f2 oba CI joby `verify` a `medusa-persistence`
(run 38648035677), včetně notifikací, kompenzací refundu a izolace A-02.
Inventář je snapshot čistého 8cf9c86; novější ZeptoMail provider tím není označen za ověřené reálné doručení.
Další backendové balíky X1–X3 a C-1–C-4 určuje `ROZDELENI-BACKEND-ZBYTEK.md`; admin stále čeká.
Bez nasazení nebo produkčních zásahů.
