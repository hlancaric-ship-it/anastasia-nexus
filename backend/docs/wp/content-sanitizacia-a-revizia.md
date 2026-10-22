# Bezpečnosť obsahu webu: sanitizácia rich textu a ochrana proti súbežnému ukladaniu

**Balík:** obsah webu (Fáza 1 – bezpečná správa textu v administrácii) · **Dátum:** 21. 10. 2026
**Rozsah:** `backend/src/api/admin/content`, `backend/src/api/admin/pages` a ich knižnice
(`lib/content`, `lib/pages`, `lib/html`) + administrácia (`anastasia-admin`).
**Stav:** `VERIFIED` – testy backendu aj prehliadačový test sú zelené.

---

## 1. Prečo

Do textu, ktorý Lucia napíše v administrácii, sa dostáva HTML (odkazy, tučné písmo, odseky).
Bez čistenia by sa do webu mohlo dostať `<script>`, `onclick` alebo `javascript:` odkaz.
Druhá riziková vec: dvaja ľudia môžu otvoriť tú istú stránku a druhý uloží bez toho, aby
zvedel, že prvý už niečo zmenil – a jeho zápis prvého prepíše.

## 2. Čistenie (sanitizácia) pri zápise

Jedna zdieľaná funkcia pre oba prípady (texty právnych stránok aj polia v obsahu webu):
**`backend/src/lib/html/sanitize.ts` → `sanitizeRichText()`** (vlastná malá funkcia, bez novej
závislosti a bez externích služieb).

| Pravidlo | Príklad |
|---|---|
| Povolené značky | `p`, `br`, `strong`, `em`, `u`, `a[href, rel]`, `ul`, `ol`, `li`, `h2`, `h3`, `blockquote` |
| Nebezpečné prvky sa odstránia aj s obsahom | `<script>alert(1)</script>` → nič, `<iframe …>` → nič, `<svg>` → nič |
| Ostatné značky sa odstránia (text v nich zostane) | `<div><span>text</span></div>` → `text` |
| Obsluhy udalostí a všetky ostatné atribúty zmiznú | `<p onclick="x()" style="…">` → `<p>` |
| Odkaz smie byť len `http`, `https`, `mailto` alebo cesta na vlastnú stránku | `<a href="javascript:alert(1)">` → `<a>` (bez odkazu) |
| Dvojité lomítko (iný host) je zakázané | `<a href="//cudzi-host">` → `<a>` |
| Bezpečný odkaz dostane `rel="noopener"` | `<a href="https://…">` → `<a href="https://…" rel="noopener">` |

Cesta na vlastnú stránku (`/kontakt`, `/vop`) je povolená, pretože východiskové znenie
právnych stránok naň odkazuje a nie je to skriptová adresa.

Kde sa volá:
- `lib/content/policy.ts` → `validateFieldValue()` pre polia typu `rich` (pred uložením),
- `lib/pages/policy.ts` → `sanitizePageHtml()` → `validatePageHtml()` pre texty stránok.

Seed zo storefrontu je obyčajný text (bez značiek), takže čistenie nemení existujúci obsah.

## 3. Revízia bloku a ochrana proti súbežnému ukladaniu

Každý blok (pole v obsahu webu) a každá stránka má **revíziu**: čas poslednej zmeny
(ISO dátum) alebo značku pôvodného znenia (`seed` pre polia, `default` pre stránky), ak ho
ešte nikto nemenil.

```
GET /admin/content   → každé pole má "revision": "2026-10-21T10:00:00.000Z"
GET /admin/pages     → každá stránka má "revision": "default"
POST /admin/content  { page, field, value, revision }
POST /admin/pages    { slug, html, revision }
```

Ak sa revízia líši od aktuálnej, server odmietne uloženie:

```json
HTTP 409
{ "message": "Obsah medzitým zmenil niekto iný, obnovte stránku." }
```

Ochrana platí aj pri obnovovaní pôvodného znenia (`POST /admin/content/reset`,
`DELETE /admin/pages/:slug`) – obnovenie tiež prepíše obsah.

Bez revízie (staršia administrácia) sa to nekontroluje – server ostáva kompatibilný.

Pomocné funkcie: `backend/src/lib/revision.ts` (`revisionOf`, `isRevisionConflict`,
`REVISION_CONFLICT_MESSAGE`).

## 4. Čo vidí používateľ

- Konflikt sa zobrazí v editore ako hláška **„Obsah medzitým zmenil niekto iný, obnovte
  stránku.“** s tlačidlom **Obnoviť stránku** (doteraz to bola len hláška v prehliadači).
- Po obnovení sa načíta nová revízia a uloženie prejde.
- Uložený obsah je vyčistený – v administrácii aj na webe vidíte len povolené značky.

## 5. Testy

```bash
# backend
cd backend
npx jest src/lib/html src/lib/__tests__/revision.unit.spec.ts \
  src/lib/content/__tests__/content.unit.spec.ts src/lib/pages/__tests__/policy.unit.spec.ts \
  src/api/admin/content/__tests__/content-route.unit.spec.ts \
  src/api/admin/pages/__tests__/pages-route.unit.spec.ts
npm run test:unit && npx tsc --noEmit

# administrácia (prehliadač)
cd anastasia-admin
ANASTASIA_API_ORIGIN=https://anastasia-test-api.l-code-dynamics.com node build.mjs
ADMIN_URL=http://127.0.0.1:4179 ADMIN_TEST_PASSWORD=… node test/browser-content-revision.mjs
```

Prehliadačový test (12 kontrol) overí: revízia je v poli, zhodná revízia sa uloží, iná
revízia vyvolá hlášku s tlačidlom na obnovenie, po obnovení sa uloží aj druhý text a rovnako
aj texty právnych stránok.

## 6. Čo zostáva na integrátora

Nasadenie backendu (trasy `/admin/content*` a `/admin/pages*`) a nasadenie administrácie.
Bez nasadenia backendu bude stará administrácia posielať zápis bez revízie – to funguje,
ale bez ochrany pred súbežným ukladaním. Po nasadení treba obnoviť aj administráciu
(nový súbor `dist/`).
