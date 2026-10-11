# NEXUS — legacy, chybějící migrace a placeholdery (zdrojově ověřeno)

**Revize:** `codex/wave1-security` `5de8682`; změny pouze do auditní větve.

## Důležité rozlišení „není přítomné“ vs „rozbité“

1. `nexus/domains/pricing/QuantityTierRule.ts` — první komentář explicitně označuje **PLACEHOLDER** hypotézy C a potvrzuje, že **není napojen do `createNexusPricingCalculator`**. Tato třída `Rule<>` tedy není nasazenou funkcí množstevních slev; odpovídá izolovanému návrhu, ne hotové akceptaci.
2. `nexus/connectors/shoptet/legacy/csv/ShoptetExportSchema.ts` — `ParseDate(raw)` vrací neupravený text, komentář `Placeholder, real impl must return Date object or valid ISO string`. Pokud volající očekává skutečně normalizované datum, potřeba explicitní validace a testu, **ne automatické přepočítávání na účetní pravdu**. `ParseDecimal` vrací normalizovaný string; cílový canonical decimal kontrakt musí být ověřen samostatně.
3. `nexus/core/canonical/entities/Price.ts` — `QuantityTierGroup` je **nepotvrzená** Hecmania cross-variant hypotéza. Současný legacy Shoptet quantity config byl pass-through, nikoli Nexus výpočet. Nepřepisovat produkční pricing podle návrhové rule.
4. `nexus/connectors/omega/legacy/orchestrator/LCodePipelineOrchestrator.ts`, `sync/SyncJob.ts`, `orchestrator/PipelineAuditRecord.ts` — v aktuálním kompletním stromu `anastasia-nexus` **tyto cesty nejsou**, uživatelem popsané soubory patří ke zdrojovému systému/migračnímu vstupu. Jejich absence je vědomá hranice migrace, **ne důkaz nedokončeného Rule refactoringu**. Orchestrátor je konzument Rules + I/O, typy SyncJob/AuditRecord nejsou business pravidla. Pro konkrétní původní strukturu nutno auditovat originální source repo, nikoli vymýšlet implementaci z popisu.
5. `nexus/connectors/omega/legacy/agent/OmegaExecutor.ts` — v aktuálním NEXUS existuje spawn-wrapper pro výslovně whitelistovaný executable; unit/sanity mock nenahrazuje skutečný Windows agent. P0 CI EACCES je problém testovací infrastruktury, ne důkaz funkční účetní integrace.
6. `nexus/core/canonical/entities/Invoice.ts`, `nexus/domains/invoice/InvoiceLifecycleRule.ts` — reference na účetní doklad i vydání invoice jsou dnes v doménové hranici přes `omegaDocumentId`. Před zavedením volitelného POHODA/Money S3 je třeba neutrální kontrakt; nevynucovat nový ERP do akceptace checkoutu.

## Status
`PARTIAL`: statická kontrola konkrétního kódu, ne runtime/production sign-off. Bez nové implementace, bez merge a bez nasazení.

## Odkazy
- [Current source inventory](WAVE1-CURRENT-595-FILE-REVIEW-REGISTER.csv)
- [Modulový stav](WAVE1-MODULE-STATUS-AND-DEPENDENCIES-2026-10-12.md)
- [Zdroje, testy a rozpory](WAVE1-SOURCE-REVIEW-FINDINGS-2026-10-12.md)
