# ANASTASIA admin (vlastní)

Vlastní administrace ANASTASIA — **NE Medusa Admin**. Samostatná SPA, která se přihlašuje do Medusa **Admin API** a obsluhuje agendy v zeleném ANASTASIA vzhledu (předloha `../backend/docs/wp/admin-design-preview.html`), slovensky.

## Spuštění
Backend Medusa musí běžet na `http://localhost:9100` (Admin API).

```
cd anastasia-admin
node serve.mjs        # http://127.0.0.1:4178
```

Přihlášení (lokální dev): `admin@anastasia.local` / `Anastasia2026!`.
Jiné jádro: v konzoli `localStorage.setItem('ana_api','https://…')` a refresh.

## Produkční build (Cloudflare Pages)
```
ANASTASIA_API_ORIGIN=https://api.anastasiaoz.eu \
ANASTASIA_MEDIA_ORIGIN=https://media.anastasiaoz.eu \
node build.mjs        # → dist/
```
- adresa jádra se zapíše do `<meta name="ana-api">` a má přednost před `localStorage`;
- `dist/_headers`: CSP (`connect-src` jen na jádro), `noindex`, `X-Frame-Options: DENY`, HSTS;
- bez https originu build skončí chybou;
- origin adminu musí být v `ADMIN_CORS` a `AUTH_CORS` backendu.

## Stav agend
**Funkční proti Admin API (vše přes existující routy jádra, citlivé výpočty jen na backendu):**
- **Prehľad** – čísla + karta *Pripravenosť obchodu* z `GET /admin/readiness` (blokery, doporučení, „nedá sa overiť“ – nikdy falešné OK).
- **Produkty** – výpis, nový produkt (jediný predajný kanál automaticky), úprava: cena přes `POST /admin/shop-prices/:variantId` s `expected_amount`, akcia, obrázky (`/admin/uploads`, hlavný obrázok), kategórie, predajné kanály, sklad (inventory items + počty po skladoch), kontrola úplnosti – bez ceny a kanála sa produkt nedá zverejniť. Kategórie.
- **Objednávky** – zoznam so stránkovaním (50 na stranu), filtre (Všetky / Na vybavenie / Čaká na platbu / Odoslané / Zrušené / Archív) a hľadaním; stĺpce doručenia a spôsobu platby; hromadné akcie (tlač štítkov a dodacích listov, export CSV) a poznámka k objednávke; detail v záložkách (Prehľad / Položky / Odoslanie / Platby) vrátane fakturačnej adresy; pripraviť na odoslanie, odoslať s číslom zásielky, prijať platbu, vrátiť peniaze (aj čiastočne), zrušiť. **Tlač:** adresný štítok (A6) a dodací list (A4) v zozname aj v detaile objednávky, hromadná tlač štítkov pre filter „Na vybavenie“ (`print.mjs`; okno sa otvára synchronne v kliknutí, údaje z `/admin/orders?id[]=…`).
- **Zákazníci** – stránkovanie, hľadanie podľa mena a e-mailu, jednotné ID zákazníka; detail so záložkami Základné / Skupiny / Objednávky / Prístupy / Ochrana údajov, ručným pridelením prístupu a GDPR výmazom (s potvrdením).
- **Produkty** – serverové stránkovanie, vyhľadávanie a filter stavu (zverejnené / koncepty).
- **Zákazníci** + prístupy ku knižnici.
- **Konzultácie** – stavy, detail, zrušenie termínu (`/admin/bookings*`).
- **Správy** – konverzácie, odpoveď, uzavrieť/otvoriť, stlmiť, blokovať chat (`/admin/chat/*`).
- **Klub/predplatné** – v Fáze 1 mimo rozsahu: sekcia je v administrácii skrytá (návody aj prihliadka).
- **Poukazy a zľavy** – kupóny (promotions); darčekové poukazy s históriou, zneplatnením a vrátením na poukaz (`/admin/vouchers*`).
- **Obsah a e-maily** – šablóny s náhľadom, newsletter.
- **Nastavenia** – vzhľad (`/admin/my-theme` s revíziou, 409 pri súbežnej zmene), **pripojenia** (produktové feedy Heureka + Google Merchant s odkazom na kopírovanie, dopravca Packeta/SPS/GLS/DPD s API kľúčom uloženým šifrovaným na serveri), doprava/platby/sklady (len na čítanie, bez kľúčov), používatelia a pozvánky (`/admin/invites`; prijatie na `#/pozvanka/<token>`).

**UI pripravené, „pripravujeme“:** Médiá, Stránky a texty (CMS), Preklady, Účtovníctvo. RBAC (roly) je v jadre vypnutý – každý správca má plný prístup.

Seznam agend vychází z `../backend/docs/wp/ADMIN-FUNKCE-A-POKRYTI.md`.

## Design
Barevné tokeny v `styles.css` (`--forest`, `--gold`, `--cream`…) — přebarvitelné, aby si Lucia mohla admin upravit sama.


## Regrese newsletteru

S lokálním náhledem na portu 4178 spusťte
`node anastasia-admin/test/browser-newsletter.mjs`. Test používá syntetické
API a skutečnou serverovou šablonu e-mailu, ověřuje typografii, přetečení,
náhled Mobil a umístění hlášky u tlačítka na 1440 a 390 px.
Žádný e-mail neposílá. Cestu k Playwrightu lze předat přes `PLAYWRIGHT_MODULE`;
screenshoty jsou v systémové dočasné složce.
