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

## Stav agend
**Funkční proti Admin API:** Prehľad, Produkty (výpis + úprava názvu/stavu; cena přes `POST /admin/shop-prices/:variantId` se zámkem a kontrolou `expected_amount`, jen základní EUR cena bez pravidel), Kategórie, Objednávky, Zákazníčky, Kupóny (promotions).
**Skúša endpoint, inak „čaká na backend“:** Vouchery, Klub/Členstvo, Rezervácie, Chat.
**UI pripravené, „čaká na backend“:** Médiá, CMS/Stránky, Preklady, Feed/Nákupčí, Účtovníctvo/Faktúry, Nastavenia/Pripojenia.
**Vzhľad administrácie:** osobní motiv obsluhy přes `GET/POST /admin/my-theme` (uložen k účtu na backendu, s revizí – při souběžné změně 409), default = ANASTASIA zelená.

Seznam agend vychází z `../backend/docs/wp/ADMIN-FUNKCE-A-POKRYTI.md`.

## Design
Barevné tokeny v `styles.css` (`--forest`, `--gold`, `--cream`…) — přebarvitelné, aby si Lucia mohla admin upravit sama.
