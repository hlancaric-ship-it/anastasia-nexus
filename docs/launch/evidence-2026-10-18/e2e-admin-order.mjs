// Browser E2E č. 3: admin → objednávka z E2E nákupu → príprava → odoslanie → (capture) → čiastočná refundácia cez Stripe.
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence';
const ADMIN = 'http://127.0.0.1:4178';
const { order } = JSON.parse(readFileSync(`${OUT}/order.json`, 'utf8'));
const [orderId] = order.split('|');
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const results = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail) : ''); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
page.on('dialog', d => d.accept());
const api = [];
page.on('response', r => { const u = r.url(); if (u.includes(':9100/admin/') && r.request().method() !== 'GET') api.push(`${r.request().method()} ${new URL(u).pathname} ${r.status()}`); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const notice = async () => { await page.waitForSelector('#omsg .notice, #omsg .err', { timeout: 30000 }); return (await page.textContent('#omsg')).trim(); };

try {
  await page.goto(ADMIN + '/');
  await page.fill('#l-pass', process.env.E2E_ADMIN_PASSWORD);
  await page.click('#lf button[type=submit]');
  await page.waitForSelector('#logout', { timeout: 15000 });
  await page.goto(ADMIN + '/#/objednavky');
  await page.click(`.rc[data-id="${orderId}"]`, { timeout: 15000 });
  await page.waitForSelector('#o-back');
  const prehlad = (await page.textContent('[data-pane="p"]')).replace(/\s+/g, ' ');
  rec('admin-detail-objednavky', /59,00/.test(prehlad) && /Testovacia 12/.test(prehlad) && /Kuriér/.test(prehlad), { prehlad: prehlad.slice(0, 300) });
  await shot('20-admin-objednavka');

  await page.click('[data-tab="o"]'); await page.click('#o-ful');
  rec('priprava-na-odoslanie', /pripravené/.test(await notice()));
  await page.click('[data-tab="o"]');
  await page.fill('[data-trk]', 'Z123456789'); await page.fill('[data-trkurl]', 'https://tracking.example.com/Z123456789');
  await page.click('[data-ship]');
  rec('oznacenie-odoslania', /odoslaná/.test(await notice()));
  const ful = sql(`select o.id from "order" o where o.id='${orderId}'`) && sql(`select string_agg(f.shipped_at is not null||'',',') from order_fulfillment of join fulfillment f on f.id=of.fulfillment_id where of.order_id='${orderId}'`);
  const mail = sql(`select count(*) from notification where template ilike '%ship%' and "to" = (select email from "order" where id='${orderId}')`);
  rec('odoslanie-v-db-a-email', ful === 'true' && Number(mail) > 0, { shipped: ful, shipmentMails: mail });

  await page.click('[data-tab="pl"]');
  if (await page.$('[data-cap]')) { await page.click('[data-cap]'); rec('capture', /prijatá/.test(await notice())); await page.click('[data-tab="pl"]'); }
  const before = (await page.textContent('[data-pane="pl"]')).replace(/\s+/g, ' ');
  await page.fill('[data-refamt]', '10');
  await page.click('[data-ref]');
  const refMsg = await notice();
  await page.click('[data-tab="pl"]');
  const after = (await page.textContent('[data-pane="pl"]')).replace(/\s+/g, ' ');
  const refunds = sql(`select string_agg(r.amount::text,',') from refund r join payment p on p.id=r.payment_id join order_payment_collection opc on opc.payment_collection_id=p.payment_collection_id where opc.order_id='${orderId}'`);
  rec('refundacia-10-eur', /bolo odoslané/.test(refMsg) && /vrátené 10,00/.test(after) && refunds === '10', { refMsg, before: before.slice(0, 160), after: after.slice(0, 160), refunds });
  await shot('21-admin-refund');
  const stat = sql(`select payment_status||'|'||fulfillment_status from (select id from "order" where id='${orderId}') o, lateral (select 1) x, lateral (select '' as payment_status, '' as fulfillment_status) y`);
  void stat;
} catch (e) {
  rec('chyba', false, { message: e.message.split('\n')[0] });
  await shot('admin-order-chyba').catch(() => {});
} finally {
  writeFileSync(`${OUT}/e2e-admin-order.json`, JSON.stringify({ at: new Date().toISOString(), orderId, results, api, consoleErrors }, null, 2));
  console.log('API:', api.join(' | '));
  console.log('console:', consoleErrors.slice(0, 6));
  await browser.close();
}
