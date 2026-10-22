# Handoff: ako storefront načítať obsah webu z administrácie

**Pre:** MiniMax (storefront) · **Dátum:** 21. 10. 2026 · **Stav:** backend hotový, storefront ho ešte nepoužíva

## 1. Prečo

Lucia musí vedieť upraviť **akúkoľvek časť webu** (nadpis, podnadpis, popis, tlačidlo, obrázok, hero video) **bez toho, aby rozbila dizajn**.
Obsah je preto oddelený od dizajnu: texty a médiá žijú v backende (Medusa), rozdelené na **stránky → sekcie → polia**,
a storefront ich iba **načíta a vloží** do už existujúcich miest. Layout, farby, písmo a poradie elementov ostávajú v storefronte zamknuté.

## 2. Verejná trasa (bez prihlásenia, bez CORS)

```
GET https://<api-host>/store/content/:page
```

`:page` = kľúč stránky zo semena (napr. `kontakt`, `vop`, `zdravy-svet`, `konzultacie`, `global`).
Zoznam všetkých kľúčov: `GET /store/content` (bez parameterra) alebo `backend/src/lib/content/seed.json`.

### Odpoveď

```json
{
  "page": { "key": "kontakt", "title": "Kontakt", "path": "/kontakt" },
  "sections": [
    {
      "key": "kontakt-1",
      "title": "Kontakt",
      "order": 0,
      "fields": [
        {
          "key": "kontakt__kontakt-1__0-text",
          "type": "text",
          "label": "Nadpis 1",
          "value": "Kontakt",
          "fallback": "Kontakt",
          "lang": "sk",
          "max_length": 160,
          "hint": null,
          "alt": null,
          "label_text": null,
          "changed": false
        }
      ]
    }
  ]
}
```

### Význam polí

| Pole | Význam |
|---|---|
| `key` | **stabilný identifikátor poľa** – toto je kľúč, podľa ktorého storefront pozná, kam text patrí. Nemení sa pri úpravách. |
| `type` | `text` (jediný riadok) · `rich` (viac riadkov, rich text) · `image` (adresa obrázka) · `video` (adresa videa) · `link` (adresa odkazu) |
| `value` | hodnota, ktorá sa má zobraziť (zmenená v administrácii, inak pôvodná) |
| `fallback` | pôvodné znenie zo seeda – vždy dostupné, aj keď sa zmení |
| `changed` | `true`, ak sa hodnota líši od pôvodného znenia |
| `max_length` | maximálna dĺžka (server to kontroluje pri uložení) |
| `hint` | odporúčaný rozmer obrázka/videa alebo iná poznámka pre Luciu |
| `alt` | alternatívny text obrázka (seed) |
| `label_text` | text tlačidla pri type `link` |
| `lang` | jazyk poľa: `sk` (dnes), `en`, `ru` (miesta pripravené) |

> **Bezpečnosť:** hodnoty polí typu `rich` sa pri uložení vždy vyčistia (povolené sú len značky
> `p, br, strong, em, u, a[href, rel], ul, ol, li, h2, h3, blockquote`; skripty, obsluhy udalostí
> a `javascript:` odkazy sa odstránia). Bližšie: `backend/docs/wp/content-sanitizacia-a-revizia.md`.

## 3. Ako to použiť vo storefronte

1. **Načítajte raz pri štarte stránky** (alebo pri prechode na novú sekciu) a uložte do pamäti:

```js
const content = await fetch(`${API}/store/content/kontakt`).then((r) => r.json())
```

2. **Vložte hodnoty do existujúcich elementov** – dizajn nemeníte, meníte iba text/obrázok:

```js
const field = (key) => content.sections.flatMap((s) => s.fields).find((f) => f.key === key)
const title = field('kontakt__kontakt-1__0-text')
document.querySelector('h1').textContent = title?.value ?? title?.fallback ?? ''
const img = field('kontakt__kontakt-1__5-image')
if (img?.value) document.querySelector('.hero img').src = img.value
```

3. **Fallback je vždy v odpovedi** – ak `value` chýba, použite `fallback` (pôvodný text). Nemusíte riešiť, či text zmenila Lucia.
4. **Cache:** odpoveď má hlavičku `Cache-Control: public, max-age=60`. Po zmene v administrácii počkajte max. 60 s
   (alebo prečistite cache) – pri prerenderovaní odporúčame prefetch pri buildi.

## 4. Čo sa NEMENÍ

- **Dizajn:** layout, farby, písmo, animácie, grid – zostávajú vo storefronte. Obsah ich nemení.
- **Štruktúra stránky:** počet sekcií a ich poradie (`order`) sú vlastné frontendu; backend len vracia obsah sekcií.
- **Adresy stránok:** `page.path` je len informácia – routes zostávajú vo storefronte.

## 5. Mapovanie seedu na zdroj

Seed (`backend/src/lib/content/seed.json`) je vygenerovaný zo storefrontu:
`backend/scripts/generate-content-seed.mjs` (prečíta `storefront-prototype/src/legacy-content.json` – **read-only**, nič vo worktree storefrontu nemení).

- Každý legacy blok `h1/h2/h3` → pole typu `text`
- `p`, `ul`, `ol`, `blockquote`, `table` → pole typu `rich`
- `image` → pole typu `image` (`src` = adresa, `alt` = alternatívny text)
- Odkazy v blokoch → polia typu `link` (`value` = adresa, `label_text` = text tlačidla)
- `h1` v legacy obsahu = nová sekcia

Ak sa texty webu zmenia priamo v kóde frontendu, spustite znova generátor a commitnite nový seed.
**Pozor:** existujúce zmeny Lucy zostávajú v metadátach obchodu – seed je iba fallback, takže sa neprepíšu.

## 6. Jazyky

- Dnes je v seade jazyk `sk` (slovenčina) pre všetky polia.
- `lang: 'en' | 'ru'` je v modeli pripravené: keď sa doplnia preklady, pole dostane vlastný `lang`
  a storefront si ho načíta podľa jazyka stránky. **Storefront zatím načíta len `sk`.**

## 7. Overenie

```bash
# backend: trasy a model
cd backend && npx tsc --noEmit && npm run test:unit
# seed
node scripts/generate-content-seed.mjs          # vyrobí src/lib/content/seed.json
# ručne: otvoriť /store/content/kontakt a skontrolovať, že hodnoty sedia s fallbackom
```
