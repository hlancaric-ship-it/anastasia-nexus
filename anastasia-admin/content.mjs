// Obsah webu – úprava obsahových blokov po sekciách (backend /admin/content).
// Backend drží seed (pôvodné texty zo storefrontu) a zmeny; tu sa iba editujú hodnoty.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (d) => (d ? new Date(d).toLocaleString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const TYPE_LABEL = { text: 'Text', rich: 'Rich text', image: 'Obrázok', video: 'Video', link: 'Odkaz' };

const fieldInput = (f) => {
  const attrs = `data-field="${esc(f.key)}" maxlength="${esc(String(f.max_length))}"`;
  return f.type === 'rich'
    ? `<textarea rows="4" ${attrs}>${esc(f.value)}</textarea>`
    : `<input type="text" ${attrs} value="${esc(f.value)}">`;
};

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
  <div class="content-actions">
    <button type="button" class="btn gold sm" data-save="${esc(f.key)}">Uložiť</button>
    ${f.changed ? `<button type="button" class="btn ghost sm" data-reset="${esc(f.key)}">Obnoviť pôvodné</button>` : ''}
    <span class="muted" data-counter="${esc(f.key)}">${f.value.length} / ${f.max_length}</span>
  </div>
  ${(f.history || []).length ? `<details class="content-history"><summary>${f.history.length} predchádzajúcich verzií</summary>${f.history.map((h, i) => `<div class="content-version"><span>${esc(fmtDate(h.updated_at))} · ${esc(h.updated_by || '—')}</span><button type="button" class="btn ghost sm" data-version="${esc(f.key)}" data-index="${i}">Obnoviť túto verziu</button></div>`).join('')}</details>` : ''}
</div>`;

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
    <p class="muted" style="margin-top:0">Každá stránka webu je rozdelená na sekcie a polia (text, rich text, obrázok, video, odkaz). Zmeníte čokoľvek priamo tu – pôvodné znenie zostáva v zálohe a dá sa obnoviť. Dizajn (layout, farby, písmo) sa nemení.</p>
    <div class="rc-grid">${pages.map((p) => `<div class="rc"><div class="rc-body"><div class="rc-title">${escHtml(p.title)}</div>
      <div class="rc-fields"><span class="rc-f"><em>Adresa</em>${escHtml(p.path)}</span>
        <span class="rc-f"><em>Sekcie</em>${p.sections.length}</span>
        <span class="rc-f"><em>Polia</em>${p.sections.reduce((b, s) => b + s.fields.length, 0)}</span>
        ${p.changed ? '<span class="rc-f"><em>Stav</em><span class="pill warn">upravené</span></span>' : ''}</div>
      <div style="margin-top:10px"><button type="button" class="btn ghost sm" data-page="${escHtml(p.key)}">Upraviť obsah</button></div></div></div>`).join('')}</div>
  </div></div>
  ${extra.length ? `<div class="card"><div class="card-h">Ďalšie texty (právne a informačné)</div><div class="card-b">
    <p class="muted" style="margin-top:0">Celé znenie jednej stránky v rich texte – vhodné na právne a informačné texty.</p>
    <div class="rc-grid">${extra.map((p) => `<div class="rc"><div class="rc-body"><div class="rc-title">${escHtml(p.label)}</div>
      <div class="rc-fields"><span class="rc-f"><em>Stav</em>${p.is_default ? 'pôvodné znenie' : 'upravené'}</span></div>
      <div style="margin-top:10px"><button type="button" class="btn ghost sm" data-extra="${escHtml(p.slug)}">Upraviť text</button></div></div></div>`).join('')}</div>
  </div></div>` : ''}`;
}

/** Editor jednej stránky: sekcie a polia (+ náhľad a verzie). */
export async function contentPage(api, key, escHtml = esc) {
  const page = ((await api('/admin/content')).pages || []).find((p) => p.key === key) || null;
  if (!page) return '<div class="err">Stránka sa nenašla.</div>';
  const fieldByKey = (k) => page.sections.flatMap((s) => s.fields).find((f) => f.key === k);
  return `<div class="card" style="margin-bottom:16px"><div class="card-h">${escHtml(page.title)}<div class="card-h-act">
      <span class="muted" style="font-size:12px">${escHtml(page.path)}</span>
      <button type="button" class="btn ghost" data-cp-back>Späť</button></div></div><div class="card-b">
    <p class="muted" style="margin-top:0">Rozviňte sekciu a upravte pole. Uložiť tlačidlom pri poli alebo skratkou Ctrl+Enter. Pôvodné znenie sa dá obnoviť.</p>
    ${page.sections.map((section) => `<details class="content-section"${section.changed ? ' open' : ''}><summary><b>${escHtml(section.title)}</b><span class="muted"> – ${section.fields.length} polí${section.changed ? ' · upravené' : ''}</span></summary>
      <div class="content-fields">${section.fields.map(fieldHtml).join('')}</div></details>`).join('')}
  </div></div>
  <div class="card"><div class="card-h">Náhľad</div><div class="card-b">${page.sections.map((s) => `<div class="content-preview-sec"><h3>${escHtml(s.title)}</h3>${preview(s)}</div>`).join('')}</div></div>`;
}

/** Obsluha udalostí v editore stránky (uloženie, obnovenie, verzie, počítadlo znakov). */
export function wireContentPage(root, api, key, onBack) {
  const fieldByKey = (k) => root.querySelector('[data-field="' + CSS.escape(k) + '"]');
  const save = async (fieldKey) => {
    const input = fieldByKey(fieldKey);
    if (!input) return;
    try {
      await api('/admin/content', { method: 'POST', body: { page: key, field: fieldKey, value: input.value } });
      onBack.reload();
    } catch (e) { if (e.message !== '401') alert(e.message); }
  };
  root.querySelectorAll('[data-save]').forEach((b) => { b.onclick = () => save(b.dataset.save); });
  root.querySelectorAll('[data-reset]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Obnoviť pôvodné znenie tohto poľa?')) return;
      try { await api('/admin/content/reset', { method: 'POST', body: { page: key, field: b.dataset.reset } }); onBack.reload(); }
      catch (e) { if (e.message !== '401') alert(e.message); }
    };
  });
  root.querySelectorAll('[data-version]').forEach((b) => {
    b.onclick = async () => {
      try { await api('/admin/content/reset', { method: 'POST', body: { page: key, field: b.dataset.version, version: Number(b.dataset.index) } }); onBack.reload(); }
      catch (e) { if (e.message !== '401') alert(e.message); }
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
