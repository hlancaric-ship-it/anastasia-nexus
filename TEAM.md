# Tým L-Code Dynamics – ANASTASIA (stav 21. 10. 2026)

Šéf a právo veta: **Lucky** (Jan Lančarič). Koordinátor a reviewer: **Claude**. Klientka: Lucia Rogožanová (předání Fáze 1: 22.–23. 10.).

## Kdo co dělá
| Kdo | Kde | Práce |
|---|---|---|
| Claude | všude | koordinace, review, merge do `release/predani-faze1`, deploy na test, shrnutí pro Luckyho |
| MiniMax „storefront“ | `~/anastasia-nexus-codex-storefront-design`, větev `codex/storefront-autorsky-design` | web: úvod, výkon, audit 1:1 se starým webem (`storefront-prototype/design/AUDIT-1to1.md`) |
| MiniMax „ANASTASIA admin“ | `~/anastasia-nexus-release` | admin: audit, štítky, feedy, Stránky a texty, Médiá, návod pro Luciu |
| MiniMax „ANASTASIA digital“ | `~/anastasia-nexus-release` | nahrávání a ochrana digitálního obsahu (`anastasia-admin/HANDOFF-digital-minimax.md`) |
| Claude agent | `~/anastasia-nexus-release` | doprava a platby 1:1 se starým webem, deploy backendu na test |
| Qwen | dle zadání Luckyho | – |
| GPT‑6 Sol (od 22. 10.) | přidělí Claude | nejdřív přečíst tento soubor a zadání (HANDOFF-*.md), pak si vzít volný úkol od Clauda |

## Pravidla (závazná)
1. Nepushovat bez Claudova review. Commitovat jen vlastní soubory a do vlastní větve/worktree.
2. Nikdy nesahat na doménu a DNS Lucie (anastasiaoz.eu). Testuje se jen na `*.l-code-dynamics.com`.
3. Stripe jen TEST. Testovací e-maily jen na `@l-code-dynamics.com`.
4. Tajné údaje (`.env`, `data-private`, `*.pem`) nečíst do výstupů a nevypisovat.
5. Cenotvorba a citlivá logika jen na backendu/Workeru.
6. Neměnit cizí práci. Problém → navrhnout opravu koordinátorovi.
7. Texty pro Luciu: slovensky a ve vykání („Váš web“).
8. Každá dodávka obsahuje testy (`npx tsc --noEmit`, unit testy, storefront `node --test test/*.test.mjs`) a krátké shrnutí.
9. Humor je povinná výbava. 😄
