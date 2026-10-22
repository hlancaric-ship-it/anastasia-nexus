# Zadání: digitální produkty v adminu (MiniMax)

Lucky chce, aby Lucia sama založila nový digitální produkt, nahrála k němu soubory a vše se samo propojilo, bez nás.

## Současný stav (zjištěno)
- Chráněné soubory leží v soukromém R2 bucketu `anastasia-media` (manifest `backend/src/lib/protected-library/manifest.ts`).
- Vazba produkt → soubory: `product.metadata.protected_media = [{key,title,kind?}]`.
- Zákaznice dostane přístup přes entitlement (subscriber `entitlement-order-placed.ts` / `entitlement-payment-captured.ts`), odkaz podepisuje `modules/entitlement/media/access.ts` (HMAC token, doručovací worker `/v1/<key>?t=`).
- Admin (`anastasia-admin/library-editor.mjs` + `api/admin/products/[id]/protected-media/route.ts`) umí jen přejmenovat a změnit pořadí. NELZE nahrát nový soubor ani odebrat. To je hlavní mezera.

## Úkoly
1. **Nahrání souborů (backend)**: `POST /admin/products/:id/protected-media/upload-url` → vrátí presigned PUT URL do R2 (S3 API, `@aws-sdk/client-s3` + `s3-request-presigner`, pokud už je v závislostech; jinak multipart upload přes backend se streamem). Klíč `<product-handle>/<slug-názvu>-<random6>.<ext>`. Povolené typy: mp4, mp3, m4a, pdf, epub, zip; limit 2 GB video / 200 MB ostatní. Credentials jen ze serverových env (`PROTECTED_R2_*`), nikdy do klienta mimo presigned URL. Po uploadu `POST .../protected-media/attach {key,title}` ověří HEAD objektu v R2 a přidá do `metadata.protected_media` (zámek + audit jako stávající POST). `DELETE .../protected-media/:key` jen odpojí od produktu (objekt v R2 nemaže; pokud už má produkt zakoupený, potvrzení v UI).
2. **Admin UI (`library-editor.mjs`)**: drag & drop + výběr souboru, progress bar (XHR upload.onprogress), automatický název z názvu souboru, náhled typu (video/audio/dokument), odebrat, pořadí, uložit. Texty slovensky, srozumitelně pro Luciu.
3. **Průvodce „Nový digitálny produkt“**: při založení produktu s profilem „Digitálny produkt“ admin rovnou otevře záložku Zakúpený obsah s výzvou nahrát soubory. Kontrola před zveřejněním: digitální produkt bez souborů → varování.
4. **Kategorie digitálních produktů**: v seznamu produktů filtr Fyzické / Digitálne a v e-shopu (storefront) i adminu digitální produkty podle kategorií (ACADEMY kurzy, audio/meditácie, e-knihy…) – navrhni podle existujících kategorií, nemaž nic.
5. **E2E ověření na testu**: založit testovací digitální produkt, nahrát malý mp3, koupit (`SHIP` netřeba), ověřit, že se v Môj účet → Knižnica zobrazí a přehraje. Pak testovací produkt deaktivovat.
6. Testy: `cd backend && npx tsc --noEmit && npm test` (unit). Commit do release větve, NEPUSHOVAT. Neměň checkout/platební soubory. Tajemství nevypisuj.

## DOPLNĚNÍ od Luckyho (závazné)
- Placený obsah NESMÍ jít obejít ani stáhnout: video/audio jen streamem přes podepsaný krátkodobý odkaz s vodoznakem (stávající přehrávač), žádné tlačítko stáhnout, `controlsList="nodownload"`, bez přímé URL do R2. PDF/e-knihy jen náhled v prohlížeči s vodoznakem, ne ZIP ke stažení. Povolené typy proto: mp4, mp3, m4a, pdf.
- Bucket a R2 účet musí být jen v konfiguraci (env), protože R2 se bude přesouvat na účet Lucie – žádné natvrdo zapsané názvy/ID účtu.
- Digitální produkt smí koupit jen přihlášená zákaznice (host nedostane přístup – ověř, že checkout digitálního produktu bez přihlášení neprojde a UI ji vyzve k přihlášení/registraci).
- Stávající obsah Reset 40+ a Nič nemusíš se nesmí rozbít (zachovat klíče v metadata.protected_media).
