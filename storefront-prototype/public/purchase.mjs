const bound = new WeakSet();
/** One click/Enter means one cart mutation, even while the network is slow. */
export function bindProductPurchase(form, {addToCart, onResult}) {
  if (!form || bound.has(form)) return;
  bound.add(form); let busy=false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.dataset.code || !form.reportValidity()) return;
    busy=true;
    const buttons=[...form.querySelectorAll('[type=submit]')].map(button=>[button,button.disabled]);
    buttons.forEach(([button])=>{button.disabled=true;});
    try { await onResult(await addToCart(form.dataset.code, Number(form.elements.quantity.value))); }
    catch { await onResult({ok:false,message:'Pridanie sa nepodarilo overiť. Pred ďalším pokusom skontrolujte košík.'}); }
    finally { busy=false; buttons.forEach(([button,disabled])=>{button.disabled=disabled;}); }
  });
}
