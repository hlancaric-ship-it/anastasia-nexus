# Sjednocení větví — 15. 10. 2026

Stav: PARTIAL, kandidát ve větvi codex/unified-integration; master zatím nezměněn. Souhlas Luckyho: sjednotit práci, po ověřených balících commit/push a zaznamenat výsledky. Žádné nasazení.

## Zahrnuté větve

- Výchozí origin/master 232c149.
- codex/security-fixes: opravy autentizace, podpisů magic linků a omezených kupónů, důkaz předchozí samostatné CI v security-fixes.md.
- wave1-base a PR #8: závazná cílová architektura, nikoliv tvrzení o dokončení autonomie.
- feat/selectable-accounting-adapters (PR #2): základ konektorů POHODA/Money S3, nikoliv hotové připojení účetnictví.
- fix/omega-ci-executable-tmpfs (PR #1), codex/master-zip-audit-20261011 (PR #3), codex/anastasia-storefront-visual-foundation (PR #4).
- Lokálně commitnutý codex/storefront-chat 4d375d2 a codex/admin-inventory 746c5b6. Necommitnuté rozšíření admin prototypu nebylo přebráno jako hotové.
- Lokální wave1 integrace 91799e8: kontrola vlastnictví košíků; konflikty spojeny se security-fixes a právními souhlasy. HTTP fixtures upraveny na nový kontrakt, přidány negativní sondy.

PR #7 audit/evidence zůstává izolovaný: obsahuje reprodukce bezpečnostních nálezů, není balíkem opraveného produkčního kódu. Historické lokální větve s již převzatými ekvivalentními opravami se nepřepisují přes novější implementaci.

## Ověření kandidáta

Cílené backend unit testy: 18/18 PASS ve třech souborech (5 ownership + 2 contract + 11 checkout); backend TypeScript exit 0 lokálně. Kompletní NEXUS, workerd a backend/PostgreSQL pouze workflow wave1-p0.yml na GitHub Actions; konkrétní běh a součty doplnit po výsledku. Sloučení do master až po zelené regresi. Deployment konfigurace ani produkce se nemění.

## Další backend práce

Po sjednocení postupovat podle docs/NEXUS_AUTONOMY_SPEC.md: nejprve zmapovat a propojit stávající trvalé ExecutionIntent a reconciliation, chybějící doručování událostí/obnovu doplnit v samostatném ověřeném balíku. Úspěšný integrační test neznamená, že systém již nahrazuje veškerou práci obchodníka.

## První CI kontrola

Běh 38787876085: backend 544/544 a NEXUS/workerd zelené, HTTP nově odhalilo předřazenou duplicitní kontrolu souhlasu (422 před očekávaným 401). Kontrola pro vlastní nexus-checkout zůstává v handleru po ověření vlastníka; duplicitní middleware odstraněn, nativní complete má svůj middleware zachován. Oprava nejistého D1 claimu cac0bf1 zahrnuta do kandidáta; důkaz a meze v intent-claim-safety.md. Nový úplný CI běh nutný.
