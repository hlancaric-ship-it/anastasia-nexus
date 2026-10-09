# Produkty současného webu (akceptační seznam 1:1)

Zdroj: DB.sql ze starého e-shopu (export 5. 10. 2026), zpracováno parserem C1. Ověřeno vůči dumpu, **neověřeno vůči živému webu** (porovnat před spuštěním). Ceny jsou koncové s DPH v EUR. Pravidlo (Lucky, 9. 10. 2026): produkty, které jsou dnes na webu, zůstávají na novém webu přesně takové (název, cena, URL, popis, obrázek); skryté se přenesou jako nepublikované.

Souhrn: 30 produktů, 25 zveřejněných, 5 skrytých. Sazby DPH v datech: 23 % (27×), 20 % (2×), 19 % (1×).

| SKU | Název | Typ | Cena | DPH | Stav | Dostupnost | Stará URL |
|---|---|---|---|---|---|---|---|
| EP.001 | Nič nemusíš | digital | 38.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/nic-nemusis |
| EP.002 | AI ANASTASIA RESET 40+ | digital | 168.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/reset-40-plus |
| DO.001 | ZDRAVÁ KÁVA | physical | 14.00 € | 20 % | zveřejněn | in_stock | /eshop/produkt/kava-zdrava |
| DO.002 | CHRÍPKOVÝ PRÁŠOK | physical | 9.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/chripka-prasok |
| DO.003 | JANČOVA antibiotická zmes | physical | 9.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/antibioticky-prasok |
| K05 | MINERAL PROTECT 200ml | physical | 38.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/Mineralny-ochranny-krem-pre-citlivu-pokozku |
| KO.001 | Tvoj pleťový krém | physical | 77.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/bio-plet-krem |
| KO.002 | Tvoja pleťová voda | physical | 11.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/pletova-voda |
| KO.003 | Tvoj sprcháč | physical | 11.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/bio-sprchovy-gel |
| KO.004 | Tvoja pleťová voda osviežujúca | physical | 11.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/osviezit-plet |
| KO.005 | TVOJE TELOVÉ MASLO | physical | 22.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/telove-maslo |
| L001 | ENZYMY 7 RED HEALTH CARE 100tbl | physical | 43.91 € | 19 % | zveřejněn | in_stock | /eshop/produkt/wobenzym |
| L002 | JÓD KELP 100 tbl | physical | 6.20 € | 23 % | zveřejněn | in_stock | /eshop/produkt/prirodny-jod |
| MA.001 | Zmes na vydymovanie | physical | 11.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/vydymovanie-zmes |
| ON.001 | Sukňa ľanová zavinovacia dlhá | physical | 70.00 € | 23 % | zveřejněn | on_order | /eshop/produkt/lanova-sukna |
| V001 | LOSOSOVY OLEJ 250ml PET HEALTH CARE | physical | 11.40 € | 23 % | zveřejněn | in_stock | /eshop/produkt/lososovy |
| V003 | STAROSTLIVOSŤ O UŠI MAČKA, PES 100ml | physical | 12.30 € | 23 % | zveřejněn | in_stock | /eshop/produkt/usi |
| V004 | STAROSTLIVOSŤ O KĹBY 90TBL | physical | 22.80 € | 23 % | zveřejněn | in_stock | /eshop/produkt/bolest-klby |
| V005 | STAROSTLIVOSŤ O OČI  MAČKA , PES 100ml | physical | 12.30 € | 23 % | zveřejněn | in_stock | /eshop/produkt/bolest-oci |
| V006 | LOLA ŠAMPÓN JEMNÝ MAČKA, PES 250ml | physical | 11.40 € | 23 % | zveřejněn | in_stock | /eshop/produkt/sampon-zvierata |
| V007 | APTUS SentrX EYE GEL 3ml | physical | 10.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/ocne-kvapky-pre-psa |
| KONZ.01 | Supervízia | service | 69.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/supervizia |
| L004 | Personifikovaný zdravotný protokol | service | 59.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/personalizovany-zdravotny-protokol-pro |
| L005 | Online zdravotná konzultácia | service | 69.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/online-zdravotna-konzultacia |
| NR.01 | Astrologický profil zdravia a osobných predispozícií | service | 59.00 € | 23 % | zveřejněn | in_stock | /eshop/produkt/astrologia-zdravie-predispozicia |
| VVV.001 | Výuka vedomého vnímania | digital | 2600.00 € | 23 % | SKRYTÝ | in_stock | /eshop/produkt/vyuka-vedomeho-vnimania |
| MA.002 | RITUÁLNE SVIEČKY | physical | 99.00 € | 20 % | SKRYTÝ | in_stock | /eshop/produkt/ritualne-sviecky-voskove |
| ON.002 | Šaty ľanové zavinovacie midi | physical | 110.00 € | 23 % | SKRYTÝ | on_order | /eshop/produkt/saty-lanove |
| V002 | FYTO OBOJOK FORTE | physical | 19.30 € | 23 % | SKRYTÝ | in_stock | /eshop/produkt/protiparazitom |
| L003 | Personalizovaný zdravotný protokol  Základ | service | 38.00 € | 23 % | SKRYTÝ | in_stock | /eshop/produkt/personalizovany-zdravotny-protokol-zaklad |

## Zjištění k rozhodnutí
1. **DPH 20 %** mají Zdravá káva (14 €, zveřejněná) a Rituální svíčky (99 €, skrytá), ceny z roku 2022. Naše konfigurace počítala 23/19/5 %. Sazbu a případnou změnu ceny potvrdit s účetní; do té doby se cena nemění.
2. **Výuka vedomého vnímania (VVV.001)** je skrytá, 2 600 €, digitální; v parseru chybí její obsah v Umbraco stromu. Nepublikovat, dokud to Lucia nepotvrdí.
3. **Další skryté:** FYTO OBOJOK FORTE (V002), Šaty ľanové (ON.002), Rituálne sviečky (MA.002), Personalizovaný protokol Základ (L003). Přenést jako nepublikované.
4. **Služby** (L004, L005, KONZ.01, NR.01, L003): konzultace 69 €, supervize 69 €, astrologický profil 59 €, protokol 59 €. Nákup vede k rezervaci termínu (K9).
5. **Digitální:** Nič nemusíš (EP.001, 38 €), AI ANASTASIA RESET 40+ (EP.002, 168 €).
6. **Duplicitní názvy:** „Tvoja pleťová voda“ (KO.002) a „osviežujúca“ (KO.004) jsou dva samostatné produkty, ponechat oba.

## Porovnání s živým webem (9. 10. 2026, veřejné stránky `/eshop/produkt/{handle}`)
- **14 produktů se na živém webu zobrazuje s cenou, a všech 14 cen přesně odpovídá dumpu** (K05, DO.002, DO.003, KO.001–KO.004, NR.01, L004, L005, KONZ.01, EP.001, EP.002, VVV.001).
- **VVV.001 Výuka vedomého vnímania (2 600 €)** je na živém webu dostupná přímou adresou, přestože je v DB označená jako skrytá.
- **16 produktů se na živém webu nezobrazuje** (stránka vrací prázdnou šablonu „Produkt“): L001, L002, V001, V003–V007, KO.005, DO.001, MA.001, ON.001 a skryté V002, ON.002, MA.002, L003. Z toho 11 je v DB označeno jako zveřejněné. Příčinu neznám (od exportu 5. 10. mohly být staženy, nebo se zobrazují jinou adresou). **Neověřeno; k rozhodnutí Lucie/Luckyho, které produkty mají být na novém webu.**
- Nebyl nalezen žádný produkt na webu, který by v dumpu chyběl.
