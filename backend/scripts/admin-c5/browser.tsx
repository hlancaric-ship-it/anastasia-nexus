/** Focused real-browser UI/transport test with synthetic API responses; not a PostgreSQL test. */
import React from 'react'
import { DEFAULT_THEME } from '../../src/lib/admin-theme/policy'
import { createRoot } from 'react-dom/client'
import Shop from '../../src/admin/routes/sprava-obchodu/Shop'
const state: Record<string, any[]> = {
  products: [{ id: 'prod_1', title: 'Ukážkový produkt', description: '', status: 'draft', categories: [], variants: [{ id: 'variant_1', title: 'Základná', prices: [{ id: 'price_1', amount: 50, currency_code: 'eur', rules: {} }] }] }],
  product_categories: [{ id: 'cat_1', name: 'Programy', description: '', is_active: true, is_internal: false, parent_category_id: null }],
  promotions: [{ id: 'promo_1', code: 'TEST10', type: 'standard', status: 'draft', is_automatic: false, rules: [], application_method: { type: 'percentage', value: 10, target_type: 'items', target_rules: [], buy_rules: [] } }],
  customers: [{ id: 'cus_1', first_name: 'Ukážka', last_name: 'Test', email: 'synthetic@example.test' }],
  orders: [{ id: 'order_1', display_id: 1001, email: 'synthetic@example.test', total: 61.5, currency_code: 'eur', payment_status: 'captured', fulfillment_status: 'not_fulfilled', metadata: { legal: 'keep' }, items: [{ id: 'item_1', title: 'Ukážkový produkt', quantity: 1, unit_price: 50 }] }],
}
const calls: { path: string; body: any }[] = []
let failWrite = false, serial = 10
window.fetch = (async (url: string, init: RequestInit = {}) => {
  const u = new URL(url, location.origin), parts = u.pathname.split('/').filter(Boolean)
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  calls.push({ path: u.pathname, body })
  const reply = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }))
  if (parts[1] === 'my-theme') return reply({selection: DEFAULT_THEME, revision: 0})
  if (parts[1] === 'stores') return reply({ stores: [{ default_sales_channel_id: 'sc_1' }] })
  if (parts[1] === 'shipping-profiles') return reply({ shipping_profiles: [{ id: 'sp_1', type: 'default' }] })
  if (failWrite && body) throw new Error('NETWORK_UNCERTAIN')
  if (parts[1] === 'shop-prices') {
    state.products[0].variants[0].prices[0].amount = body.amount
    return reply({ price: { id: 'price_1', amount: body.amount } })
  }
  const family: Record<string, [string,string]> = { products: ['products','product'], 'product-categories': ['product_categories','product_category'], promotions: ['promotions','promotion'], customers: ['customers','customer'], orders: ['orders','order'] }
  const spec = family[parts[1]]
  if (!spec) throw new Error('UNEXPECTED_API '+u.pathname)
  const [key,singular] = spec
  if (body) {
    let row = state[key].find(r => r.id === parts[2])
    if (!parts[2]) { row = { id: `${key}_${serial++}`, ...body }; if (key === 'products') row.variants = body.variants.map((v:any) => ({ ...v, id: 'variant_new', prices: v.prices.map((p:any) => ({ ...p, id: 'price_new', rules: {} })) })); state[key].push(row) }
    else Object.assign(row, body, body.application_method ? { application_method: { ...row.application_method, ...body.application_method } } : {})
    return reply({ [singular]: row })
  }
  if (parts[2]) return reply({ [singular]: state[key].find(r => r.id === parts[2]) })
  const q = u.searchParams.get('q')?.toLowerCase()
  const rows = state[key].filter(r => !q || JSON.stringify(r).toLowerCase().includes(q))
  const offset = Number(u.searchParams.get('offset') ?? 0), limit = Number(u.searchParams.get('limit') ?? 12)
  return reply({ [key]: rows.slice(offset, offset+limit), count: rows.length })
}) as typeof fetch
const root = createRoot(document.getElementById('root')!)
root.render(<React.StrictMode><Shop /></React.StrictMode>)
const checks: string[] = []
const assert = (condition: unknown, label: string) => { if (!condition) throw new Error(label); checks.push(label) }
const tick = () => new Promise(r => setTimeout(r, 20))
async function wait(test: () => unknown) { for (let n=0;n<100;n++) { if (test()) return; await tick() } throw new Error('TIMEOUT') }
function button(label: string, scope: ParentNode = document): HTMLButtonElement {
  const result = [...scope.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
  if (!result) throw new Error('Missing button '+label)
  return result
}
async function nav(label: string) { button(label,document.querySelector('nav')!).click(); await tick(); await wait(() => !document.querySelector('[role=status]')?.textContent?.includes('Načítavame')); await tick() }
function fill(id: string, value: string) {
  const el = document.getElementById('shop-'+id) as HTMLInputElement | HTMLTextAreaElement
  if (!el) throw new Error('Missing field '+id)
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value)
  el.dispatchEvent(new Event('input',{ bubbles:true }))
}
async function open(label:string) { button(label).click(); await wait(() => document.querySelector('dialog[open]')); await tick() }
async function save() { button('Uložiť zmeny').click(); await wait(() => !document.querySelector('dialog')); await tick() }
const writes = () => calls.filter(c => c.body)
// Run on the mounted application, using DOM actions and the actual fetch client.
void (async () => {
 try {
  await wait(() => document.querySelectorAll('.shop-card strong').length===6 && document.querySelector('.shop-card strong')?.textContent==='1')
  assert(document.querySelectorAll('.shop-tabs button').length===7,'seven working sections')
  document.querySelector<HTMLButtonElement>('.shop-card')!.click(); await tick()
  await wait(() => !!document.querySelector('.shop-toolbar'))
  await wait(() => !button('Pridať produkt').disabled)
  assert(document.querySelector('h2')?.textContent==='Produkty','overview card opens its agenda')
  await open('Pridať produkt'); fill('title','Nový testovací produkt'); fill('amount','-1'); await tick()
  const before=writes().length; button('Uložiť zmeny').click(); await tick()
  assert(writes().length===before && !!document.querySelector('[role=alert]'),'invalid price is not sent')
  fill('amount','19,90'); fill('sku','SYNTHETIC-NEW'); await tick(); await save()
  assert(state.products.length===2 && state.products[1].variants[0].manage_inventory===true,'native draft create preserves stock control')
  assert(!state.products[1].metadata?.booking_required,'product create does not impose booking')
  await open('Otvoriť'); fill('title','Upravený produkt'); await tick(); await save()
  assert(state.products[0].variants[0].prices[0].amount===50,'text edit preserves price')
  await nav('Ceny'); await open('Upraviť cenu'); fill('amount','42,50'); await tick(); await save()
  assert(writes().some(c => c.path==='/admin/shop-prices/variant_1' && c.body.amount===42.5 && c.body.expected_amount===50),'price uses restricted server endpoint with original value')
  await nav('Kategórie'); await open('Pridať kategóriu'); fill('name','Nová kategória'); await tick(); await save()
  assert(state.product_categories.length===2,'category create and read back')
  await nav('Kupóny'); await open('Vytvoriť kupón'); fill('code','JAR20'); fill('value','101'); await tick(); const couponBefore=writes().length
  button('Uložiť zmeny').click(); await tick(); assert(writes().length===couponBefore,'over-100 percent is blocked')
  fill('value','20'); await tick(); await save(); assert(state.promotions[1].application_method.type==='percentage','supported coupon create')
  await nav('Zákazníčky'); await open('Pridať zákazníčku'); fill('first_name','Nová'); fill('last_name','Ukážka'); fill('email','bad'); await tick(); button('Uložiť zmeny').click(); await tick()
  assert(!!document.querySelector('[aria-invalid=true]'),'email validation appears at field')
  fill('email','new@example.test'); await tick(); await save(); assert(state.customers.length===2,'customer create and read back')
  await nav('Objednávky'); await open('Otvoriť objednávku'); fill('note','Poznámka obsluhy'); await tick(); await save()
  assert(state.orders[0].metadata.legal==='keep' && state.orders[0].payment_status==='captured','order note preserves legal metadata and payment state')
  await nav('Produkty')
  const search=document.getElementById('shop-search') as HTMLInputElement
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(search,'NOT-FOUND');search.dispatchEvent(new Event('input',{bubbles:true}));await tick();button('Hľadať').click();await tick()
  await wait(() => document.body.textContent?.includes('nič nenašlo'));assert(!document.querySelector('tbody tr'),'empty search uses server result')
  await nav('Zákazníčky'); await open('Pridať zákazníčku'); fill('first_name','Neistý');fill('last_name','Výsledok');fill('email','uncertain@example.test'); await tick()
  failWrite=true;const n=writes().length;button('Uložiť zmeny').click();await tick();await wait(() => button('Uložiť zmeny').disabled)
  assert(writes().length===n+1,'uncertain write is not repeated');assert(document.body.textContent?.includes('Výsledok uloženia nepoznáme'),'uncertain write explains verification')
  button('Obnoviť zoznam a overiť výsledok').click();failWrite=false;await tick();await nav('Prehľad')
  assert(document.documentElement.scrollWidth <= window.innerWidth+1,'no viewport horizontal overflow')
  assert(getComputedStyle(document.querySelector('.anastasia-shop')!).getPropertyValue('--admin-accent').trim()==='#184987','saved original theme applies to shop workspace')
  assert(document.querySelectorAll('img').length===0,'plain text rendering does not inject HTML')
  const result = { status:'PASS', checks, width:innerWidth }; document.getElementById('result')!.textContent=JSON.stringify(result);parent.postMessage(result,location.origin)
 } catch(e) { throw e }
})().catch(e => { const result={status:'FAIL',error:String(e),checks,body:document.body.textContent?.slice(-1500)};document.getElementById('result')!.textContent=JSON.stringify(result);parent.postMessage(result,location.origin) })
