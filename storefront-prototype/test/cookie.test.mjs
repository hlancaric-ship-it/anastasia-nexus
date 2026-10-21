import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NON_ESSENTIAL_COOKIES, needsCookieBanner} from '../public/cookie-consent.mjs';

test('no cookie banner while only necessary storage is used', () => {
  assert.deepEqual(NON_ESSENTIAL_COOKIES, [], 'the web must not track visitors');
  assert.equal(needsCookieBanner(), false);
});

test('the site ships no cookie banner markup', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.ok(!/cookie-banner|cookie-consent/i.test(html), 'no banner in the markup');
  const privacy = await readFile(new URL('../dist/gdpr/index.html', import.meta.url), 'utf8');
  assert.match(privacy, /Cookies/);
});
