# X2 — Export zákaznice, žádost o výmaz a interní poznámky

Větev `codex/customer-gdpr`, vlastní worktree, základ integrace 8cf9c86 + závislost X1 14df581.
Žádné změny konfigurace/závislostí ani entitlement modulu. Backend bez UI.

## API a ochrana

- `GET /store/customers/me/export`: přihlášená zákaznice, no-store, attachment JSON.
  Obsahuje profil/adresy, vlastní objednávky a jejich serverové součty/položky/adresy,
  rezervace, nároky, chat, souhlasy X1, odstoupení, newsletter včetně historie a poukazy.
  Cizí `customer_id` vrací404. Každý zdroj je omezen autoritou actor_id; žádné interní poznámky,
  auth secrets nebo libovolná metadata. Cizímu obdarovanému se nevypisuje plný kód ani osobní zpráva.
  Export nikdy nevrací plný kód poukazu; částky jsou označené jako minor units.
  Vazby přes e-mail se čtou/mažou pouze pro ověřené magic-link identity zákaznice. Editovatelný
  profilový e-mail není důkaz vlastnictví newsletteru ani poukazu; neověřený kontakt tak neodhalí
  ani neodstraní cizí údaje. Profil/objednávky zůstávají autorizované výhradně customer ID.
  Zahrnuje uchované soft-deleted osobní záznamy a text rezervace, ne jen aktivní chat.
  3 požadavky/h/customer sdílené přes PG (X1 rate table), 429 + Retry-After, výpadek503.
  Přes10000 záznamů jednoho zdroje vrací413 místo tichého neúplného exportu. SQL část má
  repeatable-read snapshot; nativní finanční detail objednávek se čte následně přes serverový graph
  v dávkách100, tedy nejde o jeden atomický snapshot všech Medusa modulů.
- `POST /store/customers/me/erasure-request`: idempotentní jedna žádost/customer, odpověď202.
  Pouhé podání nic neanonymizuje. Limit5/h/customer.
- `GET /admin/customer-erasures`: pouze správce, stránkování max100, bez email_hash.
- `POST /admin/customer-erasures/:id/execute`: pouze správce; tělo musí být
  `{confirm:true,customer_id:"přesné ID z žádosti"}`. Bez něj422, žádné destruktivní kroky.
  `requested → processing → completed`, řádkové/advisory zámky, retry completed beze změny.
  Processing blokuje zákaznický přístup už před anonymizací; při chybě zůstává blokovaný
  a správce může bezpečně zopakovat stejný execute. Nikdy nevydá completed po chybě cache/DB.
- `GET/POST /admin/customers/:id/notes`; `POST/DELETE /admin/customers/:id/notes/:note_id`.
  Plain text1–5000, vždy vazba na zákaznici, cizí note404. CRUD audit obsahuje pouze ID/operaci,
  nikdy text poznámky. Žádný store endpoint ani export tyto poznámky nevrací.

## Provedení výmazu

Samostatná tabulka `customer_erasure` drží pseudonymní tombstone a stav; není to smazání
účetní historie. Potvrzená operace atomicky v jedné lokální PG transakci odstraní jména,
telefony, osobní adresní části, profilová metadata, text chatu/předmět a interní poznámky,
poznámky rezervací a důvody odstoupení. Kontakty se nahradí stabilním anonymním `@example.invalid`.
Newsletter se odhlásí, token zneplatní; notifikační data a kontakt se vyprázdní. U poukazů
se odstraňuje kontakt kupujícího a vlastní příjemce, nikoli kontakt jiného obdarovaného.

ID/vazby/časová evidence, objednávky, částky, daně, položky, platební a poukazové transakce
zůstávají. Země adresy zůstává pro daňový kontext. Žádná refundace/storno ani změna zůstatků.
Používá se společná PG instance jako u stávajícího magic-link SQL propojení. Přechod na fyzicky
oddělené databáze modulů by vyžadoval jiný koordinovaný workflow; není tímto podporovaný.

Magic-link stav se spotřebuje veřejným Auth service API; auth identity a provider credentials
zákaznice se zneplatní. Sdílené identity s admin rolí ponechávají admina a odstraní pouze customer vazbu.
Middleware na **všech store a auth cestách** ověřuje trvalý tombstone, takže dříve vydané stateless
JWT/session zákaznice nemají přístup ani refresh. Při DB chybě fail-closed. Přítomná session se čistí;
není nutné plošně mazat session store jiných zákaznic. Krátkodobé hashe všech ověřených e-mailů blokují potvrzení
rozeslaných magic-linků po dobu jejich15min TTL; cleanup je po dokončení odstraní. Obsah chatu se odstraňuje pod stejným zámkem
zákaznice jako send a zákaznický chat se blokuje; nové interní poznámky po výmazu409.

Toto není potvrzení celkové právní shody GDPR: právní důvody/archivační lhůty musí potvrdit vlastník.
Externí poskytovatelé plateb, zálohy a již vydané krátkodobé media URL mají vlastní retenční/revokační
režim; tato operace nevolá externí účty ani nemaže účetní platební záznamy. Audit ukládá jen změnu
stavu žádosti a technická ID. Zdravotní obsah nepatří do provozních logů.

## Zapojení integrátorem

1. Do `medusa-config.ts` `{resolve:"./src/modules/customer-privacy"}`; migrace `Migration20261015050000` a `Migration20261015051000`.
2. Import/spread `customerPrivacyMiddlewares` z `./customer-privacy-middlewares` v main middleware
   **před** endpoint-specific middleware. Globální tombstone guard na `/store/*` a `/auth/*` musí být aktivní
   před umožněním execute API; bez něj je zneplatnění stateless JWT neúplné.
3. Vyžaduje X1 modul/migraci a `legal_rate_limit`; žádná nová env konfigurace.
4. V Actions zavolat `verifyCustomerGdpr({api,container,options,newCart,evidence})` z HTTP helperu.
   Ověřuje cizí export404, neveřejné poznámky, rate limit, explicitní potvrzení, opakovaný výmaz,
   zachované součty, anonymizaci chatu/profilu, cizí zákaznici beze změny, odvolaný JWT/refresh a magic-link.

## Ověření

Lokální TypeScript PASS. Fokus základ2 sad/13 testů PASS; poslední identity hardening11/11 PASS.
Integraci provedl Claude včetně globálního store/auth guardu a obou migrací.
Plná sada a skutečný HTTP běžely výhradně v GitHub Actions. Lokální PG ani HTTP nespouštěny.

Integrovaný kód **VERIFIED** na `claude/backend-integration` **4ba87ff**:
[GitHub Actions 38667772955](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38667772955), oba joby `verify` a `medusa-persistence` PASS.
Backend TypeScript + **516/516 unit** (53 sad), celý skutečný Medusa/PostgreSQL HTTP běh PASS,
všech **15/15 scénářů X1–X3** PASS. Dále NEXUS1102/1102 a workerd38/38 PASS.
Tento důkaz ověřuje syntetické kontrakty; není produkčním nasazením ani právním schválením textů.
