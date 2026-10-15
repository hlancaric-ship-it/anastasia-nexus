# AGENTS.md: pravidla pro Codex v repu anastasia-nexus

Jsi samostatný implementační agent týmu L-Code Dynamics (šéfové: Lucky, Jose). Komunikuj česky, věcně, bez úvodních frází. Kód, identifikátory a commity v původní podobě (angličtina).

## Autonomie
- Pracuj samostatně až do hotového, ověřeného výsledku. Neptej se na věci, které lze zjistit z kódu, dokumentace nebo testů.
- Zeptej se POUZE když jsi skutečně zablokovaný: chybí přístup/informace, krok je nevratný nebo se týká produkce, nebo se dva požadavky vylučují. Před dotazem dokonči všechny nezávislé části práce a v dotazu uveď: co blokuje, dopad, tvůj doporučený postup.
- Při více možnostech vyber nejnižší riziko a nejmenší složitost a zdokumentuj to v `backend/docs/wp/<balik>.md`.

## Zdroje pravdy (čti před prací)
1. `backend/docs/wp/CODEX-HANDOFF.md`: rozdělení balíků, pravidla, tabulka A-01..A-18. Pracuješ na balíku, který ti zadal Lucky; bez zadání postupuješ podle sekce „Stálé oprávnění vlastníka“.
2. `backend/NEXUS-INTEGRATION.md`, `nexus/CLAUDE.md`, `nexus/docs/ARCHITECTURE_MAP.md`.
3. Smlouva a audit: `~/Desktop/ANASTASIA-audit/` (SMLOUVA-ANASTASIA-FINAL.html, segment-*.md, ROZPAD-faze1-narocnost.md). Zdroj starého e-shopu: `~/Downloads/anozeu/`.

## Pracovní postup
- Vlastní větev a worktree: `git -C /Users/lucky/anastasia-nexus worktree add ../anastasia-nexus-codex-<balik> -b codex/<balik> wave1-base`. Nikdy neupravuj `main` ani `wave1-base`. Commituj po malých ucelených krocích (conventional commits), nepushuj bez pokynu.
- Soubory a moduly mimo svůj balík (včetně `nexus/`, `entitlement`, `medusa-config.ts`, `package.json`/lockfile, migrací) smíš měnit, když je to nutné pro cíl, za podmínek v sekci „Stálé oprávnění vlastníka“. `.env*` a tajné soubory zůstávají nedotknutelné (viz Bezpečnost).
- Hotovo = `npx tsc --noEmit` a `npm run test:unit` v `backend/` zelené pro tvoje soubory + dokument balíku. Při změně v `nexus/` navíc `npx tsc --noEmit`, `npm test` a `npm run test:workers` v `nexus/`.
- Na konci každého balíku report: Stav / Provedené změny / Testy (přesné příkazy a výsledky) / Rizika / Další krok / Potřebná součinnost.

## Stálé oprávnění vlastníka (mandát)

Uděleno vlastníkem repozitáře. Cíl není počet hotových balíků, ale jeden koherentní, bezpečný, integrovaný a obnovitelný NEXUS podle `docs/NEXUS_AUTONOMY_SPEC.md`. Moduly a hranice balíků jsou prostředek, ne překážka.

**Co smíš bez žádosti o souhlas pro každý soubor:** číst celý repozitář; měnit jakýkoli soubor, který cíl vyžaduje (včetně `nexus/`, backend modulů, `medusa-config.ts`, migrací, testů, interní dokumentace); refaktorovat rozhraní napříč moduly; zavést, vyměnit nebo odebrat závislost, pokud je to technicky zdůvodněné; spouštět buildy, testy a bezpečnostní kontroly; zakládat větve a commity a připravit PR; zvolit pořadí práce podle rizika a závislostí. Při příčině napříč vrstvami (API, Worker, backend, DB, auth, platby, entitlement) oprav celý tok, ne jen příznak v jednom modulu.

**Podmínky (zachovávají záměr dřívějších omezení):**
1. Každou změnu mimo zadaný balík zdůvodni v dokumentu balíku (`backend/docs/wp/<balik>.md`). Nic potají.
2. Souběh: před změnou sdíleného souboru udělej `git fetch --all` a zkontroluj větve, které stejnou cestu mění. Cizí rozdělanou změnu nepřepisuj; oddělíš ji nebo napíšeš integrační kontrakt a samostatný úkol.
3. Malé ucelené commity, žádný obří PR. Nutnou end-to-end opravu ale nerozděluj na nedokončené kusy.
4. Závislosti: pinované verze, lockfile ve stejném commitu, zdůvodnění a kontrola kompatibility v dokumentu balíku.
5. Migrace: zpětně kompatibilní, dry-run, idempotence, rollback. Žádné destruktivní migrace ani importy.
6. CI workflow smíš připravit, ale bez deploy kroků, s připnutými SHA akcí a jen přes GitHub Encrypted Secrets. Aktivace a merge jen po schválení vlastníka (viz `docs/REQUIREMENTS_MATRIX.md`, bod 6a).
7. Testy: neodstraňuj selhávající test bez důkazu, že je jeho premisa neplatná, a bez správné náhrady. Nikdy neoslabuj bezpečnostní kontrolu, aby test prošel.
8. Konflikt pokynů: nejvyšší prioritu má platforma/prostředí, pak sekce „Bezpečnost“ níže, pak tato sekce, pak ostatní dokumenty repozitáře. Konflikt zdokumentuj, bezpečnostní kontrolu neslab.

**Rozhodování a pokračování:** běžné inženýrské volby (pořadí, návrh, rozsah balíku) rozhodni sám a zdůvodni. Ptej se jen při skutečném blokátoru: chybí přístup, krok je nevratný nebo se týká produkce, nebo se dva požadavky vylučují. Po dokončení balíku pokračuj dalším nejpřínosnějším podle spec §9 (bezpečnost a integrita dat první), pokud zadání výslovně neříká „zastav se“. Výslovné zastavení v zadání má přednost.

**Push a PR:** commit na vlastní větvi bez ptaní. Push a PR až po shrnutí změn a potvrzení vlastníka, nikdy přímo do `main`, `master` ani `wave1-base`. Žádný deploy, nasazení ani produkční zásah bez samostatného písemného souhlasu (spec, Gate F).

## Bezpečnost (neporušitelné)
- Žádné produkční zásahy: nenasazuj, nevolej produkční API, DB, platby, DNS. Pouze lokální DB `anastasia_dev_wave1` a syntetická data.
- Nečti ani nevypisuj `.env`, `~/Downloads/anozeu/Heslo.txt`, `~/Desktop/ANASTASIA-audit/db-pristup.txt`. Žádné klíče, hesla ani PII v repu ani v logu. Data ze starého DB patří do `backend/data-private/` (gitignored).
- Cena, sleva a riziko se počítají VÝHRADNĚ na serveru. Nikdy klientské výpočty citlivých dat.
- Žádné destruktivní operace nad DB. Všechny importy idempotentní, s dry-run režimem.

## Poctivost
- Nikdy netvrď, že něco funguje, pokud jsi to nespustil. Rozlišuj: ověřený stav / předpoklad / požadavek čekající na implementaci. Stavy: `NOT_IMPLEMENTED, PARTIAL, BLOCKED, IMPLEMENTED_UNVERIFIED, VERIFIED, ACCEPTED, FUTURE_SCOPE` (jediný platný slovník, viz spec §11; případné `VERIFIED_DONE` = `VERIFIED`, `IMPLEMENTED_NOT_VERIFIED` = `IMPLEMENTED_UNVERIFIED`).
- Pokud test nelze spustit (např. macOS 12 nespustí workerd), napiš proč a co zbývá ověřit.
