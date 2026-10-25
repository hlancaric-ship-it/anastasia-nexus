// Správa zakúpeného obsahu produktu: nahrávanie chránených súborov, názvy, poradie, odoberanie.
// Súbory zostávajú v súkromnom úložisku; klient dostane len krátkodobý URL na presný kľúč.
const escape = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// Povolené typy a limity musia sedieť s backendom (src/lib/protected-library/upload.ts).
const UPLOAD_TYPES = {
  mp4: { kind: 'video', label: 'Video', maxBytes: 2 * 1024 * 1024 * 1024 },
  mp3: { kind: 'audio', label: 'Nahrávka', maxBytes: 200 * 1024 * 1024 },
  m4a: { kind: 'audio', label: 'Nahrávka', maxBytes: 200 * 1024 * 1024 },
  pdf: { kind: 'document', label: 'Dokument', maxBytes: 200 * 1024 * 1024 },
};
const KIND_LABEL = { video: 'Video', audio: 'Nahrávka', document: 'Dokument' };
const sizeLabel = bytes => bytes >= 1024 * 1024 * 1024
  ? `${Math.round(bytes / (1024 * 1024 * 1024))} GB`
  : `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
// Názov pre zákazníka z názvu súboru: bez prípony, podčiarkovníky a pomlčky ako medzery, prvé písmeno veľké.
const titleFromFile = name => {
  const base = String(name ?? '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ').replace(/(\S)-(?=\S)/g, '$1 ').replace(/\s+/g, ' ').trim();
  return (base.charAt(0).toLocaleUpperCase('sk') + base.slice(1)).slice(0, 200) || String(name ?? '').slice(0, 200);
};
const extensionOf = name => {
  const clean = String(name ?? '').trim().toLowerCase();
  const dot = clean.lastIndexOf('.');
  return dot > 0 ? clean.slice(dot + 1) : '';
};

export async function mountLibraryEditor(host, {api, productId}) {
  let saved = null, rows = [], page = 0, unavailable = true, purchases = null;
  let uploads = [], message = '';
  const size = 50, path = `/admin/products/${encodeURIComponent(productId)}/protected-media`;
  const dirty = () => saved && JSON.stringify(rows.map(({key,title}) => ({key,title}))) !== JSON.stringify(saved.media.map(({key,title}) => ({key,title})));

  function draw(note = '') {
    if (note) message = note;
    const pages = Math.max(1, Math.ceil(rows.length / size)); page = Math.min(page, pages - 1);
    const dropZone = `<div class="library-drop" id="library-drop">
          <p class="library-drop-title">Nahrajte súbory pre zákazníkov</p>
          <p class="muted">Preťiahnite súbory sem alebo vyberte zo zariadenia. Povolené: MP4 (video), MP3 a M4A (nahrávka), PDF (dokument).</p>
          <button type="button" class="btn gold" id="library-pick">Vybrať súbory</button>
          <input type="file" id="library-file" class="sr-only" multiple accept=".mp4,.mp3,.m4a,.pdf,video/mp4,audio/mpeg,audio/mp4,application/pdf">
        </div>
        <div id="library-uploads" class="library-uploads" aria-live="polite"></div>`;
    const filesHtml = rows.length ? `<p class="muted">Tieto súbory sa zobrazujú zákazníkom s prístupom k produktu. Názov aj poradie upravíte tu a potvrdíte tlačidlom Uložiť zmeny.</p>
        <ol class="library-files" start="${page * size + 1}">${rows.slice(page * size, (page + 1) * size).map((r, j) => {
        const i = page * size + j, kind = saved.media.find(m => m.key === r.key)?.kind || r.kind;
        return `<li class="library-row"><span class="library-num" aria-hidden="true">${i+1}</span><span class="pill ok library-kind">${escape(KIND_LABEL[kind] || 'Súbor')}</span><input id="library-title-${i}" data-library-title="${i}" maxlength="200" required value="${escape(r.title)}" aria-label="Názov ${kind === 'video' ? 'videa' : kind === 'audio' ? 'nahrávky' : 'dokumentu'} ${i+1}">
        <span class="library-actions"><button type="button" class="library-icon" data-library-move="${i}" data-direction="-1" aria-label="Posunúť súbor ${i+1} vyššie" title="Vyššie" ${i===0?'disabled':''}>↑</button><button type="button" class="library-icon" data-library-move="${i}" data-direction="1" aria-label="Posunúť súbor ${i+1} nižšie" title="Nižšie" ${i===rows.length-1?'disabled':''}>↓</button><button type="button" class="library-icon danger" data-library-remove="${i}" aria-label="Odobrať súbor ${i+1}" title="Odobrať">×</button></span></li>`;
      }).join('')}</ol>
      ${pages > 1 ? `<div class="library-pagination"><button type="button" class="btn ghost" data-library-page="-1" ${!page?'disabled':''}>Predchádzajúce</button><span aria-live="polite">${page+1} / ${pages}</span><button type="button" class="btn ghost" data-library-page="1" ${page===pages-1?'disabled':''}>Ďalšie</button></div>` : ''}
      <p class="muted">Úprava názvu alebo poradia nemení zakúpené prístupy. Pôvodné súbory zostávajú chránené.</p>`
      : '<p class="muted">Tento produkt zatiaľ nemá priradené súkromné súbory.</p><p class="muted">Verejné fotografie vyššie nenahrádzajú obsah pre zákazníkov.</p>';
    host.innerHTML = `<div class="library-feedback" role="status">${message ? `<p class="muted">${escape(message)}</p>` : ''}</div>
      ${unavailable ? '<p>Obsah sa nepodarilo načítať. Ostatné údaje produktu môžete upraviť; súbory zostanú zachované.</p>' : dropZone + filesHtml}
      <button type="button" class="btn ghost" data-library-reload>Načítať uložený obsah</button>`;
    renderUploads();
    host.querySelectorAll('[data-library-title]').forEach(input => input.oninput = () => { rows[Number(input.dataset.libraryTitle)].title = input.value; });
    host.querySelectorAll('[data-library-move]').forEach(b => b.onclick = () => {
      const i=Number(b.dataset.libraryMove), n=i+Number(b.dataset.direction);
      [rows[i],rows[n]]=[rows[n],rows[i]]; page=Math.floor(n/size); draw('Poradie je upravené. Nezabudnite uložiť zmeny.');
      host.querySelector(`#library-title-${n}`)?.focus();
    });
    host.querySelectorAll('[data-library-remove]').forEach(b => b.onclick = () => remove(Number(b.dataset.libraryRemove)));
    host.querySelectorAll('[data-library-page]').forEach(b => b.onclick = () => { page += Number(b.dataset.libraryPage); draw(); });
    host.querySelector('[data-library-reload]').onclick = async () => {
      if (dirty() && !confirm('Načítať uložený obsah? Vaše neuložené názvy a poradie sa zahodia.')) return;
      await load();
    };
    const pick = host.querySelector('#library-pick'), input = host.querySelector('#library-file');
    if (pick && input) {
      pick.onclick = () => input.click();
      input.onchange = () => { const files = [...(input.files || [])]; input.value = ''; startUploads(files); };
      const drop = host.querySelector('#library-drop');
      if (drop) {
        drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('drag'); };
        drop.ondragleave = () => drop.classList.remove('drag');
        drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('drag'); startUploads([...(e.dataTransfer?.files || [])]); };
      }
    }
  }

  function renderUploads() {
    const box = host.querySelector('#library-uploads');
    if (!box) return;
    box.innerHTML = uploads.length ? `<ul class="library-upload-list">${uploads.map((u, i) => `<li><div class="library-upload-row"><span class="library-upload-name">${escape(u.name)}</span><span class="pill ${u.status === 'error' ? 'off' : u.status === 'done' ? 'ok' : 'warn'}">${escape(u.status === 'error' ? 'Chyba' : u.status === 'done' ? 'Nahraté' : u.status === 'uploading' ? `${Math.round(u.progress)} %` : 'Čaká')}</span></div>
      <progress class="library-progress" max="100" value="${Math.round(u.progress)}" aria-label="Nahrávanie ${escape(u.name)}"></progress>
      ${u.status === 'error' ? `<p class="muted">${escape(u.error || 'Nahrávanie sa nepodarilo.')}</p>` : ''}</li>`).join('')}</ul>` : '';
  }

  const disableControls = () => {
    const controls = [...host.querySelectorAll('input,button')].map(el => [el, el.disabled]);
    controls.forEach(([el]) => { el.disabled = true; });
    return () => controls.forEach(([el, disabled]) => { el.disabled = disabled; });
  };

  async function load() {
    host.setAttribute('aria-busy','true');
    const restore = disableControls();
    try { const next = await api(path); saved = next; rows = next.media.map(({key,title,kind}) => ({key,title,kind})); unavailable=false; page=0; draw(); }
    catch(e) { if(e.message==='401') throw e; if (!saved) unavailable=true; draw('Načítanie sa nepodarilo. Neuložené úpravy zostali zachované.'); }
    finally { restore(); host.removeAttribute('aria-busy'); }
  }

  // Nahrávanie: server dá presigned URL na JEDEN kľúč, potom sa súbor posla priamo do úložišta.
  async function uploadOne(file) {
    const extension = extensionOf(file.name);
    const type = UPLOAD_TYPES[extension];
    if (!type) return { ok: false, error: `${file.name}: povolené sú MP4, MP3, M4A a PDF.` };
    if (file.size > type.maxBytes) return { ok: false, error: `${file.name}: príliš veľký súbor (limit ${sizeLabel(type.maxBytes)}).` };
    if (!file.size) return { ok: false, error: `${file.name}: súbor je prázdny.` };
    const target = await api(`${path}/upload-url`, { method:'POST', body:{ filename: file.name, size: file.size } });
    await putFile(target.url, target.headers || {}, file, p => { const item = uploads.find(u => u.name === file.name && u.status === 'uploading'); if (item) { item.progress = p; renderUploads(); } });
    await api(`${path}/attach`, { method:'POST', body:{ key: target.key, title: titleFromFile(file.name) } });
    return { ok: true };
  }

  function putFile(url, headers, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      Object.entries(headers || {}).forEach(([name, value]) => { try { xhr.setRequestHeader(name, value); } catch { /* hlavička sa nepodarila nastaviť */ } });
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress((e.loaded / e.total) * 100); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error('Nahrávanie do úložiška zlyhalo.'));
      xhr.onerror = () => reject(new Error('Nahrávanie do úložiška zlyhalo.'));
      xhr.send(file);
    });
  }

  async function startUploads(files) {
    if (!files.length) return;
    if (unavailable) { draw('Obsah sa nepodarilo načítať. Obnovte stránku a skúste nahrať súbor znova.'); return; }
    if (dirty() && !confirm('Súbory nahráte nové názvy a poradie. Pokračovať?')) return;
    const entries = [...files].sort((x, y) => x.name.localeCompare(y.name, 'sk', { numeric: true })).map(file => ({ name: file.name, progress: 0, status: 'queued', file }));
    uploads = uploads.concat(entries);
    draw('Nahrávanie súborov…');
    let failed = 0;
    for (const entry of entries) {
      entry.status = 'uploading'; renderUploads();
      try {
        const result = await uploadOne(entry.file);
        if (!result.ok) { entry.status = 'error'; entry.error = result.error; failed++; continue; }
        entry.status = 'done'; entry.progress = 100;
      } catch (e) {
        entry.status = 'error'; entry.error = e?.message || 'Nahrávanie sa nepodarilo.'; failed++;
      }
      renderUploads();
    }
    uploads = uploads.filter(u => u.status !== 'done');
    await load();
    draw(failed ? `Nahralo sa ${entries.length - failed} z ${entries.length} súborov. Neúspešné súbory sú uvedené vyššie.` : 'Súbory sú nahraté a pripojené k produktu.');
  }

  async function remove(index) {
    const row = rows[index];
    if (!row) return;
    if (purchases === null) {
      try {
        const result = await api(`/admin/entitlements?product_id=${encodeURIComponent(productId)}&status=active&limit=1`);
        purchases = Number(result?.count) || 0;
      } catch { purchases = -1; }
    }
    const bought = purchases > 0
      ? `\n\nTento produkt už kúpilo ${purchases} zákazníkov. Po odobratí im súbor zmizne z knižnice.`
      : '';
    if (!confirm(`Odobrať súbor „${row.title}“ z tohto produktu?${bought}`)) return;
    const restore = disableControls();
    try {
      const result = await api(`${path}/${encodeURIComponent(row.key)}`, { method:'DELETE' });
      saved = result; rows = result.media.map(({key,title,kind}) => ({key,title,kind}));
      draw('Súbor je odpojený od produktu.');
    } catch (e) {
      if (e.message === '401') { restore(); throw e; }
      draw(e?.message || 'Súbor sa nepodarilo odobrať.');
    } finally { restore(); }
  }

  host.innerHTML = '<p class="muted" role="status">Načítavam zakúpený obsah…</p>';
  await load();
  return {
    /** true = súbor existuje, false = prázdna knižnica, null = stav sa nepodarilo načítať. */
    hasFiles() { return unavailable ? null : rows.length > 0; },
    validate() {
      if(!dirty()) return;
      const invalid = rows.findIndex(r => !r.title.trim() || r.title.trim().length > 200 || /[\u0000-\u001f\u007f]/.test(r.title));
      if(invalid!==-1) { page=Math.floor(invalid/size); draw('Doplňte názov súboru s najviac 200 znakmi.'); host.querySelector(`#library-title-${invalid}`)?.focus(); throw Error('Každý súbor potrebuje názov s najviac 200 znakmi.'); }
    },
    async save() {
      if (!dirty()) return;
      this.validate();
      const restore = disableControls(); host.setAttribute('aria-busy','true');
      try {
        const result = await api(path, {method:'POST', body:{revision:saved.revision, media:rows.map(({key,title})=>({key,title:title.trim()}))}});
        saved=result; rows=result.media.map(({key,title,kind})=>({key,title,kind})); draw('Názvy a poradie sú uložené.');
      } finally { restore(); host.removeAttribute('aria-busy'); }
    },
  };
}
