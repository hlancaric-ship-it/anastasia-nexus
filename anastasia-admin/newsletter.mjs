// Newsletter — písanie kampaní a rozosielanie prihláseným odberateľom.
// Ceny, zľavy ani obchodné údaje sa tu nepočítajú. Obsah sa ukladá na serveri (sanitizovaný),
// e-maily odosiela backendový job podľa denného limitu.

import { cropPhoto, cropShape, fileToDataUrl } from './photo-crop.mjs';

const NL_STATUS = {
  draft: ['koncept', 'warn'],
  queued: ['v poradí', 'warn'],
  sending: ['odosiela sa', 'warn'],
  sent: ['odoslaná', 'ok'],
  cancelled: ['zrušená', 'off'],
};

// Štýly sekcií ako v návrhu newslettera. Prázdny = striedajú sa automaticky (tmavý, svetlý, olivový).
const NL_STYLES = [
  ['', 'Automaticky'],
  ['dark', 'Tmavý panel s citátom'],
  ['light', 'Svetlá s fotografiou'],
  ['olive', 'Olivový pás s tlačidlom'],
];
const NL_LINK = (kind = 'button') => ({ kind, label: '', url: '' });
const NL_SECTION = (style = '') => ({ style, eyebrow: '', title: '', accent: '', image: '', alt: '', text: '', quote: '', links: [NL_LINK()] });
const NL_INTRO = () => ({ eyebrow: '', title: '', accent: '', text: '' });
const NL_FORM = () => ({ intro: NL_INTRO(), sections: [NL_SECTION()], signature: 'S láskou,' });

// Hotový newsletter podľa schváleného návrhu. Nová kampaň začína z neho, Lucia len prepíše texty a fotky.
const NL_SAMPLE_PHOTO = 'https://anastasia-test.l-code-dynamics.com/assets/newsletter-sample-product.jpg';
const NL_SAMPLE_TIP = 'https://anastasia-test.l-code-dynamics.com/assets/newsletter-tip.jpg';
const NL_TEMPLATE = () => ({
  intro: {
    eyebrow: 'Milá priateľka,',
    title: 'Teším sa,',
    accent: 'že si tu.',
    text: 'V dnešnom newsletteri sa s tebou chcem podeliť o niekoľko myšlienok, ktoré mi v poslednom čase prinášajú pokoj, rovnováhu a viac ľahkosti do každodenného života.\n\nVerím, že ťa inšpirujú rovnako ako mňa a prinesú ti viac energie, zdravia a radosti.',
  },
  sections: [
    { ...NL_SECTION('dark'), eyebrow: 'Tip pre vás', title: 'Malý rituál', accent: 'pre viac pokoja', text: 'Skúste si každý večer dopriať pár minút ticha, vedomého dýchania a vďačnosti. Uvidíte, ako aj malé okamihy môžu priniesť veľkú zmenu vo vašej energii a kvalite spánku.', image: NL_SAMPLE_TIP, alt: 'Program Reset 40', links: [{ kind: 'button', label: 'Prečítať tip', url: 'https://anastasiaoz.eu/blog' }] },
    { ...NL_SECTION('light'), eyebrow: 'Novinka', title: 'Kráľovna svojho', accent: 'života', image: NL_SAMPLE_PHOTO, alt: 'Pleťová voda Kráľovna svojho života', text: 'Jemná pleťová voda, ktorá podporuje prirodzenú rovnováhu pleti a prináša sviežosť každý deň. Vznikla s rešpektom k prírode, vede a ženám, ktoré sa starajú o seba vedome.', links: [{ kind: 'button', label: 'Viac o produkte', url: 'https://anastasiaoz.eu/eshop' }] },
    { ...NL_SECTION('olive'), eyebrow: 'Pozvánka', title: 'Online', accent: 'konzultácie', text: 'Individuálny prístup, osobné protokoly a podpora na vašej ceste k zdravšiemu a harmonickejšiemu životu.', links: [{ kind: 'button', label: 'Rezervovať termín', url: 'https://anastasiaoz.eu/konzultacie' }] },
  ],
  signature: 'S láskou,',
});
const NL_BLANK = () => {
  const form = NL_TEMPLATE();
  return { id: null, mode: 'sablona', form, subject: 'Novinky z ANASTASIA', preheader: 'Malý rituál pre viac pokoja, novinka a online konzultácie', body_html: nlBuildBody(form), status: 'draft', recipients_count: 0, sent_count: 0, failed_count: 0, created_at: null, queued_at: null, sent_at: null };
};

const NL_CSV_PAGE = 100;
const NL_CSV_MAX_PAGES = 50;

// Kampaň zo servera: ak sa dá poskladať späť na šablónu, otvorí sa vo formulári, inak ako HTML.
function nlAdopt(campaign, keepMode) {
  const parsed = nlParseForm(campaign && campaign.body_html);
  const mode = keepMode === 'html' ? 'html' : (parsed ? 'sablona' : 'html');
  return { ...campaign, mode, form: parsed || NL_FORM() };
}

export function newsletterView({ api, esc, fmtDate, freshView, pickMedia, uploadImage }) {
  return async function openNewsletter(view) {
    view = freshView(view);
    const state = {
      tab: 'campaigns',
      campaigns: [],
      stats: { subscribed: 0, campaigns_sent: 0, last_campaign: null },
      consents: [],
      consentCount: 0,
      editing: NL_BLANK(),
      message: null,
    };

    const msg = (text, error = false) => `<div class="${error ? 'err' : 'notice'}" role="${error ? 'alert' : 'status'}">${esc(text)}</div>`;
    const fail = (error) => {
      if (error && error.message === '401') return;
      const network = /failed to fetch|networkerror|load failed/i.test(String(error && error.message));
      state.message = { text: network ? 'Spojenie so serverom zlyhalo. Skontrolujte pripojenie a skúste to znova.' : ((error && error.message) || 'Spojenie zlyhalo. Skúste to znova.'), error: true };
      render();
    };
    const busy = (on) => { view.querySelectorAll('button').forEach(b => { if (b.dataset.nobusy !== '1') b.disabled = on; }); };

    // Hláška sa ukáže pri tlačidle, ktoré ju vyvolalo, a stránka sa k nej posunie.
    let messageAt = 'top', shownMessage = null;
    const slot = (at) => state.message && messageAt === at ? `<div class="nl-msg" data-msg>${msg(state.message.text, state.message.error)}</div>` : '';
    function revealMessage() {
      if (!state.message || state.message === shownMessage) return;
      shownMessage = state.message;
      const box = view.querySelector('[data-msg]');
      if (!box) return;
      const r = box.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 20) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async function run(work, at = 'top') {
      messageAt = at;
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
          const idx = Number(el.dataset.sec), field = el.dataset.f, sec = form.sections[idx];
          if (!sec) return;
          if (el.dataset.link !== undefined) { const link = sec.links[Number(el.dataset.link)]; if (link) link[field] = el.value; }
          else sec[field] = el.value;
        });
        view.querySelectorAll('[data-intro]').forEach(el => { form.intro[el.dataset.intro] = el.value; });
        const sg = view.querySelector('#nl-sign');
        if (sg) form.signature = sg.value;
        state.editing.body_html = nlBuildBody(form);
      } else if (body) state.editing.body_html = body.value;
    }

    // Náhľad vykresľuje server rovnakou šablónou, akou e-mail odíde. Pri písaní s krátkym oneskorením.
    let previewTimer = null, previewSeq = 0, previewHtml = '';
    // Celý e-mail bez vnútorného posúvania: iframe má skutočnú šírku e-mailu (počítač 1196 px, mobil 390 px)
    // a zmenší sa na šírku panela, výška podľa obsahu. Skripty v iframe nebežia (sandbox bez allow-scripts).
    let previewMode = 'desktop', previewObserver = null;
    const PREVIEW_WIDTH = { desktop: 1196, mobile: 390 };
    function fitPreview() {
      const box = view.querySelector('#nl-pv');
      const frame = view.querySelector('#nl-preview');
      if (!box || !frame) return;
      const width = PREVIEW_WIDTH[previewMode];
      const scale = Math.min(1, (box.clientWidth || width) / width);
      let height = 900;
      try {
        const doc = frame.contentDocument;
        if (doc && doc.documentElement) {
          frame.style.height = '0px';
          height = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0) || height;
        }
      } catch { /* bez prístupu k obsahu ponecháme predvolenú výšku */ }
      frame.style.width = width + 'px';
      frame.style.height = height + 'px';
      frame.style.transform = scale < 1 ? `scale(${scale})` : '';
      box.style.height = Math.ceil(height * scale) + 'px';
    }
    function watchPreview() {
      const box = view.querySelector('#nl-pv');
      const frame = view.querySelector('#nl-preview');
      if (!box || !frame) return;
      frame.addEventListener('load', () => {
        fitPreview();
        // Obrázky a písma sa môžu dotiahnuť po load; prepočítame ešte raz.
        try { frame.contentDocument?.querySelectorAll('img').forEach((img) => { if (!img.complete) img.addEventListener('load', fitPreview, { once: true }); }); } catch { /* ignore */ }
        setTimeout(fitPreview, 600);
      });
      previewObserver?.disconnect();
      if (typeof ResizeObserver === 'function') { previewObserver = new ResizeObserver(() => fitPreview()); previewObserver.observe(box); }
      fitPreview();
    }
    function preview(immediate = false) {
      clearTimeout(previewTimer);
      const frame = view.querySelector('#nl-preview');
      if (frame && previewHtml && !frame.srcdoc) frame.srcdoc = previewHtml;
      previewTimer = setTimeout(async () => {
        const seq = ++previewSeq;
        try {
          const data = await api('/admin/newsletter/preview', { method: 'POST', body: { subject: state.editing.subject, preheader: state.editing.preheader, body_html: state.editing.body_html } });
          if (seq !== previewSeq || !data || typeof data.html !== 'string') return;
          previewHtml = data.html;
          const current = view.querySelector('#nl-preview');
          if (current) current.srcdoc = previewHtml;
        } catch {
          const current = view.querySelector('#nl-preview');
          if (current && seq === previewSeq && !previewHtml) current.srcdoc = '<p style="font:14px sans-serif;color:#777;padding:24px">Náhľad sa nepodarilo načítať. Skúste to o chvíľu.</p>';
        }
      }, immediate ? 0 : 450);
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
        .nl-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start;width:100%;max-width:1120px;margin:0 auto}
        .nl-tools{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px}
        .nl-sec{border:1px solid var(--line);border-radius:14px;padding:12px 16px 14px;margin:0 0 12px;background:rgba(255,255,255,.6)}
        .nl-sec-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
        .nl-sec-tools{display:flex;gap:6px}
        .nl-sec-tools .btn{padding:6px 10px;min-height:32px}
        .nl-link{display:grid;grid-template-columns:140px minmax(0,1fr) minmax(0,1.3fr) auto;gap:8px;align-items:center;margin:0 0 8px}
        .nl-link .btn{padding:8px 12px;min-height:36px}
        .nl-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 12px}
        .nl-3{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1fr) minmax(0,1fr);gap:0 12px}
        .nl-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0 12px}
        .nl-act{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:14px 0 0}
        .nl-act .btn{width:auto;flex:0 0 auto}
        .nl-msg{margin:12px 0 0}.nl-msg>*{margin:0}
        .nl-act input{flex:0 1 320px;width:auto}
        .nl-editor label{margin:12px 0 5px;font-size:12.5px}
        .nl-editor input,.nl-editor select{min-height:38px;padding:7px 12px;font-size:13.5px}
        .nl-editor .btn{min-height:38px;padding:8px 14px;font-size:13px}
        .nl-sec textarea{font:inherit;font-size:13.5px;line-height:1.6}
        .nl-sec .nl-note{margin:6px 0 0}
        .nl-photo{display:grid;grid-template-columns:132px minmax(0,1fr);gap:14px;align-items:start;margin:4px 0 6px}
        .nl-photo img,.nl-photo-empty{width:132px;height:96px;object-fit:cover;border-radius:44px 8px 8px 8px;background:#eeecf5;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--muted)}
        .nl-photo-act{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
        .nl-photo-act .btn{padding:8px 12px;min-height:36px;cursor:pointer}
        .nl-photo-act label[for],.nl-photo-act input{flex:1 1 100%}
        .nl-photo-act label[for]{margin-bottom:0}
        .nl-tools .btn{padding:8px 12px;min-height:36px}
        .nl-editor textarea{width:100%;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}
        .nl-pv{position:relative;width:100%;max-width:1198px;margin:0 auto;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:#fbf8f2;min-height:320px}
        .nl-pv.mobile{max-width:392px;margin:0 auto}
        .nl-preview{display:block;border:0;transform-origin:0 0;background:#fbf8f2}
        .nl-pv-mode{display:flex;gap:6px}.nl-pv-mode .btn{padding:6px 12px;min-height:32px;font-size:12.5px}.nl-pv-mode .btn.on{border-color:var(--gold);color:var(--primary)}
        .nl-note{font-size:12px;color:var(--muted);line-height:1.6}
        .nl-tabs{display:flex;gap:20px;border-bottom:1px solid var(--line);margin:2px 0 18px}
        .nl-tabs .tab{background:none;border:0;border-bottom:2px solid transparent;padding:0 0 12px;min-height:44px;font:inherit;font-size:13.5px;color:var(--muted);cursor:pointer}
        .nl-tabs .tab.active{border-bottom-color:var(--gold);color:var(--primary)}
        .nl-row{cursor:pointer}
        @media(max-width:1100px){.nl-4{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:900px){.nl-stats,.nl-grid,.nl-2,.nl-3,.nl-4,.nl-link{grid-template-columns:1fr}}
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
          <section class="card nl-editor" aria-labelledby="nl-editor-h" data-no-fgrid>
            <div class="card-h"><h2 id="nl-editor-h" tabindex="-1" style="font:inherit;margin:0">Kampaň <span class="pill ${status[1]}">${esc(status[0])}</span></h2>
              <div class="card-h-act"><button type="button" class="btn ghost" data-new>Nová kampaň</button></div>
            </div>
            <div class="card-b">
              ${slot('top')}
              <div class="nl-2">
                <div><label for="nl-subject">Predmet</label>
                <input id="nl-subject" maxlength="200" value="${esc(editing.subject)}" ${editable ? '' : 'disabled'} placeholder="Napríklad Novinky z ateliéru ANASTASIA"></div>
                <div><label for="nl-preheader">Náhľadový text</label>
                <input id="nl-preheader" maxlength="300" value="${esc(editing.preheader)}" ${editable ? '' : 'disabled'} placeholder="Krátky úvod, ktorý sa zobrazí pri predmete"></div>
              </div>
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
              ${editable ? '<p class="nl-note"><button type="button" class="btn ghost" data-mode="sablona">Späť do formulára</button> <button type="button" class="btn ghost" data-mode="vzor">Začať znova podľa návrhu</button></p>' : ''}`}
              <div class="nl-act">
                ${editable ? '<button type="button" class="btn gold" data-save>Uložiť koncept</button>' : ''}
                ${editable && editing.id ? '<button type="button" class="btn ghost" data-delete>Zmazať koncept</button>' : ''}
                ${editing.status === 'queued' || editing.status === 'sending' ? '<button type="button" class="btn ghost" data-cancel>Zrušiť odosielanie</button>' : ''}
              </div>
              ${slot('save')}
              <hr style="border:0;border-top:1px solid var(--line-soft);margin:22px 0">
              <label for="nl-test">Testovací e-mail</label>
              <div class="nl-act" style="margin-top:0"><input id="nl-test" type="email" maxlength="254" placeholder="meno@l-code-dynamics.com" ${editable ? '' : 'disabled'}><button type="button" class="btn ghost" data-test ${editable ? '' : 'disabled'}>Poslať test</button></div>
              ${slot('test')}
              <p class="muted nl-note">Test odchádza len na adresy @l-code-dynamics.com. Odkaz na odhlásenie sa pridá, ak pre adresu existuje prihlásený súhlas.</p>
              ${editable ? `<div class="nl-act" style="margin-top:16px"><button type="button" class="btn gold" data-send>Odoslať všetkým</button><span class="muted nl-note">Prihlásených teraz: ${esc(state.stats.subscribed ?? 0)}</span></div>
                ${slot('send')}
                <p class="muted nl-note">Po potvrdení sa vytvorí zoznam príjemcov a e-maily odchádzajú postupne. Denný limit chráni doručiteľnosť.</p>` : ''}
            </div>
          </section>

          <section class="card" aria-labelledby="nl-preview-h">
            <div class="card-h"><h2 id="nl-preview-h" tabindex="-1" style="font:inherit;margin:0">Náhľad e-mailu</h2><span class="muted nl-note">Aktualizuje sa pri písaní</span></div>
            <div class="card-b">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
                <p class="muted nl-note" style="margin:0">Predmet: <b id="nl-preview-subject">${esc(editing.subject || '—')}</b></p>
                <div class="nl-pv-mode" role="group" aria-label="Zobrazenie náhľadu">
                  <button type="button" class="btn ${previewMode === 'desktop' ? 'on' : ''}" data-pv-mode="desktop" aria-pressed="${previewMode === 'desktop'}">Počítač</button>
                  <button type="button" class="btn ${previewMode === 'mobile' ? 'on' : ''}" data-pv-mode="mobile" aria-pressed="${previewMode === 'mobile'}">Mobil</button>
                </div>
              </div>
              <div class="nl-pv ${previewMode === 'mobile' ? 'mobile' : ''}" id="nl-pv"><iframe id="nl-preview" class="nl-preview" title="Náhľad e-mailu kampane" sandbox="allow-same-origin" scrolling="no"></iframe></div>
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

      watchPreview();
      preview(true);
      wire();
      revealMessage();
    }

    // Fotografia: náhľad, výber z mediálnej banky, nahratie z počítača a popis pre čítačky.
    function photoHtml(key, src, alt, editable, altId, altAttrs) {
      const dis = editable ? '' : 'disabled';
      return `<div class="nl-photo">
        ${src ? `<img src="${esc(src)}" alt="">` : '<div class="nl-photo-empty">Bez fotografie</div>'}
        <div class="nl-photo-act">
          ${editable ? `<button type="button" class="btn ghost" data-photo-pick="${key}">Vybrať z médií</button>
          <label class="btn ghost">Nahrať z počítača<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" data-photo-file="${key}"></label>
          ${src ? `<button type="button" class="btn ghost" data-photo-crop="${key}">Upraviť výrez</button>
          <button type="button" class="btn ghost danger" data-photo-del="${key}">Odstrániť</button>` : ''}` : ''}
          ${src ? `<label for="${altId}">Popis fotografie (pre nevidiacich a keď sa obrázky nenačítajú)</label>
          <input id="${altId}" ${altAttrs} maxlength="200" value="${esc(alt)}" ${dis} placeholder="Napríklad Ranný les v hmle">` : ''}
        </div>
      </div>`;
    }

    function headingHtml(prefix, data, dis, idAttr, before = '', cls = 'nl-2') {
      return `<div class="${cls}">${before}
          <div><label for="${prefix}-t">Nadpis</label>
          <input id="${prefix}-t" ${idAttr('title')} maxlength="120" value="${esc(data.title)}" ${dis} placeholder="Napríklad Malý rituál"></div>
          <div><label for="${prefix}-ac">Zvýraznené slová (fialová kurzíva)</label>
          <input id="${prefix}-ac" ${idAttr('accent')} maxlength="80" value="${esc(data.accent)}" ${dis} placeholder="Napríklad viac pokoja"></div>
        </div>`;
    }

    function templateFormHtml(editing, editable) {
      const form = editing.form, dis = editable ? '' : 'disabled', last = form.sections.length - 1;
      const intro = form.intro;
      const sections = form.sections.map((sec, i) => {
        const field = f => `data-sec="${i}" data-f="${f}"`;
        return `<div class="nl-sec">
        <div class="nl-sec-h"><b>Sekcia ${i + 1}</b>${editable ? `<span class="nl-sec-tools">
          ${i > 0 ? `<button type="button" class="btn ghost" data-sec-up="${i}" aria-label="Posunúť sekciu ${i + 1} vyššie">↑</button>` : ''}
          ${i < last ? `<button type="button" class="btn ghost" data-sec-down="${i}" aria-label="Posunúť sekciu ${i + 1} nižšie">↓</button>` : ''}
          <button type="button" class="btn ghost" data-sec-del="${i}">Odstrániť</button></span>` : ''}</div>
        ${headingHtml(`nl-sec-${i}`, sec, dis, field, `
          <div><label for="nl-sec-s-${i}">Vzhľad sekcie</label>
          <select id="nl-sec-s-${i}" ${field('style')} ${dis}>${NL_STYLES.map(([v, l]) => `<option value="${v}" ${sec.style === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div><label for="nl-sec-e-${i}">Nadtitulok (malý text nad nadpisom)</label>
          <input id="nl-sec-e-${i}" ${field('eyebrow')} maxlength="60" value="${esc(sec.eyebrow)}" ${dis} placeholder="Napríklad Tip pre vás"></div>`, 'nl-4')}
        <label for="nl-sec-x-${i}">Text (prázdny riadok = nový odsek)</label>
        <textarea id="nl-sec-x-${i}" ${field('text')} rows="4" ${dis} placeholder="Napíšte text sekcie.">${esc(sec.text)}</textarea>
        <div class="nl-2">
          <div><label>Fotografia (v tmavom paneli sa ukáže, len ak nie je citát)</label>
          ${photoHtml(`s${i}`, sec.image, sec.alt, editable, `nl-sec-a-${i}`, field('alt'))}</div>
          <div><label for="nl-sec-q-${i}">Citát vpravo (len tmavý panel, nepovinné)</label>
          <input id="nl-sec-q-${i}" ${field('quote')} maxlength="160" value="${esc(sec.quote)}" ${dis} placeholder="Napríklad Pokoj začína v malých okamihoch."></div>
        </div>
        <label>Tlačidlá a odkazy</label>
        ${sec.links.map((link, j) => {
          const lf = f => `data-sec="${i}" data-link="${j}" data-f="${f}"`;
          return `<div class="nl-link">
          <select id="nl-sec-lk-${i}-${j}" ${lf('kind')} ${dis} aria-label="Druh odkazu ${j + 1}"><option value="button" ${link.kind !== 'link' ? 'selected' : ''}>Tlačidlo</option><option value="link" ${link.kind === 'link' ? 'selected' : ''}>Odkaz v texte</option></select>
          <input id="nl-sec-ll-${i}-${j}" ${lf('label')} maxlength="80" value="${esc(link.label)}" ${dis} placeholder="Text, napríklad Rezervovať termín" aria-label="Text odkazu ${j + 1}">
          <input id="nl-sec-lu-${i}-${j}" ${lf('url')} maxlength="500" value="${esc(link.url)}" ${dis} placeholder="https://anastasiaoz.eu/..." aria-label="Adresa odkazu ${j + 1}">
          ${editable ? `<button type="button" class="btn ghost" data-link-del="${i}:${j}" aria-label="Odstrániť odkaz ${j + 1}">Odstrániť</button>` : ''}
        </div>`;
        }).join('') || '<p class="muted nl-note" style="margin:0 0 8px">Sekcia nemá tlačidlo ani odkaz.</p>'}
        ${editable ? `<p style="margin:4px 0 0"><button type="button" class="btn ghost" data-link-add="${i}">Pridať tlačidlo alebo odkaz</button></p>` : ''}
      </div>`;
      }).join('');
      const introField = f => `data-intro="${f}"`;
      return `<p class="muted nl-note" style="margin-top:14px">Newsletter je pripravený podľa návrhu. Stačí prepísať texty, vymeniť fotografie a odkazy. Fotografia Lucie hore je stála.</p>
        <div class="nl-sec">
          <div class="nl-sec-h"><b>Úvod vedľa fotografie Lucie</b></div>
          ${headingHtml('nl-in', intro, dis, introField, `
          <div><label for="nl-in-e">Oslovenie (malý text nad nadpisom)</label>
          <input id="nl-in-e" ${introField('eyebrow')} maxlength="60" value="${esc(intro.eyebrow)}" ${dis} placeholder="Napríklad Milá priateľka,"></div>`, 'nl-3')}
          <label for="nl-in-x">Text (prázdny riadok = nový odsek)</label>
          <textarea id="nl-in-x" ${introField('text')} rows="4" ${dis} placeholder="Napíšte úvodný text.">${esc(intro.text)}</textarea>
          <div class="nl-2" style="align-items:end">
            <div><label for="nl-sign">Pozdrav pred podpisom</label>
            <input id="nl-sign" maxlength="80" value="${esc(form.signature)}" ${dis} placeholder="S láskou,"></div>
            <p class="muted nl-note" style="margin:0 0 10px">Pod pozdravom je vždy podpis Lucia Rogožanová, Farmaceutka • Tvorkyňa ANASTASIA.</p>
          </div>
        </div>
        ${sections}
        ${editable ? '<div class="nl-act" style="margin:0"><button type="button" class="btn ghost" data-sec-add>Pridať sekciu</button><button type="button" class="btn ghost" data-mode="html">Upraviť ako HTML (pokročilé)</button></div>' : ''}`;
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
      view.querySelectorAll('[data-pv-mode]').forEach(b => b.onclick = () => {
        previewMode = b.dataset.pvMode === 'mobile' ? 'mobile' : 'desktop';
        view.querySelector('#nl-pv')?.classList.toggle('mobile', previewMode === 'mobile');
        view.querySelectorAll('[data-pv-mode]').forEach(x => { const on = x.dataset.pvMode === previewMode; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
        fitPreview();
      });
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
      view.querySelectorAll('[data-sec],[data-intro],#nl-sign').forEach(el => { el.oninput = syncPreview; if (el.tagName === 'SELECT') el.onchange = syncPreview; });
      const secAdd = view.querySelector('[data-sec-add]');
      if (secAdd) secAdd.onclick = () => { sync(); state.editing.form.sections.push(NL_SECTION()); sync(); render(); };
      const moveSec = (from, to) => { sync(); const list = state.editing.form.sections; if (to < 0 || to >= list.length) return; list.splice(to, 0, list.splice(from, 1)[0]); sync(); render(); };
      view.querySelectorAll('[data-sec-up]').forEach(btn => btn.onclick = () => moveSec(Number(btn.dataset.secUp), Number(btn.dataset.secUp) - 1));
      view.querySelectorAll('[data-sec-down]').forEach(btn => btn.onclick = () => moveSec(Number(btn.dataset.secDown), Number(btn.dataset.secDown) + 1));
      const setPhoto = (key, url) => {
        const form = state.editing.form;
        { const sec = form.sections[Number(key.slice(1))]; if (!sec) return; sec.image = url; if (!url) sec.alt = ''; }
      };
      const usable = url => /^https:\/\//i.test(String(url || ''));
      const shapeOf = key => cropShape(state.editing.form.sections[Number(key.slice(1))]?.style);
      // Orezaná fotografia sa nahrá ako nový súbor do Médií. Pri zrušení okna sa nič nemení.
      const cropAndUpload = async (key, src) => {
        const file = await cropPhoto(src, shapeOf(key), { esc, name: `newsletter-${key}-${Date.now()}` });
        if (!file) return false;
        const url = await uploadImage(file);
        if (!usable(url)) throw new Error('Nahratá fotografia nemá verejnú adresu https, do e-mailu sa nedá použiť.');
        setPhoto(key, url);
        messageAt = 'top'; state.message = { text: 'Fotografia je orezaná a nahratá aj v Médiách. Nezabudnite uložiť koncept.', error: false };
        sync(); render();
        return true;
      };
      view.querySelectorAll('[data-photo-pick]').forEach(btn => btn.onclick = async () => {
        sync();
        const key = btn.dataset.photoPick;
        const [url] = await pickMedia([]);
        if (!url) return;
        if (!usable(url)) { messageAt = 'top'; state.message = { text: 'Táto fotografia nemá verejnú adresu https, do e-mailu sa nedá použiť.', error: true }; render(); return; }
        try {
          await cropAndUpload(key, url);
        } catch {
          // Médiá bez CORS sa nedajú orezať v prehliadači, fotografia sa použije celá.
          setPhoto(key, url);
          messageAt = 'top'; state.message = { text: 'Fotografia je vložená celá. Ak ju chcete orezať, nahrajte ju z počítača.', error: false };
          sync(); render();
        }
      });
      view.querySelectorAll('[data-photo-file]').forEach(input => input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;
        sync();
        run(async () => {
          if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 15 * 1024 * 1024) throw new Error(`${file.name}: povolené sú JPG, PNG a WebP do 15 MB.`);
          await cropAndUpload(input.dataset.photoFile, await fileToDataUrl(file));
        });
      });
      view.querySelectorAll('[data-photo-crop]').forEach(btn => btn.onclick = () => {
        sync();
        const key = btn.dataset.photoCrop;
        const sec = state.editing.form.sections[Number(key.slice(1))];
        if (!sec?.image) return;
        run(async () => {
          try { await cropAndUpload(key, sec.image); }
          catch { throw new Error('Túto fotografiu nie je možné orezať v prehliadači. Nahrajte ju znova z počítača.'); }
        });
      });
      view.querySelectorAll('[data-photo-del]').forEach(btn => btn.onclick = () => { sync(); setPhoto(btn.dataset.photoDel, ''); sync(); render(); });
      view.querySelectorAll('[data-link-add]').forEach(btn => btn.onclick = () => {
        sync();
        const sec = state.editing.form.sections[Number(btn.dataset.linkAdd)];
        if (!sec) return;
        sec.links.push(NL_LINK(sec.links.some(l => l.kind !== 'link') ? 'link' : 'button'));
        sync(); render();
      });
      view.querySelectorAll('[data-link-del]').forEach(btn => btn.onclick = () => {
        sync();
        const [i, j] = btn.dataset.linkDel.split(':').map(Number);
        const sec = state.editing.form.sections[i];
        if (sec) sec.links.splice(j, 1);
        sync(); render();
      });
      view.querySelectorAll('[data-sec-del]').forEach(btn => btn.onclick = () => { sync(); state.editing.form.sections.splice(Number(btn.dataset.secDel), 1); sync(); render(); });
      view.querySelectorAll('[data-mode]').forEach(btn => btn.onclick = () => {
        sync();
        if (btn.dataset.mode === 'html') state.editing.mode = 'html';
        else if (btn.dataset.mode === 'vzor') {
          if (!confirm('Nahradiť obsah kampane hotovým newsletterom podľa návrhu? Terajší text sa stratí.')) return;
          state.editing.mode = 'sablona'; state.editing.form = NL_TEMPLATE(); state.editing.body_html = nlBuildBody(state.editing.form);
        } else {
          const parsed = nlParseForm(state.editing.body_html);
          if (!parsed) { messageAt = 'top'; state.message = { text: 'Tento obsah sa nedá zobraziť vo formulári. Upravte ho ako HTML alebo začnite znova podľa návrhu.', error: true }; render(); return; }
          state.editing.mode = 'sablona'; state.editing.form = parsed; sync();
        }
        render();
      });

      view.querySelectorAll('[data-format]').forEach(button => button.onclick = () => insertFormat(button.dataset.format));
      const newButton = view.querySelector('[data-new]');
      if (newButton) newButton.onclick = () => { state.editing = NL_BLANK(); state.message = null; state.tab = 'campaigns'; render(); };
      const saveButton = view.querySelector('[data-save]');
      if (saveButton) saveButton.onclick = () => run(async () => { await save(); }, 'save');
      const deleteButton = view.querySelector('[data-delete]');
      if (deleteButton) deleteButton.onclick = () => run(removeCampaign, 'save');
      const testButton = view.querySelector('[data-test]');
      if (testButton) testButton.onclick = () => run(sendTest, 'test');
      const sendButton = view.querySelector('[data-send]');
      if (sendButton) sendButton.onclick = () => run(sendAll, 'send');
      const cancelButton = view.querySelector('[data-cancel]');
      if (cancelButton) cancelButton.onclick = () => run(cancelCampaign, 'save');
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

// --- Šablóna podľa návrhu: úvod vedľa stálej fotky, sekcie (vzhľad, nadpis, fotka, text, citát, tlačidlo) a pozdrav.
// Z formulára sa skladá HTML obsahu s rolami data-nl, ktoré pozná serverová šablóna (policy.ts).
const NL_STYLE_VALUES = new Set(['dark', 'light', 'olive']);

function nlBuildBody(form) {
  const https = v => /^https:\/\//i.test(String(v || '').trim());
  const clean = v => String(v || '').trim();
  const paragraphs = text => String(text || '').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean)
    .map(t => `<p>${escapeHtml(t).replace(/\n/g, '<br>')}</p>`).join('');
  const heading = d => {
    const title = clean(d.title), accent = clean(d.accent);
    if (!title && !accent) return '';
    return `<h2>${escapeHtml(title)}${title && accent ? ' ' : ''}${accent ? `<em>${escapeHtml(accent)}</em>` : ''}</h2>`;
  };
  const eyebrow = v => clean(v) ? `<p data-nl="eyebrow">${escapeHtml(clean(v))}</p>` : '';
  const intro = form.intro || NL_INTRO();
  const introHtml = eyebrow(intro.eyebrow) + heading(intro) + paragraphs(intro.text);
  const parts = (form.sections || []).map(sec => {
    const links = (sec.links || []).map(l => ({ kind: l.kind === 'link' ? 'link' : 'button', label: clean(l.label), url: clean(l.url) }))
      .filter(l => l.label && https(l.url))
      .map(l => `<p${l.kind === 'link' ? ' data-nl="link"' : ''}><a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a></p>`).join('');
    const content = eyebrow(sec.eyebrow) + heading(sec)
      + (https(sec.image) ? `<img src="${escapeHtml(clean(sec.image))}" alt="${escapeHtml(clean(sec.alt))}">` : '')
      + paragraphs(sec.text)
      + links
      + (clean(sec.quote) ? `<p data-nl="quote">${escapeHtml(clean(sec.quote))}</p>` : '');
    if (!content) return '';
    return (NL_STYLE_VALUES.has(sec.style) ? `<hr data-nl="${sec.style}">` : '<hr>') + content;
  }).join('');
  const sign = clean(form.signature);
  return introHtml + parts + (sign ? `<p data-nl="sign">${escapeHtml(sign)}</p>` : '');
}

// Spätné poskladanie formulára z uloženého HTML. Ak obsah nezodpovedá šablóne, vráti null (otvorí sa ako HTML).
function nlParseForm(html) {
  const source = String(html || '').trim();
  if (!source) return NL_TEMPLATE();
  const doc = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html');
  const nodes = [...doc.body.children];
  if (nodes.some(n => n.tagName === 'H2') && !nodes.some(n => n.tagName === 'HR')) return null;
  const form = { intro: NL_INTRO(), sections: [], signature: '' };
  let current = form.intro, isIntro = true;
  const only = (node, tag) => node.children.length === 1 && node.firstElementChild.tagName === tag && node.textContent === node.firstElementChild.textContent ? node.firstElementChild : null;
  for (const node of nodes) {
    const tag = node.tagName.toLowerCase(), role = node.getAttribute('data-nl') || '';
    if (tag === 'hr') { current = { ...NL_SECTION(NL_STYLE_VALUES.has(role) ? role : ''), links: [] }; form.sections.push(current); isIntro = false; continue; }
    if (tag === 'img') {
      if (isIntro || current.image) return null;
      current.image = node.getAttribute('src') || ''; current.alt = node.getAttribute('alt') || '';
      continue;
    }
    if (tag === 'h2') {
      if (current.title || current.accent) return null;
      const kids = [...node.childNodes];
      const emIndex = kids.findIndex(n => n.nodeName === 'EM');
      if (kids.some((n, i) => n.nodeType === 1 && i !== emIndex) || (emIndex >= 0 && kids.slice(emIndex + 1).some(n => n.textContent.trim()))) return null;
      if (emIndex >= 0 && kids[emIndex].children.length) return null;
      current.title = kids.slice(0, emIndex >= 0 ? emIndex : kids.length).map(n => n.textContent).join('').trim();
      current.accent = emIndex >= 0 ? kids[emIndex].textContent.trim() : '';
      continue;
    }
    if (tag !== 'p') return null;
    if (role === 'sign') { form.signature = node.textContent; continue; }
    if (role === 'eyebrow') { if (current.eyebrow) return null; current.eyebrow = node.textContent; continue; }
    if (role === 'quote') { if (isIntro || current.quote) return null; current.quote = node.textContent; continue; }
    const link = only(node, 'A');
    if (link) {
      if (isIntro) return null;
      current.links.push({ kind: role === 'link' ? 'link' : 'button', label: link.textContent, url: link.getAttribute('href') || '' });
      continue;
    }
    if (node.children.length && [...node.children].some(c => c.tagName !== 'BR')) return null;
    const text = [...node.childNodes].map(n => n.nodeName === 'BR' ? '\n' : n.textContent).join('');
    current.text += (current.text ? '\n\n' : '') + text;
  }
  return form;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
