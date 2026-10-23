# Registrácia zákazníckeho účtu

## Implementácia

- Passwordless formulár používa existujúci `auth-magic-link` provider a jeho middleware rate limit. Pri registrácii sa stále vracia rovnaký výsledok bez ohľadu na existenciu zákazníckeho e-mailu.
- Server validuje meno, priezvisko, e-mail a povinné súhlasy pomocou Zod. Verzie VOP a ochrany súkromia číta z `LEGAL_TERMS_VERSION` a `LEGAL_PRIVACY_VERSION`; newsletter verziu z `NEWSLETTER_CONSENT_VERSION`.
- Údaje registrácie čakajú na potvrdenie v tabuľke `auth_registration_state`, identifikovanej SHA-256 e-mailu a s platnosťou 30 minút. Po spotrebovaní magic linku vznikne Medusa customer a `metadata.registration_consents` uloží verziu aj serverový čas prijatia.
- Existujúci e-mail nepremení profil ani jeho súhlasy. Magic link pokračuje existujúcim prihlasovacím tokom.
- Dobrovoľný newsletter súhlas po potvrdení odošle idempotentný event subscriberu a uloží ho cez existujúcu službu `legal.subscribe`.
- Storefront má záložky prihlásenia/registrácie, odkazy na registráciu v menu, košíku a pokladni, ako aj CTA na stránke výhod. Preklady SK/EN/RU sú v existujúcom slovníku.

## Stav a limity

- Implementované: formulár, Zod validácia, verzované súhlasy v metadátach zákazníka, newsletter integrácia, anonymná odpoveď a existujúci rate limit.
- Implementované, neoverené na testovacom serveri: vytvorenie zákazníka cez Medusa databázové tabuľky počas overenia providerom. Vyžaduje nasadenie novej migrácie `auth_registration_state` aj backendu.
- Právne stránky `/vop` a `/gdpr` sú existujúce cesty webu. Obsah týchto stránok sa týmto balíkom nemení.
- Bez nových závislostí.

## Overenie

Spustiť `npx tsc --noEmit`, `npm run test:unit` v `backend/` a `node --test test/registration-links.test.mjs` v `storefront-prototype/`. E2E nasadenie vyžaduje koordináciu s prebiehajúcim test deployom.
