// KONCEPT redesignu – interakcie (len návrh, bez zásahu do produkčného kódu).
// Mobilné menu na jeden displej, bočná lišta sa objaví plynule až po scrolle,
// parallax na obrázkoch (ako pri Leil), taby zóny účtu.
(() => {
  const doc = document;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- hlavička: priehľadná nad úvodom, plná po scrolle
  const head = doc.querySelector('.k-head');
  const rail = doc.querySelector('.k-rail');
  const onScroll = () => {
    const y = window.scrollY;
    if (head) head.classList.toggle('is-solid', y > 40);
    if (rail) rail.classList.toggle('is-on', y > 220);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // --- mobilné menu (celé na jeden displej)
  const menu = doc.querySelector('.k-menu');
  const burger = doc.querySelector('.k-burger');
  const close = () => {
    if (!menu) return;
    menu.classList.remove('is-open');
    burger?.setAttribute('aria-expanded', 'false');
    doc.body.style.overflow = '';
  };
  burger?.addEventListener('click', () => {
    if (!menu) return;
    const open = !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    doc.body.style.overflow = open ? 'hidden' : '';
  });
  menu?.addEventListener('click', event => {
    if (event.target.closest('a') || event.target.closest('[data-close]')) close();
  });
  doc.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });

  // --- parallax na obrázkoch
  const layers = [...doc.querySelectorAll('.k-parallax img')];
  if (layers.length && !reduce) {
    let ticking = false;
    const paint = () => {
      ticking = false;
      for (const layer of layers) {
        const box = layer.parentElement.getBoundingClientRect();
        const progress = (window.innerHeight - box.top) / (window.innerHeight + box.height);
        const shift = Math.round((progress - 0.5) * 60);
        layer.style.setProperty('--shift', `${shift}px`);
      }
    };
    const onScrollParallax = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener('scroll', onScrollParallax, { passive: true });
    window.addEventListener('resize', onScrollParallax, { passive: true });
  }

  // --- záložky zóny účtu
  const tabs = [...doc.querySelectorAll('[data-account-tab]')];
  const panels = [...doc.querySelectorAll('[data-account-panel]')];
  const show = id => {
    for (const tab of tabs) tab.setAttribute('aria-current', String(tab.dataset.accountTab === id));
    for (const panel of panels) panel.hidden = panel.dataset.accountPanel !== id;
  };
  for (const tab of tabs) tab.addEventListener('click', () => show(tab.dataset.accountTab));
  if (tabs.length) show(tabs[0].dataset.accountTab);

  // --- hodnotenie 1–10 v Zrkadielku
  doc.addEventListener('click', event => {
    const value = event.target.closest('[data-value]');
    if (!value) return;
    const field = value.closest('[data-metric]');
    const input = field?.querySelector('input[type=hidden]');
    if (!input) return;
    const same = input.value === value.dataset.value;
    input.value = same ? '' : value.dataset.value;
    field.querySelectorAll('[data-value]').forEach(b => b.setAttribute('aria-pressed', String(!same && b === value)));
  });
})();
