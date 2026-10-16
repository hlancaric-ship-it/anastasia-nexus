# Pravdivé potvrzení transakčních e-mailů

Stav: IMPLEMENTED_UNVERIFIED před plným CI. Balík `codex/notification-receipts`,
základ `c551299` po PR #21. Bez nasazení, změny závislostí, konfigurace či migrace.

## Problém a nejmenší oprava

Dosavadní `sendEmail` označil jakýkoliv existující záznam se stejným klíčem
za úspěšnou duplicitu, včetně `pending` a `failure`. Po `createNotifications`
vracel `sent` bez kontroly výsledku. Nešlo o důkaz doručení.

Ověřeno přímo v instalovaném Medusa 2.19 modulu notification:
`createNotifications(single DTO)` vrací jeden objekt, při potlačení duplicity
může vrátit undefined. Provider failure vyhodí a zapíše FAILURE, ale tento
stav nerozlišuje jisté odmítnutí od timeoutu po přijetí. Model má databázově
unikátní `idempotency_key`; nepřidáváme druhý registr ani vlastní zámek.

Sdílená cesta nyní uzná duplicitu pouze pro jediný nativní záznam SUCCESS
se shodným adresátem, kanálem, šablonou, klíčem a požadovanou entitou.
Po novém volání samostatně načte uložený nativní záznam a ověří stejnou
identitu i stav. Undefined z create vyžaduje samostatný prokázaný úspěch
stejného klíče, jinak nejde o úspěch. Hodnoty `sent/duplicate/disabled`
ve veřejném TypeScript kontraktu zůstávají.

Pending/failure, cizí identita, chybějící záznam a výpadek čtení nebo zápisu
vyvolají obecnou `EmailOutcomeUnknownError`. Zapíše se redigované
`notification/outcome_requires_review` s bezpečným důvodem, bez adresáta,
obsahu, klíče či raw chyby. Nevzniká další odeslání se stejným klíčem.
Ostatní nativní obchodní operace zůstávají; stávající notify catch nezruší
platbu ani rezervaci. Právní žádost si zachovává původní persistovaný záznam,
ale nejisté e-mailové potvrzení se při replay netváří úspěšně.

## Ověření

Lokálně `npm run test:unit -- --runInBand src/lib/email/__tests__/send.unit.spec.ts
src/lib/notify/__tests__ src/modules/legal/__tests__/routes.unit.spec.ts`:
**40/40 PASS**; `npx tsc --noEmit`: PASS. Plné HTTP/PG pouze GitHub Actions.

Cílené testy pokrývají success, pending/failure/unknown, identitu, chybějící
read-back, DB výpadek před i po zápisu, potlačený souběžný create a absenci PII.
Staré testovací double vracely pole bez stavu pro single DTO; byly opraveny
podle skutečného SDK kontraktu, nikoliv oslabena produkční validace.

Do plného CI přidány tři scénáře se skutečným notification modulem a PG:
úspěch/replay se samostatným čtením, persisted pending/failure bez dalšího
odeslání a souběžné volání stejného unikátního klíče. Používají pouze
syntetický log provider. Stav nejistoty se simuluje SQL aktualizací již
existujícího syntetického záznamu; skutečný timeout poskytovatele se nepředstírá.

## Meze a další práce

SUCCESS znamená uložené potvrzení nativního provideru, nikoliv důkaz přečtení
nebo doručení do schránky. Živý ZeptoMail ani jeho zpětné události se nevolají.
Tento balík neimplementuje outbox, řízené obnovení oznámení, delivery webhook
ani automatické opakování FAILURE. Neřeší volání bez idempotency key a
jejich samostatné aplikační claims (například poukazy). Nepřepíná globální
retry event busu. Po nejasném výsledku je potřeba další ověření nebo bezpečná
obsluha; pouhé změnění failure na success není dovolená náprava.

Audit používá existující `recordEvent`: při nedostupné DB zůstává stdout
log a provozní chyba, nevytváří se falešná garance trvale uložené eskalace.
Celý autonomní provoz zůstává PARTIAL.
