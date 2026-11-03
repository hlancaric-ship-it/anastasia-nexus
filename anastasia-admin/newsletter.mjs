import { renderLuciaLetter } from './newsletter-letter.mjs';
// Newsletter — písanie kampaní a rozosielanie prihláseným odberateľom.
// Ceny, zľavy ani obchodné údaje sa tu nepočítajú. Obsah sa ukladá na serveri (sanitizovaný),
// e-maily odosiela backendový job podľa denného limitu.

const NL_STATUS = {
  draft: ['koncept', 'warn'],
  queued: ['v poradí', 'warn'],
  sending: ['odosiela sa', 'warn'],
  sent: ['odoslaná', 'ok'],
  cancelled: ['zrušená', 'off'],
};

const NL_BLANK = () => ({ id: null, mode: 'sablona', form: { sections: [{ title: '', text: '' }], ctaLabel: '', ctaUrl: '', signature: 'Lucia' }, subject: '', preheader: '', body_html: '', status: 'draft', recipients_count: 0, sent_count: 0, failed_count: 0, created_at: null, queued_at: null, sent_at: null });

const NL_CSV_PAGE = 100;
const NL_CSV_MAX_PAGES = 50;

// Kampaň zo servera: ak sa dá poskladať späť na šablónu Dopis, otvorí sa vo formulári, inak ako HTML.
function nlAdopt(campaign, keepMode) {
  const parsed = nlParseForm(campaign && campaign.body_html);
  const mode = keepMode === 'html' ? 'html' : (parsed ? 'sablona' : 'html');
  return { ...campaign, mode, form: parsed || { sections: [{ title: '', text: '' }], ctaLabel: '', ctaUrl: '', signature: 'Lucia' } };
}

export function newsletterView({ api, esc, fmtDate, freshView }) {
  return async function openNewsletter(view) {
    view = freshView(view);
    const state = {
      tab: 'campaigns',
      campaigns: [],
      stats: { subscribed: 0, campaigns_sent: 0, last_campaign: null },
      consents: [],
      consentCount: 0,
      editing: NL_BLANK(),
      initialized: false,
      message: null,
    };

    const msg = (text, error = false) => `<div class="${error ? 'err' : 'notice'}" role="${error ? 'alert' : 'status'}">${esc(text)}</div>`;
    const fail = (error) => {
      if (error && error.message === '401') return;
      state.message = { text: (error && error.message) || 'Spojenie zlyhalo. Skúste to znova.', error: true };
      render();
    };
    const busy = (on) => { view.querySelectorAll('button').forEach(b => { if (b.dataset.nobusy !== '1') b.disabled = on; }); };

    async function run(work) {
      busy(true);
      try { await work(); }
      catch (error) { fail(error); }
      finally { busy(false); }
    }

    async function load() {
      const [list, consents] = await Promise.all([
        api('/admin/newsletter/campaigns?limit=100'),
        api('/admin/newsletter?limit=100'),
      ]);
      state.campaigns = list.campaigns || [];
      state.stats = list.stats || state.stats;
      state.consents = consents.consents || [];
      state.consentCount = Number(consents.count) || state.consents.length;
      if (!state.initialized) {
        state.initialized = true;
        const draft = state.campaigns.filter(c => c.status === 'draft')
          .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0];
        if (draft) state.editing = nlAdopt(draft);
      }
      if (state.editing.id) {
        const fresh = state.campaigns.find(c => c.id === state.editing.id);
        if (fresh) state.editing = nlAdopt(fresh, state.editing.mode);
      }
    }

    function sync() {
      const subject = view.querySelector('#nl-subject');
      const preheader = view.querySelector('#nl-preheader');
      const body = view.querySelector('#nl-body');
      if (subject) state.editing.subject = subject.value;
      if (preheader) state.editing.preheader = preheader.value;
      if (state.editing.mode === 'sablona') {
        const form = state.editing.form;
        view.querySelectorAll('[data-sec]').forEach(el => {
          const idx = Number(el.dataset.sec), field = el.dataset.f;
          if (form.sections[idx]) form.sections[idx][field] = el.value;
        });
        const cl = view.querySelector('#nl-cta-label'), cu = view.querySelector('#nl-cta-url'), sg = view.querySelector('#nl-sign');
        if (cl) form.ctaLabel = cl.value;
        if (cu) form.ctaUrl = cu.value;
        if (sg) form.signature = sg.value;
        state.editing.body_html = nlBuildBody(form);
      } else if (body) state.editing.body_html = body.value;
    }

    function preview() {
      const frame = view.querySelector('#nl-preview');
      if (frame) frame.srcdoc = emailHtml(state.editing);
    }

    function render() {
      if (!view.isConnected) return;
      const editing = state.editing;
      const editable = editing.status === 'draft';
      const status = NL_STATUS[editing.status] || [editing.status || 'koncept', 'off'];
      const last = state.stats.last_campaign;
      const lastStatus = last ? (NL_STATUS[last.status] || [last.status, 'off']) : null;

      view.innerHTML = `<style>
        .nl-wrap{display:grid;gap:16px}
        .nl-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
        .nl-k{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
        .nl-v{font:500 30px/1.15 Georgia,'Times New Roman',serif;color:var(--primary);margin:6px 0 4px}
        .nl-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}
        .nl-tools{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px}
        .nl-sec{border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 14px;background:rgba(255,255,255,.6)}
        .nl-sec-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
        .nl-tools .btn{padding:8px 12px;min-height:36px}
        .nl-editor textarea{width:100%;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}
        .nl-preview{width:100%;height:720px;border:1px solid var(--line);border-radius:12px;background:#fbf8f2}
        .nl-note{font-size:12px;color:var(--muted);line-height:1.6}
        .nl-tabs{display:flex;gap:20px;border-bottom:1px solid var(--line);margin:2px 0 18px}
        .nl-tabs .tab{background:none;border:0;border-bottom:2px solid transparent;padding:0 0 12px;min-height:44px;font:inherit;font-size:13.5px;color:var(--muted);cursor:pointer}
        .nl-tabs .tab.active{border-bottom-color:var(--gold);color:var(--primary)}
        .nl-row{cursor:pointer}
        @media(max-width:900px){.nl-stats,.nl-grid{grid-template-columns:1fr}.nl-preview{height:560px}}
      </style>
      <div class="nl-wrap">
        <div class="rc-grid nl-stats">
          <div class="card"><div class="card-b"><div class="nl-k">Prihlásení odberatelia</div><div class="nl-v">${esc(state.stats.subscribed ?? 0)}</div><p class="muted nl-note">Súhlasy so stavom „prihlásený“ v tejto chvíli.</p></div></div>
          <div class="card"><div class="card-b"><div class="nl-k">Odoslané kampane</div><div class="nl-v">${esc(state.stats.campaigns_sent ?? 0)}</div><p class="muted nl-note">Kampane, ktoré už prešli odosielaním.</p></div></div>
          <div class="card"><div class="card-b"><div class="nl-k">Posledná kampaň</div>
            ${last ? `<div class="nl-v" style="font-size:18px;line-height:1.35">${esc(last.subject)}</div><p class="muted nl-note"><span class="pill ${lastStatus[1]}">${esc(lastStatus[0])}</span> ${esc(fmtDate(last.sent_at || last.queued_at || last.created_at))}</p>` : '<div class="nl-v" style="font-size:18px">—</div><p class="muted nl-note">Zatiaľ ste neposlali žiadnu kampaň.</p>'}
          </div></div>
        </div>

        <div class="nl-grid">
          <section class="card nl-editor" aria-labelledby="nl-editor-h">
            <div class="card-h"><h2 id="nl-editor-h" tabindex="-1" style="font:inherit;margin:0">Kampaň <span class="pill ${status[1]}">${esc(status[0])}</span></h2>
              <div class="card-h-act"><button type="button" class="btn ghost" data-new>Nová kampaň</button></div>
            </div>
            <div class="card-b">
              ${state.message ? msg(state.message.text, state.message.error) : ''}
              <label for="nl-subject">Predmet</label>
              <input id="nl-subject" maxlength="200" value="${esc(editing.subject)}" ${editable ? '' : 'disabled'} placeholder="Napríklad Novinky z ateliéru ANASTASIA">
              <label for="nl-preheader">Náhľadový text</label>
              <input id="nl-preheader" maxlength="300" value="${esc(editing.preheader)}" ${editable ? '' : 'disabled'} placeholder="Krátky úvod, ktorý sa zobrazí pri predmete">
              ${editing.mode === 'sablona' ? templateFormHtml(editing, editable) : `<label for="nl-body">Obsah</label>
              ${editable ? `<div class="nl-tools" role="group" aria-label="Formátovanie obsahu">
                <button type="button" class="btn ghost" data-format="h2">Nadpis</button>
                <button type="button" class="btn ghost" data-format="strong">Tučné</button>
                <button type="button" class="btn ghost" data-format="link">Odkaz</button>
                <button type="button" class="btn ghost" data-format="img">Obrázok (URL)</button>
                <button type="button" class="btn ghost" data-format="ul">Odrážky</button>
              </div>` : ''}
              <textarea id="nl-body" rows="14" ${editable ? '' : 'disabled'} placeholder="Napíšte text kampane. Povolené je základné formátovanie.">${esc(editing.body_html)}</textarea>
              <p class="muted nl-note">Povolené sú odseky, nadpisy, tučné a kurzívne písmo, odrážky, odkazy a obrázky len cez https. Ostatné značky server pri uložení odstráni.</p>
              ${editable && !editing.id ? '<p class="nl-note"><button type="button" class="btn ghost" data-mode="sablona">Použiť šablónu Dopis</button></p>' : ''}`}
              <div class="row" style="margin-top:14px">
                ${editable ? '<button type="button" class="btn gold" data-save>Uložiť koncept</button>' : ''}
                ${editable && editing.id ? '<button type="button" class="btn ghost" data-delete>Zmazať koncept</button>' : ''}
                ${editing.status === 'queued' || editing.status === 'sending' ? '<button type="button" class="btn ghost" data-cancel>Zrušiť odosielanie</button>' : ''}
              </div>
              <hr style="border:0;border-top:1px solid var(--line-soft);margin:22px 0">
              <label for="nl-test">Testovací e-mail</label>
              <div class="row"><input id="nl-test" type="email" maxlength="254" placeholder="meno@l-code-dynamics.com" ${editable ? '' : 'disabled'}><button type="button" class="btn ghost" data-test ${editable ? '' : 'disabled'}>Poslať test</button></div>
              <p class="muted nl-note">Test odchádza len na adresy @l-code-dynamics.com. Odkaz na odhlásenie sa pridá, ak pre adresu existuje prihlásený súhlas.</p>
              ${editable ? `<div class="row" style="margin-top:16px"><button type="button" class="btn gold" data-send>Odoslať všetkým</button><span class="muted nl-note">Prihlásených teraz: ${esc(state.stats.subscribed ?? 0)}</span></div>
                <p class="muted nl-note">Po potvrdení sa vytvorí zoznam príjemcov a e-maily odchádzajú postupne. Denný limit chráni doručiteľnosť.</p>` : ''}
            </div>
          </section>

          <section class="card" aria-labelledby="nl-preview-h">
            <div class="card-h"><h2 id="nl-preview-h" tabindex="-1" style="font:inherit;margin:0">Náhľad e-mailu</h2><span class="muted nl-note">Aktualizuje sa pri písaní</span></div>
            <div class="card-b">
              <p class="muted nl-note" style="margin-top:0">Predmet: <b id="nl-preview-subject">${esc(editing.subject || '—')}</b></p>
              <iframe id="nl-preview" class="nl-preview" title="Náhľad e-mailu kampane" sandbox></iframe>
            </div>
          </section>
        </div>

        <section class="card">
          <div class="card-b">
            <div class="nl-tabs" role="tablist" aria-label="Newsletter">
              <button type="button" class="tab ${state.tab === 'campaigns' ? 'active' : ''}" role="tab" aria-selected="${state.tab === 'campaigns'}" data-tab="campaigns">Kampane</button>
              <button type="button" class="tab ${state.tab === 'consents' ? 'active' : ''}" role="tab" aria-selected="${state.tab === 'consents'}" data-tab="consents">Odberatelia</button>
            </div>
            ${state.tab === 'campaigns' ? campaignsHtml() : consentsHtml()}
          </div>
        </section>
      </div>`;

      preview();
      wire();
    }

    function templateFormHtml(editing, editable) {
      const form = editing.form, dis = editable ? '' : 'disabled';
      const sections = form.sections.map((sec, i) => `<div class="nl-sec">
        <div class="nl-sec-h"><b>Sekcia ${i + 1}</b>${editable && form.sections.length > 1 ? `<button type="button" class="btn ghost" data-sec-del="${i}">Odstrániť</button>` : ''}</div>
        <label for="nl-sec-t-${i}">Nadpis sekcie</label>
        <input id="nl-sec-t-${i}" data-sec="${i}" data-f="title" maxlength="120" value="${esc(sec.title)}" ${dis} placeholder="Napríklad Pokoj v tmavších dňoch">
        <label for="nl-sec-x-${i}">Text (prázdny riadok = nový odsek)</label>
        <textarea id="nl-sec-x-${i}" data-sec="${i}" data-f="text" rows="6" ${dis} placeholder="Napíšte text sekcie.">${esc(sec.text)}</textarea>
      </div>`).join('');
      return `<p class="muted nl-note" style="margin-top:0">Každá sekcia je v e-maile na vlastnom farebnom podklade, ako na webe.</p>
        ${sections}
        ${editable ? '<p><button type="button" class="btn ghost" data-sec-add>Pridať sekciu</button></p>' : ''}
        <div class="nl-sec">
          <div class="nl-sec-h"><b>Jedno tlačidlo s odkazom</b></div>
          <label for="nl-cta-label">Text tlačidla</label>
          <input id="nl-cta-label" maxlength="80" value="${esc(form.ctaLabel)}" ${dis} placeholder="Napríklad Pozrieť konzultácie">
          <label for="nl-cta-url">Adresa odkazu (musí začínať https://)</label>
          <input id="nl-cta-url" maxlength="500" value="${esc(form.ctaUrl)}" ${dis} placeholder="https://">
          <label for="nl-sign">Podpis</label>
          <input id="nl-sign" maxlength="80" value="${esc(form.signature)}" ${dis} placeholder="Lucia">
        </div>
        ${editable ? '<p class="nl-note"><button type="button" class="btn ghost" data-mode="html">Upraviť ako HTML (pokročilé)</button></p>' : ''}`;
    }

    function campaignsHtml() {
      const rows = state.campaigns;
      return `<div class="ot-wrap"><table class="ot lv">
        <thead><tr><th>Predmet</th><th>Stav</th><th>Odoslané / Spolu</th><th>Dátum</th></tr></thead>
        <tbody>${rows.length ? rows.map(c => {
          const st = NL_STATUS[c.status] || [c.status, 'off'];
          const date = fmtDate(c.sent_at || c.queued_at || c.created_at);
          return `<tr class="nl-row" data-id="${esc(c.id)}" tabindex="0" role="link"><td class="lv-title">${esc(c.subject)}</td><td><span class="pill ${st[1]}">${esc(st[0])}</span></td><td>${esc(c.sent_count ?? 0)} / ${esc(c.recipients_count ?? 0)}</td><td>${esc(date)}</td></tr>`;
        }).join('') : '<tr><td colspan="4" class="empty">Zatiaľ tu nie je žiadna kampaň. Napíšte prvú v editore vyššie.</td></tr>'}</tbody>
      </table></div>`;
    }

    function consentsHtml() {
      const rows = state.consents;
      return `<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px">
          <p class="muted nl-note" style="margin:0">Zobrazených ${esc(rows.length)} z ${esc(state.consentCount)} súhlasov. Export obsahuje všetky.</p>
          <button type="button" class="btn ghost" data-export>Export CSV</button>
        </div>
        <div class="ot-wrap"><table class="ot lv">
          <thead><tr><th>E-mail</th><th>Stav</th><th>Zdroj</th><th>Súhlas</th><th>Odhlásenie</th></tr></thead>
          <tbody>${rows.length ? rows.map(c => `<tr><td class="lv-title">${esc(c.email)}</td><td><span class="pill ${c.status === 'subscribed' ? 'ok' : 'off'}">${esc(c.status === 'subscribed' ? 'prihlásený' : 'odhlásený')}</span></td><td>${esc(c.source || '—')}</td><td>${esc(fmtDate(c.consented_at))}</td><td>${c.unsubscribed_at ? esc(fmtDate(c.unsubscribed_at)) : '—'}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Zatiaľ sa nikto neprihlásil na odber.</td></tr>'}</tbody>
        </table></div>`;
    }

    function wire() {
      view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { sync(); state.tab = b.dataset.tab; render(); });
      view.querySelectorAll('.nl-row').forEach(tr => {
        const open = () => {
          const campaign = state.campaigns.find(c => c.id === tr.dataset.id);
          if (!campaign) return;
          state.editing = nlAdopt(campaign);
          state.message = null;
          state.tab = 'campaigns';
          render();
        };
        tr.onclick = open;
        tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
      });

      const subject = view.querySelector('#nl-subject');
      const preheader = view.querySelector('#nl-preheader');
      const body = view.querySelector('#nl-body');
      const syncPreview = () => {
        sync();
        const label = view.querySelector('#nl-preview-subject');
        if (label) label.textContent = state.editing.subject || '—';
        preview();
      };
      if (subject) subject.oninput = syncPreview;
      if (preheader) preheader.oninput = syncPreview;
      if (body) body.oninput = syncPreview;
      view.querySelectorAll('[data-sec],#nl-cta-label,#nl-cta-url,#nl-sign').forEach(el => { el.oninput = syncPreview; });
      const secAdd = view.querySelector('[data-sec-add]');
      if (secAdd) secAdd.onclick = () => { sync(); state.editing.form.sections.push({ title: '', text: '' }); render(); };
      view.querySelectorAll('[data-sec-del]').forEach(btn => btn.onclick = () => { sync(); state.editing.form.sections.splice(Number(btn.dataset.secDel), 1); sync(); render(); });
      view.querySelectorAll('[data-mode]').forEach(btn => btn.onclick = () => {
        sync();
        if (btn.dataset.mode === 'html') state.editing.mode = 'html';
        else { state.editing.mode = 'sablona'; state.editing.form = nlParseForm(state.editing.body_html) || { sections: [{ title: '', text: '' }], ctaLabel: '', ctaUrl: '', signature: 'Lucia' }; sync(); }
        render();
      });

      view.querySelectorAll('[data-format]').forEach(button => button.onclick = () => insertFormat(button.dataset.format));
      const newButton = view.querySelector('[data-new]');
      if (newButton) newButton.onclick = () => { state.editing = NL_BLANK(); state.message = null; state.tab = 'campaigns'; render(); };
      const saveButton = view.querySelector('[data-save]');
      if (saveButton) saveButton.onclick = () => run(async () => { await save(); });
      const deleteButton = view.querySelector('[data-delete]');
      if (deleteButton) deleteButton.onclick = () => run(removeCampaign);
      const testButton = view.querySelector('[data-test]');
      if (testButton) testButton.onclick = () => run(sendTest);
      const sendButton = view.querySelector('[data-send]');
      if (sendButton) sendButton.onclick = () => run(sendAll);
      const cancelButton = view.querySelector('[data-cancel]');
      if (cancelButton) cancelButton.onclick = () => run(cancelCampaign);
      const exportButton = view.querySelector('[data-export]');
      if (exportButton) exportButton.onclick = () => run(exportCsv);
    }

    function insertFormat(kind) {
      const field = view.querySelector('#nl-body');
      if (!field) return;
      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? start;
      const selected = field.value.slice(start, end);
      const samples = {
        h2: ['<h2>', '</h2>', 'Nadpis'],
        strong: ['<strong>', '</strong>', 'Tučné slovo'],
        link: ['<a href="https://">', '</a>', 'Text odkazu'],
        img: ['<img src="https://" alt="">', '', ''],
        ul: ['<ul>\n<li>', '</li>\n</ul>', 'Prvá odrážka'],
      };
      const [before, after, placeholder] = samples[kind] || ['', '', ''];
      const text = selected || placeholder;
      field.value = field.value.slice(0, start) + before + text + after + field.value.slice(end);
      field.focus();
      const from = start + before.length;
      field.setSelectionRange(from, from + text.length);
      sync();
      preview();
    }

    async function save() {
      sync();
      if (!state.editing.subject.trim()) throw new Error('Predmet chýba. Napíšte, o čom kampaň je.');
      const payload = {
        subject: state.editing.subject.trim(),
        preheader: state.editing.preheader.trim(),
        body_html: state.editing.body_html,
      };
      const data = state.editing.id
        ? await api(`/admin/newsletter/campaigns/${encodeURIComponent(state.editing.id)}`, { method: 'POST', body: payload })
        : await api('/admin/newsletter/campaigns', { method: 'POST', body: payload });
      state.editing = nlAdopt(data.campaign, state.editing.mode);
      state.message = { text: 'Koncept je uložený. E-mail sa zatiaľ neposlal.', error: false };
      await load();
      render();
      return data.campaign;
    }

    async function removeCampaign() {
      if (!state.editing.id) return;
      if (!confirm('Zmazať tento koncept? Zmazaný koncept sa už nedá obnoviť.')) return;
      await api(`/admin/newsletter/campaigns/${encodeURIComponent(state.editing.id)}`, { method: 'DELETE' });
      state.editing = NL_BLANK();
      state.message = { text: 'Koncept je zmazaný.', error: false };
      await load();
      render();
    }

    async function sendTest() {
      const email = String((view.querySelector('#nl-test') || {}).value || '').trim().toLowerCase();
      if (!email) throw new Error('Zadajte e-mail, na ktorý sa má poslať test.');
      if (!email.endsWith('@l-code-dynamics.com')) throw new Error('Testovací e-mail sa posiela len na adresy @l-code-dynamics.com.');
      if (!state.editing.id) await save();
      await api(`/admin/newsletter/campaigns/${encodeURIComponent(state.editing.id)}/send-test`, { method: 'POST', body: { email } });
      state.message = { text: 'Testovací e-mail je prijatý na odoslanie. Skontrolujte schránku.', error: false };
      render();
    }

    async function sendAll() {
      const count = Number(state.stats.subscribed) || 0;
      if (!count) throw new Error('Nie je komu poslať. Zatiaľ nemáte žiadneho prihláseného odberateľa.');
      if (!state.editing.id) await save();
      sync();
      if (!confirm(`Odoslať kampaň ${count} prihláseným odberateľom? E-maily začnú odchádzať v najbližších minútach a už ich nebude možné zastaviť jednotlivo.`)) return;
      const data = await api(`/admin/newsletter/campaigns/${encodeURIComponent(state.editing.id)}/send`, { method: 'POST' });
      state.editing = nlAdopt(data.campaign, state.editing.mode);
      state.message = { text: 'Kampaň je v poradí. E-maily odchádzajú postupne podľa denného limitu.', error: false };
      await load();
      render();
    }

    async function cancelCampaign() {
      if (!state.editing.id) return;
      if (!confirm('Zrušiť odosielanie tejto kampane? Zvyšné e-maily sa už nepošlú.')) return;
      const data = await api(`/admin/newsletter/campaigns/${encodeURIComponent(state.editing.id)}/cancel`, { method: 'POST' });
      state.editing = nlAdopt(data.campaign, state.editing.mode);
      state.message = { text: 'Odosielanie je zrušené. Už odoslané e-maily zostávajú doručené.', error: false };
      await load();
      render();
    }

    async function exportCsv() {
      const base = (document.querySelector('meta[name="ana-api"]')?.content || localStorage.getItem('ana_api') || 'http://localhost:9100').replace(/\/+$/, '');
      const token = localStorage.getItem('ana_token') || '';
      const lines = [];
      let offset = 0;
      for (let page = 0; page < NL_CSV_MAX_PAGES; page += 1) {
        const url = `${base}/admin/newsletter?format=csv&limit=${NL_CSV_PAGE}&offset=${offset}`;
        const res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
        if (res.status === 401) throw new Error('Prihlásenie vypršalo. Prihláste sa znova.');
        if (!res.ok) throw new Error('Export sa nepodaril. Skúste to znova.');
        const text = await res.text();
        const rows = text.split(/\r?\n/).filter(line => line.length > 0);
        if (!rows.length) break;
        if (!lines.length) lines.push(rows[0]);
        const body = rows.slice(1);
        lines.push(...body);
        if (body.length < NL_CSV_PAGE) break;
        offset += NL_CSV_PAGE;
      }
      if (lines.length < 2) throw new Error('Export je prázdny. Zatiaľ nie sú uložené žiadne súhlasy.');
      const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'newsletter-consents.csv';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      state.message = { text: 'Export súhlasov je stiahnutý.', error: false };
      render();
    }

    try {
      await load();
    } catch (error) {
      if (error.message === '401') return;
      view.innerHTML = `<div class="err" role="alert">${esc(error.message || 'Newsletter sa nepodarilo načítať. Skúste to znova.')}</div>`;
      return;
    }
    render();
  };
}

// Preview uses the same letter renderer as the backend.
function emailHtml(d) {
  return renderLuciaLetter({ subject:d.subject || 'Newsletter', preheader:d.preheader,
    bodyHtml:d.body_html, asset:location.origin, unsubscribeUrl:'#' });
}

// --- Šablóna Dopis: sekcie (nadpis + text), jedno tlačidlo a podpis. Z formulára sa skladá HTML obsahu. ---
function nlBuildBody(form) {
  const paragraphs = text => String(text || '').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean)
    .map(t => `<p>${escapeHtml(t).replace(/\n/g, '<br>')}</p>`).join('');
  const parts = (form.sections || []).map(sec => {
    const title = String(sec.title || '').trim();
    const text = paragraphs(sec.text);
    return (title ? `<h2>${escapeHtml(title)}</h2>` : '') + text;
  }).filter(Boolean);
  let html = parts.join('');
  const label = String(form.ctaLabel || '').trim(), url = String(form.ctaUrl || '').trim();
  if (label && /^https:\/\//i.test(url)) html += `<p><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></p>`;
  const sign = String(form.signature || '').trim();
  if (sign) html += `<p><em>${escapeHtml(sign)}</em></p>`;
  return html;
}

function nlParseForm(html) {
  const source = String(html || '').trim();
  const blank = () => ({ sections: [{ title: '', text: '' }], ctaLabel: '', ctaUrl: '', signature: 'Lucia' });
  if (!source) return blank();
  const doc = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html');
  const form = { sections: [], ctaLabel: '', ctaUrl: '', signature: '' };
  let current = null;
  const nodes = [...doc.body.children];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index], tag = node.tagName.toLowerCase();
    if (tag === 'h2') { current = { title: node.textContent, text: '' }; form.sections.push(current); continue; }
    if (tag !== 'p') return null;
    const link = node.children.length === 1 && node.firstElementChild.tagName === 'A' && node.textContent === node.firstElementChild.textContent ? node.firstElementChild : null;
    if (link) { form.ctaLabel = link.textContent; form.ctaUrl = link.getAttribute('href') || ''; continue; }
    const em = node.children.length === 1 && node.firstElementChild.tagName === 'EM' && node.textContent === node.firstElementChild.textContent ? node.firstElementChild : null;
    if (em && index === nodes.length - 1) { form.signature = em.textContent; continue; }
    if (node.children.length && [...node.children].some(c => c.tagName !== 'BR')) return null;
    if (!current) { current = { title: '', text: '' }; form.sections.push(current); }
    const text = [...node.childNodes].map(n => n.nodeName === 'BR' ? '\n' : n.textContent).join('');
    current.text += (current.text ? '\n\n' : '') + text;
  }
  if (!form.sections.length) form.sections.push({ title: '', text: '' });
  return form;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
