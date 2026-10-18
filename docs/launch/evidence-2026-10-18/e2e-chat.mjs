// Browser E2E č. 8: účet zákazníčky z backendu (bez ukážkových dát) + chat storefront ↔ admin Správy (odpoveď, e-mail, uzavretie).
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence', ADMIN = 'http://127.0.0.1:4178', SF = 'http://127.0.0.1:4173';
const RUN = Date.now().toString(36);
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const results = [], errors = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail).slice(0, 400) : ''); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const DEMO = /2026-0142|demo@example\.test|demo-workbook|Zápis z konzultácie/;
async function customerPage(email) {
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'sk-SK' })).newPage();
  page.on('pageerror', e => errors.push(`${email}: ${e.message.slice(0, 300)}`));
  page.on('response', r => { const u = new URL(r.url()); if (u.port === '9100' && r.status() >= 400) errors.push(`${r.request().method()} ${u.pathname}${u.search.slice(0, 120)} ${r.status()}`); });
  await page.goto(SF + '/prihlasenie'); await page.fill('#login-form [name=email]', email); await page.click('#login-form [type=submit]');
  await page.waitForFunction(() => document.querySelector('#login-form .form-status')?.textContent.trim().length > 0); await page.waitForTimeout(2000);
  const link = new URL(sql(`select data->>'url' from notification where template='magic-link-sk' and data->>'url' like '%${encodeURIComponent(email)}%' order by created_at desc limit 1`));
  await page.goto(SF + link.pathname + link.search);
  await page.waitForFunction(() => /Vitajte/.test(document.querySelector('#magic-confirm')?.textContent || ''), null, { timeout: 15000 });
  return page;
}
const txt = async (p, s) => ((await p.textContent(s)) || '').replace(/\s+/g, ' ').trim();
try {
  // 0) Bez prihlásenia: účet nič nevymýšľa
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(SF + '/ucet'); await anon.waitForSelector('.customer-center .empty-state', { timeout: 15000 });
  const anonTxt = await txt(anon, '.customer-center');
  rec('ucet-bez-prihlasenia', !DEMO.test(anonTxt) && /Pre zobrazenie účtu sa prihláste/.test(anonTxt));

  // A) Zákazníčka s objednávkou a potvrdenou konzultáciou
  const row = sql(`select c.id||'|'||c.email from booking b join customer c on c.id=b.customer_id where b.status='confirmed' and b.deleted_at is null and exists(select 1 from "order" o where o.customer_id=c.id and o.status not in ('canceled','draft')) order by (select count(*) from notification n where n.template='magic-link-sk' and n."to"=c.email and n.created_at > now() - interval '15 minutes'), b.starts_at desc limit 1`).split('|');
  const [cusId, email] = row;
  const displayIds = sql(`select string_agg(display_id::text, ',') from "order" where customer_id='${cusId}'`).split(',');
  const bookingTitle = sql(`select p.title from booking b join product p on p.id=b.product_id where b.customer_id='${cusId}' and b.status='confirmed' order by b.starts_at desc limit 1`);
  const p = await customerPage(email);
  await p.goto(SF + '/ucet#objednavky');
  await p.waitForFunction(() => !/Načítavam/.test(document.querySelector('#center-orders')?.textContent || 'Načítavam'), null, { timeout: 20000 });
  const orders = await txt(p, '#center-orders');
  await p.screenshot({ path: `${OUT}/70-ucet-objednavky.png`, fullPage: true });
  await p.goto(SF + '/ucet#konzultacie');
  await p.waitForFunction(() => !/Načítavam/.test(document.querySelector('#center-bookings')?.textContent || 'Načítavam'), null, { timeout: 20000 });
  const bookings = await txt(p, '#center-bookings');
  await p.screenshot({ path: `${OUT}/71-ucet-konzultacie.png`, fullPage: true });
  console.log('me', JSON.stringify(await p.evaluate(async () => { const c = globalThis.__ANASTASIA_CONFIG__; const r = await fetch((c.backendUrl || c.medusaUrl || 'http://127.0.0.1:9100') + '/store/customers/me?fields=first_name,last_name,email,phone,metadata', { headers: { authorization: 'Bearer ' + sessionStorage.getItem('anastasia.jwt'), 'x-publishable-api-key': c.publishableKey } }); return [r.status, (await r.text()).slice(0, 200), Object.keys(c)]; })));
  console.log('dbg', JSON.stringify(await p.evaluate(() => ({ name: document.querySelector('#center-name')?.textContent, f: [...document.querySelector('#center-profile').elements].map(x => x.name + '=' + x.value).slice(0, 5) }))));
  await p.goto(SF + '/ucet#profil'); await p.waitForFunction(() => document.querySelector('#center-profile [name=email]')?.value, null, { timeout: 20000 });
  const profEmail = await p.inputValue('#center-profile [name=email]');
  const whole = await txt(p, '.customer-center');
  rec('ucet-realne-data', !DEMO.test(whole) && displayIds.some(id => orders.includes(id)) && bookings.includes(bookingTitle) && profEmail === email,
    { orders: orders.slice(0, 160), bookings: bookings.slice(0, 160), bookingTitle, profOk: profEmail === email });

  // B) Chat: zákazníčka píše
  await p.goto(SF + '/ucet#chat'); await p.waitForSelector('#chat-form');
  const msg = `E2E otázka ${RUN}: ako dlho trvá doručenie?`;
  await p.fill('#chat-body', msg);
  await p.waitForFunction(() => !document.querySelector('#chat-form button[type=submit]').disabled, null, { timeout: 15000 });
  await p.click('#chat-form button[type=submit]');
  await p.waitForFunction(() => /pridaná|nepodarilo|nedostupný|dostupný po/.test(document.querySelector('#chat-form .form-status')?.textContent || ''), null, { timeout: 15000 });
  const sent = await txt(p, '#chat-form .form-status');
  await p.waitForFunction((m) => (document.querySelector('#chat-messages')?.textContent || '').includes(m), msg, { timeout: 15000 }).catch(() => {});
  const thread1 = await txt(p, '#chat-messages');
  rec('chat-zakaznicka-odoslala', /pridaná/.test(sent) && thread1.includes(msg), { sent });

  // C) Nespôsobilá zákazníčka (bez nákupu) nemôže písať
  const fresh = await customerPage(`e2e.chat.bez.nakupu.${RUN}@example.com`);
  await fresh.goto(SF + '/ucet#chat'); await fresh.waitForFunction(() => document.querySelector('#chat-availability')?.textContent.trim().length > 0, null, { timeout: 15000 });
  await fresh.fill('#chat-body', 'test');
  rec('chat-nespôsobila-blokovana', /po nákupe/.test(await txt(fresh, '#chat-availability')) && await fresh.isDisabled('#chat-form button[type=submit]'), { av: await txt(fresh, '#chat-availability') });

  // D) Admin Správy: vidí, odpovie
  const a = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  a.on('dialog', d => d.accept()); a.on('pageerror', e => errors.push('admin: ' + e.message.slice(0, 300)));
  await a.goto(ADMIN + '/'); await a.fill('#l-pass', process.env.E2E_ADMIN_PASSWORD); await a.click('#lf button[type=submit]'); await a.waitForSelector('#logout');
  await a.goto(ADMIN + '/#/spravy');
  const card = a.locator('.rc', { hasText: email }).first();
  await card.waitFor({ timeout: 15000 }).catch(async () => { const first = a.locator('.rc').first(); await first.waitFor({ timeout: 5000 }); });
  const cardTxt = (await (await card.count() ? card : a.locator('.rc').first()).textContent()).replace(/\s+/g, ' ');
  await (await card.count() ? card : a.locator('.rc').first()).click();
  await a.waitForSelector('#c-thread');
  const adminThread = await txt(a, '#c-thread');
  rec('admin-vidi-spravu', adminThread.includes(msg) && /neprečítan|●/.test(cardTxt), { cardTxt: cardTxt.slice(0, 160) });
  const reply = `E2E odpoveď ${RUN}: zvyčajne do 3 pracovných dní.`;
  await a.fill('#c-body', reply); await a.click('#c-reply button[type=submit]');
  await a.waitForFunction(() => /odoslaná/.test(document.querySelector('#cmsg')?.textContent || ''), null, { timeout: 15000 });
  await a.screenshot({ path: `${OUT}/72-admin-sprava-odpoved.png`, fullPage: true });
  await a.waitForTimeout(3000);
  const mail = sql(`select template from notification where "to"='${email}' and template like '%chat%' order by created_at desc limit 1`);
  rec('admin-odpoved-a-email', /chat/.test(mail), { mail });

  // E) Zákazníčka vidí odpoveď
  await p.reload();
  await p.waitForFunction((r) => (document.querySelector('#chat-messages')?.textContent || '').includes(r), reply, { timeout: 20000 });
  const thread2 = await txt(p, '#chat-messages');
  rec('zakaznicka-vidi-odpoved', /Lucia/.test(thread2) && thread2.includes(reply));
  await p.screenshot({ path: `${OUT}/73-ucet-chat-odpoved.png`, fullPage: true });

  // F) Admin uzavrie; zákazníčka do uzavretej nenapíše
  await a.click('[data-act="close"]'); await a.waitForFunction(() => /uzavretá/.test(document.querySelector('#cmsg')?.textContent || ''), null, { timeout: 15000 });
  await p.reload(); await p.waitForFunction((r) => (document.querySelector('#chat-messages')?.textContent || '').includes(r), reply, { timeout: 20000 });
  await p.fill('#chat-body', 'Ešte jedna otázka'); await p.waitForTimeout(500);
  if (!(await p.isDisabled('#chat-form button[type=submit]'))) await p.click('#chat-form button[type=submit]');
  await p.waitForFunction(() => (document.querySelector('#chat-form .form-status')?.textContent || '').trim().length > 0, null, { timeout: 15000 });
  rec('uzavreta-konverzacia', /uzavretá/.test(await txt(p, '#chat-form .form-status')), { st: await txt(p, '#chat-form .form-status') });
} catch (e) { rec('chyba', false, { message: e.message.split('\n')[0], at: e.stack.split('\n').find(l => l.includes('e2e-chat')) }); }
finally { writeFileSync(`${OUT}/e2e-chat.json`, JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2)); console.log('pageerrors', errors); await browser.close(); }
