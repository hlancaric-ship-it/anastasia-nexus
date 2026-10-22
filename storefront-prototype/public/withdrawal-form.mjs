// Online odstúpenie od zmluvy (časť C právnych textov): odoslanie formulára a predvyplnenie z účtu.
// Adaptér aj mock vracajú hodnotu alebo promise – všetko voláme cez `safe`, aby sa stránka nezahodila.
const safe = async fn => {
  try { return await fn(); } catch { return undefined; }
};

/** Vráti prvý element z koreňa (null, ak v DOM nie je). */
const pick = (root, selector) => {
  try { return root.querySelector(selector); } catch { return null; }
};

/**
 * Nastaví formulár online odstúpenia (ak je na stránke).
 * - prihlásenému zákazníkovi predvyplní e-mail a meno z účtu,
 * - pri odoslaní zavolá `api.sendContractWithdrawal()` a vypíše hlásenie do `.form-status`.
 *
 * `options.formData` je nahrádzač čítania údajov z formulára (v produkcii FormData, v teste náhrada).
 */
export function initWithdrawalForm(api, root = document, options = {}) {
  const form = pick(root, '#withdrawal-form');
  if (!form) return null;
  const status = pick(form, '.form-status');
  const send = pick(form, 'button[type=submit]');
  const readForm = options.formData ?? (element => Object.fromEntries(new FormData(element)));

  const prefill = async () => {
    const loggedIn = await safe(() => (typeof api.isLoggedIn === 'function' ? api.isLoggedIn() : false));
    if (!loggedIn) return;
    const email = await safe(() => (typeof api.getCustomerEmail === 'function' ? api.getCustomerEmail() : ''));
    if (!email || !form.elements?.email) return;
    form.elements.email.value = email;
    const account = await safe(() => (typeof api.getAccount === 'function' ? api.getAccount() : null));
    if (account?.ok && account.name && form.elements.name && !form.elements.name.value) form.elements.name.value = account.name;
  };

  if (form.addEventListener) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (send?.disabled) return;
      if (form.reportValidity && !form.reportValidity()) return;
      if (send) send.disabled = true;
      if (status) { status.dataset.state = ''; status.textContent = 'Odosielam…'; }
      let r;
      try {
        r = await api.sendContractWithdrawal(readForm(form));
      } catch {
        r = { ok: false, message: 'Odstúpenie sa nepodarilo odoslať. Skúste to prosím znova o chvíľu.' };
      }
      if (status) { status.textContent = r?.message ?? ''; status.dataset.state = r?.ok ? 'OK' : 'ERROR'; }
      if (r?.ok && form.reset) form.reset();
      if (send) send.disabled = false;
    });
  }

  return { prefill, form };
}
