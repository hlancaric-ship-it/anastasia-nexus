// Reálný adaptér na backend (Medusa Store API + NEXUS routy). Stejné rozhraní jako mock.mjs.
// Nejádrové metody (chat, darčekový poukaz admin, kontakt, obsahové stránky) delegujeme na mock,
// jádro zákaznické cesty (katalog, košík, kupón, checkout, prístupy, prihlásenie, história) je reálné.
import { createMockApi } from './mock.mjs';

const EUR = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });
const money = n => (Number.isFinite(Number(n)) ? EUR.format(Number(n)) : 'Cena sa doplní');
const ART = { Kozmetika: 'jar', 'BIOKOZMETIKA': 'jar', Výživa: 'coffee', Domov: 'candle', Ľan: 'linen', Programy: 'sun', Služby: 'sun' };

const PRODUCT_FIELDS =
  'handle,title,subtitle,description,thumbnail,*categories,*variants,+variants.sku,+variants.calculated_price';

function mapProduct(p) {
  const variant = (p.variants || [])[0] || {};
  const cp = variant.calculated_price || {};
  const category = (p.categories || [])[0]?.name || '';
  return {
    slug: p.handle,
    name: p.title,
    category,
    code: p.handle,
    priceLabel: cp.calculated_amount != null ? money(cp.calculated_amount) : 'Cena sa doplní',
    art: ART[category] || 'jar',
    description: p.subtitle || '',
    descriptionHtml: p.description || '',
    availability: 'Dostupné',
    isNew: false,
    isBestseller: false,
    image: p.thumbnail || `/assets/product-${ART[category] || 'jar'}.svg`,
    _variantId: variant.id,
  };
}

export function createHttpApi(storage, config) {
  const mock = createMockApi(storage); // fallback pro nejádrové metody a statický obsah
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

  const giftCredit = () => { try { return JSON.parse(get(GIFT) || 'null'); } catch { return null; } };
  async function cartShape() {
    const id = get(CART);
    const empty = { mode: 'http', lines: [], gift_voucher: giftCredit(), coupon: get(COUPON) || '', subtotalLabel: '0,00 €', discountLabel: get(COUPON) ? 'Kupón prijatý' : 'Kupón nezadaný', totalLabel: '0,00 €' };
    if (!id) return empty;
    const r = await call(`/store/carts/${id}?fields=*items,*items.product,*shipping_methods,total,item_subtotal,discount_total,shipping_total,tax_total`);
    const cart = r.data?.cart; if (!cart) return empty;
    const lines = (cart.items || []).map(it => ({
      slug: it.product_handle || it.product?.handle || it.id,
      name: it.product_title || it.title || it.product?.title || 'Položka',
      code: it.product_handle || it.product?.handle,
      priceLabel: money(it.unit_price),
      image: it.thumbnail || it.product?.thumbnail || '/assets/brand-mark.svg',
      quantity: it.quantity,
      giftVoucher: false,
      _itemId: it.id,
    }));
    const coupon = get(COUPON) || '';
    return {
      mode: 'http', lines, gift_voucher: giftCredit(), coupon,
      subtotalLabel: money(cart.item_subtotal ?? cart.total),
      discountLabel: coupon ? 'Kupón prijatý' : (cart.discount_total ? money(-cart.discount_total) : 'Kupón nezadaný'),
      shippingLabel: (cart.shipping_methods || []).length ? (Number(cart.shipping_total) > 0 ? money(cart.shipping_total) : 'Zadarmo') : '',
      taxLabel: Number(cart.tax_total) > 0 ? money(cart.tax_total) : '',
      totalLabel: money(cart.total),
    };
  }

  return {
    ...mock,
    mode: 'http',

    async getProducts({ category = '', search = '', filter = '' } = {}) {
      const r = await call(`/store/products?region_id=${config.regionId}&limit=100&fields=${PRODUCT_FIELDS}`);
      let items = (r.data?.products || []).map(mapProduct);
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
      return p ? mapProduct(p) : null;
    },
    async getCategories() {
      const r = await call('/store/product-categories?limit=100&fields=name');
      const names = (r.data?.product_categories || []).map(c => c.name).filter(Boolean);
      return names.length ? [...new Set(names)] : mock.getCategories();
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
      const weeks = Array.from({ length: 16 }, (_, i) => ({ number: i + 1, title: `Tematický týždeň ${String(i + 1).padStart(2, '0')}`, description: 'Priestor pre schválený obsah programu.' }));
      if (!loggedIn()) return { mode: 'http', active: false, weeks };
      const r = await call('/store/entitlements');
      const list = r.data?.entitlements || r.data?.data || [];
      return { mode: 'http', active: Array.isArray(list) && list.length > 0, weeks };
    },

    // Pokladňa krok 2→3: košík priradí prihlásenej zákazníčke, uloží kontakt a adresu a zvolí dopravu
    // pre každý prepravný profil v košíku (ceny a DPH počíta server; klient len vyberá zo serverových možností).
    async prepareCheckout({ firstName = '', lastName = '', email = '', delivery = 'digital', street = '', city = '', postalCode = '' } = {}) {
      const id = get(CART); if (!id) return { ok: false, message: 'Košík je prázdny.' };
      if (!loggedIn()) return { ok: false, message: 'Pre dokončenie objednávky sa prihláste.' };
      const fail = 'Objednávku sa nepodarilo pripraviť. Skúste to znova.';
      const owner = await call(`/store/carts/${id}/customer`, { method: 'POST', body: {} });
      if (!owner.ok) return { ok: false, message: fail };
      const shipping = delivery === 'shipping';
      const address = { first_name: String(firstName).trim(), last_name: String(lastName).trim(), country_code: 'sk',
        ...(shipping ? { address_1: String(street).trim(), city: String(city).trim(), postal_code: String(postalCode).replace(/\s+/g, '') } : {}) };
      const up = await call(`/store/carts/${id}`, { method: 'POST', body: { email: String(email).trim(), shipping_address: address, billing_address: address } });
      if (!up.ok) return { ok: false, message: up.status === 400 ? 'Skontrolujte kontaktné údaje a adresu.' : fail };
      const so = await call(`/store/shipping-options?cart_id=${encodeURIComponent(id)}&fields=id,name,shipping_profile_id,*type`);
      const options = so.data?.shipping_options || [];
      if (!so.ok || !options.length) return { ok: false, message: 'Pre tento košík teraz nie je dostupné doručenie. Kontaktujte nás, prosím.' };
      const perProfile = new Map();
      for (const o of options) if (!perProfile.has(o.shipping_profile_id)) perProfile.set(o.shipping_profile_id, o);
      const chosen = [...perProfile.values()];
      if (chosen.some(o => o.type?.code !== 'digital') && !shipping) return { ok: false, message: 'Košík obsahuje tovar na doručenie. Zvoľte doručenie na adresu.' };
      for (const o of chosen) {
        const sm = await call(`/store/carts/${id}/shipping-methods`, { method: 'POST', body: { option_id: o.id } });
        if (!sm.ok) return { ok: false, message: fail };
      }
      await reprice();
      return { ok: true, cart: await cartShape() };
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
    // Stripe: platobná session proti pp_stripe_stripe, vráti clientSecret pre Payment Element.
    async createPaymentSession() {
      const id = get(CART); if (!id) return { ok: false, message: 'Košík je prázdny.' };
      const col = await call('/store/payment-collections', { method: 'POST', body: { cart_id: id } });
      const collectionId = col.data?.payment_collection?.id;
      if (!collectionId) return { ok: false, message: 'Platbu sa nepodarilo pripraviť.' };
      const sess = await call(`/store/payment-collections/${collectionId}/payment-sessions`, { method: 'POST', body: { provider_id: 'pp_stripe_stripe' } });
      const session = (sess.data?.payment_collection?.payment_sessions || []).find(s => s.provider_id === 'pp_stripe_stripe');
      const clientSecret = session?.data?.client_secret;
      if (!clientSecret) return { ok: false, message: 'Platobná brána nie je dostupná.' };
      return { ok: true, clientSecret };
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
      if (r.status === 200) { del(CART); del(COUPON); return { mode: 'http', status: 'ALLOW', messages: M.ALLOW, order: r.data?.order }; }
      if (r.status === 409) return { mode: 'http', status: 'REVIEW', messages: M.REVIEW };
      if (r.status === 403) return { mode: 'http', status: 'BLOCK', messages: M.BLOCK };
      return { mode: 'http', status: 'ERROR', messages: M.ERROR };
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
    async getAccount() {
      if (!loggedIn()) return mock.getAccount();
      const r = await call('/store/orders?limit=20&fields=display_id,created_at,total,status,*items');
      const orders = (r.data?.orders || []).map(o => ({
        number: String(o.display_id ?? o.id), date: new Date(o.created_at).toLocaleDateString('sk-SK'),
        product: (o.items || [])[0]?.product_title || (o.items || [])[0]?.title || '—',
        status: o.status || '—', totalLabel: money(o.total),
      }));
      return { name: 'Zákazníčka', orders };
    },

    // QR odkaz → košík: produkt + množstvo + voliteľný kupón. Idempotentné cez uložený kľúč (max 50).
    async importQr(params) {
      const code = params.get('produkt'); if (!code) return { ok: false, message: 'V odkaze chýba kód produktu.' };
      const qty = params.get('ks') ?? '1', couponCode = params.get('kupon') ?? '';
      if (!/^[1-9]\d?$/.test(qty)) return { ok: false, message: 'QR odkaz obsahuje neplatné množstvo (1–99).' };
      let keys = []; try { keys = JSON.parse(get(QRKEYS) || '[]'); } catch { keys = []; }
      const key = JSON.stringify([code, qty, couponCode]);
      if (keys.includes(key)) return { ok: true, message: 'Tento QR odkaz už bol použitý. Košík sa nezdvojil.' };
      const added = await this.addToCart(code, Number(qty));
      if (!added.ok) return added;
      keys.push(key); set(QRKEYS, JSON.stringify(keys.slice(-50)));
      let extra = '';
      if (couponCode) { const c = await this.applyCoupon(couponCode); extra = ' ' + c.message; }
      return { ok: true, message: added.message + extra };
    },

    // Darčekový poukaz: nákup (variant + príjemca) a uplatnenie kreditu v košíku (výšku určuje server).
    async getGiftVoucherProduct() {
      const r = await call(`/store/products?handle=darkovy-poukaz&region_id=${config.regionId}&fields=${PRODUCT_FIELDS}`);
      const p = r.data?.products?.[0];
      if (!p) return mock.getGiftVoucherProduct();
      return { id: p.id, handle: p.handle, variants: (p.variants || []).map(v => ({ id: v.id, label: v.title, amount: v.calculated_price?.calculated_amount })) };
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

    // História objednávok a zákaznícke centrum (prihlásene). Materiály/rezervácie: Fáza 2 → zatiaľ prázdne.
    async getAccount() {
      if (!loggedIn()) return mock.getAccount();
      const r = await call('/store/orders?limit=20&fields=display_id,created_at,total,status,*items');
      const orders = (r.data?.orders || []).map(o => ({
        number: String(o.display_id ?? o.id), date: new Date(o.created_at).toLocaleDateString('sk-SK'),
        product: (o.items || [])[0]?.product_title || (o.items || [])[0]?.title || '—',
        status: o.status || '—', totalLabel: money(o.total),
      }));
      return { name: 'Zákazníčka', orders };
    },
    async getCustomerCenter() {
      if (!loggedIn()) return mock.getCustomerCenter();
      const me = await call('/store/customers/me?fields=first_name,last_name,email,phone,metadata');
      const c = me.data?.customer || {};
      const md = c.metadata || {};
      const reorder = (await this.getProducts()).slice(0, 3);
      // TODO(src/lib/api/http.mjs): bookings a materials (knižnica/faktúry) sú Fáza 2 – zatiaľ prázdne.
      return {
        mode: 'http', bookings: [], materials: [], reorder,
        profile: {
          name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Zákazníčka', email: c.email || '', phone: c.phone || '',
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
    async getChatStatus() { const r = await call('/store/chat/status'); return r.ok ? r.data : mock.getChatStatus(); },
    async getChatConversations() { const r = await call('/store/chat/conversations'); return r.ok ? { conversations: r.data?.conversations || [] } : mock.getChatConversations(); },
    async getChatConversation(id) {
      const r = await call(`/store/chat/conversations/${id}`);
      return r.ok ? { conversation: r.data?.conversation, messages: r.data?.messages || [] } : mock.getChatConversation(id);
    },
    async markChatRead(id) { const r = await call(`/store/chat/conversations/${id}/read`, { method: 'POST' }); return r.ok ? r.data : { ok: true }; },
    async sendChatMessage({ conversation_id, body }) {
      const r = conversation_id
        ? await call(`/store/chat/conversations/${conversation_id}/messages`, { method: 'POST', body: { body } })
        : await call('/store/chat/conversations', { method: 'POST', body: { body } });
      if (r.ok) return { ok: true, status: r.status, conversation: r.data?.conversation, message: r.data?.message };
      return { ok: false, status: r.status, type: r.data?.type || 'error', message: r.data?.message };
    },
    // TODO(src/lib/api/http.mjs): kontaktný formulár nemá backend routu – ponechané na mock.
    // sendContact zostáva z mocku (…mock) kým nevznikne /store/ kontakt endpoint.

    isLoggedIn: loggedIn,
  };
}
