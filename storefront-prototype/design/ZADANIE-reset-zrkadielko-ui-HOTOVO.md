# ZADANIE: členská zóna RESET 40+ a Zrkadielko – HOTOVO

Stav: hotovo. Zdroj API: `~/anastasia-nexus-release` (vetva `release/predani-faze1`,
`backend/docs/wp/reset-zrkadielko.md`) – čítané len cez `git show`, v tomto repo nič zmenené.

## 1. Čo je hotové

| Bod | Stav | Riešenie |
|---|---|---|
| 1. Sekcia „RESET 40+“ v zákazníckom účte | ✅ | Nová záložka **RESET 40+** v `/ucet` (`src/customer-center.mjs`). Obsah: vstupný dotazník (odkaz z API, otvorí sa v novom okne), zoznam 16 týždňov (rozbalovacie: text týždňa, materiály na samoštúdium, pracovné listy po dňoch 2–7) a záverečné zhrnutie. Týždne, dni, materiály aj texty pochádzajú **výhradne z API** (`GET /store/reset-program`). |
| 2. Zrkadielko | ✅ | Tabuľka záznamov: stĺpce **Dátum**, **Týždeň** a stĺpce **podľa metrík z API** (žiadne natvrdo stĺpce). Hodnotenie 1–10 na ťuknutie (od `min` po `max` z API), pridanie, úprava a zmazanie záznamu (z)mazanie s potvrdením. Prázdny stav má vlastný text. |
| 3. Žiadne vymyslené texty | ✅ | Chýbajúci obsah týždňov, dní a záverečného zhrnutia sa zobrazí ako jemný stav **„Obsah pripravujeme.“** Demo/ukážkové dáta nie sú nikde – ani v mocku nie sú žiadne záznamy. |
| 4. Mobil 320–430 px aj desktop 1440 | ✅ | Na mobile sa tabuľka záznamov mení na **karty** (`data-label` + CSS), žiadne vodorovné pretekanie (overené: `scrollWidth === clientWidth` na 320/360/390/430/1440/1920). Tap targety majú 44 px. |
| 5. Farby zóny účtu | ✅ | Celá zóna používa premenné účtu (`--center-main`, `--center-accent`, `--center-card`, `--center-line`, `--center-muted`) – dizajn webu ani paleta účtu sa nemenia. |
| 6. Mock | ✅ | `src/lib/api/mock.mjs` doplnený **len na lokálne testy**: prázdne Zrkadielko + kostra programu (16 týždňov, dni 2–7, `content_ready: false`). Produkčný build používa skutočný backend (`createHttpApi`). |
| 7. Testy | ✅ | `test/reset-zone.test.mjs` (9 testov): prázdny stav, stĺpce z metrík API, škála 1–10, 16 týždňov + dotazník + stav „obsah pripravujeme“, **401** (výzva k prihláseniu), **403** (výzva k nákupu programu), **CRUD záznamu** (POST/PATCH/DELETE + cesty a telo), mock bez demo dát. |

### Doplnená API vrstva (`src/lib/api/http.mjs`)
`getResetProgram()`, `getResetJournal()`, `createResetJournalEntry()`, `updateResetJournalEntry()`,
`deleteResetJournalEntry()` s prekladom chýb: 401 → „Pre prístup k Zrkadielku sa prihláste.“,
403 → „Zrkadielko je dostupné len zákazníčkám s programom RESET 40+.“, 404/400/429 podľa kódu.

## 2. Screenshoty

Cesty: `~/.claude/jobs/8ebf6c40/tmp/`

| Súbor | Obsah |
|---|---|
| `reset-1440-zona.png`, `reset-1920-zona.png` | desktop 1440/1920 – záložka RESET 40+, týždne, dotazník, prázdne Zrkadielko s formulárom |
| `reset-390-zona.png`, `reset-320-zona.png`, `reset-360-zona.png`, `reset-430-zona.png` | mobil 320–430 px – rovnaký obsah bez pretekania |
| `reset-1440-zaznamom-zona.png`, `reset-390-zaznamom-zona.png` | rozloženie tabuľky/karty **so záznamom** (iba na kontrolu rozloženia; v produkcii dáta nie sú) |

## 3. Výsledok testov

```
ANASTASIA_OFFLINE_FIXTURES=1 node --test --test-timeout=90000 test/*.test.mjs
ℹ tests 107
ℹ pass 107
ℹ fail 0
```

QA crawler všetkých 71 rout + 404 na 360/390/430 px (DPR 3) → **„OK: žádné chyby“**.
Build: 71 statických strán. Žiadne chyby v konzole pri načítaní zóny (overené v headless Chrome).

## 4. Commity (len vlastné súbory, bez pushu)

| Commit | Obsah |
|---|---|
| `eae394c` | store API pre program a Zrkadielko (+ mock pre lokálne testy) |
| `e455789` | členská zóna RESET 40+ a Zrkadielko v účte (UI, styly účtu) |
| (testy) | `test/reset-zone.test.mjs` – prázdny stav, 401, 403, CRUD |

## 5. Čo ostáva na Luciu (mimo zadania)

Obsah 16 týždňov, pracovných listov a záverečného zhrnutia (backend ich má pripravené ako
`content_ready: false`), priradenie chránených médií k týždňom a právny základ súhlasu
(bod 17 v `PRAVNE-TEXTY-DOPLNIT.md`) – frontend ich zobrazuje ako „Obsah pripravujeme.“
