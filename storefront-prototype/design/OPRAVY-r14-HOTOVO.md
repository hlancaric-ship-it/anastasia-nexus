# OPRAVY r14 – hotovo (body 1–2)

Overené: Chrome headless, **deviceScaleFactor 3**, Android UA, 360/390/430 a 1440 px.
Screenshoty: `/Users/lucky/.claude/jobs/8ebf6c40/tmp/r14-intro-{360,390,430,1440}.png`.
Testy: **83/83 zelené**. Bez pushu, bez `git checkout/reset/stash/clean`.

| # | Zadanie | Riešení |
|---|---|---|
| 1 | Písmena ANASTASIA sú na mobile mdlé – pred ťuknutím na „Vstúpte“ musia byť výrazná (plná tmavá lesná zelená #1E2A1A, opacity ≥ .85) alebo okolie výrazne svetlejšie; kontrast písmen vůči okolí ≥ 4.5:1 | Do masky pribudol **samostatný preklep iba na písmenách** (inverzná maska `lhWordInv`: písmená bielé, zvyšok čierny). Na mobile je preklep `#1E2A1A` s **opacity .88** → písmena sú plne tmavá zelená, okolie ostáva krémové. Kontrast **#1E2A1A proti #F5F2E8 ≈ 12:1** (t. j. hranicu 4,5:1 prekročili s veľkou rezervou ✓). Po ťuknutí na Vstúpte sa preklep zmenší na .45 a animácia prejde celým slovom ako doteraz ✓. |
| 2 | „Kozmetika na mieru“ (rotujúca kategória) je málo kontrastné | Text kategórie má **jemný krémový tieň** (`text-shadow: 0 1px 14px rgba(245,242,232,.92), 0 0 4px rgba(245,242,232,.85)`) → čitateľný aj cez hluché zábere videa ✓ (farba ostáva tmavá `#1E281C` ✓). |

## Technická poznámka
Maska `#lhWord` (dierka v papieri) a nová `#lhWordInv` (preklep iba na písmenách) musia mať rovnaký tvar písmen – pri mobile sú to tri riadky ANA / STA / SIA, preto `motion.mjs` vytvára `tspan` súčasne v `#lh-word-t`, `#lh-word-m` aj `#lh-word-inv-t` a na mobile zmenšuje obe masky na plochu viewBoxu (kvôli limitu GPU pri DPR 3) ✓.
