// Browser E2E: kolekcia na úvode = produkty z backendu, pridanie do košíka.
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const b = await chromium.launch({ channel: 'chrome', headless: true }); const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:4173/'); await p.waitForSelector('.kol-track[data-ready]', { timeout: 15000 });
const cards = await p.$$eval('.kol-track > *', cs => cs.map(c => ({ f: [...c.querySelectorAll('.sc-interp')].slice(1, 5).map(x => x.textContent), add: c.querySelector('[data-add]')?.dataset.add })));
const published = sql(`select string_agg(title, '|') from product where status='published' and deleted_at is null`).split('|');
await p.locator('.kol-track [data-add]').first().scrollIntoViewIfNeeded(); await p.locator('.kol-track [data-add]').first().click(); await p.waitForTimeout(2500);
const count = await p.textContent('.cart-count');
await p.screenshot({ path: 'evidence/74-uvod-kolekcia.png' });
const ok = cards.length > 0 && cards.every(c => published.includes(c.f[3]) && /€/.test(c.f[2]) && c.add) && count === '1' && !errs.length;
console.log(ok ? 'PASS' : 'FAIL', 'uvod-kolekcia-z-backendu', JSON.stringify({ cards, count, errs }));
writeFileSync('evidence/e2e-home.json', JSON.stringify({ at: new Date().toISOString(), ok, cards, count, errs }, null, 2));
await b.close();
