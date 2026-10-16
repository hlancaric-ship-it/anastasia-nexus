// Reálný adaptér na backend (Medusa Store API + NEXUS routy). Stejné rozhraní jako mock.mjs.
// Nejádrové metody (chat, darčekový poukaz admin, kontakt, obsahové stránky) delegujeme na mock,
// jádro zákaznické cesty (katalog, košík, kupón, checkout, prístupy, prihlásenie, história) je reálné.
import { createMockApi } from './mock.mjs';

const EUR = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });
const money = n => (Number.isFinite(Number(n)) ? EUR.format(Number(n)) : 'Cena sa doplní');
const ART = { Kozmetika: 'jar', 'BIOKOZMETIKA': 'jar', Výživa: 'coffee', Domov: 'candle', Ľan: 'linen', Programy: 'sun', Služby: 'sun' };

const PRODUCT_FIELDS =
  'handle,title,subtitle,thumbnail,*categories,*variants,+variants.sku,+variants.calculated_price';

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
  const JWT = 'anastasia.jwt', CART = 'anastasia.cart', COUPON = 'anastasia.coupon';
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

  async function cartShape() {
    const id = get(CART);
    const empty = { mode: 'http', lines: [], gift_voucher: null, coupon: get(COUPON) || '', subtotalLabel: '0,00 €', discountLabel: get(COUPON) ? 'Kupón prijatý' : 'Kupón nezadaný', totalLabel: '0,00 €' };
    if (!id) return empty;
    const r = await call(`/store/carts/${id}?fields=*items,*items.product,total,item_subtotal,discount_total`);
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
      mode: 'http', lines, gift_voucher: null, coupon,
      subtotalLabel: money(cart.item_subtotal ?? cart.total),
      discountLabel: coupon ? 'Kupón prijatý' : (cart.discount_total ? money(-cart.discount_total) : 'Kupón nezadaný'),
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

    async requestMagicLink(email) {
      await call('/auth/customer/magic-link', { method: 'POST', body: { email: String(email || '') } });
      return { ok: true, message: 'Ak účet existuje, poslali sme vám prihlasovací odkaz na e-mail.' };
    },
    async confirmMagicLink() {
      const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
      const email = params.get('email'), token = params.get('token');
      if (!email || !token) return { ok: false, message: 'Odkaz je neúplný. Vyžiadajte si nový.' };
      const r = await call('/auth/customer/magic-link', { method: 'POST', body: { email, token } });
      if (r.ok && r.data?.token) { set(JWT, r.data.token); return { ok: true, message: 'Prihlásenie prebehlo. Vitajte späť.' }; }
      return { ok: false, message: 'Odkaz je neplatný alebo vypršal. Vyžiadajte si nový.' };
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

    isLoggedIn: loggedIn,
  };
}
