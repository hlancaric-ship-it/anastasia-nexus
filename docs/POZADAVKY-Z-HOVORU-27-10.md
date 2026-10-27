# Požadavky Lucie z hovoru 27. 10. 2026 a návrh řešení

Stav: zadání, návrh a odhad. Nad rámec Fáze 1 se dělá po jejím písemném schválení (čl. 6 odst. 9 smlouvy, postačí e-mail).

## Hotovo dnes
| Požadavek | Stav |
|---|---|
| Osobní odběr je lékárna (Lekáreň ANASTASIA, Vyšná Slaná 259, 049 26 Vyšná Slaná) | hotovo a nasazeno |
| QR kód na bankovní účet (PAY by square, SPAYD) | hotovo a nasazeno, ověřeno objednávkou č. 65, v aplikaci banky neověřeno |
| Upozornění na objednávky, kontakt a chat chodí Lucii | hotovo |

## Nové požadavky a návrh

### 1. Faktura k objednávce
- PDF faktura (u nezaplaceného převodu „Zálohová faktúra“), číslo `FA` + rok + číslo objednávky na 6 míst.
- Prodejce LUCRAT spol. s r.o. (IČO 36652164, DIČ 2022216372, IČ DPH SK2022216372, Sokolská 1646/88, 960 01 Zvolen), účet Tatra banka.
- Zákazník ji dostane v potvrzovacím e-mailu po zaplacení, ke stažení v účtu a Lucia v administraci u objednávky.
- Technicky: `pdf-lib` s vloženým fontem (jako poukaz). Odhad 3 až 4 hodiny.
- Potřebujeme od Lucie: číslování (souvislá řada), sazby DPH, texty (doba splatnosti, poznámky), zda chce razítko a podpis.

### 2. Šablona newsletteru podle Lucie
- Nastavení „Vzhľad newslettera“ v administraci: font (nabídka), barvy, logo, hlavička, patička, tlačítka.
- Stejné vykreslení v náhledu i v odeslaném e-mailu.
- Potřebujeme od Lucie: font, barvy a logo, které chce. Odhad 3 až 4 hodiny.

### 3. Videa u produktu
- Lucia nahraje video k produktu (nebo vloží odkaz), na detailu se ukáže přehrávač.
- Dnes se do knihovny médií nahrávají jen obrázky. Přidat MP4 a WebM (limit velikosti) do soukromého úložiště s přehráním přes doručovací službu, nebo vložit odkaz na hostované video.
- Odhad 4 až 6 hodin. Pozor na místo v úložišti a na velikost souborů, doporučujeme limit 200 MB.

### 4. Videa v newsletteru
- E-mailové programy video nepřehrají, proto do e-mailu patří náhledový obrázek s tlačítkem „Prehrať“ vedoucí na stránku s videem.
- Součástí návrhu 3 a 5. Odhad 2 hodiny.

### 5. Stránka „Novinky“
- Nová stránka na webu: příspěvky (nadpis, obrázek, text, video), seznam a detail, Lucia je přidává v administraci.
- Odkaz z menu a z úvodu. Newsletter lze z příspěvku odeslat jedním tlačítkem.
- Odhad 8 až 10 hodin (včetně administrace).

### 6. Reklamní plocha na prodej cizím lidem
- Nápad: boční výsuvné okno (jako panel zprava) uvnitř Novinek, které se vysune po scrollu nebo po chvíli, nenaruší čtení a jde zavřít.
- Správa v administraci: kampaň (obrázek nebo video, odkaz, platnost od do, text „Reklama“), počet zobrazení a kliků.
- Právní poznámka: označení „Reklama“ a souhlas s cookies u sledování. Cena a podmínky pro inzerenty jsou věc Lucie.
- Odhad 6 až 8 hodin.

## Doporučené pořadí
1. Faktura (zákon a každá objednávka ji potřebuje).
2. Šablona newsletteru (bez ní newsletter neposílat).
3. Novinky s videem.
4. Videa u produktu.
5. Reklamní plocha.

## Otevřené otázky pro Lucii
1. Faktura: číslování, DPH, texty, razítko.
2. Newsletter: font, barvy, logo.
3. Video: nahrávat soubory, nebo vkládat odkazy na YouTube a Vimeo?
4. Novinky: kdo píše a jak často, kolik příspěvků na stránce?
5. Reklama: kdo ji kupuje, co je cenově a obsahově povoleno, jak se vyúčtuje?
