# Bezpečnosť administrácie: 2FA (TOTP) a role vlastník / asistent

**Balík:** admin bezpečnosť (část auditu Fáze 1 – P0 „bezpečný prístup do administrácie“).
**Dátum:** 21. 10. 2026 · **Vetva:** `release/predani-faze1` (nepushnuté)

## Čo Medusa 2.19 umí (a čo nie)

| Schopnosť | Stav v Meduse 2.19 | Záver |
|---|---|---|
| TOTP dvojfaktorové overenie | **áno, natívne** – provider `totp` v auth module (`auth_mfa_factor`), záložné kódy (`auth_mfa_recovery_code`) | Použijeme natívne riešenie, **žiadna nová platená služba** |
| Prihlásenie s výzvou na kód | **áno** – `POST /auth/user/emailpass` vráti `mfa_required` + `mfa_challenge`, potom `POST /auth/mfa/challenges/:id/verify` | Bez zmeny v jadre |
| RBAC (role a politiky) | **nie** – `@medusajs/rbac` je za flagom `MEDUSA_FF_RBAC` (predvolene vypnutý) a zapína sa v `medusa-config.ts` | Role spravíme v backendovom kóde, bez flagu a bez zásahu do `medusa-config.ts` |

**Šifrovací kľúč pre TOTP tajomstvo – hotovo (21. 10. 2026).** Provider vyžaduje kľúč
na šifrovanie tajomstva v konfigurácii auth modulu; bez neho enroláciu odmietne
(fail-closed, nie tichý vypnutý 2FA). Konfigurácia aj šablona prostredia sú doplnené:

```ts
// backend/medusa-config.ts – modul AUTH
{
  key: Modules.AUTH,
  resolve: "@medusajs/medusa/auth",
  options: {
    providers: [
      { resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" },
      // ... ďalší provider (magic-link)
    ],
    // Šifrovací kľúč pre TOTP tajomstvo (len na serveri). Pridá sa IBA vtedy,
    // keď je MFA_ENCRYPTION_KEY nastavený v prostredí – inak zostáva konfigurácia
    // Medusy bez zmeny.
    ...(mfaEncryptionKey ? { mfa: { encryption_key: mfaEncryptionKey } } : {}),
  },
}
```

- `backend/.env.template` – `MFA_ENCRYPTION_KEY=` s komentárom (ako `openssl rand -hex 32`;
  po nastavení ho nemeniť, inak sa nebudú dať overiť už zapísané faktory).
- **Zostáva urobiť:** nastaviť `MFA_ENCRYPTION_KEY` v prostredí (lokálne `.env`,
  produkcia secret store). Bez neho 2FA zostáva vypnuté a enrolácia odmietne.

## Čo je z implementované v backende

### 1. Role: vlastník a asistent

Rola je v metadátach administrátora (`metadata.anastasia_role`), číta ju server – nikdy klient.
**Predvolená rola je `vlastník` (`owner`)**, takže existujúce prihlásenia fungujú bez zmeny;
asistenta musí vlastník vypnúť ručne.

| Rola | Smie |
|---|---|
| **vlastník** (`owner`) | všetko: ceny a cenové politiky, vernostné úrovne, ručné udelenie prístupu, role, 2FA, katalóg, objednávky, zákazníci, obsah |
| **asistent** (`assistant`) | denná práca: katalóg, objednávky, zákazníci, obsah, chat. **Nie:** ceny, zľavy, vernostné úrovne, ručné udelenie prístupu, role |

Vlastník sa nesmie znížiť, ak je posledným vlastníkom (inak by administráciu nikto nevedel spravovať).

### 2. Dvojfaktorové overenie (TOTP)

Backend zapĺňa natívne MFA provider Medusy, ale len pre administrátorov
(`actor_type = user`) a každú zmenu zapíše do auditu (`ops_audit`).

## API pre administráciu (presne)

### Role

**`GET /admin/nexus/admin-roles`**
```json
{
  "admins": [
    { "id": "user_…", "email": "lucia@anastasia.sk", "first_name": "Lucia", "last_name": "…", "role": "owner" }
  ],
  "roles": ["owner", "assistant"],
  "current_user_id": "user_…"
}
```

**`POST /admin/nexus/admin-roles`** – telo `{ "user_id": "user_…", "role": "owner" | "assistant" }`
→ `{ "user_id": "user_…", "role": "assistant" }`.
Chyby: `400` (neplatná rola / posledný vlastník), `403` (zmenu robí iba vlastník).

### Dvojfaktorové overenie

**`GET /admin/nexus/admin-2fa`**
```json
{ "enrolled": true, "provider": "totp", "factor_id": "authmfa_…", "recovery_codes_remaining": 8, "role": "owner" }
```

**`POST /admin/nexus/admin-2fa`** – začne enroláciu (založí faktor v stave `pending`).
Odpoveď obsahuje **tajomstvo a `otpauth_url`** – z nich sa vyrobí QR kód pre aplikáciu
(Google Authenticator, 1Password, Aegis…). Tajomstvo sa zobrazí **raz**.
```json
{ "factor_id": "authmfa_…", "secret": "JBSWY3DPEHPK3PXP", "otpauth_url": "otpauth://totp/ANASTASIA:lucia@…?secret=…" }
```

**`POST /admin/nexus/admin-2fa/verify`** – telo `{ "factor_id": "authmfa_…", "code": "123456" }`
→ `{ "enabled": true, "recovery_codes": ["…", "…"] }`.
**Záložné kódy sa zobrazia raz – treba si ich uložiť.** Chybný kód → `400`.

**`POST /admin/nexus/admin-2fa/recovery-codes`** – telo `{ "count": 10 }` (voliteľné, 1–50)
→ `{ "recovery_codes": ["…"] }` (staré kódy zneplatnia).

**`DELETE /admin/nexus/admin-2fa`** – telo `{ "factor_id": "authmfa_…", "code": "123456" }`
→ `{ "enabled": false }`. Na vypnutie treba platný kód (dôkaz, že kto vypína, je prihlásený).

### Prihlásenie po zapnutí 2FA (natívny tok Medusy, nič vlastné)

1. `POST /auth/user/emailpass { email, password }`
   → `{ "mfa_required": true, "mfa_challenge": { "id": "…", "methods": ["totp", "recovery_code"] }, "token": "<actorless>" }`
   → SPA zobrazí pole pre 6-miestny kód (alebo záložný kód).
2. `POST /auth/mfa/challenges/:id/verify { "method": "totp", "code": "123456" }`
   → `{ "token": "<plný token>" }` → SPA sa prihlási.
3. Bez zapnutého faktoru ide prihlásenie ako doteraz (odpoveď `{ "token": … }`).

Kľúčový bod pre SPA: **odpoveď `mfa_required` nie je chyba** – je to výzva na kód.

## Čo sme ZÁMERNE neurobili (a prečo)

- **Nepoistili sme 2FA pre všetkých administrátorov.** Kým sa faktor nepotvrdí kódom,
  mohol by sa prihlásiť iba jeho vlastník; vynútenie 2FA pre všetkých by v prípade
  chyby znamenalo, že sa do administrácie nikto nedostane. 2FA sa zapína dobrovoľne
  (a odporúčame, aby si ho zapnul aspoň vlastník).
- **Nezmenili sme spôsob prihlásenia ani provider** – natívne MFA Medusy, žiadny vlastný
  kód na overovanie kódov (tvorba a overenie TOTP je v Meduse).
- **Nepoužili sme natívny RBAC Medusy** – je za flagom `MEDUSA_FF_RBAC` a zapína sa v
  `medusa-config.ts`, ktorý je mimo hraníc tohto balíka.
- **Nepridali sme novú tabuľku** – rola je v metadátach administrátora, ktoré admin
  (`metadata`) už používa.

## Čo ostáva na UI (admin MiniMax)

1. **Nastavenia → Bezpečnosť administrácie**: prehľad administrátorov s rolou (vlastník/asistent),
   prepínač role, zapnutie 2FA (QR kód z `otpauth_url`), zobrazenie záložných kódov raz.
2. **Prihlásenie**: Ak API vráti `mfa_required`, zobraziť pole pre kód (6 číslic) a pošliť
   `POST /auth/mfa/challenges/:id/verify`. Chybný kód → hlásenie, ne „zlá heslá“.
3. **Ochrana rolí v UI**: tlačidlá pre ceny, zľavy, vernostné úrovne a ručné udelenie prístupu
   sa asistentovi skryjú (server ich aj tak odmietne s `403`).

## Overenie

- `src/lib/admin/__tests__/roles.unit.spec.ts` – čítanie roly, predvolený vlastník, práva.
- `src/api/admin/nexus/__tests__/admin-roles.unit.spec.ts` – zoznam, zmena roly, audit,
  zákaz pre asistenta, ochrana posledného vlastníka.
- `src/api/admin/nexus/__tests__/admin-2fa.unit.spec.ts` – stav bez tajomstva, enrolácia
  (tajomstvo + otpauth URI), overenie kódu + záložné kódy, vypnutie vyžaduje kód.

`cd backend && npm run test:unit` – všetko zelené.

## Stav

`IMPLEMENTED_UNVERIFIED` – kód a testy sú overené lokálne. Konfigurácia
`mfa.encryption_key` (z `MFA_ENCRYPTION_KEY`) aj záznam v `.env.template` sú hotové;
**zostáva iba dosadiť hodnotu do prostredia** (lokálne `.env`, produkcia secret store)
a pripraviť prihlásenie s výzvou na kód v UI administrácie (paralelná session).

## Vyriešené obmedzenie: zápis metadát administrátora (21. 10. 2026)

~~Rola je v `user.metadata.anastasia_role`. Natívna trasa Medusy `POST /admin/users/:id`
dovoľuje prihlásenému administrátorovi meniť metadáta, takže asistent by si mohol
rolu prepísať na `owner`.~~

**VYRIEŠENÉ.** `POST /admin/users/:id` (aj `POST /admin/users/me`) je teraz obalené
middlewarom `protectAdminRoleMetadata` (`backend/src/lib/admin/role-guard.ts`):

- zápis `metadata` administrátora smie **iba vlastník**; asistent dostane `403`,
- odmietnutý je aj zápis metadát **bez kľúča `anastasia_role`** – Medusa pri aktualizácii
  metadáta nenásobí (nahrádza ich), takže by sa rola zrušila,
- bez zápisu metadát prejde (meno, e-mail a podobné údaje smie meniť aj asistent),
- rola sa číta z databázy, takže ju klient nepodvrhuje.

Navyše `POST /admin/users` (založenie nového účtu) smie iba vlastník
(`protectAdminUserCreation`) – nový účet má predvolenú rolu `owner`, takže by inak
asistent mohol založiť kolegu s plnými právami.

Test: `backend/src/lib/admin/__tests__/role-guard.unit.spec.ts` (zápis roly asistentom,
odstránenie roly, vlastník, bez zápisu metadát, neprihlásený, zakladanie účtov).

Kým sa nezapne natívny RBAC (`MEDUSA_FF_RBAC`), je toto vlastná bezpečnostná hranica
rolí v našom backende (nie len ochrana pred omylom).
