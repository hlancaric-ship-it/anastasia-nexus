import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpApi} from '../src/lib/api/http.mjs';
import {createMockApi} from '../src/lib/api/mock.mjs';
import {
  orderedMetrics,
  renderAccessNotice,
  renderEmptyJournal,
  renderJournalForm,
  renderJournalTable,
  renderProgram,
} from '../public/reset-zone.mjs';

const CONFIG = { apiBaseUrl: 'http://api.test', publishableKey: 'pk_test', regionId: 'reg_test' };
const memoryStorage = (seed = {}) => {
  const map = new Map(Object.entries(seed));
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
};

const apiWith = (handler, storage = memoryStorage({ 'anastasia.jwt': 'jwt' })) => {
  const calls = [];
  const api = createHttpApi(storage, CONFIG);
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const { status = 200, data = {} } = (await handler(String(url), init)) || {};
    return { ok: status >= 200 && status < 300, status, json: async () => data };
  };
  return { api, calls, restore: () => { globalThis.fetch = original; } };
};

const METRICS = [
  { key: 'energia', label: 'Energia', min: 1, max: 10, order: 10 },
  { key: 'spanok', label: 'Spánok', min: 1, max: 10, order: 20 },
];

test('Zrkadielko: prázdny stav bez záznamov', () => {
  const html = renderEmptyJournal();
  assert.match(html, /Zrkadielko zatiaľ nemá záznamy/);
  assert.match(html, /Pridajte prvý záznam/);
});

test('Zrkadielko: stĺpce pochádzajú z metrík API, poradie podľa order', () => {
  assert.deepEqual(orderedMetrics([{ key: 'b', order: 20 }, { key: 'a', order: 10 }]).map(m => m.key), ['a', 'b']);
  const html = renderJournalTable(METRICS, [{ id: 'rje_1', week: 3, date: '2026-10-12', metrics: { energia: 7, spanok: 5 } }]);
  assert.match(html, /Dátum/);
  assert.match(html, /Týždeň/);
  assert.match(html, /Energia/);
  assert.match(html, /Spánok/);
  assert.ok(!/Stres/.test(html), 'stĺpce sa neodvádzajú z pevného zoznamu');
  assert.match(html, /12\. 10\. 2026/);
  assert.match(html, /data-reset-edit="rje_1"/);
  assert.match(html, /data-reset-delete="rje_1"/);
});

test('Zrkadielko: formulár má hodnotenie 1–10 pre každú metriku z API', () => {
  const html = renderJournalForm(METRICS, { weeks: [{ week: 1 }, { week: 2 }] });
  assert.match(html, /name="date"/);
  assert.match(html, /Týždeň 2/);
  assert.match(html, /data-metric="energia"/);
  assert.match(html, /data-metric="spanok"/);
  assert.ok(!/data-metric="stres"/.test(html));
  const values = [...html.matchAll(/data-reset-value="(\d+)"/g)].map(m => Number(m[1]));
  assert.ok(values.includes(1) && values.includes(10), 'škála 1–10');
});

test('Program: 16 týždňov, vstupný dotazník a jemný stav bez obsahu', () => {
  const program = { total_weeks: 16, entry_questionnaire_url: 'https://tally.so/r/440GBr', weeks: [{ week: 1, days: [{ day: 2, label: '2. deň', materials: [] }] }], final_summary: { title: 'Záverečné zhrnutie', materials: [] } };
  const html = renderProgram(program);
  assert.match(html, /Vyplňte prosím vstupný dotazník/);
  assert.match(html, /href="https:\/\/tally\.so\/r\/440GBr" target="_blank"/);
  assert.match(html, /Týždeň číslo 1/);
  assert.match(html, /2\. deň/);
  assert.match(html, /Obsah pripravujeme/);
  assert.match(html, /Záverečné zhrnutie/);
});

test('Bez prístupu: 401 = prihlásenie, 403 = kúpiť program', () => {
  const login = renderAccessNotice({ status: 401, message: 'Pre prístup k Zrkadielku sa prihláste.' });
  assert.match(login, /data-reset-status="401"/);
  assert.match(login, /href="\/prihlasenie"/);
  const forbidden = renderAccessNotice({ status: 403, message: 'Zrkadielko je dostupné len zákazníkom s programom RESET 40+.' });
  assert.match(forbidden, /data-reset-status="403"/);
  assert.match(forbidden, /href="\/reset-40"/);
  assert.ok(!/Chyba/.test(login + forbidden), 'bez prístupu sa nezobrazuje chyba');
});

test('API: prázdny Zrkadielko a konfigurácia metrík', async () => {
  const { api, calls, restore } = apiWith(async () => ({ status: 200, data: { program: 'reset-40-plus', metrics: METRICS, entries: [], count: 0 } }));
  const result = await api.getResetJournal();
  restore();
  assert.equal(result.ok, true);
  assert.deepEqual(result.entries, []);
  assert.equal(result.metrics.length, 2);
  assert.match(calls[0].url, /\/store\/reset-journal\?limit=50&offset=0/);
});

test('API: 401 a 403 sa preložia na zrozumiteľnú výzvu', async () => {
  const { api, restore } = apiWith(async () => ({ status: 401, data: { type: 'unauthorized' } }));
  const unauthorized = await api.getResetJournal();
  restore();
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.message, /prihláste/);

  const forbiddenSetup = apiWith(async () => ({ status: 403, data: { type: 'forbidden', message: 'Program je dostupný len zákazníkom s aktívnym prístupom.' } }));
  const forbidden = await forbiddenSetup.api.getResetProgram();
  forbiddenSetup.restore();
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.status, 403);
  assert.match(forbidden.message, /aktívnym prístupom/);
});

test('API: CRUD záznamu Zrkadielka (pridanie, úprava, zmazanie)', async () => {
  const { api, calls, restore } = apiWith(async (url, init) => {
    if (init.method === 'POST') return { status: 201, data: { entry: { id: 'rje_1', week: 2, date: '2026-10-12', metrics: { energia: 7 } } } };
    if (init.method === 'PATCH') return { status: 200, data: { entry: { id: 'rje_1', week: 3, date: '2026-10-12', metrics: { energia: 8 } } } };
    if (init.method === 'DELETE') return { status: 200, data: { ok: true } };
    return { status: 200, data: {} };
  });
  const created = await api.createResetJournalEntry({ date: '2026-10-12', week: 2, metrics: { energia: 7 } });
  const updated = await api.updateResetJournalEntry('rje_1', { date: '2026-10-12', week: 3, metrics: { energia: 8 } });
  const removed = await api.deleteResetJournalEntry('rje_1');
  restore();
  assert.equal(created.ok, true);
  assert.equal(created.entry.id, 'rje_1');
  assert.equal(updated.ok, true);
  assert.equal(removed.ok, true);
  assert.deepEqual(calls.map(c => c.method), ['POST', 'PATCH', 'DELETE']);
  assert.match(calls[0].url, /\/store\/reset-journal$/);
  assert.match(calls[1].url, /\/store\/reset-journal\/rje_1$/);
  assert.match(calls[2].url, /\/store\/reset-journal\/rje_1$/);
  assert.deepEqual(calls[0].body.metrics, { energia: 7 });
});

test('Mock (lokálne testy): prázdne Zrkadielko a kostra programu bez demo dát', async () => {
  const api = createMockApi();
  const program = await api.getResetProgram();
  const journal = await api.getResetJournal();
  assert.equal(program.total_weeks, 16);
  assert.equal(program.content_ready, false);
  assert.equal(program.weeks.length, 16);
  assert.deepEqual(program.weeks[0].days.map(d => d.day), [2, 3, 4, 5, 6, 7]);
  assert.deepEqual(journal.entries, []);
  assert.equal(journal.count, 0);
});
