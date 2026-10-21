// Súhlas s cookies: jediný zdroj pravdy, čo návštevník povolil.
// - Nevyhnutné kategórie sú vždy povolené.
// - Voliteľné kategórie (analytické, marketingové) sú vypnuté, kým zákazník nevyberie.
// - Pred rozhodnutím sa nenačíta žiadny skript tretej strany: brána je v requireDecision().
//
// Údaje o voľbe sa ukladajú len v prehliadači (localStorage). Na server sa neposielajú.

const KEY = 'anastasia.consent';
const OPTIONAL = ['analytics', 'marketing'];

const listeners = [];
const waiters = [];

const readState = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.decided !== true) return null;
    const state = { necessary: true, analytics: false, marketing: false };
    for (const category of OPTIONAL) state[category] = parsed[category] === true;
    return state;
  } catch {
    return null;
  }
};

const writeState = state => {
  const payload = { decided: true, necessary: true, updated_at: new Date().toISOString() };
  for (const category of OPTIONAL) payload[category] = state[category] === true;
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Prehliadač bez úložiska (súkromné prehliadanie) – voľba sa platí len do obnovenia stránky.
  }
};

/** Uložená voľba zákazníka alebo null, ak ešte nerozhodol. */
export const consentState = readState;

/** Rozhodol už zákazník? (true = voľba je uložená, aj keď sú voliteľné kategórie vypnuté) */
export const hasConsentDecision = () => readState() !== null;

/** Je kategória povolená? Nevyhnutná je vždy, keď existuje uložená voľba. */
export const consentGranted = category => {
  const state = readState();
  if (!state) return false;
  if (category === 'necessary') return true;
  return state[category] === true;
};

/** Uloží voľbu a odošle ju prihláseným poslucháčom. */
export const saveConsent = choice => {
  const state = { necessary: true, analytics: false, marketing: false };
  for (const category of OPTIONAL) if (choice?.[category] === true) state[category] = true;
  writeState(state);
  for (const { category, callback } of listeners.splice(0)) {
    if (state[category] === true) {
      try { callback(); } catch { /* poslucháč nesmie zablokovať ďalších */ }
    }
  }
  for (const resolve of waiters.splice(0)) resolve(state);
  return state;
};

/**
 * Spustí callback, keď je kategória povolená; inak počká na rozhodnutie zákazníka.
 * Voliteľné kategórie sa tak nikdy nespustia pred súhlasom.
 */
export const onConsent = (category, callback) => {
  if (consentGranted(category)) {
    callback();
    return;
  }
  listeners.push({ category, callback });
};

/** Počká na rozhodnutie zákazníka (nie na súhlas – stačí aj „Odmietnuť“). */
export const requireDecision = () => {
  const state = readState();
  if (state) return Promise.resolve(state);
  showBanner();
  return new Promise(resolve => waiters.push(resolve));
};

// Verejné API pre prípadné voliteľné skripty (analytika, marketing): nič sa nenačíta pred súhlasom.
globalThis.anastasiaConsent = Object.freeze({
  granted: consentGranted,
  on: onConsent,
  requireDecision,
  get state() { return readState(); },
});

// --- Uživatelské rozhranie: lišta prvej vrstvy a panel nastavení -------------------------

const OPTIONAL_IDS = OPTIONAL;

/** Zobrazí lištu (prvá vrstva) – volá sa, keď zákazník ešte nerozhodol. */
export const showBanner = () => {
  const banner = document.getElementById('cookie-banner');
  if (banner) banner.hidden = false;
};

export const hideBanner = () => {
  const banner = document.getElementById('cookie-banner');
  if (banner) banner.hidden = true;
};

/** Prečíta stav zaškrtávacích polí v paneli nastavení. */
const readPanel = panel => {
  const choice = { analytics: false, marketing: false };
  for (const input of panel.querySelectorAll('[data-consent-category]')) {
    if (input.disabled) continue;
    choice[input.dataset.consentCategory] = input.checked;
  }
  return choice;
};

/** Prepíše zaškrtávacie polia podľa uloženej voľby. */
const writePanel = panel => {
  const state = readState() ?? { analytics: false, marketing: false };
  for (const input of panel.querySelectorAll('[data-consent-category]')) {
    if (input.disabled) continue;
    input.checked = state[input.dataset.consentCategory] === true;
  }
};

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * Nastaví lištu a panel nastavení. Volá sa raz pri načítaní stránky.
 * Markup je v statickom HTML; skript spravuje len viditeľnosť a uloženie voľby.
 */
export const initCookieConsent = () => {
  const banner = document.getElementById('cookie-banner');
  const panel = document.getElementById('cookie-settings');
  if (!banner && !panel) return;

  let lastFocused = null;

  const openSettings = () => {
    if (!panel) return;
    lastFocused = document.activeElement;
    hideBanner();
    writePanel(panel);
    panel.hidden = false;
    const first = panel.querySelector(FOCUSABLE);
    first?.focus({ preventScroll: true });
  };

  const closeSettings = () => {
    if (!panel) return;
    panel.hidden = true;
    lastFocused?.focus?.({ preventScroll: true });
    lastFocused = null;
  };

  const decide = choice => {
    saveConsent(choice);
    closeSettings();
    hideBanner();
  };

  document.addEventListener('click', event => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-consent]') : null;
    if (trigger) {
      event.preventDefault();
      const action = trigger.dataset.consent;
      if (action === 'all') return decide({ analytics: true, marketing: true });
      if (action === 'none') return decide({ analytics: false, marketing: false });
      if (action === 'settings') return openSettings();
      if (action === 'save') return decide(readPanel(panel));
      if (action === 'close') {
        // Zatvorenie bez rozhodnutia neodstráni lištu – voľba je stále nevykonaná.
        if (!hasConsentDecision()) showBanner();
        return closeSettings();
      }
      return;
    }
    const link = event.target instanceof Element ? event.target.closest('[data-cookie-settings]') : null;
    if (link) {
      event.preventDefault();
      openSettings();
    }
  });

  document.addEventListener('keydown', event => {
    if (!panel || panel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!hasConsentDecision()) showBanner();
      return closeSettings();
    }
    if (event.key !== 'Tab') return;
    // Fokus ostáva v dialógu.
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter(item => item.offsetParent !== null || item === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (hasConsentDecision()) {
    hideBanner();
    writePanel(panel);
  } else {
    showBanner();
  }
};
