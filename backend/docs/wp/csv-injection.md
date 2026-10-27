# C4: bezpečný export newsletteru do CSV

**Stav: VERIFIED.** Cílená sada 22/22 testů PASS; úplná backendová sada 177/177 suites a 1694/1694 testů PASS; `npx tsc --noEmit` a `git diff --check` PASS.

`GET /admin/newsletter?format=csv` používá `csvCell` z modulu legal pro všechna exportovaná pole. Helper přidává apostrof hodnotám začínajícím `=`, `+`, `-`, `@`, tabulátorem nebo CR. Zachována je i dosavadní ochrana vzorců po úvodních mezerách. Dosavadní ochrana záporných hodnot zůstává zachována.

Uvozovky, čárky a konce řádků zůstávají správně escapované jako obsah jediné CSV buňky. Nemění se datový formát, stránkování ani oprávnění exportu.

Regrese: `src/modules/legal/__tests__/policy.unit.spec.ts` pokrývá všech šest úvodních znaků, vzorce za whitespace, běžný text, uvozovky, čárky, víceřádkové hodnoty a prázdné hodnoty. Ověření před předáním: cílený test, `npx tsc --noEmit`, `npm run test:unit`, `git diff --check`. Bez nasazení a bez zásahu do dat.
