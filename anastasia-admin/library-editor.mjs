// Product-local editing only; protected files stay in their original private storage.
const escape = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export async function mountLibraryEditor(host, {api, productId}) {
  let saved = null, rows = [], page = 0, unavailable = true;
  const size = 5, path = `/admin/products/${encodeURIComponent(productId)}/protected-media`;
  const dirty = () => saved && JSON.stringify(rows) !== JSON.stringify(saved.media.map(({key,title}) => ({key,title})));
  function draw(message = '') {
    const pages = Math.max(1, Math.ceil(rows.length / size)); page = Math.min(page, pages - 1);
    host.innerHTML = `<div class="library-feedback" role="status">${message ? `<p class="muted">${escape(message)}</p>` : ''}</div>
      ${unavailable ? '<p>Obsah sa nepodarilo načítať. Ostatné údaje produktu môžete upraviť; súbory zostanú zachované.</p>' : !rows.length ? '<p class="muted">Tento produkt zatiaľ nemá priradené súkromné súbory.</p><p class="muted">Verejné fotografie vyššie nenahrádzajú obsah pre zákazníčky.</p>' : `<p class="muted">Tieto súbory sa zobrazujú zákazníčkam s prístupom k produktu. Názov aj poradie upravíte tu a potvrdíte tlačidlom Uložiť zmeny.</p>
      <ol class="library-files" start="${page * size + 1}">${rows.slice(page * size, (page + 1) * size).map((r, j) => {
        const i = page * size + j, kind = saved.media.find(m => m.key === r.key)?.kind;
        return `<li><div class="library-title"><label for="library-title-${i}">Názov ${kind === 'video' ? 'videa' : kind === 'audio' ? 'nahrávky' : 'dokumentu'} ${i+1}</label><input id="library-title-${i}" data-library-title="${i}" maxlength="200" required value="${escape(r.title)}"></div>
        <div class="library-move"><button type="button" class="btn ghost" data-library-move="${i}" data-direction="-1" aria-label="Posunúť súbor ${i+1} vyššie" ${i===0?'disabled':''}>Vyššie</button><button type="button" class="btn ghost" data-library-move="${i}" data-direction="1" aria-label="Posunúť súbor ${i+1} nižšie" ${i===rows.length-1?'disabled':''}>Nižšie</button></div></li>`;
      }).join('')}</ol>
      ${pages > 1 ? `<div class="library-pagination"><button type="button" class="btn ghost" data-library-page="-1" ${!page?'disabled':''}>Predchádzajúce</button><span aria-live="polite">${page+1} / ${pages}</span><button type="button" class="btn ghost" data-library-page="1" ${page===pages-1?'disabled':''}>Ďalšie</button></div>` : ''}
      <p class="muted">Úprava názvu alebo poradia nemení zakúpené prístupy. Pôvodné súbory zostávajú chránené.</p>`}
      <button type="button" class="btn ghost" data-library-reload>Načítať uložený obsah</button>`;
    host.querySelectorAll('[data-library-title]').forEach(input => input.oninput = () => { rows[Number(input.dataset.libraryTitle)].title = input.value; });
    host.querySelectorAll('[data-library-move]').forEach(b => b.onclick = () => {
      const i=Number(b.dataset.libraryMove), n=i+Number(b.dataset.direction);
      [rows[i],rows[n]]=[rows[n],rows[i]]; page=Math.floor(n/size); draw('Poradie je upravené. Nezabudnite uložiť zmeny.');
      host.querySelector(`#library-title-${n}`)?.focus();
    });
    host.querySelectorAll('[data-library-page]').forEach(b => b.onclick = () => { page += Number(b.dataset.libraryPage); draw(); });
    host.querySelector('[data-library-reload]').onclick = async () => {
      if (dirty() && !confirm('Načítať uložený obsah? Vaše neuložené názvy a poradie sa zahodia.')) return;
      await load();
    };
  }
  const disableControls = () => {
    const controls = [...host.querySelectorAll('input,button')].map(el => [el, el.disabled]);
    controls.forEach(([el]) => { el.disabled = true; });
    return () => controls.forEach(([el, disabled]) => { el.disabled = disabled; });
  };
  async function load() {
    host.setAttribute('aria-busy','true');
    const restore = disableControls();
    try { const next = await api(path); saved = next; rows = next.media.map(({key,title}) => ({key,title})); unavailable=false; page=0; draw(); }
    catch(e) { if(e.message==='401') throw e; if (!saved) unavailable=true; draw('Načítanie sa nepodarilo. Neuložené úpravy zostali zachované.'); }
    finally { restore(); host.removeAttribute('aria-busy'); }
  }
  host.innerHTML = '<p class="muted" role="status">Načítavam zakúpený obsah…</p>';
  await load();
  return {
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
        saved=result; rows=result.media.map(({key,title})=>({key,title})); draw('Názvy a poradie sú uložené.');
      } finally { restore(); host.removeAttribute('aria-busy'); }
    },
  };
}
