// Novinky — príspevky na stránke Novinky a vo výsuvnom paneli webu, reklamné plochy partnerov a texty stránky.
// Admin len zbiera údaje; celý dokument overuje server (bez HTML, len https, médiá len z nášho úložiska)
// a ukladá ho s revíziou, aby si dvaja ľudia neprepísali zmeny.

const NV_KIND = [
  ['image', 'Fotografia'],
  ['video', 'Video'],
  ['youtube', 'YouTube'],
  ['text', 'Len text'],
  ['poll', 'Anketa'],
];
const NV_CATEGORY_TONE = { tip: '#8a9a6b', pozvanka: '#b08a4a', anketa: '#7d79a8', novinka: '#4f6d86' };
const NV_VIDEO_TYPES = ['video/mp4', 'video/webm'];
const NV_VIDEO_MAX = 200 * 1024 * 1024;

const nvPost = () => ({
  id: '', category: 'novinka', kind: 'image', title: '', excerpt: '', image_url: null, image_alt: '', video_url: null, poster_url: null,
  youtube_id: null, link_url: null, link_label: '', featured: false, hidden: true, published_at: new Date().toISOString(), sort: 0,
  poll: null,
});
const nvPoll = () => ({ question: '', options: [{ id: '', label: '' }, { id: '', label: '' }] });

// ISO → hodnota pre <input type="datetime-local"> v miestnom čase a späť.
const toLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// Telo dokumentu pre server: len polia, ktoré server prijíma (bez výsledkov ankiet a počtu kliknutí).
function nvPayload(doc) {
  return {
    revision: doc.revision,
    page: { ...doc.page },
    panel: { ...doc.panel },
    posts: doc.posts.map((p, i) => ({
      id: p.id || undefined, category: p.category, kind: p.kind, title: p.title, excerpt: p.excerpt,
      image_url: p.image_url || null, image_alt: p.image_alt, video_url: p.video_url || null, poster_url: p.poster_url || null,
      youtube_id: p.youtube_id || null, link_url: p.link_url || null, link_label: p.link_label, featured: !!p.featured,
      hidden: !!p.hidden, published_at: p.published_at, sort: i,
      poll: p.kind === 'poll' && p.poll ? { question: p.poll.question, options: p.poll.options.map(o => ({ id: o.id || undefined, label: o.label })) } : null,
    })),
    ads: doc.ads.map(a => ({
      slot: a.slot, enabled: !!a.enabled, label: a.label, title: a.title, text: a.text, button: a.button, url: a.url || null,
      image_url: a.image_url || null, image_alt: a.image_alt, active_from: a.active_from || null, active_to: a.active_to || null,
    })),
  };
}

export function novinkyView({ api, esc, fmtDate, freshView, pickMedia, uploadImage }) {
  return async function openNovinky(view) {
    view = freshView(view);
    const state = { tab: 'posts', doc: null, saved: '', editing: -1, message: null, schema: null };

    const msg = (text, error = false) => `<div class="${error ? 'err' : 'notice'}" role="${error ? 'alert' : 'status'}">${esc(text)}</div>`;
    const snapshot = () => JSON.stringify(nvPayload(state.doc));
    const dirty = () => !!state.doc && snapshot() !== state.saved;
    const categories = () => (state.schema && state.schema.categories) || [{ key: 'tip', label: 'Tip' }, { key: 'pozvanka', label: 'Pozvánka' }, { key: 'anketa', label: 'Anketa' }, { key: 'novinka', label: 'Novinka' }];
    const limit = (key, fallback) => (state.schema && state.schema.limits && state.schema.limits[key]) || fallback;
    const catLabel = (key) => (categories().find(c => c.key === key) || { label: key }).label;

    function adopt(data) {
      state.doc = data;
      state.schema = data.schema || state.schema;
      state.saved = snapshot();
    }

    async function load() {
      adopt(await api('/admin/novinky'));
    }

    async function save() {
      sync();
      const btn = view.querySelector('#nv-save');
      if (btn) btn.disabled = true;
      try {
        adopt(await api('/admin/novinky', { method: 'PUT', body: nvPayload(state.doc) }));
        state.message = { text: 'Novinky sú uložené. Na webe sa zobrazia do minúty.' };
      } catch (error) {
        if (error && error.message === '401') return;
        state.message = { text: (error && error.message) || 'Uloženie zlyhalo. Skúste to znova.', error: true };
      }
      render();
    }

    // Hodnoty z formulára do stavu (pred každým prekreslením, aby sa nič nestratilo).
    function sync() {
      if (!state.doc) return;
      view.querySelectorAll('[data-page]').forEach(el => { state.doc.page[el.dataset.page] = el.value; });
      view.querySelectorAll('[data-panel]').forEach(el => {
        const f = el.dataset.panel;
        state.doc.panel[f] = f === 'enabled' ? el.checked : f === 'ad_slot' ? (el.value ? Number(el.value) : null) : el.value;
      });
      view.querySelectorAll('[data-ad]').forEach(el => {
        const ad = state.doc.ads[Number(el.dataset.ad)], f = el.dataset.f;
        if (!ad) return;
        if (f === 'enabled') ad.enabled = el.checked;
        else if (f === 'active_from' || f === 'active_to') ad[f] = fromLocal(el.value);
        else ad[f] = el.value;
      });
      const post = state.doc.posts[state.editing];
      if (post) {
        view.querySelectorAll('[data-post]').forEach(el => {
          const f = el.dataset.post;
          if (f === 'featured' || f === 'hidden') post[f] = el.checked;
          else if (f === 'published_at') post.published_at = fromLocal(el.value) || post.published_at;
          else post[f] = el.value;
        });
        if (post.kind === 'poll') {
          post.poll ||= nvPoll();
          const q = view.querySelector('[data-poll-q]');
          if (q) post.poll.question = q.value;
          view.querySelectorAll('[data-poll-o]').forEach(el => { const o = post.poll.options[Number(el.dataset.pollO)]; if (o) o.label = el.value; });
        }
      }
    }

    // --- nahrávanie ---
    async function chooseImage() {
      const [url] = await pickMedia([]);
      return url || null;
    }
    async function uploadPhoto(file) {
      return uploadImage(file);
    }
    async function uploadVideo(file) {
      if (!NV_VIDEO_TYPES.includes(file.type)) throw new Error(`Video musí byť MP4 alebo WEBM, „${file.name}“ má typ ${file.type || 'neznámy'}.`);
      if (file.size > NV_VIDEO_MAX) throw new Error(`Video je príliš veľké (maximálne 200 MB), „${file.name}“ má ${Math.round(file.size / 1024 / 1024)} MB.`);
      const fd = new FormData(); fd.append('files', file);
      const data = await api('/admin/uploads', { method: 'POST', body: fd });
      const f = (data.files || [])[0];
      if (!f || !f.url) throw new Error('Nahratie videa zlyhalo. Skúste to znova.');
      return f.url;
    }

    // --- náhľad karty tak, ako ju uvidí návštevníčka webu ---
    function cardPreview(p) {
      const tone = NV_CATEGORY_TONE[p.category] || '#73729c';
      const media = p.kind === 'video' && p.video_url
        ? `<video src="${esc(p.video_url)}" ${p.poster_url ? `poster="${esc(p.poster_url)}"` : ''} muted playsinline controls preload="metadata"></video>`
        : p.kind === 'youtube' && p.youtube_id
          ? `<img src="https://i.ytimg.com/vi/${esc(p.youtube_id)}/hqdefault.jpg" alt="" loading="lazy"><span class="nv-play" aria-hidden="true">▶</span>`
          : p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.image_alt)}" loading="lazy">` : '';
      const poll = p.kind === 'poll' && p.poll ? `<div class="nv-poll"><b>${esc(p.poll.question)}</b>${p.poll.options.map(o => `<span>${esc(o.label || '…')}</span>`).join('')}</div>` : '';
      return `<article class="nv-card">
        ${media ? `<div class="nv-media">${media}</div>` : ''}
        <div class="nv-cbody"><span class="nv-cat" style="--tone:${tone}">${esc(catLabel(p.category))}</span>
        <h4>${esc(p.title || 'Nadpis príspevku')}</h4>
        ${p.excerpt ? `<p>${esc(p.excerpt).replace(/\n/g, '<br>')}</p>` : ''}${poll}
        ${p.link_url ? `<span class="nv-link">${esc(p.link_label || 'Čítať ďalej')} →</span>` : ''}</div></article>`;
    }

    function postState(p) {
      if (p.hidden) return ['skrytý', 'off'];
      if (new Date(p.published_at).getTime() > Date.now()) return [`od ${fmtDate(p.published_at)}`, 'warn'];
      return ['zverejnený', 'ok'];
    }

    function postsTab() {
      const posts = state.doc.posts;
      const list = posts.map((p, i) => {
        const [label, tone] = postState(p);
        const votes = p.results ? ` · ${p.results.total} hlasov` : '';
        return `<li class="nv-row${i === state.editing ? ' on' : ''}">
          <button type="button" class="nv-open" data-edit="${i}">
            <span class="nv-thumb">${p.image_url || p.poster_url ? `<img src="${esc(p.image_url || p.poster_url)}" alt="">` : p.youtube_id ? `<img src="https://i.ytimg.com/vi/${esc(p.youtube_id)}/default.jpg" alt="">` : '<span>Aa</span>'}</span>
            <span class="nv-meta"><b>${esc(p.title || 'Bez nadpisu')}</b><small>${esc(catLabel(p.category))} · ${esc((NV_KIND.find(k => k[0] === p.kind) || ['', p.kind])[1])}${votes}</small></span>
          </button>
          ${p.featured ? '<span class="pill gold">hlavný</span>' : ''}<span class="pill ${tone}">${esc(label)}</span>
          <span class="nv-order"><button type="button" class="btn ghost sm" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Posunúť vyššie">↑</button><button type="button" class="btn ghost sm" data-down="${i}" ${i === posts.length - 1 ? 'disabled' : ''} aria-label="Posunúť nižšie">↓</button></span>
        </li>`;
      }).join('');
      const post = posts[state.editing];
      return `<div class="nv-split">
        <div class="card"><div class="card-h">Príspevky (${posts.length}/${limit('posts', 60)})<button type="button" class="btn gold sm" id="nv-add">+ Nový príspevok</button></div><div class="card-b">
          <p class="muted" style="margin-top:0">Poradie v zozname je poradie na webe. Nový príspevok je skrytý, kým ho nezverejníte.</p>
          ${posts.length ? `<ul class="nv-list">${list}</ul>` : '<div class="empty">Zatiaľ žiadne príspevky. Pridajte prvý.</div>'}
        </div></div>
        ${post ? editor(post) : '<div class="card"><div class="card-b muted">Vyberte príspevok zo zoznamu alebo pridajte nový.</div></div>'}
      </div>`;
    }

    function mediaField(label, field, value, kind = 'image') {
      return `<div class="nv-field"><span class="nv-lbl">${esc(label)}</span>
        <div class="nv-mediafield">${value ? (kind === 'video' ? `<video src="${esc(value)}" muted preload="metadata"></video>` : `<img src="${esc(value)}" alt="">`) : '<span class="muted">nie je vybraté</span>'}
        <div class="nv-mbtn">${kind === 'image' ? `<button type="button" class="btn ghost sm" data-pick="${field}">Vybrať z Médií</button>` : ''}
        <label class="btn ghost sm">Nahrať z počítača<input type="file" class="sr-only" data-upload="${field}" accept="${kind === 'video' ? NV_VIDEO_TYPES.join(',') : 'image/jpeg,image/png,image/webp'}"></label>
        ${value ? `<button type="button" class="btn ghost sm danger" data-clear="${field}">Odstrániť</button>` : ''}</div></div></div>`;
    }

    function editor(p) {
      const results = p.results;
      const pollEditor = p.kind === 'poll' ? `<fieldset class="nv-fs"><legend>Anketa</legend>
          <label class="nv-field"><span class="nv-lbl">Otázka</span><input data-poll-q maxlength="${limit('pollQuestion', 160)}" value="${esc(p.poll ? p.poll.question : '')}"></label>
          ${(p.poll ? p.poll.options : []).map((o, i) => {
            const r = results && results.options.find(x => x.id === o.id);
            return `<div class="nv-opt"><input data-poll-o="${i}" maxlength="${limit('pollOption', 80)}" placeholder="Možnosť ${i + 1}" value="${esc(o.label)}" aria-label="Možnosť ${i + 1}">${r ? `<small class="muted">${r.votes} hlasov</small>` : ''}<button type="button" class="btn ghost sm danger" data-opt-del="${i}" ${(p.poll.options.length <= 2) ? 'disabled' : ''} aria-label="Odstrániť možnosť">✕</button></div>`;
          }).join('')}
          <button type="button" class="btn ghost sm" id="nv-opt-add" ${(p.poll && p.poll.options.length >= limit('pollOptionsMax', 6)) ? 'disabled' : ''}>+ Pridať možnosť</button>
          ${results ? `<p class="muted">Spolu ${results.total} hlasov. Hlasovať sa dá raz z jedného zariadenia za 30 dní.</p>` : ''}
        </fieldset>` : '';
      return `<div class="card"><div class="card-h">Upraviť príspevok<button type="button" class="btn ghost sm danger" id="nv-del">Zmazať príspevok</button></div><div class="card-b nv-edit">
        <div class="nv-grid2">
          <label class="nv-field"><span class="nv-lbl">Rubrika</span><select data-post="category">${categories().map(c => `<option value="${c.key}" ${c.key === p.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>
          <label class="nv-field"><span class="nv-lbl">Typ príspevku</span><select data-post="kind" id="nv-kind">${NV_KIND.map(([k, l]) => `<option value="${k}" ${k === p.kind ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <label class="nv-field"><span class="nv-lbl">Nadpis</span><input data-post="title" maxlength="${limit('title', 120)}" value="${esc(p.title)}"></label>
        <label class="nv-field"><span class="nv-lbl">Text (krátky, nový odsek = Enter)</span><textarea data-post="excerpt" rows="4" maxlength="${limit('excerpt', 300)}">${esc(p.excerpt)}</textarea></label>
        ${p.kind === 'video' ? mediaField('Video (MP4 alebo WEBM, do 200 MB)', 'video_url', p.video_url, 'video') + mediaField('Úvodný obrázok videa', 'poster_url', p.poster_url) : ''}
        ${p.kind === 'youtube' ? `<label class="nv-field"><span class="nv-lbl">Odkaz na YouTube</span><input data-post="youtube_id" placeholder="https://www.youtube.com/watch?v=…" value="${esc(p.youtube_id || '')}"></label><p class="muted nv-hint">Video sa na webe prehrá cez YouTube bez sledovacích cookies, až keď naň návštevníčka klikne.</p>` : ''}
        ${p.kind !== 'video' && p.kind !== 'youtube' ? mediaField(p.kind === 'image' ? 'Fotografia' : 'Fotografia (nepovinná)', 'image_url', p.image_url) : ''}
        ${(p.image_url || p.kind === 'image') && p.kind !== 'video' && p.kind !== 'youtube' ? `<label class="nv-field"><span class="nv-lbl">Popis fotografie (pre nevidiacich a Google)</span><input data-post="image_alt" maxlength="160" value="${esc(p.image_alt)}"></label>` : ''}
        ${pollEditor}
        <div class="nv-grid2">
          <label class="nv-field"><span class="nv-lbl">Odkaz tlačidla (nepovinný)</span><input data-post="link_url" placeholder="https://… alebo /eshop" value="${esc(p.link_url || '')}"></label>
          <label class="nv-field"><span class="nv-lbl">Text tlačidla</span><input data-post="link_label" maxlength="${limit('linkLabel', 40)}" placeholder="Čítať ďalej" value="${esc(p.link_label)}"></label>
        </div>
        <div class="nv-grid2">
          <label class="nv-field"><span class="nv-lbl">Zverejniť od</span><input type="datetime-local" data-post="published_at" value="${esc(toLocal(p.published_at))}"></label>
          <div class="nv-checks">
            <label><input type="checkbox" data-post="hidden" ${p.hidden ? 'checked' : ''}> Skryť z webu</label>
            <label><input type="checkbox" data-post="featured" ${p.featured ? 'checked' : ''}> Hlavný príspevok (veľký, v oblúku)</label>
          </div>
        </div>
        <div class="nv-prev"><span class="nv-lbl">Náhľad karty</span>${cardPreview(p)}</div>
      </div></div>`;
    }

    function adsTab() {
      return `<div class="card"><div class="card-h">Reklamné plochy partnerov</div><div class="card-b">
        <p class="muted" style="margin-top:0">Tri plochy pod príspevkami. Plocha sa zobrazí, len ak je zapnutá a má nadpis, obrázok a odkaz. Termín je nepovinný.</p>
        <div class="nv-ads">${state.doc.ads.map((a, i) => `<fieldset class="nv-fs nv-ad"><legend>Plocha ${a.slot}</legend>
          <label class="nv-checks"><span><input type="checkbox" data-ad="${i}" data-f="enabled" ${a.enabled ? 'checked' : ''}> Zobrazovať na webe</span></label>
          <p class="muted nv-hint">Kliknutí za posledné obdobie: <b>${Number(a.clicks) || 0}</b></p>
          ${mediaField('Obrázok', `ad:${i}`, a.image_url)}
          <label class="nv-field"><span class="nv-lbl">Popis obrázka</span><input data-ad="${i}" data-f="image_alt" maxlength="160" value="${esc(a.image_alt)}"></label>
          <label class="nv-field"><span class="nv-lbl">Štítok</span><input data-ad="${i}" data-f="label" maxlength="${limit('adLabel', 20)}" value="${esc(a.label)}"></label>
          <label class="nv-field"><span class="nv-lbl">Nadpis</span><input data-ad="${i}" data-f="title" maxlength="${limit('adTitle', 40)}" value="${esc(a.title)}"></label>
          <label class="nv-field"><span class="nv-lbl">Text</span><textarea data-ad="${i}" data-f="text" rows="3" maxlength="${limit('adText', 140)}">${esc(a.text)}</textarea></label>
          <div class="nv-grid2">
            <label class="nv-field"><span class="nv-lbl">Tlačidlo</span><input data-ad="${i}" data-f="button" maxlength="${limit('adButton', 24)}" value="${esc(a.button)}"></label>
            <label class="nv-field"><span class="nv-lbl">Odkaz partnera</span><input data-ad="${i}" data-f="url" placeholder="https://…" value="${esc(a.url || '')}"></label>
          </div>
          <div class="nv-grid2">
            <label class="nv-field"><span class="nv-lbl">Zobraziť od</span><input type="datetime-local" data-ad="${i}" data-f="active_from" value="${esc(toLocal(a.active_from))}"></label>
            <label class="nv-field"><span class="nv-lbl">Zobraziť do</span><input type="datetime-local" data-ad="${i}" data-f="active_to" value="${esc(toLocal(a.active_to))}"></label>
          </div>
        </fieldset>`).join('')}</div>
      </div></div>`;
    }

    function pageTab() {
      const page = state.doc.page, panel = state.doc.panel;
      return `<div class="nv-split">
        <div class="card"><div class="card-h">Stránka Novinky</div><div class="card-b nv-edit">
          <label class="nv-field"><span class="nv-lbl">Nadtitulok</span><input data-page="eyebrow" maxlength="${limit('pageEyebrow', 60)}" value="${esc(page.eyebrow)}"></label>
          <div class="nv-grid2">
            <label class="nv-field"><span class="nv-lbl">Nadpis</span><input data-page="title" maxlength="${limit('pageTitle', 80)}" value="${esc(page.title)}"></label>
            <label class="nv-field"><span class="nv-lbl">Slovo písaným písmom</span><input data-page="title_script" maxlength="${limit('pageScript', 40)}" value="${esc(page.title_script)}"></label>
          </div>
          <label class="nv-field"><span class="nv-lbl">Úvodný text</span><textarea data-page="intro" rows="3" maxlength="${limit('pageIntro', 400)}">${esc(page.intro)}</textarea></label>
          <div class="nv-grid2">
            <label class="nv-field"><span class="nv-lbl">Tlačidlo pre partnerov</span><input data-page="partner_label" maxlength="${limit('linkLabel', 40)}" value="${esc(page.partner_label)}"></label>
            <label class="nv-field"><span class="nv-lbl">Odkaz tlačidla</span><input data-page="partner_url" placeholder="https://… alebo /kontakt" value="${esc(page.partner_url || '')}"></label>
          </div>
          <p class="muted nv-hint">Bez odkazu sa tlačidlo pre partnerov na webe nezobrazí.</p>
        </div></div>
        <div class="card"><div class="card-h">Výsuvný panel</div><div class="card-b nv-edit">
          <label class="nv-checks"><span><input type="checkbox" data-panel="enabled" ${panel.enabled ? 'checked' : ''}> Zobrazovať zlaté ouško „Novinky“ na webe</span></label>
          <div class="nv-grid2">
            <label class="nv-field"><span class="nv-lbl">Nadpis panelu</span><input data-panel="title" maxlength="${limit('pageTitle', 80)}" value="${esc(panel.title)}"></label>
            <label class="nv-field"><span class="nv-lbl">Slovo písaným písmom</span><input data-panel="title_script" maxlength="${limit('pageScript', 40)}" value="${esc(panel.title_script)}"></label>
          </div>
          <label class="nv-field"><span class="nv-lbl">Reklama dole v paneli</span><select data-panel="ad_slot"><option value="">Žiadna</option>${state.doc.ads.map(a => `<option value="${a.slot}" ${panel.ad_slot === a.slot ? 'selected' : ''}>Plocha ${a.slot}${a.title ? ` – ${esc(a.title)}` : ''}${a.enabled ? '' : ' (vypnutá)'}</option>`).join('')}</select></label>
          <p class="muted nv-hint">V paneli sa zobrazí zoznam zverejnených príspevkov a pod ním vybraná reklama, ak je práve aktívna.</p>
        </div></div>
      </div>`;
    }

    function render() {
      if (!view.isConnected) return;
      if (!state.doc) return;
      const tabs = [['posts', 'Príspevky'], ['ads', 'Reklamy'], ['page', 'Stránka a panel']];
      const info = state.doc.updated_at ? `Naposledy uložené ${fmtDate(state.doc.updated_at)}` : 'Zatiaľ neuložené';
      view.innerHTML = `<style>
        .nv-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:16px}
        .nv-tabs{display:flex;gap:6px;flex-wrap:wrap}.nv-tabs .btn[aria-pressed="true"]{background:var(--ink,#2d2b45);color:#fff}
        .nv-save{display:flex;gap:10px;align-items:center}.nv-dirty{color:#a06a1d;font-size:13px}
        .nv-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:16px;align-items:start}
        @media(max-width:1000px){.nv-split{grid-template-columns:1fr}}
        .nv-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
        .nv-row{display:flex;align-items:center;gap:8px;padding:6px;border:1px solid var(--line,#e7e3ef);border-radius:10px;background:#fff}
        .nv-row.on{border-color:#73729c;box-shadow:0 0 0 2px rgba(115,114,156,.15)}
        .nv-open{flex:1;display:flex;gap:10px;align-items:center;background:none;border:0;text-align:left;cursor:pointer;min-width:0;padding:0;font:inherit;color:inherit}
        .nv-thumb{width:46px;height:46px;border-radius:8px;overflow:hidden;flex:none;background:#f1eef7;display:grid;place-items:center;color:var(--muted)}
        .nv-thumb img{width:100%;height:100%;object-fit:cover}
        .nv-meta{display:grid;min-width:0}.nv-meta b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}.nv-meta small{color:var(--muted)}
        .nv-order{display:flex;gap:2px}
        .nv-edit{display:grid;gap:12px}.nv-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:640px){.nv-grid2{grid-template-columns:1fr}}
        .nv-field{display:grid;gap:4px}.nv-field input,.nv-field select,.nv-field textarea{width:100%;box-sizing:border-box}
        .nv-lbl{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
        .nv-hint{margin:-6px 0 0;font-size:13px}
        .nv-checks{display:grid;gap:6px;align-content:end}.nv-checks label,.nv-checks span{display:flex;gap:8px;align-items:center}
        .nv-mediafield{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.nv-mediafield img,.nv-mediafield video{width:120px;height:80px;object-fit:cover;border-radius:8px;background:#f1eef7}
        .nv-mbtn{display:flex;gap:6px;flex-wrap:wrap}
        .nv-fs{border:1px solid var(--line,#e7e3ef);border-radius:12px;padding:12px;display:grid;gap:10px;margin:0}.nv-fs legend{padding:0 6px;font-weight:500}
        .nv-opt{display:flex;gap:8px;align-items:center}.nv-opt input{flex:1}
        .nv-ads{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}@media(max-width:1100px){.nv-ads{grid-template-columns:1fr}}
        .nv-prev{display:grid;gap:6px;padding-top:6px;border-top:1px solid var(--line,#e7e3ef)}
        .nv-card{max-width:320px;border-radius:18px;overflow:hidden;background:linear-gradient(160deg,#f7f5fb,#efe6d6);border:1px solid rgba(176,138,74,.35);box-shadow:0 10px 30px rgba(45,43,69,.08)}
        .nv-media{position:relative;aspect-ratio:4/3;background:#e9e4f0}.nv-media img,.nv-media video{width:100%;height:100%;object-fit:cover;display:block}
        .nv-play{position:absolute;inset:0;display:grid;place-items:center;font-size:34px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.5)}
        .nv-cbody{padding:14px 16px 16px;display:grid;gap:6px}.nv-cbody h4{margin:0;font-size:18px;font-weight:500}.nv-cbody p{margin:0;font-size:14px;color:#55526b}
        .nv-cat{justify-self:start;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--tone);padding:3px 9px;border-radius:999px}
        .nv-link{color:#b08a4a;font-size:14px}
        .nv-poll{display:grid;gap:6px}.nv-poll span{border:1px solid rgba(176,138,74,.45);border-radius:999px;padding:6px 12px;font-size:14px;background:#fff}
      </style>
      <div class="nv-bar">
        <div class="nv-tabs" role="group" aria-label="Časti Noviniek">${tabs.map(([k, l]) => `<button type="button" class="btn ghost sm" data-tab="${k}" aria-pressed="${state.tab === k}">${l}</button>`).join('')}</div>
        <div class="nv-save"><span class="muted">${esc(info)}</span>${dirty() ? '<span class="nv-dirty">Neuložené zmeny</span>' : ''}<button type="button" class="btn gold" id="nv-save">Uložiť Novinky</button></div>
      </div>
      <div id="nv-msg">${state.message ? msg(state.message.text, state.message.error) : ''}</div>
      ${state.tab === 'posts' ? postsTab() : state.tab === 'ads' ? adsTab() : pageTab()}`;
      bind();
    }

    function rerender() { sync(); render(); }

    function setMedia(field, url) {
      if (field.startsWith('ad:')) { const ad = state.doc.ads[Number(field.slice(3))]; if (ad) ad.image_url = url; }
      else { const post = state.doc.posts[state.editing]; if (post) post[field] = url; }
    }

    function bind() {
      view.querySelector('#nv-save').onclick = save;
      view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { sync(); state.tab = b.dataset.tab; state.message = null; render(); });
      const add = view.querySelector('#nv-add');
      if (add) add.onclick = () => {
        sync();
        if (state.doc.posts.length >= limit('posts', 60)) { state.message = { text: 'Dosiahli ste najväčší počet príspevkov. Staré príspevky zmažte.', error: true }; render(); return; }
        state.doc.posts.unshift(nvPost()); state.editing = 0; state.message = null; render();
      };
      view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { sync(); state.editing = Number(b.dataset.edit); render(); });
      const move = (from, to) => {
        sync();
        const posts = state.doc.posts;
        if (to < 0 || to >= posts.length) return;
        const [item] = posts.splice(from, 1); posts.splice(to, 0, item);
        if (state.editing === from) state.editing = to; else if (state.editing === to) state.editing = from;
        render();
      };
      view.querySelectorAll('[data-up]').forEach(b => b.onclick = () => move(Number(b.dataset.up), Number(b.dataset.up) - 1));
      view.querySelectorAll('[data-down]').forEach(b => b.onclick = () => move(Number(b.dataset.down), Number(b.dataset.down) + 1));
      const del = view.querySelector('#nv-del');
      if (del) del.onclick = () => {
        const post = state.doc.posts[state.editing];
        if (!post || !confirm(`Naozaj zmazať príspevok „${post.title || 'bez nadpisu'}“? Zmaže sa po uložení.`)) return;
        state.doc.posts.splice(state.editing, 1); state.editing = -1; render();
      };
      const kind = view.querySelector('#nv-kind');
      if (kind) kind.onchange = () => {
        sync();
        const post = state.doc.posts[state.editing];
        if (post.kind === 'poll' && !post.poll) post.poll = nvPoll();
        if (post.kind === 'poll' && post.category !== 'anketa') post.category = 'anketa';
        render();
      };
      const optAdd = view.querySelector('#nv-opt-add');
      if (optAdd) optAdd.onclick = () => { sync(); state.doc.posts[state.editing].poll.options.push({ id: '', label: '' }); render(); };
      view.querySelectorAll('[data-opt-del]').forEach(b => b.onclick = () => { sync(); state.doc.posts[state.editing].poll.options.splice(Number(b.dataset.optDel), 1); render(); });
      view.querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => {
        sync();
        const url = await chooseImage();
        if (url) { setMedia(b.dataset.pick, url); render(); }
      });
      view.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { sync(); setMedia(b.dataset.clear, null); render(); });
      view.querySelectorAll('[data-upload]').forEach(input => input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        sync();
        const field = input.dataset.upload;
        const box = view.querySelector('#nv-msg');
        box.innerHTML = msg(field === 'video_url' ? 'Nahrávam video, môže to chvíľu trvať…' : 'Nahrávam obrázok…');
        view.querySelectorAll('button').forEach(b => { b.disabled = true; });
        try {
          setMedia(field, field === 'video_url' ? await uploadVideo(file) : await uploadPhoto(file));
          state.message = null;
        } catch (error) {
          if (error && error.message === '401') return;
          state.message = { text: (error && error.message) || 'Nahratie zlyhalo.', error: true };
        }
        render();
      });
      // Náhľad karty sa obnoví pri písaní (bez straty kurzora – prekreslí sa len karta).
      view.querySelectorAll('[data-post],[data-poll-q],[data-poll-o]').forEach(el => el.addEventListener('input', () => {
        sync();
        const prev = view.querySelector('.nv-prev');
        const post = state.doc.posts[state.editing];
        if (prev && post) prev.innerHTML = `<span class="nv-lbl">Náhľad karty</span>${cardPreview(post)}`;
      }));
    }

    // Upozornenie pri odchode z neuloženej stránky.
    const guard = (e) => { if (view.isConnected && dirty()) { e.preventDefault(); e.returnValue = ''; } else if (!view.isConnected) window.removeEventListener('beforeunload', guard); };
    window.addEventListener('beforeunload', guard);

    view.innerHTML = '<div class="muted">Načítavam Novinky…</div>';
    try {
      await load();
    } catch (error) {
      if (error && error.message === '401') throw error;
      view.innerHTML = msg((error && error.message) || 'Novinky sa nepodarilo načítať.', true);
      return;
    }
    if (state.doc.posts.length) state.editing = 0;
    render();
  };
}
