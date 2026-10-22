// Členská zóna RESET 40+ a Zrkadielko.
//
// Zdroj všetkého obsahu je API (GET /store/reset-program, /store/reset-journal):
// 16 týždňov, pracovné listy po dňoch, záverečné zhrnutie, vstupný dotazník a zoznam
// metrík. Nič sa nevymýšľa – keď obsah chýba, zobrazí sa jemný stav „obsah pripravujeme“.
// Názvy tlačidiel a stĺpcov pochádzajú zo starého webu (pozri API popis v release větve).
// Vlastná escape (bez importu) – modul musí byť importovateľný aj v node testoch.
const e = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const PREPARING = 'Obsah pripravujeme.';

const dateFormat = iso => {
  const d = new Date(`${iso}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return iso || '';
  return new Intl.DateTimeFormat('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Metriky z API: poradie stĺpcov je poradie z odpovede (order). */
export const orderedMetrics = metrics => [...(metrics || [])]
  .filter(m => m && typeof m.key === 'string')
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

const materialList = (materials, kind) => {
  const list = (materials || []).filter(m => m && (m.key || m.title));
  if (!list.length) return '';
  return `<ul class="reset-materials">${list.map(m => `<li><a href="#" data-reset-material="${e(m.key || '')}">${e(m.title || m.key)}</a>${m.kind && m.kind !== kind ? `<small>${e(m.kind)}</small>` : ''}</li>`).join('')}</ul>`;
};

/** Vstupný dotazník, 16 týždňov, materiály a pracovné listy, záverečné zhrnutie. */
export function renderProgram(program) {
  const weeks = Array.isArray(program?.weeks) ? program.weeks : [];
  const total = program?.total_weeks ?? weeks.length ?? 0;
  const questionnaire = program?.entry_questionnaire_url
    ? `<div class="reset-questionnaire"><p>Vyplňte prosím vstupný dotazník.</p><a class="button" href="${e(program.entry_questionnaire_url)}" target="_blank" rel="noopener">Otvoriť vstupný dotazník</a></div>`
    : '';
  const weekList = weeks.length ? `<ol class="reset-weeks">${weeks.map(w => {
    const hasContent = Boolean(w.title || w.intro || (w.materials || []).length || (w.days || []).some(d => (d.materials || []).length));
    const days = (w.days || []).map(d => `<li><span>${e(d.label || `${d.day}. deň`)}</span>${(d.materials || []).length ? materialList(d.materials, 'worksheet') : `<span class="reset-preparing">${PREPARING}</span>`}</li>`).join('');
    return `<li class="reset-week" data-reset-week="${e(w.week ?? '')}"><details><summary><span>Týždeň číslo ${e(w.week ?? '')}</span>${w.title ? `<em>${e(w.title)}</em>` : ''}</summary>${w.intro ? `<p class="reset-week-intro">${e(w.intro)}</p>` : ''}${hasContent ? materialList(w.materials, 'material') : `<p class="reset-preparing">${PREPARING}</p>`}${days ? `<ul class="reset-days">${days}</ul>` : ''}</details></li>`;
  }).join('')}</ol>` : `<p class="reset-preparing">${PREPARING}</p>`;
  const summary = program?.final_summary
    ? `<section class="reset-summary"><h2>${e(program.final_summary.title || 'Záverečné zhrnutie')}</h2>${(program.final_summary.materials || []).length ? materialList(program.final_summary.materials, 'material') : `<p class="reset-preparing">${PREPARING}</p>`}</section>`
    : '';
  return `<div class="reset-program-head"><p class="eyebrow">RESET 40+</p><p>${e(`${total} tematických týždňov vo vašom vlastnom tempe.`)}</p></div>${questionnaire}${weekList}${summary}`;
}

/** Prázdny stav Zrkadielka. */
export function renderEmptyJournal() {
  return `<div class="reset-empty"><p>Zrkadielko zatiaľ nemá záznamy.</p><p>Pridajte prvý záznam a uvidíte, ako sa vaše dni menia.</p></div>`;
}

/** Riadok hodnotenia 1–max (ťuknutie) pre každú metriku z API. */
const metricFields = metrics => (metrics || []).map(m => {
  const max = Number(m.max ?? 10) || 10;
  const min = Number(m.min ?? 1) || 1;
  const values = [];
  for (let v = min; v <= max; v += 1) values.push(v);
  return `<fieldset class="reset-metric" data-metric="${e(m.key)}"><legend>${e(m.label || m.key)}</legend><div class="reset-scale">${values.map(v => `<button type="button" data-reset-value="${v}" aria-pressed="false" aria-label="${e(m.label || m.key)} ${v}">${v}</button>`).join('')}</div><input type="hidden" name="metric-${e(m.key)}" value=""></fieldset>`;
}).join('');

/** Formulár na pridanie / úpravu záznamu. */
export function renderJournalForm(metrics, { entry = null, weeks = [] } = {}) {
  const weekOptions = ['', ...weeks.map(w => w.week).filter(w => w !== undefined && w !== null)]
    .map(w => `<option value="${e(w)}"${String(entry?.week ?? '') === String(w) ? ' selected' : ''}>${w === '' ? 'Bez týždňa' : `Týždeň ${e(w)}`}</option>`).join('');
  const values = entry?.metrics || {};
  return `<form class="reset-form" data-reset-form${entry?.id ? ` data-reset-entry="${e(entry.id)}"` : ''}>
    <div class="reset-form-row">
      <label>Dátum<input type="date" name="date" required max="${today()}" value="${e(entry?.date || today())}"></label>
      <label>Týždeň<select name="week">${weekOptions}</select></label>
    </div>
    ${metricFields(metrics).replace(/aria-pressed="false"/g, (m, key) => '')}
    <div class="reset-form-actions"><button class="button" type="submit">${entry?.id ? 'Uložiť zmeny' : 'Pridať záznam'}</button><button class="button outline" type="button" data-reset-cancel${entry?.id ? '' : ' hidden'}>Zavrieť</button></div>
    <p class="form-status" role="status" aria-live="polite"></p>
  </form>`;
}

/** Tabuľka záznamov (na mobile sa zmení na karty). */
export function renderJournalTable(metrics, entries) {
  const cols = orderedMetrics(metrics);
  const head = `<tr><th scope="col">Dátum</th><th scope="col">Týždeň</th>${cols.map(m => `<th scope="col">${e(m.label || m.key)}</th>`).join('')}<th scope="col"><span class="visually-hidden">Akcie</span></th></tr>`;
  const rows = entries.map(entry => `<tr data-reset-row="${e(entry.id)}">
      <td data-label="Dátum">${e(dateFormat(entry.date))}</td>
      <td data-label="Týždeň">${entry.week ? e(entry.week) : '—'}</td>
      ${cols.map(m => `<td data-label="${e(m.label || m.key)}">${entry.metrics?.[m.key] ?? '—'}</td>`).join('')}
      <td data-label="Akcie" class="reset-row-actions"><button type="button" class="button outline" data-reset-edit="${e(entry.id)}">Upraviť</button><button type="button" class="button outline" data-reset-delete="${e(entry.id)}">Zmazať</button></td>
    </tr>`).join('');
  return `<table class="reset-table"><caption class="visually-hidden">Záznamy Zrkadielka</caption><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

/** Stav bez prístupu: 401 = prihlásenie, 403 = bez programu. */
export function renderAccessNotice(result) {
  const status = result?.status ?? 0;
  const message = result?.message || (status === 401
    ? 'Pre prístup k Zrkadielku sa prihláste.'
    : 'Zrkadielko je dostupné len zákazníkom s programom RESET 40+.');
  const action = status === 401
    ? '<a class="button" href="/prihlasenie">Prihlásiť sa</a>'
    : '<a class="button" href="/reset-40">O programe RESET 40+</a>';
  return `<div class="reset-notice" data-reset-status="${e(status)}"><p>${e(message)}</p>${action}</div>`;
}

/**
 * Nastaví členskú zónu RESET 40+ a Zrkadielko (ak je na stránke).
 * `api` je adaptéry (getResetProgram, getResetJournal, CRUD záznamu).
 */
export function initResetZone(api, root = document) {
  const programBox = root.querySelector('#reset-program');
  const journalBox = root.querySelector('#reset-journal');
  if (!programBox && !journalBox) return null;

  const state = { metrics: [], weeks: [], entries: [], editing: null, program: null };

  const status = box => box.querySelector('.form-status');
  const setStatus = (box, message, kind = '') => {
    const el = status(box);
    if (!el) return;
    el.textContent = message || '';
    el.dataset.state = kind;
  };

  const renderJournal = () => {
    if (!journalBox) return;
    const metrics = state.metrics;
    const weeks = state.weeks;
    journalBox.innerHTML = `<div class="reset-section-heading"><h2>Zrkadielko</h2><button class="button" type="button" data-reset-add>Pridať</button></div>
      ${state.entries.length ? renderJournalTable(metrics, state.entries) : renderEmptyJournal()}
      <div class="reset-form-slot" data-reset-form-slot>${state.editing || !state.entries.length && state.metrics.length ? renderJournalForm(metrics, { entry: state.editing, weeks }) : ''}</div>`;
  };

  const load = async () => {
    const program = await api.getResetProgram();
    if (!program?.ok) {
      if (programBox) programBox.innerHTML = renderAccessNotice(program);
      if (journalBox) journalBox.innerHTML = renderAccessNotice(program);
      return;
    }
    state.program = program;
    state.metrics = orderedMetrics(program.metrics);
    state.weeks = Array.isArray(program.weeks) ? program.weeks : [];
    if (programBox) programBox.innerHTML = renderProgram(program);
    const journal = await api.getResetJournal();
    if (!journal?.ok) {
      if (journalBox) journalBox.innerHTML = renderAccessNotice(journal);
      return;
    }
    state.metrics = orderedMetrics(journal.metrics?.length ? journal.metrics : state.metrics);
    state.entries = journal.entries || [];
    renderJournal();
  };

  const collect = form => {
    const metrics = {};
    for (const field of form.querySelectorAll('.reset-metric')) {
      const input = field.querySelector('input[type=hidden]');
      const value = input?.value;
      if (value !== '' && value !== undefined && value !== null) metrics[field.dataset.metric] = Number(value);
    }
    const date = form.querySelector('[name=date]')?.value || '';
    const weekRaw = form.querySelector('[name=week]')?.value || '';
    return { date, week: weekRaw === '' ? null : Number(weekRaw), metrics };
  };

  const bind = () => {
    root.addEventListener('click', async event => {
      const add = event.target.closest('[data-reset-add]');
      if (add) {
        state.editing = null;
        renderJournal();
        return;
      }
      const cancel = event.target.closest('[data-reset-cancel]');
      if (cancel) {
        state.editing = null;
        renderJournal();
        return;
      }
      const value = event.target.closest('[data-reset-value]');
      if (value) {
        const field = value.closest('.reset-metric');
        const input = field?.querySelector('input[type=hidden]');
        if (input) {
          const same = input.value === value.dataset.resetValue;
          input.value = same ? '' : value.dataset.resetValue;
          field.querySelectorAll('[data-reset-value]').forEach(b => b.setAttribute('aria-pressed', String(!same && b === value)));
        }
        return;
      }
      const edit = event.target.closest('[data-reset-edit]');
      if (edit) {
        state.editing = state.entries.find(x => x.id === edit.dataset.resetEdit) || null;
        renderJournal();
        return;
      }
      const del = event.target.closest('[data-reset-delete]');
      if (del) {
        const entry = state.entries.find(x => x.id === del.dataset.resetDelete);
        if (!entry) return;
        if (!confirm(`Naozaj chcete záznam z ${dateFormat(entry.date)} zmazať?`)) return;
        const result = await api.deleteResetJournalEntry(entry.id);
        setStatus(journalBox, result?.message || (result?.ok ? 'Záznam bol zmazaný.' : 'Záznam sa nepodarilo zmazať.'), result?.ok ? 'OK' : 'ERROR');
        if (result?.ok) {
          state.entries = state.entries.filter(x => x.id !== entry.id);
          renderJournal();
        }
        return;
      }
      const material = event.target.closest('[data-reset-material]');
      if (material) {
        event.preventDefault();
        const key = material.dataset.resetMaterial;
        if (!key || typeof api.getMediaAccess !== 'function') return;
        const access = await api.getMediaAccess({ key });
        if (access?.ok && access.url) window.open(access.url, '_blank', 'noopener');
      }
    });

    root.addEventListener('submit', async event => {
      const form = event.target.closest('[data-reset-form]');
      if (!form) return;
      event.preventDefault();
      const button = form.querySelector('button[type=submit]');
      if (button) button.disabled = true;
      setStatus(form, 'Odosielam…');
      const payload = collect(form);
      const id = form.dataset.resetEntry;
      const result = id ? await api.updateResetJournalEntry(id, payload) : await api.createResetJournalEntry(payload);
      setStatus(form, result?.message || (result?.ok ? 'Záznam bol uložený.' : 'Záznam sa nepodarilo uložiť.'), result?.ok ? 'OK' : 'ERROR');
      if (button) button.disabled = false;
      if (result?.ok) {
        state.editing = null;
        const fresh = await api.getResetJournal();
        if (fresh?.ok) state.entries = fresh.entries || [];
        renderJournal();
      }
    });
  };

  bind();
  load();
  return { state, load, renderJournal };
}
