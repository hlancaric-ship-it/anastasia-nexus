# Klub: deterministická pravidla členských období

Stav: VERIFIED pouze pro interní čistá pravidla. Není to hotové předplatné, API, trvalý model ani napojení plateb. Bez vedlejších účinků, bez sítě, bez přidělení skutečného přístupu.

Pravidla představují časově omezené členství na přesně sjednaný počet dnů v UTC, nikoli neurčitý kalendářní „měsíc“. Cenu a délku určuje schválená konfigurace; nejsou napevno zakódované obchodní částky. Částka v integer EUR centech znamená schválený CELKOVÝ výsledek autoritativního checkoutu včetně daní/slev, nikoli klientský přepočet produktové ceny. Více měn, smíšená objednávka a kalendářní měsíce zatím nejsou podporované.

`activateMembership` ověří vlastníka, produkt, variantu, sjednanou částku/měnu, úplně zachycenou nevrácenou platbu, neprovedené storno a verzi souhlasu. Období začíná skutečným časem zaplacení; opakované zpracování jej nesmí začít znovu. Budoucí integrační adaptér musí inicializaci deduplikovat unikátní vazbou členství/první objednávky; samotná čistá funkce nic neukládá.

`planRenewal` nabídne nativní checkout až při splatnosti, pokud je automatická obnova zapnutá a autoritativní přeceněný checkout stále přesně odpovídá schválené částce/měně/verzi. Jakákoli změna podmínek vyžádá kontrolu/souhlas; nic se nestrhne tiše. Výsledek obsahuje stabilní klíč členství+období. Opakovaná nebo nejasná operace požaduje dohledání existující nativní operace, nikoli další vytvoření/stržení. Integrační vrstva musí před enqueue atomicky uložit stav/klíč pod zámkem; tato knihovna sama souběh nebo idempotenci v databázi nezajišťuje.

`applyRenewalReceipt` přijme pouze platbu vázanou na aktuální klíč, stejného zákazníka/produkt/variantu a schválenou cenu. Duplicitní či opožděný již aplikovaný receipt nepřidá další období. `stopRenewal` zastaví další obnovy, nevydává se za zrušení běžící nativní platby. Rozpracovaná platba musí být nejdřív dohledaná/řešená přes Medusu, již zaplacené období se neztrácí.

DŮLEŽITÁ hranice: `Receipt` je interní vstup budoucího serverového adaptéru, není kryptografický důkaz ani přijímaný HTTP payload. Adaptér jej musí načíst z vlastních Medusa objednávek/platby a zkontrolovat immutable vazbu cart→membership→renewal key, aktuální storno/refund a jedinou členskou položku/množství. Klient nesmí poslat tyto platební údaje a tím aktivovat členství. Jedna nativní objednávka nesmí být spotřebovaná dvěma členstvími; ochranu musí zajistit trvalý model/unikátní index a transakce.

Následuje persistovaný membership model, explicitní předplatitelský souhlas a uložená platební metoda, nativní checkout/reconciliation adaptér, joby a admin obsluha. Žádný Worker Stripe Subscription bypass ani druhá účetní kniha. Nesmí se zatím napojit storefront subscription CTA. Refund/storno a dunning nejsou tímto balíkem vyřešené. Překlady zůstávají další balík dle rozhodnutí vedení.

Ověření: 32 cílených unit kontrol (vlastník, částky, částečná/vrácená platba, souhlas, UTC bez nejednoznačných dat, splatnost, změna ceny, stabilní klíč, unknown, souběhové předpoklady a replay). Plná regrese pouze CI. Žádná skutečná platba se tímto kódem neprovádí.

Finální [CI38966524123](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38966524123): backend704/704, NEXUS1230/1230, workerd139/139, MedusaHTTP151/151 PASS. [Důkaz](evidence/membership-policy-ci.json). Lokálně32/32 a backend TypeScript PASS. Rozsah ověření nenahrazuje chybějící integraci předplatného.
