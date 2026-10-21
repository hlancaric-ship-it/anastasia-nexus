# Zabezpečenie administrácie – 2FA a role vlastník / asistent

**Balík:** administrácia (Fáza 1 – bezpečný prístup do administrácie) · **Dátum:** 21. 10. 2026
**Zdroj pravdy:** `backend/docs/wp/admin-2fa-rbac.md` (backendová časť je hotová, UI dopĺňa toto)
**Stav:** `IMPLEMENTED_UNVERIFIED` – kód a testy zelené, nasadenie administrácie aj backendu patrí
integrátorovi (blokované v tomto prostredí).

---

## 1. Čo pribudlo v administrácii

| Kde | Čo |
|---|---|
| **Nastavenia → Zabezpečenie** (iba vlastník) | Dvojfaktorové overenie (2FA) a zoznam administrátorov s rolou |
| QR kód pre TOTP | Vygenerovaný **v prehliadači** z odkazu `otpauth://` – žiadna externá služba, tajomstvo nikam neodchádza |
| Prihlásenie | Ak jadro vráti výzvu na kód (`mfa_required`), zobrazí sa pole na 6-miestny kód (alebo záložný kód) |
| Skrytie sekcií pre asistenta | Ceny, zľavy, vernostné úrovne, ručné pridanie prístupu a role sa asistentovi nezobrazia |

## 2. Ako to vyzerá pre Luciu

1. **Nastavenia → Zabezpečenie → Zapnúť dvojfaktorové overenie.**
2. Naskenuje QR kód v telefóne (Google Authenticator, 1Password, Aegis …). Ak sa naskenovať
   nedá, do aplikácie vloží vypísaný tajný kód.
3. Vloží 6-miestny kód z aplikácie → overenie → zobrazia sa **záložné kódy (raz)**.
4. Záložné kódy si **vytlačí alebo stiahne** (textový súbor) a odloží na bezpečné miesto.
5. **Administrátori a ich roly**: prepínač Vlastník / Asistent + **Uložiť rolu**.
   Posledného vlastníka nemožno znížiť (server to odmietne s vecnou hláškou).

Vypnutie 2FA vyžaduje platný kód z aplikácie (dôkaz, že vypína ten, kto je prihlásený).
Nové záložné kódu generuje tlačidlo **Vygenerovať nové záložné kódy** (staré stratia platnosť).

## 3. Čo asistent nevidí

| Sekcia / akcia | Vlastník | Asistent |
|---|---|---|
| Poukazy a zľavy (kupóny, QR kódy, darčekové poukazy) | vidí a spravuje | **v menu chýba**, pri priamom prechode sa zobrazí „nemáte prístup“ |
| Ceny a akcie v úprave produktu | upravuje | pole na cenu sa nezobrazí, pri uložení sa cena nemení |
| Vernostné úrovne (Nastavenia) | vidí a spravuje | **záložka chýba** |
| Pridanie úrovne zákazníkovi (Označiť → Priradiť) | vidí | **tlačidlo chýba** |
| Pridanie prístupu ku digitálnemu obsahu | vidí | **formulár chýba** (informácia zostane) |
| Odobratie prístupu | vidí | **tlačidlo chýba** |
| Zabezpečenie (2FA a role) | vidí a spravuje | **záložka chýba** |

Server aj tak odmietne zákaz s `403` – skytie v UI je len prehľadnosť, nie bezpečnostná hranica.

## 4. API (backendová časť – `backend/src/api/admin/nexus/`)

| Trasa | Použitie |
|---|---|
| `GET /admin/nexus/admin-2fa` | stav: zapnuté?, identifikátor faktora, koľko záložných kódov zostalo, rola |
| `POST /admin/nexus/admin-2fa` | začne enroláciu: vráti `factor_id`, `secret` a `otpauth_url` |
| `POST /admin/nexus/admin-2fa/verify` | overí kód, zapne 2FA a vráti záložné kódy |
| `POST /admin/nexus/admin-2fa/recovery-codes` | nové záložné kódy (staré stratia platnosť) |
| `DELETE /admin/nexus/admin-2fa` | vypne 2FA (vyžaduje platný kód) |
| `GET /admin/nexus/admin-roles` | zoznam administrátorov s rolou + `current_user_id` |
| `POST /admin/nexus/admin-roles` | zmena role (iba vlastník) |
| `POST /auth/user/emailpass` | pri 2FA vráti `mfa_required` + `mfa_challenge` |
| `POST /auth/mfa/challenges/:id/verify` | overenie kódu → token |

Rolu pre UI administrácia načíta z `GET /admin/nexus/admin-roles` (odpoveď servera).
Ak trasa nie je nasadená, administrácia pracuje ďalej ako vlastník a jadro zákaz aj tak
odmietne.

## 5. QR kód bez externých knižníc

`anastasia-admin/qr-encode.mjs` – vlastný generátor QR:

- bajtový režim, úroveň korekcie chýb **M**, verzie 1–10 (pre odkaz `otpauth://` viac než dosť),
- Reed-Solomon (GF(256), polynóm `0x11D`), zamiešanie blokov, mriežka s funkčnými vzormi,
  značkami formátu a verzie, výber masky podľa štandardnej penalizácie,
- výstup: inline SVG (bez siete, bez CDN, dá sa vytlačiť).

**Overenie:** mriežka je **bitovo zhodná** s referenčnou implementáciou (balík `qrcode`,
bajtový režim) a QR sa dá prečítať nezávislou čítačkou (OpenCV). Referenčná kontrola je
zapísaná ako regresný test `anastasia-admin/test/qr-otp.mjs` (odtlačok mriežky).

Stiahnutie QR kódu vo formáte SVG zostáva aj pri kupónoch – to nie je nahrávanie súboru,
ale QR kód, ktorý si server vygeneruje.

## 6. Testy

```bash
# QR generátor (16 kontrol)
node anastasia-admin/test/qr-otp.mjs

# prehliadačový test zabezpečenia (23 kontrol) – lokálna stavba + test API
cd anastasia-admin
ANASTASIA_API_ORIGIN=https://anastasia-test-api.l-code-dynamics.com node build.mjs
ADMIN_URL=http://127.0.0.1:4179 ADMIN_TEST_PASSWORD=… node test/browser-security.mjs
```

Prehliadačový test overuje: zapnutie 2FA, vykreslenie QR z `otpauth_url`, zobrazenie tajomstva,
overenie kódu (chybný aj správny), záložné kódy (zobrazenie, stiahnutie, tlač), generovanie
nových kódov, vypnutie 2FA s kódom, uloženie role, hlášku pri poslednom vlastníkovi a
skytie sekcií pri role „asistent“ (menu, priamy prechod, záložky, ceny, úrovne, prístupy).

Súčasne zostávajú zelené predchádzajúce testy administrácie (141 kontrol) a testy backendu
(`cd backend && npx tsc --noEmit && npm run test:unit`).

## 7. Čo zostáva na integrátora

| Vec | Prečo |
|---|---|
| Nasadenie backendu s trasami `/admin/nexus/admin-2fa*` a `/admin/nexus/admin-roles` | Bez nich sa záložka Zabezpečenie zobrazí hláškou „nie je dostupné“ a rolu treba overiť po nasadení |
| `MFA_ENCRYPTION_KEY` v `medusa-config.ts` (min. 32 znakov) a `.env` | Bez kľúča provider odmietne enroláciu (fail-closed) – backend hlási „nie je nakonfigurované“ |
| Nasadenie administrácie (Cloudflare Pages) | Zatiaľ nebolo nasadené (blokované v tomto prostredí) |

**Známe obmedzenie (z handoffu, nezmenené):** rola je v `user.metadata.anastasia_role` a
natívna trasa `POST /admin/users/:id` ju vie prepísať. Kým sa nezapne natívny RBAC, roly
chránia pred omylom, nie pred zámerným obcházením. Pre Fázu 1 má administráciu iba vlastník.
