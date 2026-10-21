import {SHOP_CATEGORIES} from './catalog.mjs';

const EUR = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });
const ORDER_STATUS = { pending: 'Prijatá', completed: 'Vybavená', canceled: 'Zrušená', archived: 'Archivovaná', requires_action: 'Čaká na vás', draft: 'Rozpracovaná' };
const money = n => (Number.isFinite(Number(n)) ? EUR.format(Number(n)) : 'Cena sa doplní');
const ART = { Kozmetika: 'jar', 'BIOKOZMETIKA': 'jar', Výživa: 'coffee', Domov: 'candle', Ľan: 'linen', Programy: 'sun', Služby: 'sun' };

const PRODUCT_FIELDS =
  'handle,title,subtitle,description,thumbnail,metadata,*images,*categories,*variants,+variants.sku,+variants.calculated_price';

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

export function createHttpApi(storage, config) {
  const base = config.apiBaseUrl.replace(/\/+$/, '');
  const JWT = 'anastasia.jwt', CART = 'anastasia.cart', COUPON = 'anastasia.coupon', QRKEYS = 'anastasia.qrkeys', GIFT = 'anastasia.gift';
  const get = k => { try { return storage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { storage.setItem(k, v); } catch { /* preview bez storage */ } };
  const del = k => { try { storage.removeItem(k); } catch { /* noop */ } };
  const headers = (json = true) => {
    const h = { 'x-publishable-api-key': config.publishableKey };
    if (json) h['content-type'] = 'application/json';
    const t = get(JWT); if (t) h.authorization = `Bearer ${t}`;
    return h;
  };
  async function call(path, { method = 'GET', body, auth = false } = {}) {
    const res = await fetch(base + path, {
      method, headers: headers(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null; try { data = await res.json(); } catch { /* prázdné tělo */ }
    return { status: res.status, ok: res.ok, data };
  }
  const loggedIn = () => Boolean(get(JWT));
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
  // Pred platbou: termín v košíku musí byť stále podržaný pre túto zákazníčku (inak by platba prešla bez termínu).
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
  const qrImports = new Map();
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
      // Dobierka: poplatok je súčasťou ceny dopravy „Kuriér – platba na dobierku“ (počíta server).
      shippingTitle: (cart.shipping_methods || []).some(m => /dobierk/i.test(m?.name || '')) ? 'Doprava a dobierka' : 'Doprava',
      taxLabel: Number(cart.tax_total) > 0 ? money(cart.tax_total) : '',
      totalLabel: money(cart.total), paymentRequired: cart.total!==0,
    };
  }

  // createApi volá metódy bez `this`, vnútorné volania preto idú cez `self`.
  const self = {
    mode: 'http',

    async getProducts({ category = '', search = '', filter = '' } = {}) {
      const r = await call(`/store/products?region_id=${config.regionId}&limit=100&fields=${PRODUCT_FIELDS}`);
      if(!r.ok)throw new Error('Katalóg sa nepodarilo načítať.');
      let items = (r.data?.products || []).filter(p=>p.metadata?.gift_voucher!==true&&p.metadata?.gift_voucher!=='true').map(p=>mapProduct(p,base));
      const s = search.toLocaleLowerCase('sk');
      if (category) items = items.filter(p => p.category === category);
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
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) return { ok: false, message: 'Množstvo musí byť celé číslo od 0 do 999.' };
      const id = get(CART); if (!id) return { ok: false, message: 'Košík je prázdny.' };
      const current = await cartShape();
      const line = current.lines.find(l => l.slug === slug);
      if (!line) return { ok: false, message: 'Položka už nie je v košíku.' };
      // An old QR may legitimately carry more than 99 pieces. Allow reducing
      // that existing quantity; ordinary increases retain the current 99 cap.
      if (quantity > 99 && quantity >= line.quantity) return { ok: false, message: 'Pri bežnom pridávaní je možné najviac 99 kusov.' };
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

    // Pokladňa: košík priradí prihlásenej zákazníčke a uloží kontakt a adresu. Možnosti dopravy a platby
    // (s cenami) potom vráti server – klient len vyberá kódy, sumy ani provider nikdy neposiela.
    // delivery: 'courier' | 'pickup' | 'digital' ('shipping' = starší názov pre kuriéra); country: 'sk' | 'cz'.
    async prepareCheckout({ firstName = '', lastName = '', email = '', delivery = 'digital', street = '', city = '', postalCode = '', country = 'sk' } = {}) {
      const id = get(CART); if (!id) return { ok: false, message: 'Košík je prázdny.' };
      if (!loggedIn()) return { ok: false, message: 'Pre dokončenie objednávky sa prihláste.' };
      const fail = 'Objednávku sa nepodarilo pripraviť. Skúste to znova.';
      const owner = await call(`/store/carts/${id}/customer`, { method: 'POST', body: {} });
      if (!owner.ok) return { ok: false, message: fail };
      const term = await checkCartBooking(id);
      if (!term.ok) return term;
      const courier = delivery === 'courier' || delivery === 'shipping';
      const cc = String(country).toLowerCase() === 'cz' ? 'cz' : 'sk';
      const address = { first_name: String(firstName).trim(), last_name: String(lastName).trim(), country_code: cc,
        ...(courier ? { address_1: String(street).trim(), city: String(city).trim(), postal_code: String(postalCode).replace(/\s+/g, '') } : {}) };
      const up = await call(`/store/carts/${id}`, { method: 'POST', body: { email: String(email).trim(), shipping_address: address, billing_address: address } });
      if (!up.ok) return { ok: false, message: up.status === 400 ? 'Skontrolujte kontaktné údaje a adresu.' : fail };
      const options = await self.getCheckoutOptions();
      if (!options.ok) return options;
      if (options.requiresDelivery && courier && !street) return { ok: false, message: 'Pri doručení kuriérom vyplňte adresu.' };
      return { ok: true, options, cart: await cartShape() };
    },
    async getCheckoutOptions() {
      const id = get(CART); if (!id) return { ok: false, message: 'Košík je prázdny.' };
      const r = await call(`/store/nexus-checkout/options?cart_id=${encodeURIComponent(id)}`);
      if (!r.ok || !r.data?.ok) return { ok: false, message: 'Spôsoby doručenia a platby sa nepodarilo načítať. Skúste to znova.' };
      const delivery = (r.data.delivery || []).map(d => ({ ...d,
        priceLabel: Number(d.amount) === 0 ? 'zadarmo' : money(d.amount),
        freeFromLabel: d.free_from ? `zadarmo pri nákupe od ${money(d.free_from)}` : '' }));
      const payment = (r.data.payment || []).map(p => ({ ...p, feeLabel: Number(p.fee) > 0 ? `+${money(p.fee)}` : '' }));
      return { ok: true, requiresDelivery: r.data.requires_delivery === true, delivery, payment };
    },
    // Výber dopravy a platby: server nastaví dopravu, prepočíta košík a pripraví platbu (pri karte client_secret).
    async selectCheckout({ delivery = null, payment = 'card' } = {}) {
      const id = get(CART); if (!id) return { ok: false, message: 'Košík je prázdny.' };
      const r = await call('/store/nexus-checkout/options', { method: 'POST', body: { cart_id: id, delivery: delivery || null, payment } });
      const M = { COD_NOT_AVAILABLE: 'Na dobierku sa dá platiť len pri doručení tovaru kuriérom.', DELIVERY_REQUIRED: 'Zvoľte spôsob doručenia.', SHIPPING_REQUIRED: 'Zvoľte spôsob doručenia.',
        PAYMENT_METHOD_UNAVAILABLE: 'Tento spôsob platby teraz nie je dostupný.', PAYMENT_PROVIDER_UNAVAILABLE: 'Platobná brána nie je dostupná.' };
      if (!r.ok || !r.data?.ok) return { ok: false, message: M[r.data?.error] || 'Platbu sa nepodarilo pripraviť. Skúste to znova.' };
      return { ok: true, payment: r.data.payment, delivery: r.data.delivery, paymentRequired: r.data.payment_required !== false, clientSecret: r.data.client_secret || null, cart: await cartShape() };
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
      if (r.status === 200) {
        del(CART); del(COUPON); del(BOOKING);
        const paid = r.data?.paymentStatus === 'PAID', method = r.data?.payment_method || null, bt = r.data?.bank_transfer || null;
        const pending = method === 'bank_transfer' ? 'Objednávka bola vytvorená. Uhraďte ju prevodom podľa údajov nižšie; platobné údaje sme vám poslali aj e-mailom. Tovar odošleme a digitálny obsah sprístupníme po pripísaní platby.'
          : method === 'cod' ? 'Objednávka bola vytvorená. Platíte pri prevzatí zásielky.'
          : 'Objednávka bola vytvorená. Čakáme na potvrdenie platby; platený obsah sa sprístupní po úhrade.';
        return { mode: 'http', status: paid ? 'ALLOW' : 'PENDING', messages: paid ? M.ALLOW : pending, order: r.data?.order, paymentMethod: method,
          bankTransfer: bt ? { ...bt, amountLabel: money(bt.amount) } : null, pickupAddress: r.data?.pickup_address || null };
      }
      // Objednávka nevznikla: server už prípadnú platbu kartou vrátil/zrušil – zákazníčka to musí vedieť.
      const back = { refunded: ' Platbu kartou sme vám automaticky vrátili.', canceled: ' Platba kartou bola zrušená, peniaze vám nestrhneme.', failed: ' Ak vám bola stiahnutá platba, kontaktujte nás – vrátime ju.' }[r.data?.payment_compensation] || '';
      if (r.status === 409) return { mode: 'http', status: 'REVIEW', messages: (back ? 'Objednávku teraz nebolo možné dokončiť.' : M.REVIEW) + back };
      if (r.status === 403) return { mode: 'http', status: 'BLOCK', messages: M.BLOCK + back };
      return { mode: 'http', status: 'ERROR', messages: (back ? 'Objednávku sa nepodarilo dokončiť.' : M.ERROR) + back };
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
    async confirmMagicLink() {
      const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
      const email = params.get('email'), token = params.get('token');
      if (!email || !token) return { ok: false, message: 'Odkaz je neúplný. Vyžiadajte si nový.' };
      const r = await call('/auth/customer/magic-link', { method: 'POST', body: { email, token } });
      if (!r.ok || !r.data?.token) return { ok: false, message: 'Odkaz je neplatný alebo vypršal. Vyžiadajte si nový.' };
      set(JWT, r.data.token);
      // Nová zákazníčka: overený e-mail ešte nemá Customer. Token identity ho založí a refresh vydá token so zákazníčkou.
      if ((await call('/store/customers/me')).status === 401) {
        const created = await call('/store/customers', { method: 'POST', body: { email } });
        const refreshed = created.ok ? await call('/auth/token/refresh', { method: 'POST', body: {} }) : null;
        if (!refreshed?.ok || !refreshed.data?.token) { del(JWT); return { ok: false, message: 'Účet sa nepodarilo založiť. Vyžiadajte si nový odkaz.' }; }
        set(JWT, refreshed.data.token);
        return { ok: true, message: 'Účet je založený. Vitajte.' };
      }
      return { ok: true, message: 'Prihlásenie prebehlo. Vitajte späť.' };
    },

    // QR odkaz → košík: produkt + množstvo + voliteľný kupón. Idempotentné cez uložený kľúč (max 50).
    async importQr(params) {
      const code = params.get('produkt'); if (!code) return { ok: false, message: 'V odkaze chýba kód produktu.' };
      const qty = params.get('ks') ?? '1', couponCode = params.get('kupon') ?? '';
      const key = JSON.stringify([code, qty, couponCode]);
      if (qrImports.has(key)) return qrImports.get(key);
      const task = (async () => {
        // Legacy produkt is an SKU, not a storefront handle. Resolution and legacy
        // quantity validation belong to the server, as do all monetary decisions.
        const resolved = await call('/store/coupon-links', { method: 'POST', body: { produkt: code, kupon: couponCode, ks: qty } });
        const target = resolved.data;
        if ((!resolved.ok && resolved.status !== 422) || !target?.variant_id || !Number.isInteger(target.quantity) || target.quantity < 1 || target.quantity > 999) {
          return { ok: false, message: target?.message || 'Produkt z QR odkazu nie je dostupný.' };
        }
        const id = await ensureCart();
        if (!id) return { ok: false, message: 'Košík sa nepodarilo vytvoriť. Skúste to znova.' };
        if (loggedIn()) {
          const owner = await call(`/store/carts/${id}/customer`, { method: 'POST', body: {} });
          if (!owner.ok) return { ok: false, message: 'Košík sa nepodarilo priradiť k vášmu účtu. Obnovte prihlásenie.' };
        }
        let keys = [];
        try { const saved = JSON.parse(get(QRKEYS) || '{}'); if (saved?.cart_id === id && Array.isArray(saved.keys)) keys = saved.keys; } catch { /* invalid saved state cannot block a valid link */ }
        if (keys.includes(key)) {
          const current = await call(`/store/carts/${id}`);
          if (!current.ok) return { ok: false, message: 'Košík sa nepodarilo načítať. Skúste to znova.' };
          if (!current.data?.cart?.items?.some(line => line.variant_id === target.variant_id)) keys = keys.filter(saved => saved !== key);
        }
        if (!keys.includes(key)) {
          const added = await call(`/store/carts/${id}/line-items`, { method: 'POST', body: { variant_id: target.variant_id, quantity: target.quantity } });
          if (!added.ok) return { ok: false, message: 'Produkt sa nepodarilo pridať do košíka.' };
          keys.push(key); set(QRKEYS, JSON.stringify({ cart_id: id, keys: keys.slice(-50) }));
          await reprice();
        }
        // Signing in and rescanning retries the coupon without adding the product twice.
        const coupon = couponCode ? await self.applyCoupon(couponCode) : null;
        return { ok: true, couponApplied: coupon?.ok ?? false, message: 'Produkt z QR odkazu je v košíku.' + (coupon ? ' ' + coupon.message : '') };
      })();
      qrImports.set(key, task);
      try { return await task; }
      catch { return { ok: false, couponApplied: false, message: 'Spojenie sa prerušilo. Pred opakovaním skontrolujte košík.' }; }
      finally { qrImports.delete(key); }
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
    // E-mail prihlásenej zákazníčky na predvyplnenie platobného formulára (bez neho Stripe pýta e-mail pre Link).
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

    isLoggedIn: loggedIn,
  };
  return self;
}
