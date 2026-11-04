# DÔLEŽITÉ INFO PRE CODEXA (Stav projektu a nasadzovanie)

Tento report obsahuje presné inštrukcie kam a ako sa čo nasadzuje, a čo všetko už je hotové.

---

## 1. KDE A AKO SA ČO NASADZUJE

### A) Storefront (`anastasia-test.l-code-dynamics.com`)
* **Kde:** Cloudflare Workers (účet ID `3a147fa6382bb87477201b385bb945ea`).
* **Katalóg a API:** Medusa Cloud (`https://anastasia-api.medusajs.app`).
* **Platné kľúče pre build s ostrým katalógom:**
  * `ANASTASIA_PUBLISHABLE_KEY=pk_cd18083546dc5cac3fdcc6c653aa04231f2b64c2c47e0da10496c4a9849e1888`
  * `ANASTASIA_REGION_ID=reg_01M5DB22ZWQJX7QEX1YQTCCW7R`
  * `ANASTASIA_API_ORIGIN=https://anastasia-api.medusajs.app`
  * `ANASTASIA_MEDIA_ORIGIN=https://pub-e3ec1b5623e544bb8f2907db2e7cbda1.r2.dev`
* **Príkaz na build:**
  ```bash
  cd storefront-prototype && ANASTASIA_PUBLISHABLE_KEY=pk_cd18083546dc5cac3fdcc6c653aa04231f2b64c2c47e0da10496c4a9849e1888 ANASTASIA_REGION_ID=reg_01M5DB22ZWQJX7QEX1YQTCCW7R ANASTASIA_API_ORIGIN=https://anastasia-api.medusajs.app ANASTASIA_MEDIA_ORIGIN=https://pub-e3ec1b5623e544bb8f2907db2e7cbda1.r2.dev node build.mjs
  ```
* **Príkaz na deploy (spúšťa sa z rootu repozitára):**
  ```bash
  wrangler deploy -c ops/test-predani/web.wrangler.jsonc
  ```

---

### B) Admin (`anastasia-test-admin.l-code-dynamics.com`)
* **Kde:** Cloudflare Workers (účet ID `3a147fa6382bb87477201b385bb945ea`).
* **Príkaz na build:**
  ```bash
  cd anastasia-admin && ANASTASIA_API_ORIGIN=https://anastasia-api.medusajs.app node build.mjs
  ```
* **Príkaz na deploy (spúšťa sa z rootu repozitára):**
  ```bash
  wrangler deploy -c ops/test-predani/admin.wrangler.jsonc
  ```

---

### C) Backend (`https://anastasia-api.medusajs.app`)
* **Kde:** Medusa Cloud.
* **Ako sa nasadzuje:** Automaticky cez CI/CD pri pushnutí do vetvy `main` repozitára `L-Code-Dynamics-Dev/anastasia-nexus`.
* **Príkaz na deploy:**
  ```bash
  git push https://github.com/L-Code-Dynamics-Dev/anastasia-nexus.git HEAD:main
  ```

---

### D) NEXUS Worker (`anastasia-test-nexus.l-code-dynamics.com`)
* **Kde:** Cloudflare Workers (`nexus-api-anastasia-test`).
* **Príkaz na deploy:**
  ```bash
  cd nexus && wrangler deploy --env anastasia-test
  ```

---

## 2. ČO VŠETKO JE HOTOVÉ

1. **Redizajn detailu objednávky v admine (`#/objednavky`):**
   * Upravené v `anastasia-admin/app.mjs` a `styles.css`.
   * Odstránené fixné obmedzenie na 1120px a neprirodzene zobrazený olivový podklad.
   * Nový `od-card` / `od-head` layout v štýle ostatných stránok (Fraunces typografia, status pills, prehľadná nástrojová lišta tlačidiel).
   * Všetky pôvodné ID selektory pre browser regression testy (`#order-help`, `#o-back`, `#o-prev`, atď.) sú plne zachované.

2. **Mobilné menu a ouško (`.ana-menu-tab`):**
   * Pridané modré ouško na pravej strane priamo **nad** záložkou Novinky (`top: calc(34vh - 76px); right: 0;`).
   * Na mobile je natívne ľavé menu a rail (`#ana-rail`, `.hero-rail`, `.lh-top__menu`) kompletne skryté.
   * Po kliknutí na ouško sa menu vysunie zospodu obrazovky ako bottom sheet panel.

3. **Oprava mobilného rozbitia konzultácií:**
   * V `jednotny.css` opravené zvislé stláčanie textov (`.cv2-hero` na 1 stĺpec pri šírke <= 900px).

4. **Katalóg produktov a R2 CSP:**
   * Build generuje 49 stránok s reálnym Medusa katalógom a platnými R2 obrázkami bez placeholderov.

5. **Klientská zóna (`/ucet`): Responzivita sidebaru (Desktop vs. Mobil):**
   * **Desktop (>= 1000px):** Levý tmavě zelený sidebar `.center-sidebar` se VŽDY zobrazuje jako fixní panel (`display: flex!important`) na přehledu i na všech podstránkách (`.center-layout` je 280px grid).
   * **Mobil (< 1000px):** `.center-sidebar` je na mobilu striktně skrytý (`display: none!important`). Žádná duplicitní zelená lišta s horizontálními tlačítky se nezobrazuje. Na podstránkách je nahoře pouze karta sekce s tlačítkem `← Môj účet` a pod tím čistý obsah sekce.

---

## 3. AKTUÁLNY BLOKER K RIEŠENIU

* **Hláška: „Ceny sa nepodarilo vypočítať. Skúste to o chvíľu.“**
  * Medusa backend pri prepočte košíka volá `NEXUS_PRICING_URL` (`https://anastasia-test-nexus.l-code-dynamics.com/api/nexus/pricing`).
  * Tento worker aktuálne vracia `500 INTERNAL_ERROR`. V `nexus/wrangler.jsonc` pod `anastasia-test` chýba reálne KV namespace ID pre `PRICING_POLICY` (`"id": "REPLACE_WITH_ANASTASIA_TEST_KV_NAMESPACE_ID"`).
