# Storefront Fáze 1 — jasné podmínky akceptace

Zdroj: smlouva čl. 2 (rozsah Fáze 1) + Příloha č. 1 (testovací scénáře Fáze 1). Toto je to, co musí storefront umět, aby prošel předáním k testování **23. 10. 2026** a následně schválením Objednatelem (Lucia Rogožanová). Nic nad tento rozsah není pro Fázi 1 podmínkou — i18n, chráněná média, AI asistent, ambasadorský program a ComGate jsou výslovně Fáze 2 (čl. 2).

Doplňuje `docs/PROGRESS_LOG.md` (backend) — tento dokument popisuje jen to, co musí dodat storefront, aby mohl volat už hotové/ověřené backendové API.

---

## 1. Sedm testovacích scénářů z přílohy č. 1 — musí projít doslova

1. **Nákup produktu:** výběr produktu → košík → uplatnění slevového kupónu → platba kartou / Apple Pay / Google Pay přes Stripe → potvrzovací e-mail.
2. **Nákup RESET 40+:** po zaplacení se obsah automaticky zpřístupní; bez zaplacení není dostupný.
3. **Přihlášení migrované zákaznice:** účet, historie objednávek a dřívější přístupy (entitlementy) jsou po přihlášení vidět a zachované.
4. **Staré adresy a vytištěné QR kódy** vedou na správné stránky nového webu (301).
5. **Generátor QR kódů v administraci:** vytvoření kupónu → URL s automatickou slevou v košíku → stažitelný QR kód.
6. **Administrace:** správa produktů, cen, kategorií, kupónů, objednávek a zákaznic Objednatelem.
7. **Bezpečnostní rizika z auditu** prokazatelně odstraněna (to je backendová/infra položka, ne storefront — ale storefront nesmí žádné z nich znovu zavádět, např. klientský výpočet ceny/slevy).

Scénář 6 (administrace) je samostatný balík C5, **0 %, ještě nezačatý** — není podmínkou pro 23. 10., ale je podmínkou finálního schválení Fáze 1 před veřejným spuštěním. Pokud na 23. 10. nebude hotový, musí to být v hlášení Lucii jasně napsané jako chybějící část, ne zamlčené.

---

## 2. Konkrétní backendové API, na které se storefront musí napojit (hotové a ověřené)

Base URL Medusa serveru (lokálně `http://localhost:9100`, v NODE_ENV=development). Standardní Medusa Store API (produkty, kategorie, carts, customers, orders) je dostupné beze změny — storefront ho používá normálně podle Medusa dokumentace.

### Přihlášení (K6 — magic-link, HOTOVO, ověřeno živě)
- `POST /auth/customer/magic-link` s `{ "email": "..." }` → vždy odpoví `{ success:false, error:"LINK_SENT" }` (storefront to zobrazí jako „pokud účet existuje, poslali jsme odkaz" — **nikdy neukazovat, jestli účet existuje**).
- Odkaz z e-mailu vede na stránku storefrontu (`/prihlasenie/potvrdit?email=...&token=...`) — tu stránku musí storefront vytvořit; po načtení zavolá `POST /auth/customer/magic-link` s `{ email, token }`, dostane JWT, uloží ho a přihlásí zákaznici.
- Žádné heslo. Staré heslo se nepřenáší nikdy (viz migrace).

### Entitlementy / přístupy k RESET 40+ (K3, HOTOVO)
- `GET /store/entitlements` (přihlášená zákaznice) → vrátí seznam jejích aktivních oprávnění. Storefront podle toho ukazuje/skrývá obsah RESET 40+ — **nikdy nerozhodovat o přístupu jen podle toho, že produkt je v historii objednávek; vždy se ptát tohoto endpointu.**

### Cena podle tier (K1, HOTOVO)
- Tier se počítá server-side z `customer.metadata`/skupiny, storefront ho nikde sám nepočítá ani neukazuje slevu, kterou si sám spočítal — konečnou cenu vždy vrátí `/store/nexus-cart` (viz níže).

### Košík a SafeOrder (K2 HOTOVO, bezpečnostní oprava z `codex/wave1-security` ČEKÁ na sloučení)
- `POST /store/nexus-cart` — přepočet košíku se zohledněním tier ceny/kupónu, server-side.
- `POST /store/nexus-checkout` — SafeOrder: ALLOW/REVIEW(409)/BLOCK(403)/chyba(503). **Storefront musí každý z těchto čtyř stavů ukázat zákaznici srozumitelně** (např. REVIEW = „objednávku ještě ověřujeme, ozveme se"), ne jen generickou chybu.
- Upozornění: Worker route pro SafeOrder dnes (12. 10.) **nemá autentizaci** — oprava existuje na `codex/wave1-security`, ale ještě není sloučená do `wave1-base`. Storefront na to nemusí čekat, ale nasazení do testovacího prostředí 23. 10. by mělo počkat, až bude sloučená (jinak jde o known security gap v testovacím prostředí).

### QR kupóny (C3, HOTOVO až na jednu věc)
- `GET /store/coupon-links/:code` — ověří kupón, vrátí info (read-only, nikdy sám neaplikuje slevu na klientovi).
- **Chybí:** propojení ověřeného kupónu s `/store/nexus-cart`, aby se sleva opravdu uplatnila v košíku — to je otevřený bod z backendu (Krok 2 v `PROGRESS_LOG.md`), storefront na něj počká nebo si o prioritu řekne.
- Admin generátor: `POST /admin/coupon-links` (vytvoření), vrací URL + data pro QR — QR obrázek samotný (vykreslení/stažení) je na storefrontu/adminu, backend dává jen data a URL.
- 301 mapa (`redirects-map.csv`, 44 řádků) se nasazuje na úrovni Cloudflare Redirect Rules, ne v kódu storefrontu — to je infra úkol, ne úkol pro Codex na storefrontu.

### Objednávky a historie (standardní Medusa)
- `GET /store/customers/me/orders` — standardní, funguje, protože C2 migrace naplnila objednávky s `customer_id`.

### Rezervace konzultace (K9, HOTOVO na backendu, NENÍ v rozsahu Fáze 1 dle smlouvy)
- `GET /store/booking-slots`, `POST /store/bookings`, `POST /store/bookings/:id/cancel` existují a jsou otestované, ale **rezervace konzultací je formálně Fáze 2** (čl. 9 — AI asistent + rezervace v chatu). Storefront je v Fázi 1 nepotřebuje, pokud se mezitím nerozhodne jinak (byla řeč o tom, že se manuální domlouvání nemá dít — to je ale otázka pro Lucky/Jose, ne blokující podmínka z této smlouvy).

### Stripe platby (K7, 10 % — NEJVĚTŠÍ RIZIKO)
- Standardní Medusa Stripe provider je nakonfigurovaný, ale **nikdy neběžel proti reálnému/testovacímu Stripe klíči** a webhook (podpis, idempotence, částka) není ověřený. Bez tohoto nejde splnit scénář 1 a 2 z přílohy č. 1 (platba kartou/Apple Pay/Google Pay, potvrzovací e-mail). **Toto je společná blokace pro backend i storefront** — potřebujeme testovací Stripe klíč co nejdřív, jinak celé předání 23. 10. nemá na čem stát.

---

## 3. Co storefront NESMÍ dělat (bezpečnostní pravidlo platformy)

- Nikdy nepočítat cenu, slevu ani limit (např. COD limit) na klientovi — vždy jen zobrazit to, co vrátí backend/NEXUS. Backend je jediný zdroj pravdy pro peníze (organizační pravidlo L-Code Dynamics, platí bez výjimky).
- Nikdy neukazovat rozdílnou odpověď podle toho, jestli e-mail v systému existuje (magic-link enumerace).
- Nikdy nerozhodovat o přístupu k RESET 40+ jinak než dotazem na `/store/entitlements`.

---

## 4. Co chybí a kdo na tom pracuje

| Co | Stav | Kdo |
|---|---|---|
| Storefront samotný | mimo tuto session, staví Jose + Codex | Jose |
| SafeOrder Worker auth fix | hotovo na `codex/wave1-security`, čeká na review+merge | Claude (Krok 1) |
| QR kupón → reálná sleva v košíku | chybí propojení | Claude (Krok 2) nebo Codex, podle domluvy |
| Stripe testovací klíč | čeká na Lucky | Lucky |
| Admin (C5) | nezačato | nerozhodnuto |
| 301 redirecty na Cloudflare | mapa hotová, nasazení chybí | infra, ne storefront kód |

---

## 5. Hlavní menu (návrh od Jose, posouzeno 12. 10. 2026)

Vizuální návrh (mlžný les, zlaté kruhové logo, rozjížděcí tmavě zelené menu) odpovídá požadavku na „prémiový e-shop s autorským vzhledem, bez šablony" (čl. 2). Dvě položky v menu ale patří obsahově do **Fáze 2**, ne Fáze 1 — nejde o chybu designu, jen je potřeba mít jasno, co z toho musí být 23. 10. funkční a co jen vizuálně přítomné:

- **Přepínač jazyků SK / EN / RU** — jazykové verze e-shopu jsou výslovně Fáze 2 (čl. 2). V menu může zůstat jako vizuální prvek, ale **nesmí se v Fázi 1 od něj očekávat funkční překlad obsahu**.
- **„AI ANASTASIA" a „Konzultácie"** pod Službami — AI asistent i rezervace/úhrada konzultace v chatu jsou formálně Fáze 2 (čl. 9). V menu mohou být jako odkazy/struktura, ale **nesmí se 23. 10. předpokládat, že za nimi je funkční stránka** — pokud tam něco bude, ať je to jasně označené jako „již brzy" nebo podobně, ne jako hotová funkce, aby to nepůsobilo jako rozbité při testování s Lucií.

Zbytek menu (Obchod, Programy včetně RESET 40+, Zdravý svet/O Lucii/Kontakt) odpovídá Fázi 1 beze změny.

---

**Shrnutí pro Codexe v jedné větě:** postav scénáře 1–5 z přílohy č. 1 nad API výše, nikdy nepočítej peníze ani přístup sám, a scénáře 1–2 (platba) nepůjdou doopravdy dotáhnout do konce, dokud nedorazí testovací Stripe klíč.
