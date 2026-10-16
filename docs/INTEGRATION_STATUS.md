# Ověřený integrační balík — 15. 10. 2026

Aktualizace 16. 10. 2026: [šest navazujících ověřených backendových balíků a zbývající kroky plánu](AUTONOMY_PROGRESS.md). Následující součty jsou historický integrační běh z 15. 10.

Stav: VERIFIED pro sjednocení větví a popsané opravy. PR #9 sloučen do master, commit 78214ae. Backend, NEXUS i storefront mají stejný git tree jako ověřený kandidát 62395d3. Bez nasazení.

Tento záznam aktualizuje předběžné stavy z backend/docs/wp/unified-integration.md, nexus-cart-auth.md a intent-claim-safety.md. Ty popisují implementaci a průběh před dokončením CI; rozhodující finální důkaz je zde a v evidence/unified-integration-20261015.json.

## Výsledek

- Backend unit: 544/544 PASS, TypeScript PASS.
- NEXUS: 1188/1188 PASS, TypeScript PASS.
- Skutečný workerd a D1: 56/56 PASS včetně 10 nových kontrol stavů/izolace, TypeScript PASS.
- Izolované HTTP + PostgreSQL: 132/132 scénářů PASS (Medusa 2.19, Worker handler v Node; skutečný workerd je ověřen zvlášť).
- Storefront: 26/26 Node testů (mock, navigace, zvuk), 27/27 skupin browser.mjs, všech 59 stránek a interní odkazy. Pro lokální kontrolu byly doplněny již dodané obrazové/video soubory z existujícího worktree do ignorovaného dist; nevolalo se produkční API.

[GitHub Actions 38788629533](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38788629533). Předchozí běh 38787876085 záměrně odhalil chybu pořadí middleware; neopomíjí se jako zelený důkaz.

## Co se spojilo a opravilo

Zahrnuté větve a výjimky jsou v backend/docs/wp/unified-integration.md. Zachována autentizace magic linků, omezení kupónů, právní souhlasy, účetní základy a commitnuté návrhy storefrontu/adminu. Necommitnuté cizí rozpracované změny zůstávají ve svých worktree. PR #7 s reprodukcemi zranitelností zůstává oddělený.

Vlastní NEXUS košík i checkout vyžadují přihlášení a přesného vlastníka. Cizí či nepřiřazený košík se nemění. Kontrola souhlasu v custom checkoutu následuje až po ověření přístupu. HTTP nákupy nyní používají skutečnou syntetickou zákaznici a nativní přiřazení košíku, negativní anonymní sondy zůstaly zachovány.

D1 ExecutionIntentStore nyní odvozuje povolené spuštění z kanonického stavového automatu. UNKNOWN nelze znovu spustit naslepo; nejprve se musí ověřit skutečný výsledek. Paralelní pokusy po prokázaném neprovedení mají jediného vítěze.

## Co tím není dokončeno

Celý NEXUS zůstává PARTIAL vůči docs/NEXUS_AUTONOMY_SPEC.md. Účetní adaptéry jsou základ, admin je návrh, storefront běží nad mockem. Není zde prokázané plné napojení dopravců, účetnictví, dobírkové historie ani autonomní provoz všech obchodních procesů.

Další backend balík: zapojení existujících trvalých ExecutionIntent do konkrétního runtime toku, s ověřením výsledku, obnovou po pádu a viditelnou eskalací. Před přidáním obecného runneru je nutné vyřešit deadline/lease běžící operace a bezpečné atomické dokončení pokusu. Nejisté vnější zápisy se nesmí automaticky opakovat.
