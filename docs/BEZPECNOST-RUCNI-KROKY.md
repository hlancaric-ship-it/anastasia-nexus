# Bezpečnost: ruční kroky mimo repozitář (27. 10. 2026)

Kódy kroků odpovídají `docs/BEZPECNOST-AUDIT-2026-10-27.md`. Každý krok obsahuje ověření. Tajemství sem nikdy nepište.
Zóna `anastasiaoz.eu` a účet Lucie se mění **jen po jejím schválení**. Totéž pak platí obdobně.

## A. Admin účty
- **A4 – povinná 2FA:** každý admin si v Admin → Zabezpečení zapne TOTP a záložní kódy uloží do správce hesel. Ověření: `GET /admin/nexus/admin-2fa` vrací u každého účtu `enrolled: true`.
- **A5 – `mfa.disable_policy: "challenge"` a admin `jwtExpiresIn: "8h"`:** jde o změnu `medusa-config.ts`, kterou dělá vlastník configu (Jose). Serverová kontrola TOTP u vypnutí 2FA už funguje i bez ní.

## C. Cloudflare (účet L-Code)
- **C1 – WAF:** Security → WAF → Managed rules: zapnout Cloudflare Managed Ruleset a OWASP Core (citlivost Medium, akce Block). Ověření: `curl "https://anastasia-test.l-code-dynamics.com/?q=<script>alert(1)</script>"` vrátí 403.
- **C2 – Rate limiting** (Security → WAF → Rate limiting rules), klíčem je IP:
  - `/auth/*`: 30 požadavků za minutu, Block na 10 minut;
  - `/store/payment-collections/*`: 20 za minutu;
  - `/store/*`, metoda POST: 300 za minutu.

  Limity v kódu zůstávají, tohle je první vrstva.
- **C3 – Bot Fight Mode:** zapnout (Security → Bots). Turnstile vyžaduje widget a sitekey a ověření na serveru je samostatný balík.
- **C4 – workers.dev a preview URL:** u každého Workeru (`anastasia-test-web`, `-admin`, media, `nexus-api-anastasia-test`) v Settings → Domains & Routes vypnout `workers.dev` i Preview URLs. V `nexus/wrangler` doplní vlastník `workers_dev = false`, `preview_urls = false` a `ratelimits` binding. Ověření: adresa `*.workers.dev` vrací 404 nebo chybu 1042.
- **C5 – Cloudflare Access na admin:** Zero Trust → Access → Application na `anastasia-test-admin.l-code-dynamics.com` s povolenými e-maily týmu a Lucie. Přidá druhou vrstvu nad heslo a 2FA.
- **C6 – HSTS pro API:** produkční API na `*.medusajs.app` není za Cloudflare a HSTS posílá Medusa Cloud. U vlastní domény API za Cloudflare: SSL/TLS → Edge Certificates → HSTS (max-age 12 měsíců, includeSubDomains). Ověření: `curl -sI` vrací `strict-transport-security`.
- **C7 – env v buildu:** nastavit `BACKEND_PUBLIC_URL` (backend) a `ANASTASIA_ADMIN_ORIGIN` (build storefrontu) na přesné hodnoty, ne odvozené.

## D. Doména a DNS
- **D1 – registrátor a Websupport:** zapnout zámek domény (transfer lock) a 2FA na účtech Websupport a Cloudflare. U Cloudflare zkontrolovat členy účtu a API tokeny a nepoužívané smazat.
- **D2 – e-mail:** pokud se z `l-code-dynamics.com` posílá přes Resend, doplnit jeho include do SPF. Po 4 týdnech čistých DMARC reportů přepnout `p=quarantine` na `p=reject` a SPF `~all` na `-all`.
- **D3 – CAA:** přidat záznamy `CAA 0 issue "letsencrypt.org"`, `CAA 0 issue "pki.goog"`, `CAA 0 issue "digicert.com"`, `CAA 0 issue "ssl.com"`, `CAA 0 iodef "mailto:<bezpečnostní adresa>"`. Jde o CA, které používá Cloudflare Universal SSL. Ověření: `dig CAA l-code-dynamics.com`.
- **D4 – visící záznamy:** DNS → Export zóny a u každého CNAME a A záznamu ověřit, že cíl existuje (Worker, Pages, bucket). Nepoužívané smazat.

## S. Stripe (jen Test mode, pro live stejně)
- **S1 – Radar:** zapnout pravidla „Block if CVC fails“ a „Block if postal code fails“. Platby s risk_level `highest` blokovat.
- **S2 – 3DS:** Radar rule „Request 3D Secure if 3DS is supported“.
- **S3 – oddělené webhook secrety:** každý endpoint má vlastní `whsec_`. Po změně `medusa-config.ts` (vlastník configu) uložit secrety do env proměnných Medusa Cloud, nikdy do repa.

## R. R2
- **R1 – bucket `anastasia-media`:** R2 → bucket → Settings: zkontrolovat, že je `r2.dev` vypnuté a vlastní doména míří jen na veřejné obrázky. Výpis objektů by neměl obsahovat placené soubory (`paid/`, PDF a audio programů). Pokud tam jsou, přesunout je do soukromého bucketu.

## K. Klíče a zálohy
- **K1 – heslo test-serveru:** heslo bylo dříve v `ops/test-server/compose.yml` v git historii. Pokud server běžel, heslo rotovat.
- **K2 – rotace:** jednou za 6 měsíců a vždy při odchodu člena týmu rotovat `JWT_SECRET`, `COOKIE_SECRET`, `MEDIA_TOKEN_SECRET`, Stripe a Resend klíče. Pozor: rotace JWT secretu odhlásí všechny.
- **K3 – zálohy:** spustit ručně workflow DB backup, stáhnout zálohu a obnovit ji do lokální prázdné DB. Ověřit, že je záloha šifrovaná.
