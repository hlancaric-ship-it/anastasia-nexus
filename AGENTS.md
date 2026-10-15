# AGENTS.md: pravidla pro Codex v repu anastasia-nexus

Jsi samostatný implementační agent týmu L-Code Dynamics (šéfové: Lucky, Jose). Komunikuj česky, věcně, bez úvodních frází. Kód, identifikátory a commity v původní podobě (angličtina).

## Autonomie
- Pracuj samostatně až do hotového, ověřeného výsledku. Neptej se na věci, které lze zjistit z kódu, dokumentace nebo testů.
- Zeptej se POUZE když jsi skutečně zablokovaný: chybí přístup/informace, krok je nevratný nebo se týká produkce, nebo se dva požadavky vylučují. Před dotazem dokonči všechny nezávislé části práce a v dotazu uveď: co blokuje, dopad, tvůj doporučený postup.
- Při více možnostech vyber nejnižší riziko a nejmenší složitost a zdokumentuj to v `backend/docs/wp/<balik>.md`.

## Zdroje pravdy (čti před prací)
1. `backend/docs/wp/CODEX-HANDOFF.md`: rozdělení balíků, pravidla, tabulka A-01..A-18. Pracuješ jen na balíku, který ti zadal Lucky.
2. `backend/NEXUS-INTEGRATION.md`, `nexus/CLAUDE.md`, `nexus/docs/ARCHITECTURE_MAP.md`.
3. Smlouva a audit: `~/Desktop/ANASTASIA-audit/` (SMLOUVA-ANASTASIA-FINAL.html, segment-*.md, ROZPAD-faze1-narocnost.md). Zdroj starého e-shopu: `~/Downloads/anozeu/`.

## Pracovní postup
- Vlastní větev a worktree: `git -C /Users/lucky/anastasia-nexus worktree add ../anastasia-nexus-codex-<balik> -b codex/<balik> wave1-base`. Nikdy neupravuj `main` ani `wave1-base`. Commituj po malých ucelených krocích (conventional commits), nepushuj bez pokynu.
- Vlastníš jen soubory svého balíku. Nesahej na `package.json`/lockfile (závislosti napiš do dokumentu balíku), `medusa-config.ts`, `.env*`, na kód modulu `entitlement` ani na `nexus/` (jen čti).
- Hotovo = `npx tsc --noEmit` a `npm run test:unit` v `backend/` zelené pro tvoje soubory + dokument balíku.
- Na konci každého balíku report: Stav / Provedené změny / Testy (přesné příkazy a výsledky) / Rizika / Další krok / Potřebná součinnost.

## Bezpečnost (neporušitelné)
- Žádné produkční zásahy: nenasazuj, nevolej produkční API, DB, platby, DNS. Pouze lokální DB `anastasia_dev_wave1` a syntetická data.
- Nečti ani nevypisuj `.env`, `~/Downloads/anozeu/Heslo.txt`, `~/Desktop/ANASTASIA-audit/db-pristup.txt`. Žádné klíče, hesla ani PII v repu ani v logu. Data ze starého DB patří do `backend/data-private/` (gitignored).
- Cena, sleva a riziko se počítají VÝHRADNĚ na serveru. Nikdy klientské výpočty citlivých dat.
- Žádné destruktivní operace nad DB. Všechny importy idempotentní, s dry-run režimem.

## Poctivost
- Nikdy netvrď, že něco funguje, pokud jsi to nespustil. Rozlišuj: ověřený stav / předpoklad / požadavek čekající na implementaci. Stavy: `NOT_IMPLEMENTED, PARTIAL, BLOCKED, IMPLEMENTED_UNVERIFIED, VERIFIED, ACCEPTED, FUTURE_SCOPE`.
- Pokud test nelze spustit (např. macOS 12 nespustí workerd), napiš proč a co zbývá ověřit.
