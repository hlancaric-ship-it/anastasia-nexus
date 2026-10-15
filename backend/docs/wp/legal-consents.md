# X1 — Souhlasy, newsletter a odstoupení

Větev `codex/legal-consents`, základ `claude/backend-integration` 8cf9c86. Backend bez UI.

## Implementace a kontrakty

- Modul `legal`: `legal_consent`, `newsletter_consent`, `newsletter_consent_event`, `legal_withdrawal`.
  Souhlas není v klientem měnitelných metadatech. Obsahuje cart/customer, přesné verze, serverový čas;
  `order.placed` ho idempotentně propojí s objednávkou. Uchování samostatné tabulky zachová původní
  doklad i při pozdější změně metadat objednávky. Asociace je asynchronní, ne druhá finanční transakce.
- `GET /store/legal/versions`: aktuální `terms_version`, `privacy_version`.
- `POST /store/carts/:id/consents`: `{terms_accepted:true, privacy_acknowledged:true, terms_version, privacy_version}`.
  Přihlášená zákaznice jen ke svému košíku; Medusa guest customer_id s `has_account=false`
  neznamená přihlášený účet. Anonymní guest košík funguje se znalostí náhodného cart ID
  stejně jako nativní Store API. Převod košíku na jinou zákaznici vyžaduje nový souhlas.
  Obchodní podmínky jsou přijetí; soukromí je potvrzení seznámení, nikoli marketingový souhlas.
- Standardní complete i nexus-checkout mají HTTP guard 422 `TERMS_NOT_ACCEPTED` a kontrolu
  v uzamčeném workflow snapshotu. Opakování už dokončené objednávky nevyžaduje novou verzi.
  Bez nastavení verzí se nový checkout bezpečně zastaví (503), žádné produkční výchozí znění.
- `POST /store/newsletter`: `{email, source, text_version, accepted:true}`. Normalizovaný e-mail,
  serverová verze, zdroj max60 alfanumerických znaků/`_-`. Atomický zámek e-mailového hashe,
  jedna aktuální evidence a historie každé skutečné změny. Opakovaný subscribe historii nezdvojí.
  Žádné rozesílání. Při nové aktivaci odpověď obsahuje jednorázově vydaný `unsubscribe_token`;
  klient musí odkaz bezpečně uchovat. Opakovaná aktivní registrace token neodhalí/neotáčí.
  V DB je pouze SHA-256 tokenu (256 bitů náhody). Toto není double opt-in/ověření vlastnictví e-mailu.
- `POST /store/newsletter/unsubscribe`: `{token}`, bez přihlášení, opakování je bezpečné.
  Po novém přihlášení je starý odhlašovací token zneplatněn.
- `GET /admin/newsletter?limit=50&offset=0&format=csv`: max100 na stránku v JSON i CSV,
  bez token hashů. CSV neutralizuje vzorce a escapuje uvozovky; úplný export stránkováním.
- `POST /store/withdrawals`: `{order_id,items:[{item_id,quantity}],reason?}`; jen přihlášená vlastnice.
  Cizí objednávka 404; položky/počty dle serveru, důvod max2000. Lhůta 14×24h od posledního
  doloženého doručení, jinak posledního capture; bez obou dat 422. Žádné použití klientského času.
  Před spuštěním musí právník potvrdit zacházení s nedoručenými zásilkami, dělenými dodávkami,
  výjimkami digitálního obsahu a počítáním zákonné lhůty; tato technická politika není právní posouzení.
  Jeden formulář na objednávku; stejné položky vracejí původní doklad i po lhůtě, jiné 409.
- `GET /admin/withdrawals`; `POST /admin/withdrawals/:id {status}`. Přechody
  `received → accepted|rejected`, `accepted → refunded`, replay beze změny. Row lock, audit
  pouze původní/nový stav, bez důvodu/obsahu. Refund se zde nikdy nespouští.
- Newsletter a odstoupení mají sdílený atomický PG limit; žádné raw IP/e-maily v tabulce limitů.
  Newsletter 20/min/peer, odstoupení 10/min/customer. Fail-closed 503, limit 429 + Retry-After.
  Bounded cleanup expirovaných limitů každých10min.

## Zapojení integrátorem (Codex nesmí měnit konfiguraci)

1. Do `medusa-config.ts` přidat `{ resolve: "./src/modules/legal" }`; spustit migraci
   `Migration20261015040000`. Bez ní nové endpointy/checkout nefungují, nepovažovat za dokončené nasazení.
2. Do `src/api/middlewares.ts` import `legalMiddlewares` z `./legal-middlewares` a spread mezi routes.
   Guard obou cest musí být zapojený před jejich spuštěním (standardní workflow serializuje chyby).
3. Nastavit `LEGAL_TERMS_VERSION`, `LEGAL_PRIVACY_VERSION`, `NEWSLETTER_CONSENT_VERSION` (max100 znaků).
   Skutečné verze schvaluje vlastník textů. V CI výhradně syntetické verze.
4. C-1 šablona `withdrawal-received-sk`: data `withdrawal_id`, `order_id`; příjemce výhradně order.email
   načtený serverem. `idempotency_key=withdrawal.received:<id>`. Nikdy volný důvod nebo položky do logu.
   Selhání doručení vrací503 po uložení dokladu; retry znovu zkouší notifikaci, ne zakládání formuláře.
5. Stávající HTTP fixtures musí přijmout verze na každém novém košíku před completion (včetně gift
   factory a digitálního checkoutu). Generické unit testy checkoutu mockují consent guard, jeho vlastní
   testy ověřují reálnou logiku. Nevypínat guard pro test/production.
6. Zavolat `verifyLegalConsents` z `integration-tests/http/legal-consents-http-checks.ts`
   s `{api,container,options,newCart,evidence}` ve společném runneru, kde `newCart` už souhlas ukládá.
   Test pokrývá obě cesty bez souhlasu, vlastníka/verze/replay, cizí objednávku, lhůtu a newsletter.

## Ověření

`npx tsc --noEmit` PASS; fokus unit 6 sad / 57 testů PASS (legal policy/guard/routes,
SafeOrder workflow, voucher workflow a nexus-checkout errors). Plná unit a HTTP výhradně GitHub Actions
po zapojení modulu, middleware a fixtures Claudem. Lokální PostgreSQL/HTTP nespouštěny.
Stav: IMPLEMENTED; runtime integrace a plná regrese zatím IMPLEMENTED_UNVERIFIED.
Bez nových závislostí, bez zásahu do cen, entitlement modulu, `.env` nebo produkce.
