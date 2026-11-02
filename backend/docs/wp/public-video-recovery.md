# Obnova veřejných videí — 2026-11-02

Příčina: nové worktree neobsahovalo gitignored `storefront-prototype/public/media`. Nasazený `dist` proto postrádal MP4/WebM i další veřejná média. Ověřeno přímo v uživatelově Chrome: hero a night-sky vracely 404 text/html a video readyState0.

Obnova: do kopie aktuálního integračního dist doplněno pouze chybějících39souborů ze starého release/public/media. Stávající soubory nepřepisovány; SHA256 index.html zachován. Nasazen pouze test worker `anastasia-test-web`, verze `bf183ae7-74e9-42e6-88f4-7827ee9d65ee`. Reálný Chrome po reloadu: hero1920×1080 i night-sky1280×720 readyState4, oba playing:true. SMOKE_OK. Koordinátor A následně doplnil i své public/media a dist/media (39souborů), aby další deploy obnovu nezrušil.

Prevence: build před mazáním/generováním dist vyžaduje kompletní manifest základních veřejných videí, posterů a ambientu; chybějící, prázdný nebo adresář místo souboru build odmítne. Wrangler testweb deploy má navíc kontrolu zdrojové i finální složky médií. Spouštět z kořene repozitáře jako dosud (`wrangler deploy --config ops/test-predani/web.wrangler.jsonc`). Média zůstávají mimo Git; nové worktree je musí převzít z dodaných podkladů, guard už neumožní jejich tiché vynechání.

Ověření: `node --test storefront-prototype/test/edge-worker.test.mjs storefront-prototype/test/media-manifest.test.mjs` 5/5PASS; manifest reálných zdrojových i dist médiíPASS; `wrangler deploy --dry-run --config ops/test-predani/web.wrangler.jsonc` PASS včetně custom checku; `bash ops/test-predani/deploy.sh --smoke` SMOKE_OK. Při přípravě custom hooku byla opravena relativní pracovní cesta dle skutečného běhu Wrangleru; finální dryrun prošel. Žádný zásah do backendu ani produkčních domén.
