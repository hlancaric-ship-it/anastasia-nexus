// Browser E2E: kontaktný formulár → e-mail správkyni (notifikácia contact-form-admin), pasca na robotov, limit;
// newsletter v pätičke → súhlas uložený s aktuálnou verziou textu.
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence';
const SF = 'http://127.0.0.1:4173', API = 'http://localhost:9100';
const RUN = Date.now().toString(36);
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const results = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail) : ''); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message.slice(0, 300)));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });
const notif = () => Number(sql(`select count(*) from notification where template='contact-form-admin'`));
try {
  // Limit zdieľa tabuľku s poukazmi – vyčistiť len kontaktné záznamy z lokálnej adresy nejde (hash), preto stačí čerstvé okno.
  // Čerstvé okno limitu pre lokálne adresy (syntetická DB).
  for (const a of ['127.0.0.1','::1','::ffff:127.0.0.1']) sql(`delete from gift_voucher_rate_limit where subject = encode(sha256(convert_to('contact-form:${a}','UTF8')),'hex')`);
  const before = notif();
  await page.goto(SF + '/kontakt/');
  await page.waitForSelector('#contact-form');
  const trapBox = await page.locator('.contact-trap').boundingBox();
  const trapVisible = !!trapBox && trapBox.x + trapBox.width > 0;
  await page.fill('#contact-form [name=name]', `E2E Kontakt ${RUN}`);
  await page.fill('#contact-form [name=email]', `e2e-kontakt-${RUN}@example.com`);
  await page.selectOption('#contact-form [name=subject]', 'Konzultácia');
  await page.fill('#contact-form [name=message]', 'Dobrý deň, syntetická správa z E2E testu.\nDruhý riadok.');
  await page.check('#contact-form [name=consent]');
  await page.click('#contact-form button[type=submit]');
  await page.waitForFunction(() => /Ďakujeme|nepodarilo|nedostupný|Skontrolujte/.test(document.querySelector('#contact-form .form-status').textContent), null, { timeout: 20000 });
  const status = await page.textContent('#contact-form .form-status');
  await page.locator('#contact-form').scrollIntoViewIfNeeded(); await shot('58-sf-kontakt-odoslane');
  const row = sql(`select "to"||'|'||(data->>'name')||'|'||(data->>'topic')||'|'||status from notification where template='contact-form-admin' order by created_at desc limit 1`);
  const cleared = await page.inputValue('#contact-form [name=message]');
  rec('kontakt-odoslanie', /Ďakujeme/.test(status) && notif() === before + 1 && row === `lucia@anastasia.local|E2E Kontakt ${RUN}|Konzultácia|success` && cleared === '' && !trapVisible, { status, row, trapVisible });

  const post = (body) => fetch(API + '/store/contact', { method: 'POST', headers: { 'content-type': 'application/json', 'x-publishable-api-key': process.env.PK }, body: JSON.stringify(body) }).then(async r => ({ s: r.status, b: await r.json() }));
  const base = { name: 'E2E', email: `e2e-kontakt-${RUN}@example.com`, subject: 'Iná otázka', message: 'Syntetická správa, test limitu.', consent: true };
  const bad = await post({ ...base, consent: false });
  const n1 = notif();
  const spam = await post({ ...base, website: 'http://spam.example' });
  rec('kontakt-validacia-a-pasca', bad.s === 400 && /súkromí/.test(bad.b.message) && spam.s === 200 && notif() === n1, { bad: bad.s, spam: spam.s });
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await post(base)).s);
  rec('kontakt-limit', codes.indexOf(429) > 0 && codes.indexOf(429) <= 5 && codes.slice(codes.indexOf(429)).every(c => c === 429), { codes });

  // Newsletter
  const mail = `e2e-news-${RUN}@example.com`;
  await page.goto(SF + '/');
  const form = page.locator('form[data-newsletter]').first();
  await form.scrollIntoViewIfNeeded();
  const consentTxt = await page.locator('.newsletter-consent').first().textContent();
  await form.locator('[name=email]').fill(mail);
  await form.locator('button').click();
  await page.waitForFunction(() => (document.querySelector('.newsletter-status')?.textContent || '').length > 0, null, { timeout: 20000 });
  const nstatus = await page.locator('.newsletter-status').first().textContent();
  await shot('59-sf-newsletter');
  const nrow = sql(`select status||'|'||source||'|'||(text_version = '${execFileSync('zsh', ['-c', "grep '^NEWSLETTER_CONSENT_VERSION=' /Users/lucky/anastasia-nexus-claude-integration/backend/.env | cut -d= -f2-"]).toString().trim()}') from newsletter_consent where email='${mail}'`);
  rec('newsletter-suhlas-ulozeny', /Ďakujeme/.test(nstatus) && nrow === 'subscribed|footer|true' && /Odhlásiť sa môžete/.test(consentTxt), { nstatus, nrow });
} catch (e) {
  rec('exception', false, { message: e.message.slice(0, 400) });
  await shot('58-fail').catch(() => {});
} finally {
  console.log('errors:', JSON.stringify(errors));
  writeFileSync(`${OUT}/e2e-contact-newsletter.json`, JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2));
  await browser.close();
}
