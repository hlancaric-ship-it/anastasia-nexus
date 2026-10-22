import {SHOP_CATEGORIES, SHOP_CATEGORY_HANDLES} from './catalog.mjs';

const EUR = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });
const ORDER_STATUS = { pending: 'Prijatá', completed: 'Vybavená', canceled: 'Zrušená', archived: 'Archivovaná', requires_action: 'Čaká na vás', draft: 'Rozpracovaná' };
const money = n => (Number.isFinite(Number(n)) ? EUR.format(Number(n)) : 'Cena sa doplní');
const NAME_BY_HANDLE=Object.fromEntries(Object.entries(SHOP_CATEGORY_HANDLES).map(([name,handle])=>[handle,name]));
const ART = { Kozmetika: 'jar', 'BIOKOZMETIKA': 'jar', Výživa: 'coffee', Domov: 'candle', Ľan: 'linen', Programy: 'sun', Služby: 'sun' };

const PRODUCT_FIELDS =
  'handle,title,subtitle,description,thumbnail,metadata,*images,*categories,*variants,+variants.sku,+variants.calculated_price';

// --- Prihlásenie: token musí byť viazaný na zákazníka (actor_id) ------------------
// Medusa v2 vydáva pri registrácii token identity BEZ actor_id (zákazník ešte nie je
// naviazaný). Správny poriadok je: register → POST /store/customers (naviaže zákazníka
// na identitu) → NOVÝ prihlasovací token. Token bez actor_id je na chránené volania
// nepoužiteľný (401), preto ho v klienti nikdy neukladáme ako prihlásenie.
const ACTOR_RETRY_DELAYS = [300, 800]; // ms medzi pokusmi, keď server vráti token bez actor_id
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Dekóduje payload JWT (base64url) BEZ overenia podpisu – podpis už overil server,
 * ktorý token vydal. Zámer je zistiť, či je token viazaný na zákazníka (actor_id).
 */
export function decodeJwtPayload(token) {
  if (typeof token !== 'string' || !token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === 'object' ? payload : null;
  } catch { return null; }
}

/** Token je použiteľný pre chránené volania len vtedy, keď je naviazaný na zákazníka. */
export const tokenHasActor = token => {
  const payload = decodeJwtPayload(token);
  return Boolean(payload && typeof payload.actor_id === 'string' && payload.actor_id.trim() !== '');
};

// Klub, konzultácie a darčekový poukaz majú vlastný nákupný tok (súhlas, termín, príjemca); bežný košík ich backend odmietne.
const isShopProduct = p => { const m = p?.metadata || {}; return !m.membership && !m.booking && m.gift_voucher !== true && m.gift_voucher !== 'true'; };

const publicMedia=(value,base)=>{try{const u=new URL(value);if(u.origin===new URL(base).origin&&u.pathname.startsWith('/static/'))return '/backend-media'+u.pathname;}catch{}return value;};
function mapProduct(p,apiBase='') {
  const media=value=>{if(typeof value!=='string')return value;try{const u=new URL(value),base=new URL(apiBase);if(u.origin===base.origin&&u.pathname.startsWith('/static/'))return '/backend-media'+u.pathname;}catch{}return value;};
  const variant = (p.variants || [])[0] || {};
  const cp = variant.calculated_price || {};
  const category = (p.categories||[]).map(c=>c.name).find(n=>SHOP_CATEGORIES.includes(n)) || (p.categories||[])[0]?.name || '';
  return {
    slug: p.handle,
    name: p.title,
    category,
    code: p.handle,
    priceLabel: cp.calculated_amount != null ? money(cp.calculated_amount) : 'Cena sa doplní',
    art: ART[category] || 'jar',
    description: p.subtitle || p.metadata?.description_text || '',
    descriptionHtml: p.description || '',
    longDescription: p.metadata?.description_text || '',
    images: (p.images || []).map(image => media(image.url)).filter(Boolean),
    availability: 'Dostupné',
    isNew: false,
    isBestseller: false,
    image: media(p.thumbnail) || `/assets/product-${ART[category] || 'jar'}.svg`,
    _variantId: variant.id,
  };
}

// Kľúč tokenu zákazníka v prehliadači. Používa ho aj skript stráže účtu (src/account-guard.mjs).
export const JWT_KEY = 'anastasia.jwt';

export function createHttpApi(storage, config) {
  const base = config.apiBaseUrl.replace(/\/+$/, '');
  const JWT = JWT_KEY, CART = 'anastasia.cart', COUPON = 'anastasia.coupon', QRKEYS = 'anastasia.qrkeys', GIFT = 'anastasia.gift';
  const get = k => { try { return storage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { storage.setItem(k, v); } catch { /* preview bez storage */ } };
  const del = k => { try { storage.removeItem(k); } catch { /* noop */ } };
  const headers = (json = true, token) => {
    const h = { 'x-publishable-api-key': config.publishableKey };
    if (json) h['content-type'] = 'application/json';
    // `token` prepíše uložený token – používa sa pre registračný token, ktorý sa nikdy neukladá.
    const t = token || get(JWT); if (t) h.authorization = `Bearer ${t}`;
    return h;
  };
  async function call(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(base + path, {
      method, headers: headers(body !== undefined, token),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null; try { data = await res.json(); } catch { /* prázdné tělo */ }
    return { status: res.status, ok: res.ok, data };
  }
  const loggedIn = () => Boolean(get(JWT));

  /**
   * Získa prihlasovací token naviazaný na zákazníka (payload obsahuje actor_id).
   * Ak server vráti token bez actor_id (zákazník ešte nie je naviazaný), pokus
   * zopakuje max 2× s krátkou pauzou (300 ms, 800 ms) – backend doviaže väzbu
   * identita → zákazník oneskor a ďalší login už token s actor_id vráti.
   */
  async function boundToken(attempt) {
    for (let i = 0; i <= ACTOR_RETRY_DELAYS.length; i++) {
      let r = null;
      try { r = await attempt(); } catch { r = null; } // výpadok siete nepretrží celý retry
      const token = r?.data?.token;
      if (r?.ok && token && tokenHasActor(token)) return { ok: true, token, attempts: i + 1 };
      if (i < ACTOR_RETRY_DELAYS.length) await sleep(ACTOR_RETRY_DELAYS[i]);
    }
    return { ok: false, attempts: ACTOR_RETRY_DELAYS.length + 1 };
  }
  // RESET 40+ (členská zóna): štruktúra programu a Zrkadielko. Endpointy sú len pre
  // prihláseného zákazníka s aktívnym prístupom – 401 = neprihlásený, 403 = bez prístupu.
  const RESET_MSG = {
    400: 'Údaje záznamu nie sú platné.',
    401: 'Pre prístup k Zrkadielku sa prihláste.',
    403: 'Zrkadielko je dostupné len zákazníkom s programom RESET 40+.',
    404: 'Tento záznam už neexistuje.',
    429: 'Denný limit záznamov je dosiahnutý.',
  };
  async function resetCall(path, { method = 'GET', body } = {}) {
    try { return await call(path, { method, body }); } catch { return { status: 503, ok: false, data: null }; }
  }
  const resetFail = r => ({ ok: false, status: r.status, error: r.data?.error || r.data?.type || 'RESET_ERROR', message: r.data?.message || RESET_MSG[r.status] || 'Údaje sa nepodarilo načítať.' });
  // Klub: výpadok siete sa vracia ako 503, nie ako výnimka do UI.
  const MCART = 'anastasia.membership.cart', MCHECKOUT = 'anastasia.membership.checkout', MOFFER = 'anastasia.membership.offer';
  const MEMBERSHIP_MSG = {
    401: 'Pre členstvo sa prihláste.',
    404: 'Členstvo alebo nákup sa nenašli.',
    409: 'Podmienky sa medzičasom zmenili. Načítajte ponuku znova; platbu neopakujte.',
    422: 'Skontrolujte vybrané členstvo a údaje.',
    503: 'Členstvo sa teraz nedá overiť. Skúste to neskôr.',
  };
  async function mcall(path, opts) {
    try { return await call(path, opts); } catch { return { status: 503, ok: false, data: null }; }
  }
  const mfail = (r, fallback) => ({ ok: false, status: r.status, error: r.data?.error || 'MEMBERSHIP_ERROR', message: r.data?.message || MEMBERSHIP_MSG[r.status] || fallback });

  // Konzultácia: podržaný termín patrí ku košíku (metadata.booking_id); klient si pamätá len popis pre zobrazenie.
  const BOOKING = 'anastasia.booking';
  const BOOKING_MSG = {
    401: 'Pre rezerváciu termínu sa prihláste.',
    404: 'Táto konzultácia už nie je v ponuke.',
    409: 'Termín už nie je voľný, zvoľte prosím iný.',
  };
  const storedBooking = () => { try { const b = JSON.parse(get(BOOKING) || 'null'); return b && typeof b.id === 'string' ? b : null; } catch { return null; } };
  const bookingLabel = (startsAt, endsAt) => {
    const s = new Date(startsAt), e = new Date(endsAt);
    if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return '';
    const f = o => new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', ...o });
    return `${f({ weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' }).format(s)} · ${f({ hour: '2-digit', minute: '2-digit' }).format(s)} – ${f({ hour: '2-digit', minute: '2-digit' }).format(e)}`;
  };
  // Uvoľní podržaný termín a odpojí konzultáciu od košíka (riadok aj metadata.booking_id), aby košík zostal dokončiteľný.
  async function releaseBooking(cartId) {
    const b = storedBooking(); del(BOOKING);
    if (b && loggedIn()) await call(`/store/bookings/${encodeURIComponent(b.id)}/cancel`, { method: 'POST', body: {} }).catch(() => null);
    if (!cartId) return;
    const r = await call(`/store/carts/${cartId}?fields=id,metadata,*items,*items.product`).catch(() => null);
    const cart = r?.data?.cart; if (!cart) return;
    for (const it of cart.items || []) if (it.product?.metadata?.booking) await call(`/store/carts/${cartId}/line-items/${it.id}`, { method: 'DELETE' }).catch(() => null);
    if (cart.metadata?.booking_id) await call(`/store/carts/${cartId}`, { method: 'POST', body: { metadata: { booking_id: '' } } }).catch(() => null);
  }
  // Pred platbou: termín v košíku musí byť stále podržaný pre túto zákazníka (inak by platba prešla bez termínu).
  async function checkCartBooking(cartId) {
    const r = await call(`/store/carts/${cartId}?fields=id,metadata,*items,*items.product`);
    if (!r.ok || !r.data?.cart) return { ok: false, message: 'Košík sa nepodarilo načítať. Skúste to znova.' };
    const cart = r.data.cart;
    const lines = (cart.items || []).filter(it => it.product?.metadata?.booking);
    if (!lines.length && !cart.metadata?.booking_id) return { ok: true };
    const expired = { ok: false, expired: true, message: 'Podržanie termínu vypršalo. Vyberte si prosím termín znova.' };
    if (lines.length !== 1 || Number(lines[0].quantity) !== 1 || typeof cart.metadata?.booking_id !== 'string' || !cart.metadata.booking_id) return expired;
    const bk = await call('/store/bookings');
    if (!bk.ok) return { ok: false, message: 'Termín sa nepodarilo overiť. Skúste to znova.' };
    const b = (bk.data?.bookings || []).find(x => x.id === cart.metadata.booking_id);
    if (!b || b.status !== 'held' || (b.held_until && new Date(b.held_until).getTime() <= Date.now())) return expired;
    return { ok: true, booking: b };
  }

  const productCache = new Map();
  async function variantFor(code) {
    if (productCache.has(code)) return productCache.get(code);
    const r = await call(`/store/products?handle=${encodeURIComponent(code)}&region_id=${config.regionId}&fields=${PRODUCT_FIELDS}`);
    const p = r.data?.products?.[0];
    const id = p ? mapProduct(p)._variantId : null;
    if (id) productCache.set(code, id);
    return id;
  }

  async function ensureCart() {
    const existing = get(CART);
    if (existing) {
      const r = await call(`/store/carts/${existing}`);
      if (r.ok && r.data?.cart) return existing;
    }
    const r = await call('/store/carts', { method: 'POST', body: { region_id: config.regionId } });
    const id = r.data?.cart?.id;
    if (id) set(CART, id);
    return id;
  }

  async function reprice() {
    // Přepočet ceny/kupónu dělá server; vyžaduje prihlásenie. Host vidí základní ceny Medusy.
    if (!loggedIn()) return;
    const id = get(CART); if (!id) return;
    const coupon = get(COUPON) || undefined;
    await call('/store/nexus-cart', { method: 'POST', body: { cart_id: id, couponCode: coupon } });
  }

  // Server vracia čísla v eurách (amount, balance); košík zobrazuje popisky.
  const giftCredit = () => {
    let c; try { c = JSON.parse(get(GIFT) || 'null'); } catch { return null; }
    if (!c || typeof c !== 'object') return null;
    return { ...c, amountLabel: money(-Math.abs(Number(c.amount))), balanceLabel: money(c.balance) };
  };
  async function cartShape() {
    const id = get(CART);
    const empty = { mode: 'http', lines: [], gift_voucher: giftCredit(), coupon: get(COUPON) || '', subtotalLabel: '0,00 €', discountLabel: get(COUPON) ? 'Kupón prijatý' : 'Kupón nezadaný', totalLabel: '0,00 €' };
    if (!id) return empty;
    const r = await call(`/store/carts/${id}?fields=*items,*items.product,*shipping_methods,total,item_subtotal,discount_total,shipping_total,tax_total`);
    const cart = r.data?.cart; if (!cart) return empty;
    const held = storedBooking();
    const lines = (cart.items || []).map(it => ({
      slug: it.product_handle || it.product?.handle || it.id,
      name: it.product_title || it.title || it.product?.title || 'Položka',
      code: it.product_handle || it.product?.handle,
      priceLabel: money(it.unit_price),
      image: publicMedia(it.thumbnail || it.product?.thumbnail || '/assets/brand-mark.svg',base),
      quantity: it.quantity,
      giftVoucher: false,
      // Konzultácia má vždy 1 ks a termín; množstvo sa nemení, riadok sa dá len odstrániť.
      booking: it.product?.metadata?.booking ? { label: held && held.product_id === it.product_id ? held.label : '', heldUntil: held && held.product_id === it.product_id ? held.held_until : '' } : null,
      _itemId: it.id,
    }));
    const coupon = get(COUPON) || '';
    return {
      mode: 'http', lines, gift_voucher: giftCredit(), coupon,
      subtotalLabel: money(cart.item_subtotal ?? cart.total),
      discountLabel: coupon ? 'Kupón prijatý' : (cart.discount_total ? money(-cart.discount_total) : 'Kupón nezadaný'),
      shippingLabel: (cart.shipping_methods || []).length ? (Number(cart.shipping_total) > 0 ? money(cart.shipping_total) : 'Zadarmo') : '',
      taxLabel: Number(cart.tax_total) > 0 ? money(cart.tax_total) : '',
      totalLabel: money(cart.total), paymentRequired: cart.total!==0,
    };
  }

  // Pokladňa: server je jediný zdroj pravdy. Vracia, či treba adresu (requires_delivery),
  // možnosti dopravy (courier/pickup) a platby (card/cod/bank_transfer) a sám nastaví dopravu,
  // prepočíta ceny a založí platobnú session. Klient posiela len kódy, nikdy sumy.
  const CHECKOUT_MSG = {
    UNAUTHORIZED: 'Pre dokončenie objednávky sa prihláste.',
    CART_ACCESS_DENIED: 'Košík patrí inému zákazníkovi. Prihláste sa správnym účtom.',
    CART_NOT_FOUND: 'Košík sa nenašiel. Vytvorte si nový.',
    CART_EMPTY: 'Košík je prázdny.',
    CART_COMPLETED: 'Táto objednávka už bola vykonaná.',
    UNSUPPORTED_CURRENCY: 'Objednávku nie je možné potvrdiť v tejto meny.',
    // Fyzický tovar bez zvolenej dopravy: zákazník musí zvoliť doručenie na adresu.
    INVALID_DELIVERY: 'Košík obsahuje tovar na doručenie. Zvoľte doručenie na adresu.',
    DELIVERY_REQUIRED: 'Košík obsahuje tovar na doručenie. Zvoľte doručenie na adresu.',
    SHIPPING_OPTION_UNAVAILABLE: 'Košík obsahuje tovar na doručenie. Zvoľte doručenie na adresu.',
    SHIPPING_REQUIRED: 'Košík obsahuje tovar na doručenie. Zvoľte doručenie na adresu.',
    ADDRESS_REQUIRED: 'Košík obsahuje tovar na doručenie. Zvoľte doručenie na adresu.',
    SHIPPING_PROFILE_UNKNOWN: 'Niektorý tovar v košíku sa nedá doručiť. Skúste iný spôsob platby.',
    INVALID_PAYMENT_METHOD: 'Zvoľte spôsob platby.',
    PAYMENT_METHOD_UNAVAILABLE: 'Tento spôsob platby momentálne nie je dostupný. Zvoľte iný.',
    COD_NOT_AVAILABLE: 'Dobierka je dostupná len pri doručení kuriérom.',
    PAYMENT_COLLECTION_FAILED: 'Platbu sa nepodarilo pripraviť. Skúste to znova.',
    PAYMENT_PROVIDER_UNAVAILABLE: 'Platobná brána je momentálne nedostupná. Skúste to neskôr.',
    CART_TOTAL_INVALID: 'Cenu objednávky sa nepodarilo vypočítať. Skúste to znova.',
  };
  const checkoutFail = (res, fallback) => {
    const code = res?.data?.error;
    if (typeof code === 'string' && code.startsWith('NEXUS_PRICING')) return 'Ceny sa nepodarilo vypočítať. Skúste to o chvíľu.';
    if (code && CHECKOUT_MSG[code]) return CHECKOUT_MSG[code];
    if (res?.status === 401) return CHECKOUT_MSG.UNAUTHORIZED;
    if (res?.status === 403) return CHECKOUT_MSG.CART_ACCESS_DENIED;
    if (res?.status === 503) return 'Služba je dočasne nedostupná. Skúste to o chvíľu.';
    return fallback;
  };
  const feeLabel = (value, free) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';
    if (amount === 0) return free ? 'Zadarmo' : '';
    return money(amount);
  };

  // Údaje viazané na zákazníka: token, košík, kupón, darček, konzultácia, členstvo, QR kľúče.
  // Po odhlásení nesmú v prehliadači prežiť – inak by zostali prístupné ďalšiemu používateľovi.
  // 'anastasia.return' drží app shell v localStorage (návrat po prihlásení), vymažeme ho z oboch úložísk.
  const RETURN_KEY = 'anastasia.return';
  const CUSTOMER_KEYS = [JWT, CART, COUPON, QRKEYS, GIFT, MCART, MCHECKOUT, MOFFER, BOOKING, RETURN_KEY];

  // createApi volá metódy bez `this`, vnútorné volania preto idú cez `self`.
  const self = {
    mode: 'http',

    async getProducts({ category = '', search = '', filter = '' } = {}) {
      const r = await call(`/store/products?region_id=${config.regionId}&limit=100&fields=${PRODUCT_FIELDS}`);
      if(!r.ok)throw new Error('Katalóg sa nepodarilo načítať.');
      let items = (r.data?.products || []).filter(p=>p.metadata?.gift_voucher!==true&&p.metadata?.gift_voucher!=='true').map(p=>mapProduct(p,base));
      const s = search.toLocaleLowerCase('sk');
      if (category) { const wanted = NAME_BY_HANDLE[category] || category; items = items.filter(p => p.category === wanted || p.categoryHandle === category); }
      if (search) items = items.filter(p => p.name.toLocaleLowerCase('sk').includes(s));
      if (filter === 'novinky') items = items.filter(p => p.isNew);
      if (filter === 'bestsellery') items = items.filter(p => p.isBestseller);
      return items;
    },
    async getProduct(slug) {
      const r = await call(`/store/products?handle=${encodeURIComponent(slug)}&region_id=${config.regionId}&fields=${PRODUCT_FIELDS}`);
      const p = r.data?.products?.[0];
      return p ? mapProduct(p,base) : null;
    },
    async getCategories() {
      const r = await call('/store/product-categories?limit=100&fields=name');
      const names = (r.data?.product_categories || []).map(c => c.name).filter(Boolean);
      return r.ok ? SHOP_CATEGORIES.filter(name=>names.includes(name)) : [];
    },

    getCart: cartShape,
    async addToCart(code, quantity = 1) {
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return { ok: false, message: 'Zadajte celé množstvo od 1 do 99.' };
      const variant = await variantFor(code);
      if (!variant) return { ok: false, message: 'Produkt sa nenašiel v katalógu.' };
      const id = await ensureCart();
      if (!id) return { ok: false, message: 'Košík sa nepodarilo vytvoriť. Skúste to znova.' };
      const r = await call(`/store/carts/${id}/line-items`, { method: 'POST', body: { variant_id: variant, quantity } });
      if (!r.ok) return { ok: false, message: 'Produkt sa nepodarilo pridať do košíka.' };
      await reprice();
      return { ok: true, message: 'Produkt pridaný do košíka.', cart: await cartShape() };
    },
    async setQuantity(slug, quantity) {
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) return { ok: false, message: 'Množstvo musí byť celé číslo od 0 do 99.' };
      const id = get(CART); if (!id) return { ok: false, message: 'Košík je prázdny.' };
      const current = await cartShape();
      const line = current.lines.find(l => l.slug === slug);
      if (!line) return { ok: false, message: 'Položka už nie je v košíku.' };
      if (line.booking) {
        if (quantity !== 0) return { ok: false, message: 'Konzultácia sa rezervuje na jeden termín. Ďalší termín si vyberte samostatne.' };
        await releaseBooking(id); await reprice();
        return { ok: true, cart: await cartShape() };
      }
      const r = quantity === 0
        ? await call(`/store/carts/${id}/line-items/${line._itemId}`, { method: 'DELETE' })
        : await call(`/store/carts/${id}/line-items/${line._itemId}`, { method: 'POST', body: { quantity } });
      if (!r.ok) return { ok: false, message: 'Množstvo sa nepodarilo zmeniť.' };
      await reprice();
      return { ok: true, cart: await cartShape() };
    },
    async applyCoupon(code) {
      const id = await ensureCart();
      if (!loggedIn()) return { ok: false, message: 'Pre uplatnenie kupónu sa prihláste.' };
      const r = await call('/store/nexus-cart', { method: 'POST', body: { cart_id: id, couponCode: String(code || '').trim() } });
      if (r.ok && r.data?.coupon) { set(COUPON, r.data.coupon.code); return { ok: true, message: 'Kupón prijatý.' }; }
      return { ok: false, message: 'Kupón nie je dostupný.' };
    },
    async removeCoupon() { del(COUPON); await reprice(); return cartShape(); },

    async getEntitlements() {
      if (!loggedIn()) return { ok: true, mode: 'http', active: false, authenticated: false, entitlements: [], weeks: [] };
      const entitlements = []; let offset = 0;
      for (;;) {
        const r = await call('/store/entitlements?limit=100&offset=' + offset);
        if (!r.ok) return { ok: false, mode: 'http', active: false, entitlements: [], weeks: [] };
        const page = r.data?.entitlements || [];entitlements.push(...page);offset += page.length;
        if (!page.length || offset >= Number(r.data?.count || 0)) break;
        if (offset >= 10000) return { ok: false, mode: 'http', active: false, entitlements: [], weeks: [] };
      }
      return { ok: true, mode: 'http', active: entitlements.length > 0, authenticated: true, entitlements, weeks: [] };
    },
    async getMediaAccess(input) {
      if (!loggedIn()) return { ok: false, message: 'Pre otvorenie obsahu sa prihláste.' };
      const r = await call('/store/media-access', { method: 'POST', body: { product_id: input.product_id, media_key: input.media_key } });
      return r.ok ? { ok: true, ...r.data } : { ok: false, message: r.status === 403 ? 'K tomuto obsahu nemáte aktívny prístup.' : r.status === 401 ? 'Prihlásenie vypršalo. Prihláste sa znova.' : 'Obsah je dočasne nedostupný. Skúste to neskôr.' };
    },

    // Pokladňa krok 2→3: možnosti dopravy a platby berie zo servera (GET /store/nexus-checkout/options).
    // Server rozhodne, či treba adresu, a vracia len kódy – žiadne „Digitálny produkt“ ani vlastné ceny.
    async getCheckoutOptions() {
      const id = get(CART); if (!id) return { ok: false, error: 'CART_EMPTY', message: CHECKOUT_MSG.CART_EMPTY };
      if (!loggedIn()) return { ok: false, status: 401, error: 'UNAUTHORIZED', message: CHECKOUT_MSG.UNAUTHORIZED };
      const fail = 'Možnosti dopravy sa nepodarilo načítať. Skúste to znova.';
      // Server overí vlastníka košíka, preto ho najprv priradíme prihlásenému zákazníkovi.
      const owner = await call(`/store/carts/${id}/customer`, { method: 'POST', body: {} });
      if (!owner.ok) return { ok: false, status: owner.status, error: owner.data?.error, message: fail };
      let r = await call(`/store/nexus-checkout/options?cart_id=${encodeURIComponent(id)}`);
      // Ceny dopravy vie server určiť až podľa krajiny – doplníme ju a spýtame sa znova.
      if (r.status === 409 && r.data?.error === 'ADDRESS_REQUIRED') {
        const up = await call(`/store/carts/${id}`, { method: 'POST', body: { shipping_address: { country_code: 'sk' } } });
        if (up.ok) r = await call(`/store/nexus-checkout/options?cart_id=${encodeURIComponent(id)}`);
      }
      if (!r.ok) return { ok: false, status: r.status, error: r.data?.error, message: checkoutFail(r, fail) };
      const data = r.data || {};
      return {
        ok: true,
        requires_delivery: data.requires_delivery === true,
        delivery: (data.delivery || []).filter(o => o?.code).map(o => ({
          code: o.code, label: o.label || o.name || o.code,
          fee: Number.isFinite(Number(o.fee ?? o.amount)) ? Number(o.fee ?? o.amount) : null,
          feeLabel: feeLabel(o.fee ?? o.amount, true), freeFrom: o.free_from ?? null, address: o.address || '',
        })),
        payment: (data.payment || []).filter(p => p?.code).map(p => ({
          code: p.code, label: p.label || p.code, available: p.available !== false,
          fee: Number.isFinite(Number(p.fee)) ? Number(p.fee) : 0, feeLabel: feeLabel(p.fee, false), reason: p.reason || null,
        })),
      };
    },
    // Pokladňa krok 2→3: košík priradí prihlásenému zákazníkovi, uloží kontakt a adresu a
    // odovzdá výber dopravy a platby serveru. Server nastaví dopravu (fyzickú aj digitálnu),
    // prepočíta ceny a založí platobnú session – klient použije len client_secret z odpovede.
    async prepareCheckout({ firstName = '', lastName = '', email = '', delivery = null, street = '', city = '', postalCode = '', payment = 'card' } = {}) {
      const id = get(CART); if (!id) return { ok: false, error: 'CART_EMPTY', message: CHECKOUT_MSG.CART_EMPTY };
      if (!loggedIn()) return { ok: false, status: 401, error: 'UNAUTHORIZED', message: CHECKOUT_MSG.UNAUTHORIZED };
      const fail = 'Objednávku sa nepodarilo pripraviť. Skúste to znova.';
      const owner = await call(`/store/carts/${id}/customer`, { method: 'POST', body: {} });
      if (!owner.ok) return { ok: false, status: owner.status, error: owner.data?.error, message: fail };
      const term = await checkCartBooking(id);
      if (!term.ok) return term;
      // Doprava je voliteľná len pre čisto digitálny košík; fyzický tovar vyžaduje courier/pickup.
      const wanted = delivery === 'courier' || delivery === 'pickup' ? delivery : null;
      // Adresa na doručenie patrí ku kuriérovi; pri osobnom odbere a digitálnom tovare stačí krajina.
      const address = { first_name: String(firstName).trim(), last_name: String(lastName).trim(), country_code: 'sk',
        ...(wanted === 'courier' ? { address_1: String(street).trim(), city: String(city).trim(), postal_code: String(postalCode).replace(/\s+/g, '') } : {}) };
      const body = { shipping_address: address, billing_address: address };
      const mail = String(email).trim(); if (mail) body.email = mail;
      const up = await call(`/store/carts/${id}`, { method: 'POST', body });
      if (!up.ok) return { ok: false, status: up.status, error: up.data?.error, message: up.status === 400 ? 'Skontrolujte kontaktné údaje a adresu.' : fail };
      // Jediný serverový krok výberu: doprava + platba + prepocet + platobná session.
      const so = await call('/store/nexus-checkout/options', { method: 'POST', body: { cart_id: id, delivery: wanted, payment } });
      if (!so.ok) return { ok: false, status: so.status, error: so.data?.error, message: checkoutFail(so, fail) };
      const data = so.data || {};
      return {
        ok: true,
        clientSecret: data.client_secret || '',
        paymentRequired: data.payment_required === true,
        delivery: data.delivery ?? null,
        payment: data.payment ?? null,
        shipping: data.shipping || [],
        totals: data.totals || null,
        cart: await cartShape(),
      };
    },
    // Súhlas s obchodnými podmienkami a GDPR pre konkrétny košík (verzie dodá server, autoritou je legal modul).
    async acceptCheckoutTerms({ terms_accepted = false, privacy_acknowledged = false } = {}) {
      const id = get(CART); if (!id) return { ok: false, message: 'Košík je prázdny.' };
      if (terms_accepted !== true || privacy_acknowledged !== true) return { ok: false, message: 'Potvrďte obchodné podmienky a ochranu osobných údajov.' };
      const v = await call('/store/legal/versions');
      if (!v.ok || !v.data?.terms_version) return { ok: false, message: 'Podmienky sa nepodarilo načítať. Skúste to znova.' };
      const cs = await call(`/store/carts/${id}/consents`, { method: 'POST', body: { terms_accepted: true, privacy_acknowledged: true, terms_version: v.data.terms_version, privacy_version: v.data.privacy_version } });
      return cs.ok ? { ok: true } : { ok: false, message: 'Súhlas sa nepodarilo uložiť. Skúste to znova.' };
    },
    // Dokončenie po úspešnej platbe (alebo pre 0 € objednávku): NEXUS prepočet + Medusa completion.
    async checkout() {
      const id = get(CART);
      if (!id) return { mode: 'http', status: 'ERROR', messages: 'Košík je prázdny.' };
      if (!loggedIn()) return { mode: 'http', status: 'ERROR', messages: 'Pre dokončenie objednávky sa prihláste.' };
      const r = await call('/store/nexus-checkout', { method: 'POST', body: { cart_id: id } });
      const M = {
        ALLOW: 'Objednávka bola vytvorená. Ďakujeme.',
        REVIEW: 'Objednávku ešte overujeme. Ozveme sa vám s ďalším postupom.',
        BLOCK: 'Objednávku teraz nemožno dokončiť. Kontaktujte nás, prosím.',
        ERROR: 'Služba je dočasne nedostupná. Skúste to znova o chvíľu.',
      };
      if (r.status === 200) { del(CART); del(COUPON); del(BOOKING); const paid=r.data?.paymentStatus==='PAID'; return { mode: 'http', status: paid?'ALLOW':'PENDING', messages: paid?M.ALLOW:'Objednávka bola vytvorená. Čakáme na potvrdenie platby; platený obsah sa sprístupní po úhrade.', order: r.data?.order }; }
      if (r.status === 409) return { mode: 'http', status: 'REVIEW', messages: M.REVIEW };
      if (r.status === 403) return { mode: 'http', status: 'BLOCK', messages: M.BLOCK };
      return { mode: 'http', status: 'ERROR', messages: M.ERROR };
    },

    // Konzultácie: typ = publikovaný produkt s metadata.booking. Voľné termíny, cenu a obsadenosť určuje server.
    async getBookingTypes() {
      let r; try { r = await call(`/store/products?region_id=${config.regionId}&limit=50&fields=${PRODUCT_FIELDS}`); } catch { return { ok: false, types: [] }; }
      if (!r.ok) return { ok: false, types: [] };
      const types = (r.data?.products || []).filter(p => p.metadata?.booking && p.metadata.booking.archived !== true).map(p => {
        const v = (p.variants || [])[0] || {}, b = p.metadata.booking;
        return { id: p.id, handle: p.handle, title: p.title, description: p.subtitle || '', image: p.thumbnail || '', variantId: v.id || '',
          priceLabel: v.calculated_price?.calculated_amount != null ? money(v.calculated_price.calculated_amount) : '',
          durationMinutes: Number(b.durationMinutes) || null, form: typeof b.form === 'string' ? b.form : '' };
      }).filter(t => t.variantId);
      return { ok: true, types };
    },
    async getBookingSlots(productId, from, to) {
      const day = /^\d{4}-\d{2}-\d{2}$/;
      if (typeof productId !== 'string' || !productId || !day.test(from) || !day.test(to)) return { ok: false, slots: [], message: 'Termíny sa nepodarilo načítať.' };
      let r; try { r = await call(`/store/booking-slots?product_id=${encodeURIComponent(productId)}&from=${from}&to=${to}`); } catch { return { ok: false, status: 503, slots: [], message: 'Termíny sa nepodarilo načítať. Skúste to znova.' }; }
      if (!r.ok) return { ok: false, status: r.status, slots: [], message: r.status === 404 ? BOOKING_MSG[404] : 'Termíny sa nepodarilo načítať. Skúste to znova.' };
      return { ok: true, slots: (r.data?.slots || []).filter(s => s?.start && s?.end).map(s => ({ start: s.start, end: s.end, label: bookingLabel(s.start, s.end) })) };
    },
    // Podrží termín (server overí, že je naozaj ponúkaný a voľný), pridá konzultáciu do košíka a naviaže termín na košík.
    // Predchádzajúci podržaný termín v košíku sa uvoľní; pri chybe sa nový termín hneď uvoľní, nič nezostane visieť.
    async reserveBooking({ productId, variantId, startsAt, title = '' } = {}) {
      if (!loggedIn()) return { ok: false, status: 401, message: BOOKING_MSG[401] };
      if (typeof productId !== 'string' || !productId || typeof variantId !== 'string' || !variantId || typeof startsAt !== 'string' || !startsAt) return { ok: false, status: 400, message: 'Vyberte termín.' };
      const fail = 'Termín sa nepodarilo rezervovať. Skúste to znova.';
      try {
        const cartId = await ensureCart();
        if (!cartId) return { ok: false, message: 'Košík sa nepodarilo vytvoriť. Skúste to znova.' };
        await releaseBooking(cartId);
        const hold = await call('/store/bookings', { method: 'POST', body: { product_id: productId, starts_at: startsAt } });
        const booking = hold.data?.booking;
        if (hold.status !== 201 || !booking?.id) {
          const message = hold.status === 409 ? (hold.data?.type === 'slot_taken' ? 'Termín si práve rezervoval niekto iný. Zvoľte prosím iný.' : 'Tento termín už nie je voľný. Zvoľte prosím iný.') : BOOKING_MSG[hold.status] || fail;
          return { ok: false, status: hold.status, type: hold.data?.type || 'error', message };
        }
        set(BOOKING, JSON.stringify({ id: booking.id, product_id: productId, title, held_until: booking.held_until || '', label: bookingLabel(booking.starts_at, booking.ends_at) }));
        const li = await call(`/store/carts/${cartId}/line-items`, { method: 'POST', body: { variant_id: variantId, quantity: 1 } });
        const owner = li.ok ? await call(`/store/carts/${cartId}/customer`, { method: 'POST', body: {} }) : li;
        const attach = owner.ok ? await call(`/store/bookings/${encodeURIComponent(booking.id)}/cart`, { method: 'POST', body: { cart_id: cartId } }) : owner;
        if (!attach.ok) { await releaseBooking(cartId); return { ok: false, status: attach.status, message: attach.status === 409 ? 'Podržanie termínu vypršalo. Vyberte si prosím termín znova.' : fail }; }
        await reprice();
        return { ok: true, booking: { id: booking.id, label: bookingLabel(booking.starts_at, booking.ends_at), heldUntil: booking.held_until || '' }, cart: await cartShape() };
      } catch { return { ok: false, status: 503, message: fail }; }
    },
    // Tesne pred potvrdením platby: termín musí byť stále podržaný.
    async verifyCartBooking() {
      const id = get(CART); if (!id) return { ok: false, message: 'Košík je prázdny.' };
      try { return await checkCartBooking(id); } catch { return { ok: false, message: 'Termín sa nepodarilo overiť. Skúste to znova.' }; }
    },

    // Klub ANASTASIA: samostatný košík s jedinou členskou variantou. Cenu, verziu a dĺžku určuje
    // výhradne server (offer); klient ich len potvrdzuje späť a nikdy neposiela provider/metódu.
    async getMembershipProducts() {
      const r = await mcall(`/store/products?region_id=${config.regionId}&limit=50&fields=${PRODUCT_FIELDS},+metadata`);
      return (r.data?.products || []).filter(p => p.metadata?.membership).map(p => ({
        id: p.id, handle: p.handle, title: p.title, description: p.subtitle || '', image: p.thumbnail || '',
        period_days: Number(p.metadata.membership.period_days) || null,
        variants: (p.variants || []).map(v => ({ id: v.id, label: v.title, priceLabel: v.calculated_price?.calculated_amount != null ? money(v.calculated_price.calculated_amount) : 'Cena sa doplní' })),
      }));
    },
    async prepareMembership(variantId) {
      if (!loggedIn()) return { ok: false, status: 401, message: MEMBERSHIP_MSG[401] };
      if (typeof variantId !== 'string' || !variantId) return { ok: false, message: 'Vyberte členstvo.' };
      del(MCHECKOUT); del(MOFFER);
      const c = await mcall('/store/carts', { method: 'POST', body: { region_id: config.regionId } });
      const cartId = c.data?.cart?.id;
      if (!cartId) return mfail(c, 'Nákup sa nepodarilo pripraviť.');
      set(MCART, cartId);
      const li = await mcall(`/store/carts/${cartId}/line-items`, { method: 'POST', body: { variant_id: variantId, quantity: 1 } });
      if (!li.ok) return mfail(li, 'Členstvo sa nepodarilo pridať.');
      const nx = await mcall('/store/nexus-cart', { method: 'POST', body: { cart_id: cartId } });
      if (!nx.ok) return mfail(nx, 'Ponuku sa nepodarilo prepočítať.');
      const of = await mcall(`/store/memberships/offer?cart_id=${encodeURIComponent(cartId)}`);
      if (!of.ok || !of.data?.offer) return mfail(of, 'Ponuku sa nepodarilo načítať.');
      set(MOFFER, JSON.stringify(of.data.offer));
      return { ok: true, offer: of.data.offer };
    },
    // Súhlas s podmienkami → príprava nákupu → platobná session (vždy serverový membership provider).
    async startMembershipCheckout({ auto_renew = false, terms_accepted = false, privacy_acknowledged = false } = {}) {
      const cartId = get(MCART); let offer = null;
      try { offer = JSON.parse(get(MOFFER) || 'null'); } catch { offer = null; }
      if (!cartId || !offer || offer.cart_id !== cartId) return { ok: false, status: 409, message: 'Ponuka vypršala. Načítajte ju znova.' };
      if (terms_accepted !== true || privacy_acknowledged !== true) return { ok: false, status: 422, message: 'Na pokračovanie potvrďte obchodné podmienky a ochranu osobných údajov.' };
      const v = await mcall('/store/legal/versions');
      if (!v.ok || !v.data?.terms_version) return mfail(v, 'Podmienky sa nepodarilo načítať.');
      const cs = await mcall(`/store/carts/${cartId}/consents`, { method: 'POST', body: { terms_accepted: true, privacy_acknowledged: true, terms_version: v.data.terms_version, privacy_version: v.data.privacy_version } });
      if (!cs.ok) return mfail(cs, 'Súhlas sa nepodarilo uložiť.');
      const ck = await mcall('/store/memberships/checkout', { method: 'POST', body: { cart_id: cartId, version: offer.version, amount_minor: offer.amount_minor, auto_renew: auto_renew === true } });
      const checkout = ck.data?.checkout;
      if (!ck.ok || !checkout?.id) return mfail(ck, 'Nákup sa nepodarilo pripraviť.');
      set(MCHECKOUT, checkout.id);
      const ps = await mcall(`/store/memberships/checkouts/${encodeURIComponent(checkout.id)}/payment-session`, { method: 'POST', body: {} });
      const clientSecret = ps.data?.payment_session?.client_secret;
      if (!ps.ok || typeof clientSecret !== 'string') return mfail(ps, 'Platobná brána nie je dostupná.');
      return { ok: true, checkout, clientSecret };
    },
    // Po potvrdení karty: rovnaké NEXUS/SafeOrder dokončenie, potom vyrovnanie členstva (krátky poll pri PENDING).
    async completeMembership({ attempts = 5, delayMs = 1500 } = {}) {
      const cartId = get(MCART), checkoutId = get(MCHECKOUT);
      if (!cartId || !checkoutId) return { ok: false, status: 'ERROR', message: 'Nákup sa nenašiel. Pozrite stav v účte.' };
      const nx = await mcall('/store/nexus-checkout', { method: 'POST', body: { cart_id: cartId } });
      if (nx.status === 409) return { ok: false, status: 'REVIEW', message: 'Nákup ešte overujeme. Platbu neopakujte, stav uvidíte v účte.' };
      if (nx.status === 403) return { ok: false, status: 'BLOCK', message: 'Nákup teraz nemožno dokončiť. Kontaktujte nás, prosím.' };
      if (!nx.ok) return { ...mfail(nx, 'Nákup sa nepodarilo dokončiť. Platbu neopakujte, stav uvidíte v účte.'), status: 'ERROR' };
      for (let i = 0; i < attempts; i++) {
        const st = await mcall(`/store/memberships/checkouts/${encodeURIComponent(checkoutId)}/settle`, { method: 'POST', body: {} });
        if (st.ok && st.data?.status === 'SETTLED') {
          del(MCART); del(MCHECKOUT); del(MOFFER);
          return { ok: true, status: 'SETTLED', membership_id: st.data.membership_id, access: st.data.access, mandate: st.data.mandate, message: 'Vitajte v Klube ANASTASIA. Členstvo je aktívne.' };
        }
        if (!st.ok) return { ...mfail(st, 'Stav členstva sa nepodarilo overiť.'), status: 'ERROR' };
        if (i < attempts - 1) await new Promise(res => setTimeout(res, delayMs));
      }
      return { ok: true, status: 'PENDING', message: 'Platbu sme prijali, členstvo ešte aktivujeme. Stav uvidíte v účte o chvíľu.' };
    },
    async listMemberships(offset = 0) {
      if (!loggedIn()) return { ok: false, status: 401, memberships: [], count: 0, offset: 0, limit: 20, message: MEMBERSHIP_MSG[401] };
      const o = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
      const r = await mcall(`/store/memberships?offset=${o}`);
      if (!r.ok) return { ...mfail(r, 'Členstvá sa nepodarilo načítať.'), memberships: [], count: 0, offset: o, limit: 20 };
      return { ok: true, memberships: r.data?.memberships || [], count: r.data?.count || 0, offset: r.data?.offset || 0, limit: r.data?.limit || 20 };
    },
    async stopMembership(id) {
      const r = await mcall(`/store/memberships/${encodeURIComponent(String(id || ''))}/stop`, { method: 'POST', body: {} });
      return r.ok ? { ok: true, membership: r.data?.membership, message: r.data?.message || 'Automatická obnova je zastavená.' } : mfail(r, 'Obnovu sa nepodarilo zastaviť.');
    },
    // 3DS obnova: vráti len EXISTUJÚCI pokus; reconcile ho dokončí, nové stŕženie nevzniká.
    async getMembershipPayment(id) {
      const r = await mcall(`/store/memberships/${encodeURIComponent(String(id || ''))}/payment`);
      return r.ok && typeof r.data?.client_secret === 'string' ? { ok: true, attempt_id: r.data.attempt_id, clientSecret: r.data.client_secret } : mfail(r, 'Platbu teraz nie je potrebné potvrdiť.');
    },
    async reconcileMembership(id) {
      const r = await mcall(`/store/memberships/${encodeURIComponent(String(id || ''))}/reconcile`, { method: 'POST', body: {} });
      return r.ok ? { ok: true, status: r.data?.status || null, message: 'Stav platby sme overili.' } : mfail(r, 'Stav platby sa nepodarilo overiť.');
    },

    async requestMagicLink(email) {
      try { await call('/auth/customer/magic-link', { method: 'POST', body: { email: String(email || '') } }); }
      catch { return { ok: false, message: 'Služba je dočasne nedostupná. Skúste to znova o chvíľu.' }; }
      return { ok: true, message: 'Ak účet existuje, poslali sme vám prihlasovací odkaz na e-mail.' };
    },
    // Prihlásenie/registrácia e-mailom (magic link).
    // Poradie (Medusa v2): 1) potvrdenie odkazu → token identity, 2) POST /store/customers
    // (založí zákazníka a naviaže ho na identitu), 3) NOVÝ prihlasovací token s actor_id.
    // Odkaz je jednorazový, preto sa nový token získa znovu vydaním pre tú istú identitu
    // (POST /auth/token/refresh) – po naviazaní zákazníka už obsahuje actor_id.
    // Registračný token sa NIKDY neukladá ako prihlásenie a nesmie sa použiť na chránené volania.
    async confirmMagicLink() {
      const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
      const email = params.get('email'), token = params.get('token');
      if (!email || !token) return { ok: false, message: 'Odkaz je neúplný. Vyžiadajte si nový.' };
      try {
        const r = await call('/auth/customer/magic-link', { method: 'POST', body: { email, token } });
        if (!r.ok || !r.data?.token) return { ok: false, message: 'Odkaz je neplatný alebo vypršal. Vyžiadajte si nový.' };
        const identityToken = r.data.token;
        const me = await call('/store/customers/me', { token: identityToken });
        if (me.status === 401) {
          // Nový zákazník: najprv ho založíme (registračným tokenom), až potom žiadame nový token.
          const created = await call('/store/customers', { method: 'POST', body: { email }, token: identityToken });
          if (!created.ok) return { ok: false, message: 'Účet sa nepodarilo založiť. Vyžiadajte si nový odkaz.' };
          const bound = await boundToken(() => call('/auth/token/refresh', { method: 'POST', body: {}, token: identityToken }));
          if (!bound.ok) return { ok: false, message: 'Registrácia prebehla, prihláste sa prosím.' };
          set(JWT, bound.token);
          return { ok: true, message: 'Účet je založený. Vitajte.' };
        }
        // Bežné prihlásenie: token musí byť naviazaný na zákazníka (actor_id), inak by
        // každé chránené volanie skončilo 401. Chýbajúci actor_id trieskame opraviť.
        if (!tokenHasActor(identityToken)) {
          const bound = await boundToken(() => call('/auth/token/refresh', { method: 'POST', body: {}, token: identityToken }));
          if (!bound.ok) return { ok: false, message: 'Prihlásenie prebehlo, ale účet ešte nie je naviazaný. Skúste to prosím znova.' };
          set(JWT, bound.token);
          return { ok: true, message: 'Prihlásenie prebehlo. Vitajte späť.' };
        }
        set(JWT, identityToken);
        return { ok: true, message: 'Prihlásenie prebehlo. Vitajte späť.' };
      } catch {
        return { ok: false, message: 'Prihlásenie sa nepodarilo. Skúste to prosím znova o chvíľu.' };
      }
    },

    // Odhlásenie: zruší serverovú reláciu a vymaže token aj údaje zákazníka z prehliadača.
    // Serverová chyba odhlásenie neblokuje – lokálne údaje sa vymažú vždy, inak by účet zostal dostupný.
    async signOut() {
      try { await call('/auth/session', { method: 'DELETE' }); } catch { /* relácia na serveri zostane, token v prehliadači zmizne */ }
      for (const key of CUSTOMER_KEYS) del(key);
      try { globalThis.localStorage?.removeItem(RETURN_KEY); } catch { /* prehliadač bez localStorage */ }
      return { ok: true };
    },

    // QR odkaz → košík: produkt + množstvo + voliteľný kupón. Idempotentné cez uložený kľúč (max 50).
    async importQr(params) {
      const code = params.get('produkt'); if (!code) return { ok: false, message: 'V odkaze chýba kód produktu.' };
      const qty = params.get('ks') ?? '1', couponCode = params.get('kupon') ?? '';
      if (!/^[1-9]\d?$/.test(qty)) return { ok: false, message: 'QR odkaz obsahuje neplatné množstvo (1–99).' };
      let keys = []; try { keys = JSON.parse(get(QRKEYS) || '[]'); } catch { keys = []; }
      const key = JSON.stringify([code, qty, couponCode]);
      if (keys.includes(key)) return { ok: true, message: 'Tento QR odkaz už bol použitý. Košík sa nezdvojil.' };
      const added = await self.addToCart(code, Number(qty));
      if (!added.ok) return added;
      keys.push(key); set(QRKEYS, JSON.stringify(keys.slice(-50)));
      let extra = '';
      if (couponCode) { const c = await self.applyCoupon(couponCode); extra = ' ' + c.message; }
      return { ok: true, message: added.message + extra };
    },

    // Darčekový poukaz: nákup (variant + príjemca) a uplatnenie kreditu v košíku (výšku určuje server).
    async getGiftVoucherProduct() {
      const r = await call(`/store/products?handle=darkovy-poukaz&region_id=${config.regionId}&fields=${PRODUCT_FIELDS}`);
      const p = r.data?.products?.[0];
      // Bez publikovaného produktu (poukazy vypnuté v adminu) ponuka zostane prázdna, nikdy ukážkové hodnoty.
      if (!r.ok || !p) return { id: '', handle: 'darkovy-poukaz', variants: [] };
      return { id: p.id, handle: p.handle, variants: (p.variants || []).map(v => ({ id: v.id, title: v.title, amount: v.calculated_price?.calculated_amount })) };
    },
    async addGiftVoucher({ variant_id, recipient }) {
      if (!variant_id) return { ok: false, message: 'Vybraná hodnota poukazu už nie je dostupná.' };
      if (!recipient?.name?.trim() || !/^\S+@\S+\.\S+$/.test(recipient?.email || '') || Array.from(recipient.message || '').length > 300)
        return { ok: false, message: 'Skontrolujte meno, e-mail a odkaz (najviac 300 znakov).' };
      const id = await ensureCart(); if (!id) return { ok: false, message: 'Košík sa nepodarilo vytvoriť.' };
      const li = await call(`/store/carts/${id}/line-items`, { method: 'POST', body: { variant_id, quantity: 1 } });
      if (!li.ok) return { ok: false, message: 'Poukaz sa nepodarilo pridať do košíka.' };
      const rec = await call('/store/gift-vouchers/recipients', { method: 'POST', body: { cart_id: id, recipients: { [variant_id]: [recipient] } } });
      await reprice();
      return { ok: true, message: 'Poukaz pridaný do košíka.', cart: await cartShape(), recipients: rec.data?.recipients };
    },
    async applyGiftVoucher(code) {
      const id = await ensureCart(); if (!id) return { ok: false, message: 'Košík je prázdny.' };
      const r = await call('/store/gift-vouchers/apply', { method: 'POST', body: { cart_id: id, code: String(code || '').trim() } });
      if (r.ok && r.data?.ok) { set(GIFT, JSON.stringify(r.data.gift_voucher || null)); return { ok: true, gift_voucher: r.data.gift_voucher, cart: await cartShape(), message: 'Poukaz bol uplatnený.' }; }
      return { ok: false, status: r.status, error: r.data?.error || 'GIFT_VOUCHER_INVALID', message: r.data?.message || 'Poukaz nie je platný alebo už nie je dostupný.' };
    },
    async removeGiftVoucher() {
      const id = get(CART); del(GIFT);
      if (id) await call('/store/gift-vouchers/remove', { method: 'POST', body: { cart_id: id } });
      await reprice();
      return cartShape();
    },

    async getAccount() {
      if (!loggedIn()) return { ok: false, name: '', orders: [] };
      const r = await call('/store/orders?limit=20&order=-created_at&fields=display_id,created_at,total,status,metadata,*items');
      if (!r.ok) return { ok: false, name: '', orders: [] };
      const orders = (r.data?.orders || []).map(o => ({
        number: String(o.metadata?.legacy_customer_migration?.number || o.display_id || o.id), date: new Date(o.metadata?.legacy_customer_migration?.placed_at || o.created_at).toLocaleDateString('sk-SK'),
        product: (o.items || [])[0]?.product_title || (o.items || [])[0]?.title || '—',
        status: ORDER_STATUS[o.status] || 'Prijatá', totalLabel: money(o.total),
      }));
      return { ok: true, orders };
    },
    // E-mail prihlásenému zákazníkov na predvyplnenie platobného formulára (bez neho Stripe pýta e-mail pre Link).
    async getCustomerEmail() {
      if (!loggedIn()) return '';
      const r = await call('/store/customers/me?fields=email');
      return r.data?.customer?.email || '';
    },
    async getCustomerCenter() {
      if (!loggedIn()) return { ok: false, bookings: [], materials: [], reorder: [], profile: null };
      const [me, bk] = await Promise.all([call('/store/customers/me?fields=first_name,last_name,email,phone,metadata'), call('/store/bookings')]);
      if (!me.ok) return { ok: false, bookings: [], materials: [], reorder: [], profile: null };
      const c = me.data?.customer || {};
      const md = c.metadata || {};
      const reorder = (await self.getProducts()).slice(0, 3);
      // Rezervácie: len zaplatené alebo práve držané termíny; názov konzultácie podľa produktu.
      const raw = (bk.data?.bookings || []).filter(b => b.status === 'confirmed' || b.status === 'completed' || (b.status === 'held' && b.order_id));
      const ids = [...new Set(raw.map(b => b.product_id))];
      const titles = new Map();
      if (ids.length) {
        const pr = await call(`/store/products?${ids.map(id => `id[]=${encodeURIComponent(id)}`).join('&')}&fields=id,title&limit=${ids.length}`);
        for (const p of pr.data?.products || []) titles.set(p.id, p.title);
      }
      const tz = 'Europe/Bratislava', fmt = (d, o) => new Intl.DateTimeFormat('sk-SK', { timeZone: tz, ...o }).format(d);
      const bookings = raw.map(b => {
        const s = new Date(b.starts_at), e = new Date(b.ends_at);
        return { id: b.id, upcoming: s.getTime() > Date.now(), day: fmt(s, { day: 'numeric' }), month: fmt(s, { month: 'short' }), title: titles.get(b.product_id) || 'Konzultácia',
          date: `${fmt(s, { day: 'numeric', month: 'numeric', year: 'numeric' })} · ${fmt(s, { hour: '2-digit', minute: '2-digit' })} – ${fmt(e, { hour: '2-digit', minute: '2-digit' })}`,
          status: b.status === 'completed' ? 'Prebehla' : 'Potvrdený termín' };
      });
      // TODO(src/lib/api/http.mjs): materials (knižnica/faktúry) sú Fáza 2 – zatiaľ prázdne.
      return {
        ok: true, mode: 'http', bookings, bookingsOk: bk.ok, materials: [], reorder,
        profile: {
          name: [c.first_name, c.last_name].filter(Boolean).join(' '), email: c.email || '', phone: c.phone || '',
          birthDate: md.birth_date || '', birthTime: md.birth_time || '', birthPlace: md.birth_place || '',
          street: md.street || '', city: md.city || '', postalCode: md.postal_code || '',
        },
      };
    },
    async saveCustomerProfile(profile = {}) {
      if (!loggedIn()) return { ok: false, message: 'Pre uloženie údajov sa prihláste.' };
      const [first, ...rest] = String(profile.name || '').trim().split(/\s+/);
      const body = {
        ...(first ? { first_name: first } : {}), ...(rest.length ? { last_name: rest.join(' ') } : {}),
        ...(profile.phone ? { phone: profile.phone } : {}),
        metadata: { birth_date: profile.birthDate || '', birth_time: profile.birthTime || '', birth_place: profile.birthPlace || '', street: profile.street || '', city: profile.city || '', postal_code: profile.postalCode || '' },
      };
      const r = await call('/store/customers/me', { method: 'POST', body });
      return r.ok ? { ok: true, message: 'Údaje boli uložené.' } : { ok: false, message: 'Údaje sa nepodarilo uložiť.' };
    },

    // Chat (Fáza 2 – AI asistent chat volá tieto routy). Reálne napojenie na /store/chat/*.
    // Pri výpadku žiadne ukážkové konverzácie: chat sa ukáže ako dočasne nedostupný.
    async getChatStatus() { const r = await call('/store/chat/status'); return r.ok ? r.data : { can_write: false, reason: 'chat_unavailable' }; },
    async getChatConversations() { const r = await call('/store/chat/conversations'); return { conversations: r.ok ? r.data?.conversations || [] : [] }; },
    async getChatConversation(id) {
      const r = await call(`/store/chat/conversations/${encodeURIComponent(id)}`);
      return r.ok ? { conversation: r.data?.conversation, messages: r.data?.messages || [] } : { conversation: null, messages: [] };
    },
    async markChatRead(id) { const r = await call(`/store/chat/conversations/${id}/read`, { method: 'POST' }); return r.ok ? r.data : { ok: true }; },
    async sendChatMessage({ conversation_id, body }) {
      const r = conversation_id
        ? await call(`/store/chat/conversations/${conversation_id}/messages`, { method: 'POST', body: { body } })
        : await call('/store/chat/conversations', { method: 'POST', body: { body } });
      if (r.ok) return { ok: true, status: r.status, conversation: r.data?.conversation, message: r.data?.message };
      return { ok: false, status: r.status, type: r.data?.type || 'error', message: r.data?.message };
    },
    async subscribeNewsletter({ email, source = 'footer' }) {
      const v = await call('/store/legal/versions');
      if (!v.ok || !v.data?.newsletter_version) return { ok: false, message: 'Prihlásenie k novinkám je dočasne nedostupné.' };
      const r = await call('/store/newsletter', { method: 'POST', body: { email, accepted: true, text_version: v.data.newsletter_version, source } });
      return r.ok ? { ok: true, message: 'Ďakujeme, novinky vám budeme posielať e-mailom.' } : { ok: false, message: r.status === 400 ? 'Skontrolujte e-mailovú adresu.' : 'Prihlásenie sa nepodarilo. Skúste to prosím znova.' };
    },
    async sendContact({ name, email, subject, message, consent, website }) {
      const r = await call('/store/contact', { method: 'POST', body: { name, email, subject, message, consent: consent === true || consent === 'on', website: website || '' } });
      if (r.ok && r.data?.ok) return { ok: true, message: r.data.message };
      return { ok: false, status: r.status, message: r.data?.message || 'Správu sa nepodarilo odoslať. Skúste to prosím znova o chvíľu.' };
    },

    // Online odstúpenie od zmluvy (časť C právnych textov): záznam pre správcu + potvrdenie e-mailom.
    async sendContractWithdrawal({ order_number, email, items, order_date, name, reason, consent, website }) {
      const r = await call('/store/contract-withdrawal', { method: 'POST', body: { order_number, email, items, order_date, name, reason, consent: consent === true || consent === 'on', website: website || '' } });
      if (r.ok && r.data?.ok) return { ok: true, message: r.data.message };
      return { ok: false, status: r.status, message: r.data?.message || 'Odstúpenie sa nepodarilo odoslať. Skúste to prosím znova o chvíľu.' };
    },

    // Štruktúra programu: 16 týždňov, pracovné listy po dňoch, záverečné zhrnutie, dotazník.
    async getResetProgram() {
      const r = await resetCall('/store/reset-program');
      if (r.ok && r.data) return { ok: true, ...r.data };
      return resetFail(r);
    },
    // Zrkadielko: vlastné záznamy + konfigurácia metrík.
    async getResetJournal({ limit = 50, offset = 0 } = {}) {
      const r = await resetCall(`/store/reset-journal?limit=${limit}&offset=${offset}`);
      if (r.ok && r.data) return { ok: true, program: r.data.program, metrics: r.data.metrics || [], entries: r.data.entries || [], count: r.data.count ?? 0 };
      return resetFail(r);
    },
    async createResetJournalEntry({ date, week = null, metrics = {} }) {
      const r = await resetCall('/store/reset-journal', { method: 'POST', body: { date, week, metrics } });
      if (r.ok && r.data) return { ok: true, entry: r.data.entry || null, message: r.data.message };
      return resetFail(r);
    },
    async updateResetJournalEntry(id, patch = {}) {
      const r = await resetCall(`/store/reset-journal/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
      if (r.ok && r.data) return { ok: true, entry: r.data.entry || null, message: r.data.message };
      return resetFail(r);
    },
    async deleteResetJournalEntry(id) {
      const r = await resetCall(`/store/reset-journal/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (r.ok) return { ok: true, message: r.data?.message };
      return resetFail(r);
    },

    isLoggedIn: loggedIn,
  };
  return self;
}
