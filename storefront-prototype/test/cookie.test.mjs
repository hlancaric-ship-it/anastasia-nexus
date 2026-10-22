import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// r19: web má lištu cookies (prvá vrstva) + panel nastavení + odkaz v pätičke.
test('markup obsahuje lištu cookies aj panel nastavení', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="cookie-banner"'), 'lišta cookies je v markupu');
  assert.ok(html.includes('id="cookie-settings"'), 'panel nastavení je v markupu');
  assert.match(html, /<a href="\/cookies" data-cookie-settings>/, 'odkaz na nastavenia cookies je v pätičke');
  const privacy = await readFile(new URL('../dist/gdpr/index.html', import.meta.url), 'utf8');
  assert.match(privacy, /Cookies/);
});

test('pred rozhodnutím sa nenačíta žiadny skript tretej strany', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const external = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]).filter(src => /^https?:/.test(src));
  assert.deepEqual(external, [], 'externý skript sa nesmie načítať v HTML');
});
