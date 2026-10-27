# Zadání: odolnost ANASTASIA proti útokům (pro silnější model)

**Proč:** Lucia nechá po spuštění a před doplatkem Fáze 2 udělat externí bezpečnostní test. Systém musí odolat běžným útokům. Opravy dělat v kódu a nastavení, ne jen popsat.

**Pravidla:** test jen na `*.l-code-dynamics.com`, Stripe jen TEST, na doménu Lucie (anastasiaoz.eu) a její DNS nesahat bez schválení. Žádná tajemství do repozitáře, e-mailů ani dokumentů. Commit jen vlastní soubory, žádné `git checkout/reset/stash/clean`. Backend pushovat dávkově (300 build minut měsíčně).

**Architektura:** Medusa 2.19 na Medusa Cloud (API `anastasia-api.medusajs.app`), storefront a admin na Cloudflare Workers, R2 buckety `anastasia-media` (veřejný) a `anastasia-paid-content-test` (soukromý), Stripe, e-maily přes Resend, ceny a kupóny v NEXUS workeru. Přihlášení emailpass je sdílené mezi zákazníky a adminy podle e-mailu (viz `healSharedAdminLogin`).

## Útoky k pokrytí (u každého: stav dnes, riziko, oprava, test)

1. **Prolomení hesla a převzetí účtu:** hrubá síla a credential stuffing na přihlášení zákazníka i admina, zasílání magic linků a resetů (e-mail bombing), enumerace účtů podle odpovědí, slabá hesla, životnost a odvolání relací (30 dní v localStorage), 2FA pro admina.
2. **Zahlcení a DoS:** limity požadavků na přihlášení, košík, checkout, kontakt, chat, newsletter, vyhledávání. Ochrana na úrovni Cloudflare (WAF, rate limiting, Bot Fight, Turnstile u formulářů). Velké odpovědi, drahé dotazy, nekonečné stránkování. Co se stane při pádu backendu (storefront nesmí ukázat chybu s detaily).
3. **Doména a DNS:** převzetí domény a DNS (zámek u registrátora, 2FA a práva u Websupportu a Cloudflare, DNSSEC, přesměrování NS), převzetí subdomén (visící záznamy, zrušené Workers a buckety), SPF, DKIM, DMARC proti podvržení e-mailů, CAA, HSTS, security hlavičky.
4. **Platby a platební brány:** zkoušení karet (card testing) přes PaymentIntent, ověření podpisu Stripe webhooků, idempotence, nedůvěřovat ceně a slevě z klienta (vše počítá backend), zneužití kupónů a QR slev (opakované použití, brute force kódů), manipulace s košíkem, podvržení stavu platby, dobírka a převod bez ověření. Stripe Radar pravidla, 3DS, limity pokusů.
5. **Přístup k datům:** IDOR u objednávek, faktur (`/store/orders/:id/invoice`, `/admin/orders/:id/invoice`), knihovny a entitlementů, enumerace čísel objednávek, úniky osobních údajů v odpovědích a logech.
6. **Placený obsah:** přímé odkazy na R2, platnost podepsaných URL, media worker (`anastasia-test-protected-media`) a jeho fallback na soukromý bucket, stahování bez nákupu, sdílení odkazů.
7. **Webové zranitelnosti:** XSS (včetně obsahu z adminu a newsletteru), CSRF, SSRF, otevřená přesměrování, nahrávání souborů (typ, velikost, SVG), injektáž do e-mailových šablon, CORS, CSP.
8. **Admin a tajemství:** přihlášení adminu, role, API klíče a tokeny v prostředích (Cloud env, Workers secrets), rotace, žádná tajemství v repozitáři a v historii gitu, závislosti s CVE (`npm audit`), zálohy a jejich šifrování.

## Výstup
1. `docs/BEZPECNOST-AUDIT-<datum>.md`: tabulka útok / stav dnes / riziko / oprava / ověřeno.
2. Opravy v kódu a nastavení s testy (jednotkové i skriptem proti testovacímu webu).
3. Seznam věcí, které musí udělat Lucia nebo L-Code ručně (nastavení Cloudflare, Websupport, Stripe, registrátor), s přesným postupem.
4. Krátký dokument pro Luciina testera: rozsah, povolené a nepovolené testy, kontakt, okno pro DoS test.
