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
    if (head && !document.body.classList.contains('k-solid-header')) head.classList.toggle('is-solid', y > 40);
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

  // --- parallax na obrázkoch (posun je obmedzený, aby obrázok nikdy neodhalil prázdno)
  const layers = [...doc.querySelectorAll('.k-parallax img')];
  if (layers.length) {
    let ticking = false;
    const paint = () => {
      ticking = false;
      for (const layer of layers) {
        const box = layer.parentElement.getBoundingClientRect();
        const progress = (window.innerHeight - box.top) / (window.innerHeight + box.height);
        const limit = Math.max(8, box.height * 0.04);
        const shift = Math.round(Math.max(-limit, Math.min(limit, (progress - 0.5) * 120)));
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

  // --- hero: montáž z rýchlych záberov (vlastné súbory, žiadne cudzie médiá)
  const cuts = [...doc.querySelectorAll('[data-cut]')];
  if (cuts.length) {
    let index = -1;
    const show = () => {
      cuts.forEach(img => img.classList.remove('is-on'));
      index = (index + 1) % cuts.length;
      cuts[index].classList.add('is-on');
    };
    show();
    if (!reduce) setInterval(show, 2800);
  }

  // --- „Čítať viac“: na mobile zobrazíme max. 5 riadkov odstavca
  const more = doc.querySelector('[data-more]');
  const paragraph = more ? more.previousElementSibling : null;
  const clamp = () => {
    if (!paragraph) return;
    const narrow = window.innerWidth <= 860;
    paragraph.classList.toggle('is-clamped', narrow && !paragraph.dataset.open);
    if (more) more.hidden = !narrow || Boolean(paragraph.dataset.open);
  };
  more?.addEventListener('click', () => {
    if (!paragraph) return;
    paragraph.dataset.open = '1';
    clamp();
  });
  window.addEventListener('resize', clamp);
  clamp();

  // --- odhalenie pri scrolle: IntersectionObserver s fallbackom (bez JS = viditeľné)
  const revealables = [...doc.querySelectorAll('.k-reveal')];
  if (revealables.length) {
    const show = element => element.classList.add('is-in');
    if ('IntersectionObserver' in window && !reduce) {
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          observer.unobserve(entry.target);
        }
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
      for (const element of revealables) {
        element.classList.add('is-armed');
        observer.observe(element);
      }
      // po istom čase sa odhalí všetko, nech nič nezostane prázdne
      setTimeout(() => { for (const element of revealables) show(element); }, 2600);
    } else {
      for (const element of revealables) show(element);
    }
  }

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
