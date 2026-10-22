# RESET 40+ – členská zóna 1:1 se starým webem (backend + API)

RESET 40+ je ve Fázi 1 smlouvy. Prodejní text slibuje „Zrkadielko – priestor pre vlastné pozorovania a sebareflexiu“, ale v novém systému chybí.
Reference (screenshoty starého webu z telefonu): ~/anastasia-nexus-codex-storefront-design/storefront-prototype/design/reference-lucia-21-10/

Starý web má v zóně programu:
- Stránku programu: „Vyplňte prosím VSTUPNÝ DOTAZNÍK“ + odkaz na externí dotazník (Tally), seznam „Týždeň číslo 1 >> … Týždeň číslo 16 >>“, „Záverečné zhrnutie >>“.
- Stránku týdne: text, „Stiahnuť materiály pre samoštúdium >>“, „2. deň – stiahnuť pracovný list“ … „7. deň – stiahnuť pracovný list“, sekce **Zrkadielko**, odkaz „<< Späť na hlavnú stránku Reset 40+“.
- Zrkadielko = tabulka záznamů zákazníka: tlačítko „Pridať“, sloupce DÁTUM, ENERGIA (1–10), SPÁNOK (1–10), STRES (1–10) a další sloupce useknuté na screenshotu (začíná „NA…“) – NEVYMÝŠLEJ je, nech je seznam metrik konfigurovatelný a zapiš do PRAVNE/otázek pro Luciu, že potřebujeme kompletní seznam sloupců. Hodnocení hvězdičkami 1–10, záznam lze upravit a smazat.

Udělej v backendu (release/predani-faze1):
1. Modul/tabulka `reset_journal_entry` (customer_id, program/entitlement, week 1–16 nullable, date, metrics jsonb {key:int 1–10}, created/updated). Migrace s `down`.
2. Store API jen pro přihlášeného zákazníka s aktivním nárokem na RESET 40+: GET seznam (vlastní záznamy), POST, PATCH, DELETE vlastního záznamu. Validace 1–10, datum ne v budoucnosti, limit záznamů/den rozumný. Nikdy cizí záznamy (test na to).
3. GDPR: data patří zákazníkovi – zahrnout do exportu osobních údajů a do výmazu (customer-privacy tombstone). Zápis do PRAVNE-TEXTY-DOPLNIT.md: Zrkadielko = údaje o zdraví/pohodě → ověřit právní základ (súhlas) s Luciou.
4. Konfigurace: seznam metrik (key, label SK, min 1, max 10) v jednom místě, admin je zatím jen čte.
5. Struktura programu: ověř, že knihovna (entitlements/library) umí 16 týdnů + Záverečné zhrnutie + materiály a pracovné listy po dnech + odkaz na vstupný dotazník. Pokud ne, doplň datový model (bez vymýšlení obsahu – obsah dodá Lucia/importem).
6. Testy (unit + integration), tsc. Commit jen svých souborů, bez push, nic nenasazovat. Na konci krátké shrnutí česky + co chybí od Lucie.
