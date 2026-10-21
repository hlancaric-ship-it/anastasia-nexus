// Zabezpečenie administrácie: dvojfaktorové overenie (2FA) a role vlastník / asistent.
// Zdroj pravdy: backend/docs/wp/admin-2fa-rbac.md
// API: GET/POST /admin/nexus/admin-2fa, POST /admin/nexus/admin-2fa/verify,
//      POST /admin/nexus/admin-2fa/recovery-codes, DELETE /admin/nexus/admin-2fa,
//      GET/POST /admin/nexus/admin-roles
const ROLE_LABEL = { owner: 'Vlastník', assistant: 'Asistent' };
const RECOVERY_CSS = `
@page{margin:14mm}
body{font:13px/1.6 Outfit,Arial,sans-serif;color:#2c2a23;margin:0}
h1{font-size:18px;margin:0 0 4px}
p{color:#6b6255;margin:0 0 14px}
.codes{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 18px;margin:12px 0}
.code{font:15px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.12em;border:1px solid #c9a44a;border-radius:6px;padding:7px 10px;background:#f8f3e6}
.warn{border:1px solid #7c2438;border-radius:6px;padding:10px 12px;background:#fdf3f4;color:#7c2438;font-weight:600}
`;

export function securityView({ api, esc, openPrintHtml, qrOtpSvg, freshView, isOwner }) {
  const owner = () => (typeof isOwner === 'function' ? isOwner() : true);
  const message = (text, error = false) => `<div class="${error ? 'err' : 'notice'}" role="${error ? 'alert' : 'status'}">${esc(text)}</div>`;

  return async function openSecurity(view) {
    view = freshView(view);
    view.innerHTML = '<div class="muted">Načítavam…</div>';
    let mfa = null, roles = null, loadError = null;
    try {
      mfa = await api('/admin/nexus/admin-2fa');
    } catch (e) {
      if (e.message === '401') throw e;
      loadError = e.message || 'Stav zabezpečenia sa nepodarilo načítať.';
    }
    try {
      roles = await api('/admin/nexus/admin-roles');
    } catch (e) {
      if (e.message === '401') throw e;
      if (!loadError) loadError = e.message || 'Zoznam administrátorov sa nepodarilo načítať.';
    }

    const state = { factorId: mfa?.factor_id || '', secret: '', otpauth: '', codes: null, enroll: false, busy: false, msg: null, disableOpen: false };

    const box = () => view.querySelector('[data-msg]');
    // Hláška sa drží v stave, aby prežila prekreslenie obrazovky.
    const say = (text, error = false) => { state.msg = { text, error }; render(); };

    // --- 2FA: stav ---
    function mfaCard() {
      if (loadError && !mfa) {
        return `<section class="card"><div class="card-h"><h2>Dvojfaktorové overenie</h2></div><div class="card-b">
          <p class="muted" style="margin-top:0">Zabezpečenie zatiaľ nie je dostupné – serverová časť nie je nasadená na tomto prostredí. Oznámte to podpore.</p>
          ${message(loadError, true)}</div></section>`;
      }
      if (state.enroll) return enrollCard();
      if (mfa?.enrolled) return enabledCard();
      return offCard();
    }

    const offCard = () => `<section class="card"><div class="card-h"><h2>Dvojfaktorové overenie</h2><span class="pill off">vypnuté</span></div><div class="card-b">
      <p style="margin-top:0">Dvojfaktorové overenie znamená, že sa do administrácie prihlásite iba heslom <b>aj</b> šesťmiestnym kódom z aplikácie v telefóne.
      Samotné heslo nestačí – bez kódu sa nikto nedostane do administrácie.</p>
      <p class="muted">Odporúčame zapnúť aspoň vlastníkovi. Kódy si uložte na papier alebo do trezoru – keď prídete o telefón, dostanete sa do administrácie len cez záložné kódy.</p>
      <button type="button" class="btn gold" id="s-enroll">Zapnúť dvojfaktorové overenie</button></div></section>`;

    const enabledCard = () => `<section class="card"><div class="card-h"><h2>Dvojfaktorové overenie</h2><span class="pill ok">zapnuté</span></div><div class="card-b">
      <p style="margin-top:0">Pri prihlásení vložíte heslo a potom šesťmiestny kód z aplikácie. Kódom sa dá aj vypnúť.</p>
      <p class="muted">Záložné kódy, ktoré zostali: <b>${esc(String(mfa?.recovery_codes_remaining ?? 0))}</b>. Slúžia na prihlásenie vtedy, keď nemáte telefón s aplikáciou.</p>
      <div class="row"><button type="button" class="btn ghost" id="s-newcodes">Vygenerovať nové záložné kódy</button>
        <button type="button" class="btn ghost danger" id="s-disable">Vypnúť dvojfaktorové overenie</button></div>
      <form id="s-disable-form" ${state.disableOpen ? '' : 'hidden'} style="margin-top:14px">
        <label for="s-disable-code">Na vypnutie vložte šesťmiestny kód z aplikácie</label>
        <input id="s-disable-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="napr. 123456">
        <button type="submit" class="btn ghost">Vypnúť overenie</button></form></div></section>`;

    const enrollCard = () => {
      const qr = qrOtpSvg(state.otpauth || '', { size: 220 });
      return `<section class="card"><div class="card-h"><h2>Zapnutie dvojfaktorového overenia</h2></div><div class="card-b">
        <p style="margin-top:0">Naskenujte QR kód aplikáciou na overovanie (napr. Google Authenticator, 1Password, Aegis) a potom vložte šesťmiestny kód, ktorý v aplikácii vidíte.</p>
        <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">
          <div>${qr || '<p class="muted">QR kód sa nepodarilo vytvoriť.</p>'}</div>
          <div style="flex:1;min-width:260px">
            <p class="muted">Ak QR kód naskenovať neviete, vložte tento tajný kód ručne do aplikácie:</p>
            <p><code class="rc-code">${esc(state.secret || '')}</code></p>
            <form id="s-verify">
              <label for="s-code">Kód z aplikácie</label>
              <input id="s-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="napr. 123456" required>
              <div class="row"><button type="submit" class="btn gold">Potvrdiť a zapnúť</button>
                <button type="button" class="btn ghost" id="s-cancel-enroll">Zrušiť</button></div>
            </form>
          </div></div></div></section>`;
    };

    // --- záložné kódy (zobrazené raz) ---
    function codesCard(codes) {
      const rows = codes.map(c => `<div class="code">${esc(c)}</div>`).join('');
      return `<section class="card"><div class="card-h"><h2>Záložné kódy</h2></div><div class="card-b">
        <p style="margin-top:0">Tieto kódy vypíšte a odložte na bezpečné miesto. <b>Zobrazia sa iba raz</b> – keď ich stratíte, budete si musieť vygenerovať nové (a prihlásiť sa aplikáciou).</p>
        <div class="codes" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">${rows}</div>
        <div class="row"><button type="button" class="btn gold" id="s-codes-download">Stiahnuť kódy (textový súbor)</button>
          <button type="button" class="btn ghost" id="s-codes-print">Vytlačiť kódy</button></div></div></section>`;
    }

    function codesHtml(codes) {
      const rows = codes.map(c => `<div class="code">${esc(c)}</div>`).join('');
      return `<h1>Záložné kódy – ANASTASIA</h1><p>Každý kód použite iba raz. Po použití prestane platiť.</p>
        <div class="warn">Tieto kódy sa zobrazujú iba raz. Vytlačte ich a odložte na bezpečné miesto.</div>
        <div class="codes">${rows}</div>`;
    }

    // --- 2FA: akcie ---
    async function enroll() {
      state.enroll = true; state.busy = true;
      render();
      say('Pripravujeme QR kód…');
      try {
        const data = await api('/admin/nexus/admin-2fa', { method: 'POST' });
        state.factorId = data?.factor_id || '';
        state.secret = data?.secret || '';
        state.otpauth = data?.otpauth_url || '';
        state.enroll = Boolean(state.factorId && state.otpauth);
        state.msg = null;
      } catch (e) {
        state.enroll = false;
        say(e.message || 'Dvojfaktorové overenie sa nepodarilo zapnúť.', true);
      } finally { state.busy = false; render(); }
    }

    async function verify(code) {
      state.busy = true; render();
      try {
        const data = await api('/admin/nexus/admin-2fa/verify', { method: 'POST', body: { factor_id: state.factorId, code: String(code || '').trim() } });
        state.codes = data?.recovery_codes || [];
        state.enroll = false;
        mfa = { ...(mfa || {}), enrolled: true, recovery_codes_remaining: state.codes.length };
        render();
        say('Dvojfaktorové overenie je zapnuté. Skontrolujte si záložné kódy nižšie.');
      } catch (e) {
        say(e.message || 'Kód sa nepodarilo overiť. Skúte to znova.', true);
      } finally { state.busy = false; render(); }
    }

    async function newCodes() {
      state.busy = true; render();
      try {
        const data = await api('/admin/nexus/admin-2fa/recovery-codes', { method: 'POST', body: { count: 10 } });
        state.codes = data?.recovery_codes || [];
        mfa = { ...(mfa || {}), recovery_codes_remaining: state.codes.length };
        render();
        say('Nové záložné kódy sú vygenerované. Predchádzajúce kódy už neplatia.');
      } catch (e) {
        say(e.message || 'Záložné kódy sa nepodarilo vygenerovať.', true);
      } finally { state.busy = false; render(); }
    }

    async function disable(code) {
      state.busy = true; render();
      try {
        await api('/admin/nexus/admin-2fa', { method: 'DELETE', body: { factor_id: state.factorId, code: String(code || '').trim() } });
        mfa = { ...(mfa || {}), enrolled: false, recovery_codes_remaining: 0 };
        state.codes = null;
        render();
        say('Dvojfaktorové overenie je vypnuté.');
      } catch (e) {
        say(e.message || 'Overenie sa nepodarilo vypnúť.', true);
      } finally { state.busy = false; render(); }
    }

    // --- role ---
    async function setRole(userId, role) {
      state.busy = true; render();
      try {
        await api('/admin/nexus/admin-roles', { method: 'POST', body: { user_id: userId, role } });
        const data = await api('/admin/nexus/admin-roles');
        roles = data;
        render();
        say('Rola je uložená.');
      } catch (e) {
        say(e.message || 'Rolu sa nepodarilo uložiť.', true);
      } finally { state.busy = false; render(); }
    }

    // --- vykreslenie ---
    function render() {
      const admins = roles?.admins || [];
      const roleRows = admins.map(a => {
        const isMe = a.id === roles?.current_user_id;
        const label = ROLE_LABEL[a.role] || a.role;
        return `<tr data-user="${esc(a.id)}">
          <td>${esc([a.first_name, a.last_name].filter(Boolean).join(' ') || a.email || '—')}${isMe ? ' <span class="muted">(vy)</span>' : ''}<div class="muted" style="font-size:12px">${esc(a.email || '')}</div></td>
          <td>${owner() ? `<label class="sr-only" for="role-${esc(a.id)}">Rola ${esc(a.email || '')}</label><select id="role-${esc(a.id)}" data-role-for="${esc(a.id)}"><option value="owner"${a.role === 'owner' ? ' selected' : ''}>Vlastník</option><option value="assistant"${a.role === 'assistant' ? ' selected' : ''}>Asistent</option></select>`
            : `<span class="pill">${esc(label)}</span>`}</td>
          <td>${owner() ? `<button type="button" class="btn ghost sm" data-save-role="${esc(a.id)}">Uložiť rolu</button>` : ''}</td></tr>`;
      }).join('');

      view.innerHTML = `<div data-msg style="margin-bottom:14px">${state.msg ? message(state.msg.text, state.msg.error) : ''}</div>
        ${mfaCard()}
        ${state.codes ? codesCard(state.codes) : ''}
        <section class="card"><div class="card-h"><h2>Administrátori a ich roly</h2></div><div class="card-b">
          <p style="margin-top:0"><b>Vlastník</b> spravuje celú administráciu – vrátane cien, zľav, vernostných úrovní, ručného pridania prístupu a rolí.
          <b>Asistent</b> vybavuje objednávky, produkty, zákazníkov, konzultácie, správy a obsah, ale ceny, zľavy, vernostné úrovne, prístupy a role nespravuje.</p>
          ${roles ? (admins.length ? `<div class="ot-wrap"><table class="ot lv"><thead><tr><th>Správca</th><th>Rola</th><th class="ot-act"><span class="sr-only">Akcia</span></th></tr></thead><tbody>${roleRows}</tbody></table></div>`
            : '<div class="empty">Zatiaľ tu nie je žiadny správca.</div>')
            : `<p class="muted">${esc(loadError || 'Zoznam administrátorov sa nepodarilo načítať.')}</p>`}
          ${!owner() ? '<p class="muted">Role môže meniť iba vlastník administrácie.</p>' : ''}</div></section>`;

      // 2FA
      const enrollBtn = view.querySelector('#s-enroll');
      if (enrollBtn) enrollBtn.onclick = () => enroll();
      const cancelBtn = view.querySelector('#s-cancel-enroll');
      if (cancelBtn) cancelBtn.onclick = () => { state.enroll = false; render(); };
      const verifyForm = view.querySelector('#s-verify');
      if (verifyForm) verifyForm.onsubmit = (e) => { e.preventDefault(); verify(view.querySelector('#s-code').value); };
      const newBtn = view.querySelector('#s-newcodes');
      if (newBtn) newBtn.onclick = () => newCodes();
      const disBtn = view.querySelector('#s-disable');
      const disForm = view.querySelector('#s-disable-form');
      if (disBtn && disForm) {
        disBtn.onclick = () => { state.disableOpen = !state.disableOpen; render(); if (state.disableOpen) view.querySelector('#s-disable-code')?.focus(); };
        disForm.onsubmit = (e) => { e.preventDefault(); disable(view.querySelector('#s-disable-code').value); };
      }
      const dl = view.querySelector('#s-codes-download');
      if (dl) dl.onclick = () => {
        const blob = new Blob([`Záložné kódy – ANASTASIA\n\n${state.codes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'zalozne-kody-anastasia.txt';
        view.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };
      const pr = view.querySelector('#s-codes-print');
      if (pr) pr.onclick = () => openPrintHtml('Záložné kódy – ANASTASIA', codesHtml(state.codes), RECOVERY_CSS);

      // role
      view.querySelectorAll('[data-save-role]').forEach(b => b.onclick = () => {
        const id = b.dataset.saveRole;
        const select = view.querySelector(`[data-role-for="${CSS.escape(id)}"]`);
        if (select) setRole(id, select.value);
      });
    }

    render();
  };
}
