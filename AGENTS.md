# AKTUALNI PROVOZNI PRAVIDLA — 2026-11-08 (maji prednost pred historickymi handoffy)

## Zdroj pravdy a ochrana hotove prace
- Schvaleny testovaci storefront je Cloudflare Worker `anastasia-test-web`; schvalena administrace je `anastasia-test-admin`. Jejich nasazene verze jsou referencni stav, nikoli automaticky ekvivalent libovolne Git vetve. Snapshot 2026-11-08: storefront `ee0ec707-80d3-47fb-baef-d8b594d9854d`, admin `6d68f415-9236-4d65-9448-ab11245e7cad`. Pri kazdem dalsim zasahu nejdrive znovu over aktualni Cloudflare deployment.
- Storefront pouziva Medusa API origin `https://anastasia-api.medusajs.app` (overena Cloudflare konfigurace 2026-11-08). Toto neni dukaz funkcni E2E registrace; oznacovat ji za hotovou lze az po overeni. Klientske API pozadavky a komunikace Medusa ↔ NEXUS musi dal fungovat.
- `master` je soucasna vychozi vetev tohoto repozitare; Medusa Cloud je podle vlastnika napojena na `hlancaric-ship-it/anastasia-nexus`. Nedotykat se automatickych deploymentu Medusy ani je nemenit bez samostatneho auditu.
- Dokumenty `backend/docs/wp/CODEX-HANDOFF.md` (9. 10.), `docs/REQUIREMENTS_MATRIX.md` (9. 10.) a `ROADMAP_ANASTASIA_NEXUS.md` (10. 10.) jsou historicke podklady. Jejich stare stavy NOT_IMPLEMENTED/PARTIAL a seznamy baliku NESMI byt bez noveho overeni zadanim k reimplementaci.
- Pred jakoukoli implementaci: (1) over cilovy repozitar, branch a HEAD, (2) precti aktualni implementaci a relevantni testy, (3) porovnej ji s aktualne nasazenym chovanim, (4) zdokumentuj konkretni chybejici chovani a regresni test, (5) uprav pouze schvaleny rozsah. Pokud funkce uz existuje, NEPREPISUJ ji.
- Zadny agent nesmi bez explicitniho schvaleni Luckyho nasadit, rollbackovat nebo zmenit konfiguraci `anastasia-test-web`, `anastasia-test-admin`, Medusa Cloud ani NEXUS Workers; zakaz se tyka take `wrangler deploy`, `wrangler versions deploy`, DNS a deployment secrets. Pravidlo NEZAKAZUJE bezny runtime provoz e-shopu, objednavky, registrace, legitimni API komunikaci ani schvalene zmeny obchodnich dat.
- Pro storefront i admin bude urcena jedina schvalena release vetev AZ PO identifikaci zdrojoveho commitu obou soucasnych buildu. Do te doby neoznacuj `master`, stare `release/*` ani `codex/*` za automaticky deployment source. Zadne automaticke nasazovani z pracovnich vetvi.
- Stare vetve a pull requesty NEMERGOVAT hromadne. Kazdou vetvi vyhodnotit proti aktualnimu HEAD; nejdrive zachovat unikátní zmeny. Nema-li vetve schvaleny aktualni ukol, agent na ni nesmi samovolne navazovat.
- NEXUS know-how zustava oddelene a chranene: zadny presun proprietarniho kodu do klientskych buildu, zadne vypisovani secrets, zadne implicitni prava deploymentu NEXUS z prace na storefrontu/adminu.
- Tato pravidla jsou instrukce pro agenty, nikoli technicka GitHub/Cloudflare ochrana. Skutecny deployment gate vyzaduje samostatne nastaveni oprávneni, vetvi, tokenu a schvalovani.

---
## HISTORICKA PRAVIDLA (uplatni se pouze pokud nejsou v rozporu s aktualnimi pravidly)

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
