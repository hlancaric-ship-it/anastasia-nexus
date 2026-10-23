// Obsah webu – úprava obsahových blokov po sekciách (backend /admin/content).
// Backend drží seed (pôvodné texty zo storefrontu) a zmeny; tu sa iba editujú hodnoty.

import { checkHeroPoster, checkHeroVideo } from './media-rules.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (d) => (d ? new Date(d).toLocaleString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const TYPE_LABEL = { text: 'Text', rich: 'Rich text', image: 'Obrázok', video: 'Video', link: 'Odkaz' };

const fieldInput = (f) => {
  // maxlength je len pomôcka (data-maxlength): prekročenie musí odmietnuť server,
  // aby zákazník videl jeho hlášku pri poli – prehliadač by ho zastavil sám.
  const attrs = `data-field="${esc(f.key)}" data-revision="${esc(f.revision || '')}" data-maxlength="${esc(String(f.max_length))}"`;
  if (f.type === 'video') return videoField(f);
  return f.type === 'rich'
    ? `<textarea rows="4" ${attrs}>${esc(f.value)}</textarea>`
    : `<input type="text" ${attrs} value="${esc(f.value)}">`;
};

/** Nahrávanie hero videa: len MP4/WEBM v 1080p/720p/480p (alebo poster). */
const videoField = (f) => `<div class="content-video">
  ${f.value ? `<video src="${esc(f.value)}" controls muted playsinline></video>` : '<p class="muted">bez videa</p>'}
  <p class="muted" style="font-size:12px;margin:8px 0 4px">Podporované formáty: MP4 (1080p, 720p, 480p) a WEBM, maximálne 25 MB. Poster: JPG, PNG alebo WebP do 5 MB.</p>
  <input type="file" accept="video/mp4,video/webm" data-video-upload="${esc(f.key)}">
  <input type="file" accept="image/jpeg,image/png,image/webp" data-poster-upload="${esc(f.key)}">
</div>`;

/** Náhľad sekcie: obsah (texty, obrázky, odkazy). Dizajn ostáva zamknutý vo storefronte. */
const preview = (section) => `<div class="content-preview">${section.fields.map((f) => {
  if (f.type === 'text') return `<h3>${esc(f.value || '—')}</h3>`;
  if (f.type === 'rich') return `<p>${esc(f.value || '')}</p>`;
  if (f.type === 'image') return f.value ? `<img src="${esc(f.value)}" alt="${esc(f.alt || '')}" loading="lazy">` : '<p class="muted">bez obrázka</p>';
  if (f.type === 'video') return f.value ? `<video src="${esc(f.value)}" controls muted playsinline></video>` : '<p class="muted">bez videa</p>';
  return f.value ? `<p><a href="${esc(f.value)}" target="_blank" rel="noopener">${esc(f.label_text || f.value)}</a></p>` : '<p class="muted">bez odkazu</p>';
}).join('')}</div>`;

const fieldHtml = (f) => `<div class="content-field${f.changed ? ' changed' : ''}">
  <div class="content-label"><b>${esc(f.label)}</b><span class="pill">${esc(TYPE_LABEL[f.type] || f.type)}</span>${f.changed ? '<span class="pill warn">zmenené</span>' : ''}</div>
  ${f.hint ? `<p class="muted" style="font-size:12px;margin:2px 0 6px">${esc(f.hint)}</p>` : ''}
  ${fieldInput(f)}
  <p class="err" data-field-error="${esc(f.key)}" style="display:none"></p>
  <div class="content-actions">
    <button type="button" class="btn gold sm" data-save="${esc(f.key)}">Uložiť</button>
    ${f.changed ? `<button type="button" class="btn ghost sm" data-reset="${esc(f.key)}">Obnoviť pôvodné</button>` : ''}
    <span class="muted" data-counter="${esc(f.key)}">${f.value.length} / ${f.max_length}</span>
  </div>
  ${(f.history || []).length ? `<details class="content-history"><summary>${f.history.length} predchádzajúcich verzií</summary>${f.history.map((h, i) => `<div class="content-version"><span>${esc(fmtDate(h.updated_at))} · ${esc(h.updated_by || '—')}</span><button type="button" class="btn ghost sm" data-version="${esc(f.key)}" data-index="${i}">Obnoviť túto verziu</button></div>`).join('')}</details>` : ''}
</div>`;
const fieldCount = (p) => (p.sections || []).reduce((b, s) => b + (s.fields || []).length, 0);
const fieldWord = (n) => (n === 1 ? 'položka' : n >= 2 && n <= 4 ? 'položky' : 'položiek');
// Nadpis písaný verzálkami zobrazíme normálne, URL adresy ponecháme.
const niceTitle = (t = '') => (t === t.toUpperCase() && /[A-ZÁ-Ž]{4}/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase().replace(/www\.[a-z.]+/g, (m) => m) : t);
const siteHost = () => location.hostname.replace(/-admin\./, '.').replace(/^admin\./, '');
const siteOrigin = () => `${location.protocol}//${siteHost()}`;
/**
 * Zoznam stránok obsahu webu.
 * @param {(path: string, options?: any) => Promise<any>} api
 */
export async function contentPages(api, escHtml = esc) {
  const pages = (await api('/admin/content')).pages || [];
  let extra = [];
  try { extra = (await api('/admin/pages')).pages || []; } catch { extra = []; }
  const changed = pages.filter((p) => p.changed).length;
  return `<div class="card" style="margin-bottom:16px"><div class="card-h">Obsah webu<div class="card-h-act">${changed ? `<span class="pill warn">${changed} upravených stránok</span>` : '<span class="pill">bez zmien</span>'}</div></div><div class="card-b">
    <p class="muted" style="margin-top:0">Vyberte stránku a upravte jej texty, obrázky a odkazy. Pôvodné znenie zostáva v zálohe a dá sa kedykoľvek obnoviť. Vzhľad stránky sa nemení.</p>
    <ul class="cp-list">${pages.filter((p) => fieldCount(p) > 0).map((p) => `<li class="cp-row">
      <span class="cp-main"><b>${escHtml(niceTitle(p.title))}</b>${p.changed ? ' <span class="pill warn">upravené</span>' : ''}
        <a class="cp-link" href="${escHtml(siteOrigin() + p.path)}" target="_blank" rel="noopener">${escHtml(siteHost() + (p.path === '/' ? '' : p.path))} ↗</a></span>
      <span class="cp-count">${fieldCount(p)} ${fieldWord(fieldCount(p))}</span>
      <button type="button" class="btn ghost sm" data-page="${escHtml(p.key)}">Upraviť</button></li>`).join('')}</ul>
  </div></div>
  <style>.cp-list{list-style:none;margin:0;padding:0}.cp-row{display:grid;grid-template-columns:1fr auto auto;gap:16px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}.cp-main b{font-weight:500}.cp-link{display:block;font-size:12px;color:var(--muted);text-decoration:none;margin-top:3px;overflow-wrap:anywhere}.cp-link:hover{text-decoration:underline}.cp-count{color:var(--muted);font-size:12.5px;white-space:nowrap}@media(max-width:600px){.cp-row{grid-template-columns:1fr auto}.cp-count{display:none}}</style>
  ${extra.length ? `<div class="card"><div class="card-h">Ďalšie texty (právne a informačné)</div><div class="card-b">
    <p class="muted" style="margin-top:0">Celé znenie jednej stránky v rich texte – vhodné na právne a informačné texty.</p>
    <div class="rc-grid">${extra.map((p) => `<div class="rc"><div class="rc-body"><div class="rc-title">${escHtml(p.label)}</div>
      <div class="rc-fields"><span class="rc-f"><em>Stav</em>${p.is_default ? 'pôvodné znenie' : 'upravené'}</span></div>
      <div style="margin-top:10px"><button type="button" class="btn ghost sm" data-extra="${escHtml(p.slug)}">Upraviť text</button></div></div></div>`).join('')}</div>
  </div></div>` : ''}`;
}

// Web k adminu: anastasia-test-admin.… → anastasia-test.…
const webOrigin = () => (/-admin\./.test(location.hostname) ? location.origin.replace('-admin.', '.') : '');

/** Živý náhľad vpravo: pole v editore → zvýraznené miesto na webe. */
function wireLivePreview(root) {
  const frame = root.querySelector('[data-cp-live]');
  const web = webOrigin();
  if (!frame || !web) return;
  const note = root.querySelector('[data-cp-live-note]');
  const send = (msg) => { try { frame.contentWindow?.postMessage({ type: 'ana-cms-field', ...msg }, web); } catch {} };
  let current = null;
  window.addEventListener('message', (ev) => {
    if (ev.origin !== web || ev.data?.type !== 'ana-cms-found' || !note) return;
    note.textContent = ev.data.found ? 'Zvýraznené miesto na webe upravuje vybrané pole.' : 'Toto pole sa na tejto stránke nenašlo (môže byť skryté alebo v inom jazyku).';
  });
  root.addEventListener('focusin', (ev) => {
    const input = ev.target.closest?.('[data-field]');
    if (!input || input === current) return;
    if (current) send({ action: 'reset' });
    current = input;
    send({ action: 'focus', text: input.defaultValue });
  });
  root.addEventListener('input', (ev) => {
    const input = ev.target.closest?.('[data-field]');
    if (input && input === current) send({ action: 'input', value: input.value, rich: input.tagName === 'TEXTAREA' });
  });
}

/** Editor jednej stránky: sekcie a polia (+ náhľad a verzie). */
export async function contentPage(api, key, escHtml = esc) {
  const page = ((await api('/admin/content')).pages || []).find((p) => p.key === key) || null;
  if (!page) return '<div class="err">Stránka sa nenašla.</div>';
  const fieldByKey = (k) => page.sections.flatMap((s) => s.fields).find((f) => f.key === k);
  const web = webOrigin();
  const frame = web ? `<aside class="cp-live"><div class="cp-live-h"><b>Náhľad na webe</b><span class="muted" data-cp-live-note>Kliknite do poľa a tu uvidíte, ktoré miesto na webe upravuje.</span></div>
    <iframe src="${escHtml(web + page.path)}" title="Náhľad stránky ${escHtml(page.title)}" data-cp-live loading="lazy"></iframe></aside>` : '';
  return `<div class="cp-layout${web ? ' has-live' : ''}"><div class="cp-edit"><div class="card" style="margin-bottom:16px"><div class="card-h">${escHtml(page.title)}<div class="card-h-act">
      <span class="muted" style="font-size:12px">${escHtml(page.path)}</span>
      <button type="button" class="btn ghost" data-cp-back>Späť</button></div></div><div class="card-b">
    <div id="cp-msg"></div>
    <p class="muted" style="margin-top:0">Rozviňte sekciu a upravte pole. Uložiť tlačidlom pri poli alebo skratkou Ctrl+Enter. Pôvodné znenie sa dá obnoviť.</p>
    ${page.sections.map((section) => `<details class="content-section"${section.changed ? ' open' : ''}><summary><b>${escHtml(section.title)}</b><span class="muted"> – ${section.fields.length} polí${section.changed ? ' · upravené' : ''}</span></summary>
      <div class="content-fields">${section.fields.map(fieldHtml).join('')}</div></details>`).join('')}
  </div></div>
  <div class="card"><div class="card-h">Náhľad</div><div class="card-b">${page.sections.map((s) => `<div class="content-preview-sec"><h3>${escHtml(s.title)}</h3>${preview(s)}</div>`).join('')}</div></div></div>${frame}</div>`;
}

/** Obsluha udalostí v editore stránky (uloženie, obnovenie, verzie, počítadlo znakov). */
export function wireContentPage(root, api, key, onBack) {
  wireLivePreview(root);
  const fieldByKey = (k) => root.querySelector('[data-field="' + CSS.escape(k) + '"]');
  const say = (html) => { const box = root.querySelector('#cp-msg'); if (box) box.innerHTML = html; };
  // Konflikt (obsah medzitým zmenil niekto iný) – ukážeme hlášku a ponúkneme obnovenie.
  const conflict = (message) => {
    say(`<div class="notice">${esc(message)} <button type="button" class="btn ghost sm" data-cp-reload>Obnoviť stránku</button></div>`);
    const btn = root.querySelector('[data-cp-reload]');
    if (btn) btn.onclick = () => onBack.reload();
  };
  const fail = (e) => {
    if (e.message === '401') return;
    if (/zmenil niekto iný/i.test(e.message || '')) return conflict(e.message);
    say(`<div class="err">${esc(e.message || 'Uložiť sa nepodarilo. Skúte to znova.')}</div>`);
  };
  const save = async (fieldKey) => {
    const input = fieldByKey(fieldKey);
    if (!input) return;
    say('');
    try {
      await api('/admin/content', { method: 'POST', body: { page: key, field: fieldKey, value: input.value, revision: input.dataset.revision || '' } });
      onBack.reload();
    } catch (e) { fail(e); showFieldError(fieldKey, e.message); }
  };
  const fieldError = (fieldKey) => root.querySelector(`[data-field-error="${CSS.escape(fieldKey)}"]`);
  const showFieldError = (fieldKey, message) => {
    const box = fieldError(fieldKey);
    if (!box) return;
    box.textContent = message || '';
    box.style.display = message ? '' : 'none';
  };
  root.querySelectorAll('[data-save]').forEach((b) => { b.onclick = () => save(b.dataset.save); });

  // Nahrávanie hero videa a posteru – formáty a rozmery sa kontrolujú pred nahratím.
  const uploadMedia = async (file) => {
    const fd = new FormData();
    fd.append('files', file);
    const data = await api('/admin/uploads', { method: 'POST', body: fd });
    const uploaded = (data.files || []).map(f => ({ key: f.key || String(f.url || '').split('/').pop(), url: f.url, name: f.name || f.key, size: f.size || 0, content_type: f.content_type || f.mimetype || '' }));
    if (!uploaded.length) throw new Error('Súbor sa nepodarilo nahrať.');
    await api('/admin/media', { method: 'POST', body: { files: uploaded } });
    return uploaded[0];
  };
  const uploadToField = async (fieldKey, file, kind) => {
    const message = kind === 'poster' ? checkHeroPoster(file) : await checkHeroVideo(file);
    if (message) { showFieldError(fieldKey, message); return; }
    showFieldError(fieldKey, '');
    try {
      const media = await uploadMedia(file);
      if (!media?.url) throw new Error('Súbor sa nepodarilo nahrať.');
      const input = fieldByKey(fieldKey);
      input.value = media.url;
      await api('/admin/content', { method: 'POST', body: { page: key, field: fieldKey, value: media.url, revision: input.dataset.revision || '' } });
      onBack.reload();
    } catch (e) { showFieldError(fieldKey, e.message || 'Nahrávanie sa nepodarilo.'); }
  };
  root.querySelectorAll('[data-video-upload]').forEach((input) => {
    input.onchange = () => { const file = input.files?.[0]; if (file) uploadToField(input.dataset.videoUpload, file, 'video'); };
  });
  root.querySelectorAll('[data-poster-upload]').forEach((input) => {
    input.onchange = () => { const file = input.files?.[0]; if (file) uploadToField(input.dataset.posterUpload, file, 'poster'); };
  });
  root.querySelectorAll('[data-reset]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Obnoviť pôvodné znenie tohto poľa?')) return;
      say('');
      const input = fieldByKey(b.dataset.reset);
      try {
        await api('/admin/content/reset', { method: 'POST', body: { page: key, field: b.dataset.reset, revision: input?.dataset.revision || '' } });
        onBack.reload();
      } catch (e) { fail(e); }
    };
  });
  root.querySelectorAll('[data-version]').forEach((b) => {
    b.onclick = async () => {
      say('');
      const input = fieldByKey(b.dataset.version);
      try {
        await api('/admin/content/reset', { method: 'POST', body: { page: key, field: b.dataset.version, version: Number(b.dataset.index), revision: input?.dataset.revision || '' } });
        onBack.reload();
      } catch (e) { fail(e); }
    };
  });
  root.querySelectorAll('[data-field]').forEach((input) => {
    const counter = root.querySelector('[data-counter="' + CSS.escape(input.dataset.field) + '"]');
    input.addEventListener('input', () => { if (counter) counter.textContent = `${input.value.length} / ${counter.textContent.split('/')[1]?.trim() ?? ''}`; });
    input.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(input.dataset.field); } });
  });
  const back = root.querySelector('[data-cp-back]');
  if (back) back.onclick = () => onBack.back();
}
