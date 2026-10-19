// Browser E2E: vlastný admin → nový typ konzultácie + dostupnosť týždňa cez UI → storefront ponúka termíny tohto typu.
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence';
const ADMIN = 'http://127.0.0.1:4178', SF = 'http://127.0.0.1:4173';
const RUN = Date.now().toString(36);
const TITLE = `E2E typ admin ${RUN}`;
const WEEK = '2026-12-07';
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const results = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail) : ''); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const admin = await browser.newPage({ viewport: { width: 1360, height: 900 } });
admin.on('dialog', d => d.accept());
const errors = [];
admin.on('pageerror', e => errors.push('admin: ' + e.message.slice(0, 300)));
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
try {
  await admin.goto(ADMIN + '/');
  await admin.fill('#l-pass', process.env.E2E_ADMIN_PASSWORD);
  await admin.click('#lf button[type=submit]');
  await admin.waitForSelector('#logout', { timeout: 15000 });
  await admin.goto(ADMIN + '/#/konzultacie');
  await admin.waitForSelector('#actions .pill', { timeout: 15000 });
  const pills = await admin.locator('#actions .pill').allTextContents();
  rec('admin-konzultacie-zalozky', pills.join('|') === 'Rezervácie|Typy konzultácií|Dostupnosť', { pills });

  // Typ konzultácie
  await admin.locator('#actions .pill', { hasText: 'Typy konzultácií' }).click();
  await admin.waitForSelector('#bt-new', { timeout: 15000 });
  await admin.click('#bt-new');
  await admin.fill('#bt-title', TITLE);
  await admin.fill('#bt-desc', 'Syntetický test rezervácie.');
  await admin.fill('#bt-price', '55');
  await admin.fill('#bt-dur', '45');
  await admin.fill('#bt-buf', '15');
  await admin.click('#bt-form [type=submit]');
  await admin.waitForSelector('#view .notice', { timeout: 20000 });
  const card = admin.locator('.rc', { hasText: TITLE });
  const cardTxt = (await card.textContent()).replace(/\s+/g, ' ');
  const pid = sql(`select id from product where title='${TITLE}'`);
  const handle = sql(`select handle from product where id='${pid}'`);
  const meta = sql(`select metadata->'booking'->>'durationMinutes'||'|'||(metadata->'booking'->>'bufferMinutes')||'|'||status from product where id='${pid}'`);
  rec('admin-ui-novy-typ', /55,00/.test(cardTxt) && /45 min/.test(cardTxt) && /v ponuke/.test(cardTxt) && meta === '45|15|published', { cardTxt: cardTxt.slice(0, 160), meta });
  await shot(admin, '53-admin-typy-konzultacii');

  // Úprava ceny
  await card.click();
  await admin.waitForSelector('#bt-price');
  await admin.fill('#bt-price', '60');
  await admin.click('#bt-form [type=submit]');
  await admin.waitForSelector('#view .notice', { timeout: 20000 });
  rec('admin-ui-uprava-ceny', /60,00/.test(await admin.locator('.rc', { hasText: TITLE }).textContent()), {});

  // Dostupnosť
  await admin.locator('#actions .pill', { hasText: 'Dostupnosť' }).click();
  await admin.waitForSelector('#av-next', { timeout: 15000 });
  for (let i = 0; i < 12; i++) {
    const head = await admin.textContent('#view strong');
    if (head.startsWith('7. 12.')) break;
    await admin.click('#av-next');
    await admin.waitForFunction((h) => document.querySelector('#view strong')?.textContent !== h, head, { timeout: 15000 });
  }
  const weekHead = await admin.textContent('#view strong');
  while (await admin.locator('[data-del^="0:"]').count()) { const n = await admin.locator('[data-del^="0:"]').count(); await admin.locator('[data-del^="0:"]').first().click(); await admin.waitForFunction((n) => document.querySelectorAll('[data-del^="0:"]').length < n, n); }
  await admin.click('[data-add="0"]');
  await admin.waitForSelector('[data-r="0:0"]');
  await admin.fill('[data-r="0:0"] [data-f=start_time]', '10:00');
  await admin.fill('[data-r="0:0"] [data-f=end_time]', '12:00');
  // Chybný úsek: začiatok po konci → hláška, nič sa neuloží
  await admin.click('[data-add="2"]');
  await admin.waitForSelector('[data-r="2:0"]');
  await admin.fill('[data-r="2:0"] [data-f=start_time]', '15:00');
  await admin.fill('[data-r="2:0"] [data-f=end_time]', '14:00');
  await admin.click('#av-save');
  await admin.waitForSelector('#avmsg .err');
  const badMsg = (await admin.textContent('#avmsg')).trim();
  await admin.click('[data-del="2:0"]');
  await admin.waitForFunction(() => !document.querySelector('[data-r="2:0"]'));
  await admin.click('#av-save');
  await admin.waitForSelector('#view .notice', { timeout: 20000 });
  const av = sql(`select string_agg(date||' '||start_time||'-'||end_time, ',') from booking_availability where date between '2026-12-07' and '2026-12-13' and deleted_at is null`);
  rec('admin-ui-dostupnost-tyzdna', /^7\. 12\./.test(weekHead) && /začiatok/.test(badMsg) && /^2026-12-07 10:00(:00)?-12:00(:00)?$/.test(av) && !/2026-12-09/.test(av), { weekHead, badMsg, av });
  await shot(admin, '54-admin-dostupnost');

  // Storefront: typ je v ponuke a ponúka termíny 7. 12. (45 min v úseku 10–12, krok 30 min = 10:00, 10:30, 11:00)
  const sf = await browser.newPage({ viewport: { width: 1360, height: 900 }, locale: 'sk-SK' });
  sf.on('pageerror', e => errors.push('sf: ' + e.message.slice(0, 300)));
  await sf.goto(SF + '/konzultacie/rezervacia');
  await sf.waitForSelector('#booking-view [data-booking-type], #booking-view .booking-slot', { timeout: 30000 });
  const listed = await sf.locator(`[data-booking-type="${handle}"]`).count();
  await sf.goto(`${SF}/konzultacie/rezervacia?typ=${handle}`);
  await sf.waitForSelector('#booking-view .booking-slot, #booking-view .empty-state', { timeout: 30000 });
  for (let i = 0; i < 4 && !(await sf.locator('.booking-slot[data-slot^="2026-12-07"]').count()); i++) {
    const nx = sf.locator('[data-booking-next]'); if (!(await nx.count())) break;
    const before = await sf.textContent('.booking-range').catch(() => '');
    await nx.click();
    await sf.waitForFunction((b) => { const t = document.querySelector('.booking-range')?.textContent || ''; return (t && t !== b) || !!document.querySelector('#booking-view .empty-state'); }, before, { timeout: 30000 });
  }
  const dec7 = await sf.locator('.booking-slot[data-slot^="2026-12-07"]').evaluateAll(b => b.map(x => x.textContent.trim()));
  const head = (await sf.textContent('.booking-head')).replace(/\s+/g, ' ');
  rec('storefront-ponuka-z-adminu', listed === 1 && dec7.join(',') === '10:00,10:30,11:00' && /45 minút/.test(head) && /60,00/.test(head), { listed, dec7, head: head.slice(0, 120) });
  await shot(sf, '55-storefront-termin-z-adminu');

  // Archivácia → typ zmizne z webu
  await admin.locator('#actions .pill', { hasText: 'Typy konzultácií' }).click();
  await admin.waitForSelector('#bt-new');
  await admin.locator('.rc', { hasText: TITLE }).click();
  await admin.click('#bt-arch');
  await admin.waitForSelector('#view .notice', { timeout: 20000 });
  await sf.goto(SF + '/konzultacie/rezervacia');
  await sf.waitForSelector('#booking-view [data-booking-type], #booking-view .booking-slot, #booking-view .empty-state, #booking-view [data-state]', { timeout: 30000 });
  await sf.waitForTimeout(500);
  rec('admin-ui-archivacia-skryje-typ', await sf.locator(`[data-booking-type="${handle}"]`).count() === 0 && sql(`select status from product where id='${pid}'`) === 'draft', {});
} catch (e) {
  rec('chyba', false, { message: e.message.split('\n')[0] });
  await shot(admin, 'admin-booking-setup-chyba').catch(() => {});
} finally {
  writeFileSync(`${OUT}/e2e-admin-booking-setup.json`, JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2));
  console.log('errors:', errors.slice(0, 6));
  await browser.close();
}
