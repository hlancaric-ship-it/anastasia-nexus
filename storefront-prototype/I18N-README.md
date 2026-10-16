# Jazyky storefrontu (SK/EN/RU)

Běhová vícejazyčnost. **SK je zdroj**, EN/RU jsou zatím **strojové/placeholder překlady (NEKONTROLOVANÉ)** — finální překlady dodá jádro (admin správa překladů, Codex), tenhle soubor je jen náhled.

## Jak to funguje
- `public/i18n.mjs` drží slovník `DICT` a běhový překladač. `public/app.mjs` volá `i18nInit()`.
- **Klíč = přesný slovenský text.** Hodnota je `[en, ru]`.
- Překládají se jen řetězce, které jsou v `DICT` (přesná shoda textového uzlu po `trim`). Cokoli nenalezené **zůstane slovensky** — nic se nerozbije, jen to není přeložené.
- Volba jazyka se ukládá do `localStorage` (`ana-lang`) a aplikuje na všech stránkách. SK = obnoví zdroj.
- Přepínače SK/EN/RU se zapojí za běhu (i dekorativní `<span>` z návrhu): `i18n.mjs` jim přidá roli tlačítka a kliknutí. `window.anaSetLang('en'|'ru'|'sk')` jde zavolat i z adminu.

## Jak doplnit/nahradit překlady
1. Krátkodobě: přidej klíč do `DICT` v `public/i18n.mjs` (`'Slovenský text': ['English', 'Русский']`).
2. Cílově: překlady spravuje jádro (Codex). Storefront pak místo statického `DICT` načte schválené překlady z endpointu jádra (per klíč/jazyk, verzované, ruční úprava přebíjí strojový překlad). Formát klíčů zůstává „SK text → překlad“, takže migrace je jen výměna zdroje slovníku.

## Co zatím NENÍ
- Plná extrakce všech textů stránek do klíčů (teď je pokrytá navigace, tlačítka, patička a běžné UI; obsah stránek se překládá, jen co je v `DICT`).
- Překlad obsahu produktů/článků — přijde z jádra (překlad katalogu).
- Profesionální korektura EN/RU — placeholder je k nahrazení.
