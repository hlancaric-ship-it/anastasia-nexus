# Přepočet košíku – 4. 11. 2026

## Rozsah a stav

Oprava zpracování neznámé věrnostní úrovně již existuje v commitu
`1819553` a v týmovém repozitáři `L-Code-Dynamics-Dev/anastasia-nexus`.
V této větvi jsou doplněny regresní testy a oprava byla nasazena pouze do
testovacího pricing Workeru `nexus-api-anastasia-test`.

Backend běží na Medusa Cloudu (`https://anastasia-api.medusajs.app`),
root repozitáře na Cloudu je `/backend`. Web a administrace jsou samostatné
Cloudflare Workery `anastasia-test-web` a `anastasia-test-admin`.
Cenový endpoint je samostatná služba `nexus-api-anastasia-test`.
Starý Docker backend není aktuální backend webu.

## Ověřená chyba

Nasazená verze cenového Workera `3f4081ab-4ae1-44b2-a06d-bbe3d476ea87`
posílá každou řetězcovou hodnotu `customerTier` přímo do kalkulátoru.
Kalkulátor odmítá úroveň, která není v `loyaltyTiers` politiky.
To vede k HTTP 500 místo běžného výpočtu bez věrnostní slevy.

Syntetické požadavky na tento cenový endpoint, stejný SKU a základ 25 EUR:

| Vstup | Nasazená verze |
| --- | --- |
| bez `customerTier` | 200, cena 25 EUR |
| `customerTier: ZR0` | 500, `INTERNAL_ERROR` |
| `customerTier: ZR1` | 500, `INTERNAL_ERROR` |

Samostatně byl přes veřejnou konfiguraci skutečného webu vytvořen označený
hostovský košík na Medusa Cloudu, přidána jedna položka `KO.004` a zavolán
`POST /store/nexus-cart`: úspěch, jednotková cena 11 EUR.
Nevznikla objednávka ani platba. Tento test nepotvrzuje stav konkrétního
přihlášeného zákazníka ani celý checkout.

## Připravená oprava

Použít již existující kontrolu vlastního klíče
`Object.prototype.hasOwnProperty.call(policyConfig.loyaltyTiers, input.customerTier)`
v `nexus/workers/api/routes/nexusPricing.ts` před předáním úrovně kalkulátoru.
Neznámá úroveň se předá jako `undefined`; známé úrovně a jejich sazby zůstávají
beze změny. Zdroj politiky, autentizace, tenant a výpočty na serveru se nemění.
Nejde o klientský fallback ani opakování neúspěšného výpočtu za základní cenu.

Nové regresní případy pokrývají prázdnou politiku s `ZR0`, `ZR1`,
`toString`, `__proto__` a zachování platné akce i kupónu u neznámé úrovně
(100 EUR → akční cena 80 EUR → kupón 10 % → 72 EUR).

Při nasazení se odstranil neplatný testovací KV placeholder z
`nexus/wrangler.jsonc`: v Cloudflare pro něj není namespace a nasazený Worker
má cenovou politiku v existujícím secretu `MEDUSA_PRICING_POLICY_JSON`.
Před deploymentem se ověřil seznam KV namespace i názvy Worker secrets
(hodnoty secretů nebyly čteny). Wrangler použil `--keep-vars`.

## Ověření

- Cílený NEXUS běh: 3/3 soubory, 22/22 testů PASS.
- Celá Node sada NEXUS: 98/98 souborů, 1276/1276 testů PASS.
- Cílený backend (věrnost, transport, synchronizace politiky): 3/3 sady,
  21/21 testů PASS.
- Backend `tsc --noEmit`: PASS.
- Celý backend `npm run test:unit`: 188 sad, 1817 testů; 1799 PASS,
  18 testů ve dvou sadách blokovalo sandboxové `listen EPERM` na loopbacku.
  Obě sady zopakovány mimo sandbox: 18/18 PASS. Souhrnně tedy ověřeno
  1817/1817 testů, nikoli jediný kompletní zelený běh mimo sandbox.
  V této výchozí větvi je 1817 testů; dříve zmiňovaných 1826 nebylo potvrzeno.
- Typová kontrola celého NEXUS hlásí existující nesoulad `BufferSource`
  v nezměněném `workers/api/routes/mediaDelivery.ts:36`; do tohoto souboru
  nebylo zasahováno.
- `wrangler deploy --dry-run --keep-vars --config nexus/wrangler.jsonc --env anastasia-test`:
  PASS; ověřen testovací Worker, D1 a Durable Object, bez placeholder KV.
- Nasazení stejného testovacího prostředí vytvořilo verzi
  `758f5426-a6dd-4c9f-9c18-ed42c5246505` (4. 11. 2026).
  `wrangler deployments list --name nexus-api-anastasia-test` potvrzuje 100 %
  provozu na této verzi. Pricing route odpovídá HTTP 401 bez tajného klíče,
  jak očekává autentizace.

## Zbývá

Požádat Luckyho o opětovné načtení pokladny a ověření přihlášeného košíku.
Aktuální zákaznická session nebyla k dispozici, takže skutečný checkout po
nasazení nebyl v této relaci ověřen. Nevytvořila se objednávka ani platba.
